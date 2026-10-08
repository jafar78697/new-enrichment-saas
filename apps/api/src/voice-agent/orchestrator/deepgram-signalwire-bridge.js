import { WebSocket } from 'ws';
import fs from 'node:fs/promises';
import path from 'node:path';
import { RestClient } from '@signalwire/compatibility-api';
import { env } from '../config/env.js';
import { buildDeepgramSettings } from '../providers/deepgram-agent.js';
import { query } from '../../calls-module/db/index.js';
import { saveCallResult } from '../services/call-result-service.js';
import { isAudioClarification } from '../services/conversation-repair.js';
import { scheduleFirstReply, armFirstAudioDeadline, clearFirstAudioRecovery, markFirstAudioForwarded } from '../services/first-audio-recovery.js';
import { replaceTemplateVars } from '../../services/multi-calling/template-runtime.js';
import { applyMulawGain } from '../utils/mulaw.js';
import { broadcastCallAudio, broadcastCallTranscript, broadcastCallAudioClear, broadcastCallStatus } from '../websocket/call-monitor.js';
import { detectCallStateFromTranscript, detectCallStateFromTranscriptML, CallStates } from '../detection/call-state-detector.js';
import { createVoiceAgentWebSocketServer } from '../websocket/upgrade-router.js';

const MAX_PENDING_AUDIO_FRAMES = 400;
const activeStreamSids = new Set();
const activeStreamLanes = new Map();

function safeJsonParse(raw, fallback = null) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw ?? fallback;
  } catch {
    return fallback;
  }
}

function readParameters(start = {}) {
  const source = start.customParameters || start.custom_parameters || {};
  if (Array.isArray(source)) {
    return Object.fromEntries(source.map((item) => [item.name || item.key, item.value]));
  }
  return source;
}

function createSignalWireClient() {
  if (!env.SIGNALWIRE_PROJECT_ID || !env.SIGNALWIRE_API_TOKEN || !env.SIGNALWIRE_SPACE_URL) {
    return null;
  }
  return RestClient(env.SIGNALWIRE_PROJECT_ID, env.SIGNALWIRE_API_TOKEN, {
    signalwireSpaceUrl: env.SIGNALWIRE_SPACE_URL,
  });
}

function isTerminalDetection(detection) {
  return detection?.action === 'hangup'
    && [CallStates.VOICEMAIL, CallStates.IVR_OR_MENU, CallStates.AI_RECEPTIONIST_OR_BOT, CallStates.CLOSED_OR_HOURS].includes(detection?.state);
}

function normalizeEmailValue(rawValue) {
  const source = String(rawValue || '').toLowerCase().replace(/[’']/g, '').trim();
  const literal = source.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/i)?.[0] || null;
  if (literal) return literal.slice(0, 320);
  if (!/\bat\b/.test(source) || !/\bdot\b/.test(source)) return null;

  const anchor = Math.max(source.lastIndexOf('email address'), source.lastIndexOf('email is'), source.lastIndexOf('email'));
  let spoken = anchor >= 0 ? source.slice(anchor).replace(/^email(?: address| is)?\s*[:,=-]?\s*/, '') : source;
  spoken = spoken
    .replace(/\bat sign\b/g, ' at ')
    .replace(/\bunderscore\b/g, ' _ ')
    .replace(/\b(?:dash|hyphen)\b/g, ' - ')
    .replace(/\bdot\b/g, ' . ');
  const parts = spoken.split(/\s+at\s+/);
  if (parts.length < 2) return null;
  let local = parts.shift() || '';
  let domain = parts.join(' at ');
  domain = domain.split(/\b(?:and|then|so|please|ill|i will|if they|for management)\b/)[0];
  local = local.replace(/[^a-z0-9._+-]/g, '');
  domain = domain.replace(/[^a-z0-9.-]/g, '');
  const candidate = `${local}@${domain}`.replace(/\.{2,}/g, '.').slice(0, 320);
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(candidate) ? candidate : null;
}

function extractEmailFromTranscript(transcript) {
  const entries = Array.isArray(transcript) ? transcript : safeJsonParse(transcript, []) || [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index]?.role !== 'user') continue;
    const email = normalizeEmailValue(entries[index]?.text || entries[index]?.content || '');
    if (email) return email;
  }
  return null;
}

function editDistance(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

function reconcileEmailWithLeadDomain(email, leadDomain) {
  if (!email || !leadDomain) return email;
  const [local, spokenDomain] = email.split('@');
  const crmDomain = String(leadDomain).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  if (!local || !spokenDomain || !crmDomain.includes('.')) return email;
  const similarity = 1 - (editDistance(spokenDomain, crmDomain) / Math.max(spokenDomain.length, crmDomain.length));
  return similarity >= 0.75 ? `${local}@${crmDomain}` : email;
}

/**
 * Transcript-based fallback classification.
 * Analyzes the user (prospect) messages in the transcript to derive a correct
 * outcome when the AI's save_call_note tool didn't fire before the call ended.
 */
function classifyFromTranscript(transcript, durationSec) {
  const entries = Array.isArray(transcript) ? transcript : safeJsonParse(transcript, []) || [];
  const userTexts = entries
    .filter((e) => e.role === 'user')
    .map((e) => String(e.text || e.content || '').toLowerCase().trim())
    .filter(Boolean);
  const allUserText = userTexts.join(' ');

  if (!allUserText) {
    return { outcome: 'no_answer', summary: `No prospect speech detected (${durationSec}s). Likely immediate hangup or silence.` };
  }

  const dncPatterns = [
    /\b(?:do\s*not\s*call|don'?t\s*(?:ever\s*)?call\s*(?:again|back|me)|remove\s*(?:me|my\s*number)|stop\s*calling)\b/,
    /\b(?:take\s*(?:me|us|my\s*number)\s*off\s*(?:your|the)\s*(?:list|system))\b/,
  ];
  const callbackPatterns = [
    /\b(?:call\s*(?:me\s*)?(?:back|later|tomorrow|next\s*week)|try\s*(?:again|back)\s*(?:later|tomorrow|next\s*week))\b/,
    /\b(?:not\s*(?:a\s*)?good\s*time|bad\s*time|call\s*(?:another|different)\s*time)\b/,
    /\b(?:i'?ll?\s*(?:call\s*(?:you\s*)?back|get\s*back\s*to\s*you))\b/,
    /\b(?:i'?m?\s*(?:busy|in\s+a\s+meeting)|can'?t\s+talk\s+(?:right\s+now|now))\b/,
  ];
  const gatekeeperPatterns = [
    /\b(?:(?:he|she|they|the\s*owner)\s*(?:is|are)\s*(?:not\s*(?:here|available|in)|out|busy|gone|on\s*(?:a\s*)?(?:call|vacation|break)))\b/,
    /\b(?:(?:can\s*i|may\s*i)\s*take\s+a\s+message)\b/,
    /\b(?:let\s*me\s*(?:transfer|connect)\s*you|hold\s*on|one\s*moment|please\s*hold)\b/,
    /\b(?:front\s*desk|reception|this\s*is\s*(?:the|a)\s*(?:office|receptionist|assistant))\b/,
  ];
  const wrongNumberPatterns = [
    /\b(?:wrong\s*number|no\s*(?:one|body)\s*(?:by\s*that\s*name|here\s*(?:by|with)\s*that)|don'?t\s*know\s*(?:who|what)\s*(?:you'?re?\s*talking\s*about))\b/,
  ];
  const rejectionPatterns = [
    /\b(?:not\s+interested|no\s+(?:thanks?|thank\s+you)|don'?t\s+(?:want|need)\s+(?:that|this|it)|not\s+(?:looking|buying))\b/,
    /\b(?:we'?re?\s+(?:good|fine|set|all\s*set)|already\s+(?:have|got|use)\s+(?:one|that|this|something))\b/,
    /\b(?:no\s*no\s*no|nah|nope|absolutely\s+not|hell\s+no|go\s+away)\b/,
    /\b(?:hang\s+up|leave\s+(?:me|us)\s+alone|waste\s+of\s+(?:my\s+)?time)\b/,
    /\b(?:we\s+don'?t\s+(?:need|want)\s+(?:that|this|it|any))\b/,
  ];
  const interestPatterns = [
    /\b(?:tell\s*me\s*more|sounds?\s*(?:good|great|interesting)|i'?m?\s*interested)\b/,
    /\b(?:send\s*(?:me|us)\s*(?:info|information|details|an?\s*email))\b/,
    /\b(?:we\s*(?:could|might|would)\s*(?:use|need|be\s*interested))\b/,
    /\b(?:what'?s?\s*the\s*(?:price|cost|fee)|how\s+much\s+(?:is|does|would|will))\b/,
    /\b(?:book|schedule|set\s+up)\s+(?:a\s+)?(?:demo|meeting|call)\b/,
    /\bsend\s+(?:it|that|the\s+(?:details|information|offer))\s+to\s+(?:my|this|the)\s+email\b/,
  ];

  const hasDNC = dncPatterns.some((pattern) => pattern.test(allUserText));
  const terminalMachine = userTexts.map(text => detectCallStateFromTranscript(text)).find(isTerminalDetection);
  const hasVoicemail = terminalMachine?.state === CallStates.VOICEMAIL;
  const hasIvr = [CallStates.IVR_OR_MENU, CallStates.AI_RECEPTIONIST_OR_BOT].includes(terminalMachine?.state);
  const hasCallback = callbackPatterns.some((pattern) => pattern.test(allUserText));
  const hasGatekeeper = gatekeeperPatterns.some((pattern) => pattern.test(allUserText));
  const hasWrongNumber = wrongNumberPatterns.some((pattern) => pattern.test(allUserText));
  const hasRejection = rejectionPatterns.some((pattern) => pattern.test(allUserText));
  const hasInterest = interestPatterns.some((pattern) => pattern.test(allUserText));

  if (hasDNC) return { outcome: 'do_not_call', summary: `Prospect explicitly requested no further calls (${durationSec}s).` };
  if (hasWrongNumber) return { outcome: 'not_interested', summary: `Wrong number (${durationSec}s). Do not retry without correcting the phone number.` };
  if (hasVoicemail) return { outcome: 'voicemail', summary: 'Voicemail greeting detected (' + durationSec + 's). No human was reached.' };
  if (hasIvr) return { outcome: 'no_answer', summary: 'Automated phone menu detected (' + durationSec + 's). Decision-maker was not reached.' };
  // A temporary bad time is a follow-up signal, never a rejection.
  if (hasCallback) return { outcome: 'followup', summary: `Prospect was unavailable or requested another call (${durationSec}s). Exact follow-up time was not captured by the live tool.` };
  // The target decision-maker was not reached.
  if (hasGatekeeper && !hasInterest) return { outcome: 'no_answer', summary: `Gatekeeper or receptionist answered (${durationSec}s). Decision-maker was not reached.` };
  if (hasRejection) return { outcome: 'not_interested', summary: `Prospect clearly declined the offer (${durationSec}s).` };
  if (hasInterest) return { outcome: 'interested', summary: `Prospect showed clear interest (${durationSec}s). Live tool did not capture the remaining details.` };

  // Apply short-call fallback only after checking explicit intent.
  if (allUserText.split(/\s+/).length <= 3 && durationSec < 15) {
    return { outcome: 'no_answer', summary: `Prospect barely spoke (${durationSec}s). Likely answered and immediately hung up.` };
  }

  return {
    outcome: 'called',
    summary: durationSec > 30
      ? `Conversation lasted ${durationSec}s. No reliable intent was detected.`
      : `Call ended after ${durationSec}s without a clear disposition.`,
  };
}
function clearIvrTimeout(context) {
  if (context.ivrTimeout) clearTimeout(context.ivrTimeout);
  context.ivrTimeout = null;
}

async function updateSession(sessionId, sql, params) {
  if (!sessionId) return;
  try {
    await query(sql, [...params, sessionId]);
  } catch (error) {
    console.error('[deepgram-bridge] Session update failed:', error.message);
  }
}

const terminalProviderStates = new Set(['completed', 'busy', 'failed', 'no-answer', 'canceled']);
const hangupRequests = new Map();

async function confirmProviderTermination(callSid, sessionId) {
  const row = (await query('SELECT provider_terminated_at, call_state FROM ai_call_sessions WHERE id = $1', [sessionId])).rows[0];
  if (row?.provider_terminated_at) return true;
  const client = createSignalWireClient();
  if (!client || !callSid) throw new Error('Cannot verify provider termination without call configuration.');
  let providerCall = await client.calls(callSid).fetch();
  if (!terminalProviderStates.has(providerCall.status)) {
    try {
      providerCall = await client.calls(callSid).update({ status: 'completed' });
    } catch (error) {
      // The remote side or a concurrent cleanup can end the call between our
      // fetch and update. Confirm its actual status before treating this as failure.
      providerCall = await client.calls(callSid).fetch();
      if (!terminalProviderStates.has(providerCall.status)) throw error;
    }
    for (const waitMs of [150, 300, 600]) {
      if (terminalProviderStates.has(providerCall.status)) break;
      await new Promise(resolve => setTimeout(resolve, waitMs));
      providerCall = await client.calls(callSid).fetch();
    }
  }
  if (!terminalProviderStates.has(providerCall.status)) throw new Error('Provider has not confirmed call termination.');
  await query('UPDATE ai_call_sessions SET provider_terminated_at = COALESCE(provider_terminated_at, NOW()) WHERE id = $1', [sessionId]);
  return true;
}

// Shared recovery path for a cleanup interrupted by provider timing or process
// restart. It never hangs up a call: the provider termination must be confirmed.
export async function finalizeEndedCall(sessionId) {
  const row = (await query(`SELECT signalwire_call_sid, duration_sec, ended_at,
    provider_terminated_at, result_finalized_at FROM ai_call_sessions WHERE id = $1`, [sessionId])).rows[0];
  if (!row || !row.ended_at || !row.provider_terminated_at) return false;
  if (row.result_finalized_at) return true;
  const callSid = row.signalwire_call_sid;
  const durationSec = Number(row.duration_sec || 0);
  // Use the original transcript classifier and preserve tool-recorded results.
  if (sessionId) {
    let session = null;
    let fallbackOutcome = 'called';
    try {
      const { rows: sessionRows } = await query(
        `SELECT s.outcome, s.hangup_reason, s.duration_sec, s.first_answer_type, s.call_state, s.queue_item_id, s.lane_id, s.summary,
                jsonb_array_length(COALESCE(transcript, '[]'::jsonb)) AS transcript_events,
                s.transcript, er.domain AS lead_domain
         FROM ai_call_sessions s
         LEFT JOIN enrichment_results er ON er.id = s.lead_id AND er.tenant_id = s.tenant_id
         WHERE s.id = $1`,
        [sessionId],
      );
      session = sessionRows[0];
      fallbackOutcome = session?.outcome || 'called';
      if (session && !session.outcome) {
        const hr = session.hangup_reason || '';
        const dur = session.duration_sec || durationSec;
        const transcriptEvents = Number(session.transcript_events || 0);
        fallbackOutcome = 'called';
        let fallbackSummary = `Call ended after ${dur}s.`;
        if (transcriptEvents === 0 && !hr) {
          fallbackOutcome = 'no_answer';
          fallbackSummary = `No speech transcript was captured (${dur}s). No live conversation confirmed.`;
        } else if (['VOICEMAIL'].includes(hr)) {
          fallbackOutcome = 'voicemail';
          fallbackSummary = `Voicemail detected (${dur}s). No human reached.`;
        } else if (['IVR_OR_MENU', 'AI_RECEPTIONIST_OR_BOT'].includes(hr)) {
          fallbackOutcome = 'no_answer';
          fallbackSummary = `${hr === 'IVR_OR_MENU' ? 'IVR/phone menu' : 'AI receptionist'} detected (${dur}s). Could not reach human.`;
        } else if (['CLOSED_OR_HOURS'].includes(hr)) {
          fallbackOutcome = 'no_answer';
          fallbackSummary = `Business hours message detected (${dur}s). Call outside operating hours.`;
        } else if (['deepgram-error', 'deepgram-disconnected', 'bridge-error', 'first-audio-timeout', 'deepgram-setup-timeout'].includes(hr)) {
          fallbackOutcome = 'technical_error';
          fallbackSummary = `Technical error: ${hr} (${dur}s). Call failed due to system issue.`;
        } else {
          // Analyze every transcript, including short calls. The classifier
          // checks explicit intent before applying its short-call fallback,
          // so a quick "no thanks" is not mislabeled as no_answer.
          const transcriptResult = classifyFromTranscript(session.transcript, dur);
          fallbackOutcome = transcriptResult.outcome;
          fallbackSummary = transcriptResult.summary;
        }
        session.summary = fallbackSummary;
        await query(
          `UPDATE ai_call_sessions
           SET outcome = COALESCE(outcome, $1),
               summary = COALESCE(summary, $2)
           WHERE id = $3 AND outcome IS NULL`,
          [fallbackOutcome, fallbackSummary, sessionId],
        );
        console.log(`[deepgram-bridge] Fallback outcome written: ${fallbackOutcome} — ${fallbackSummary}`);
      }

      const capturedEmail = extractEmailFromTranscript(session?.transcript);
      const result = await saveCallResult({
        sessionId, outcome: fallbackOutcome, note: session?.summary || '',
        email: capturedEmail, source: 'ai', fallback: true, durationSec,
      });
      fallbackOutcome = result.outcome;
    } catch (fallbackErr) {
      console.error('[deepgram-bridge] Fallback outcome write failed:', fallbackErr.message);
      await query(`UPDATE ai_calling_lanes SET status = 'error', last_error = $1 WHERE id = (SELECT lane_id FROM ai_call_sessions WHERE id = $2)`, [fallbackErr.message, sessionId]);
      throw fallbackErr;
    }

    if (session && session.queue_item_id) {
      const finalState = ['technical_error', 'bridge-error', 'deepgram-error', 'provider_error'].includes(fallbackOutcome) ? 'failed' : 'completed';
      await query(
        `UPDATE ai_call_queue_items SET state = $1, last_error = $2 WHERE id = $3 AND state NOT IN ('completed', 'failed', 'cancelled')`,
        [finalState, session.hangup_reason || null, session.queue_item_id]
      );
    }
    await writeTranscriptFile(sessionId, callSid);
    await query('UPDATE ai_call_sessions SET result_finalized_at = COALESCE(result_finalized_at, NOW()), last_error = NULL WHERE id = $1', [sessionId]);

  }
  return true;
}

async function closePhoneCall({ callSid, signalWireWs, sessionId, reason, lastError }) {
  const key = sessionId || callSid;
  if (hangupRequests.has(key)) return hangupRequests.get(key);
  const request = (async () => {
    await updateSession(sessionId, `UPDATE ai_call_sessions SET
      hangup_reason = COALESCE(hangup_reason, $1), last_error = COALESCE($2, last_error),
      call_state = 'ending' WHERE id = $3 AND ended_at IS NULL`,
    [reason || 'agent-ended', lastError || null]);
    try {
      await confirmProviderTermination(callSid, sessionId);
      if (signalWireWs?.readyState === WebSocket.OPEN) signalWireWs.close(1000, 'call-ended');
      return true;
    } catch (error) {
      await updateSession(sessionId, 'UPDATE ai_call_sessions SET last_error = $1 WHERE id = $2', [error.message]);
      console.error('[deepgram-bridge] Provider termination not confirmed:', error.message);
      return false;
    }
  })();
  hangupRequests.set(key, request);
  try { return await request; } finally { hangupRequests.delete(key); }
}

function extractConversationText(event) {
  if (event?.type !== 'ConversationText' || typeof event.content !== 'string') return null;
  const text = event.content.trim();
  if (!text) return null;
  return {
    role: /assistant|agent|ai/i.test(String(event.role)) ? 'assistant' : 'user',
    text,
  };
}

async function loadSessionContext(sessionId) {
  const { rows } = await query(
    `SELECT
       acs.*,
       lane.slot_number AS verified_lane_slot,
       sv.definition AS script_definition,
       er.company_name,
       er.industry_guess,
       er.primary_email,
       er.primary_phone,
       er.domain,
       er.raw_data->>'first_name' AS first_name,
       er.raw_data->>'last_name' AS last_name,
       er.raw_data->>'contact_name' AS contact_name,
       er.raw_data->>'title' AS title,
       er.raw_data->>'city' AS city,
       er.raw_data->>'state' AS state,
       er.raw_data->>'notes' AS notes,
       er.raw_data->>'niche_name' AS niche_name,
       er.raw_data->>'call_origin' AS call_origin,
       COALESCE(acs.compiled_script_prompt, sv.compiled_prompt) as compiled_script_prompt,
       COALESCE(acs.agent_config_snapshot, jsonb_build_object(
         'id', COALESCE(ac.id, ac_lane.id),
         'name', COALESCE(ac.name, ac_lane.name),
         'voice', COALESCE(ac.voice, ac_lane.voice),
         'language', COALESCE(ac.language, ac_lane.language),
         'prompt', COALESCE(ac.prompt, ac_lane.prompt),
         'greeting', COALESCE(ac.greeting, ac_lane.greeting),
         'max_call_duration_sec', COALESCE(ac.max_call_duration_sec, ac_lane.max_call_duration_sec),
         'speech_speed', COALESCE(ac.speech_speed, ac_lane.speech_speed),
         'listen_eot_threshold', COALESCE(ac.listen_eot_threshold, ac_lane.listen_eot_threshold),
         'listen_eot_timeout_ms', COALESCE(ac.listen_eot_timeout_ms, ac_lane.listen_eot_timeout_ms)
       )) AS agent_config
     FROM ai_call_sessions acs
     LEFT JOIN enrichment_results er ON er.id = acs.lead_id
     LEFT JOIN ai_agent_configs ac ON ac.id = acs.agent_config_id AND ac.tenant_id = acs.tenant_id AND ac.is_active = true
     LEFT JOIN ai_calling_lanes lane ON lane.id = acs.lane_id
     LEFT JOIN ai_agent_configs ac_lane ON ac_lane.id = lane.agent_config_id
     LEFT JOIN ai_calling_script_versions sv ON sv.id = acs.script_version_id
     WHERE acs.id = $1`,
    [sessionId],
  );
  return rows[0] || null;
}

async function persistConversationText({ sessionId, role, text }) {
  await updateSession(
    sessionId,
    `UPDATE ai_call_sessions
     SET transcript = COALESCE(transcript, '[]'::jsonb)
       || jsonb_build_array(jsonb_build_object('role', $1::text, 'text', $2::text, 'at', NOW()))
     WHERE id = $3`,
    [role, text],
  );
}

async function writeTranscriptFile(sessionId, callSid) {
  if (!sessionId) return;
  try {
    const { rows } = await query(
      `SELECT id, signalwire_call_sid, lead_id, started_at, ended_at, outcome, transcript
       FROM ai_call_sessions WHERE id = $1`, [sessionId],
    );
    if (!rows[0]) return;
    const directory = path.resolve(process.cwd(), 'storage', 'call-transcripts');
    await fs.mkdir(directory, { recursive: true });
    const safeSid = String(callSid || rows[0].signalwire_call_sid || sessionId).replace(/[^a-zA-Z0-9_-]/g, '_');
    await fs.writeFile(path.join(directory, `${safeSid}.json`), JSON.stringify({
      sessionId: rows[0].id, callSid: rows[0].signalwire_call_sid, leadId: rows[0].lead_id,
      startedAt: rows[0].started_at, endedAt: rows[0].ended_at, outcome: rows[0].outcome,
      transcript: rows[0].transcript || [],
    }, null, 2), 'utf8');
  } catch (error) {
    console.error('[deepgram-bridge] Transcript file write failed:', error.message);
  }
}

async function handleFunctionRequests(event, context) {
  const functions = Array.isArray(event.functions) ? event.functions : [];
  for (const fn of functions) {
    const name = String(fn?.name || '');
    const args = safeJsonParse(fn?.arguments, {}) || {};
    let content;
    let shouldEndCall = false;

    if (['save_call_note', 'mark_do_not_call'].includes(name) && context.sessionId) {
      if (context.aiAudioGated) {
        content = JSON.stringify({ ok: false, error: 'You are currently muted and waiting for a real human. Do not save notes or outcomes for automated messages.' });
      } else if (name === 'save_call_note' && args.outcome === 'not_interested' && isAudioClarification(context.lastProspectTurn)) {
        console.warn('[deepgram-bridge] Rejected unsupported refusal after an audio clarification:', { callSid: context.callSid });
        content = JSON.stringify({ ok: false, error: 'The prospect requested clarification or could not hear you; they did not refuse. Briefly identify yourself, ask if they can hear you, and continue listening. Do not say goodbye or mark not_interested.' });
      } else {
        try {
          const optOut = name === 'mark_do_not_call';
          const allowedOutcomes = ['called', 'interested', 'not_interested', 'followup'];
          let outcome = optOut ? 'do_not_call' : String(args.outcome || '');
          if (!optOut && !allowedOutcomes.includes(outcome)) {
            throw new Error('A valid call outcome is required.');
          }
          const note = String(optOut ? args.reason || 'Prospect requested no further calls.' : args.note || '').slice(0, 2000);
          const followupTimezone = outcome === 'followup' ? String(args.followup_timezone || '').trim().slice(0, 100) : '';
          const requestedFollowupAt = outcome === 'followup' ? String(args.followup_at || '').trim() : '';
          const parsedFollowupAt = requestedFollowupAt ? new Date(requestedFollowupAt) : null;
          const followupAt = parsedFollowupAt && Number.isFinite(parsedFollowupAt.getTime())
            && parsedFollowupAt.getTime() >= Date.now() + 1000
            ? parsedFollowupAt.toISOString()
            : null;
          if (outcome === 'followup' && (!followupAt || !followupTimezone)) {
            content = JSON.stringify({
              ok: false,
              error: 'Follow-up was not saved. Confirm an exact future date, time, and timezone, then call save_call_note again.',
            });
          } else {
            const contactName = String(args.contact_name || '').trim().slice(0, 160) || null;
            const callbackPhone = String(args.callback_phone || '').trim().slice(0, 40) || null;
            const email = normalizeEmailValue(args.email);
            const result = await saveCallResult({
              sessionId: context.sessionId, outcome, note, email, contactName, callbackPhone,
              followupAt, followupTimezone,
            });
            content = JSON.stringify(result);
          }
        } catch (error) {
          console.error('[deepgram-bridge] CRM tool failed:', error.message);
          content = JSON.stringify({ ok: false, error: `${error.message} Do not claim the outcome was saved.` });
        }
      }
    } else if (name === 'end_call') {
      if (context.aiAudioGated) {
        shouldEndCall = false;
        content = JSON.stringify({ ok: false, error: 'You are currently muted and waiting for a human. Do not end the call.' });
      } else if (isAudioClarification(context.lastProspectTurn) && context.audioRepairTurns < 2) {
        content = JSON.stringify({ ok: false, error: 'Do not end after the first hello, apology, or hearing problem. Repeat your short introduction, check whether they can hear you, and wait for their reply.' });
      } else {
        shouldEndCall = true;
        content = JSON.stringify({ ok: true, ending: true });
      }
    } else if (name === 'wait_for_human') {
      // The AI correctly called the wait function instead of speaking.
      context.aiAudioGated = true; // Ensure they stay gated
      content = JSON.stringify({ ok: true, message: 'You are now waiting. Keep waiting and do not speak.' });
    } else if (name === 'press_keypad') {
      // Compatibility cXML media streams cannot guarantee RFC2833 keypad
      // delivery mid-call. Treat phone menus as a machine result instead of
      // looping or pretending a key was accepted.
      shouldEndCall = true;
      content = JSON.stringify({ ok: true, ending: true, reason: 'IVR menu detected' });
    } else {
      content = JSON.stringify({ ok: false, error: 'This action is not enabled for this agent.' });
    }

    if (context.deepgramWs.readyState === WebSocket.OPEN) {
      context.deepgramWs.send(JSON.stringify({
        type: 'FunctionCallResponse',
        id: fn?.id,
        name,
        content,
      }));
    }

    if (shouldEndCall) {
      await closePhoneCall({
        callSid: context.callSid,
        signalWireWs: context.signalWireWs,
        sessionId: context.sessionId,
        reason: typeof args.reason === 'string' ? args.reason.slice(0, 200) : 'agent-end-call',
      });
    }
  }
}


async function handleDeepgramEvent(event, context) {
  if (context.closing) return;
  if (event.type === 'AgentThinking') {
    context.agentResponsePending = true;
    context.lastAgentActivityAt = Date.now();
  }
  if (event.type === 'InjectionRefused') {
    console.log('[deepgram-bridge] First-reply injection refused during an active turn:', {callSid: context.callSid});
    scheduleFirstReply(context);
    return;
  }
  if (event.type === 'UserStartedSpeaking') {
    if (context.firstReplyTimer) clearTimeout(context.firstReplyTimer);
    context.firstReplyTimer = null;
    context.prospectSpeaking = true;
    // Keep noise-driven VAD separate from packet playback and human detection.
    return;
  }

  if (event.type === 'ConversationText') {
    const transcript = extractConversationText(event);
    if (!transcript) return;

    // Track the latest confirmed prospect utterance.
    // A hallucinated rejection note must not override a clarification request.
    if (transcript.role === 'user') {
      // Each user ConversationText is a confirmed utterance. A new human
      // greeting after hold must not inherit the earlier hold announcement.
      context.lastProspectTurn = transcript.text;
      context.prospectSpeaking = false;
      if (context.agentHasSpoken && isAudioClarification(transcript.text)) context.audioRepairTurns += 1;
    }
    if (transcript.role === 'assistant') {
      context.agentResponsePending = true;
      context.lastAgentActivityAt = Date.now();
    }
    context.lastConversationRole = transcript.role;

    // ConversationText for the user is emitted at a confirmed end of turn.
    // Until this point, no AI audio is released to the phone or live monitor.
    if (transcript.role === 'user') context.userSpeaking = false;

    if (context.callSid) {
      broadcastCallTranscript(context.callSid, transcript.role === 'assistant' ? 'ai' : 'prospect', transcript.text);
    }
    await persistConversationText({ sessionId: context.sessionId, ...transcript });

    // P2 FIX: Remove 10-second detection lock so we analyze continuously
    if (transcript.role === 'user') {
      const detection = await detectCallStateFromTranscriptML(context.lastProspectTurn || transcript.text, context.agentConfig);

      // Enforce audio gate: block AI audio while an automated menu/announcement
      // is speaking. Flush any speculative greeting that Deepgram queued.
      context.aiAudioGated = detection?.action === 'wait' || isTerminalDetection(detection);
      if (context.aiAudioGated) clearFirstAudioRecovery(context);
      if (context.aiAudioGated && context.signalWireWs.readyState === WebSocket.OPEN) {
        // Marks acknowledged after a clear do not prove completed playback.
        context.pendingPlaybackMarks.clear();
        context.signalWireWs.send(JSON.stringify({ event: 'clear', streamSid: context.streamSid }));
        broadcastCallAudioClear(context.callSid);
      }

      if (detection?.state === CallStates.HUMAN_LIVE) {
        context.humanConfirmed = true;
        armFirstAudioDeadline(context);
        scheduleFirstReply(context);
        clearIvrTimeout(context);
        context.dtmfAttempts = 0;
      } else if (detection?.state === CallStates.IVR_OR_MENU) {
        clearIvrTimeout(context);
      }

      if (detection?.state && detection.state !== CallStates.HUMAN_LIVE && !context.detectionLocked) {
        await updateSession(
          context.sessionId,
          `UPDATE ai_call_sessions
           SET first_answer_type = COALESCE(first_answer_type, $1), call_state = $2
           WHERE id = $3`,
          [detection.state, detection.action || 'detected'],
        );
      }
      if (isTerminalDetection(detection) && !context.detectionLocked) {
        context.detectionLocked = true;
        const terminalStatus = detection.state === CallStates.VOICEMAIL ? 'voicemail' : 'no-answer';
        await query(
          `UPDATE enrichment_results er
           SET lead_stage = 'no_answer',
               raw_data = COALESCE(er.raw_data, '{}'::jsonb)
                 || jsonb_build_object(
                      'call_status', $1::text,
                      'answered_by', $2::text,
                      'ai_outcome', CASE WHEN $1::text = 'voicemail' THEN 'voicemail' ELSE 'no_answer' END,
                      'ai_outcome_source', 'ai',
                      'call_ended_at', NOW()::text
                    ),
               lead_notes = CONCAT_WS(E'\n', NULLIF(er.lead_notes, ''), $3::text)
           FROM ai_call_sessions s
           WHERE s.id = $4
             AND er.id = s.lead_id
             AND er.tenant_id = s.tenant_id
             AND s.id = (SELECT s2.id FROM ai_call_sessions s2
               WHERE s2.lead_id = s.lead_id AND s2.tenant_id = s.tenant_id
               ORDER BY s2.created_at DESC, s2.id DESC LIMIT 1)`,
          [
            terminalStatus,
            detection.state,
            `[AI Call] ${detection.state} detected from the live conversation; call ended.`,
            context.sessionId,
          ],
        );
        broadcastCallStatus(context.callSid, terminalStatus);
        await closePhoneCall({
          callSid: context.callSid,
          signalWireWs: context.signalWireWs,
          sessionId: context.sessionId,
          reason: detection.state,
        });
      }
    }
    return;
  }

  if (event.type === 'AgentAudioDone') {
    context.agentResponsePending = false;
    if (!context.firstReplySeen) scheduleFirstReply(context);
    if (context.signalWireWs.readyState === WebSocket.OPEN && !context.aiAudioGated) {
      const name = `ai-turn-${++context.playbackMarkSequence}`;
      context.pendingPlaybackMarks.add(name);
      context.signalWireWs.send(JSON.stringify({ event: 'mark', streamSid: context.streamSid, mark: { name } }));
    }
    return;
  }

  if (event.type === 'FunctionCallRequest') {
    await handleFunctionRequests(event, context);
    return;
  }

  if (event.type === 'LatencyReport') {
    await updateSession(
      context.sessionId,
      'UPDATE ai_call_sessions SET latency_report = $1::jsonb WHERE id = $2',
      [JSON.stringify(event)],
    );
    return;
  }

  if (event.type === 'Warning' || event.type === 'Error') {
    const message = String(event.description || event.message || event.code || event.type).slice(0, 2000);
    console.error(`[deepgram-bridge] ${event.type}: ${message}`);
    await updateSession(
      context.sessionId,
      'UPDATE ai_call_sessions SET last_error = $1, call_state = $2 WHERE id = $3',
      [message, event.type === 'Error' ? 'error' : 'warning'],
    );
    if (event.type === 'Warning' && /INJECT_AGENT_MESSAGE_DURING_USER_SPEECH/.test(String(event.code || '') + ' ' + message)) scheduleFirstReply(context);
    if (event.type === 'Error') {
      await closePhoneCall({
        callSid: context.callSid,
        signalWireWs: context.signalWireWs,
        sessionId: context.sessionId,
        reason: 'deepgram-error',
      });
    }
  }
}

export function attachDeepgramBridge(httpServer) {
  const wss = createVoiceAgentWebSocketServer(httpServer, '/api/voice/signalwire/deepgram-stream');

  wss.on('connection', (signalWireWs) => {
    console.log('[deepgram-bridge] SignalWire media stream connected.');
    let streamSid = null;
    let callSid = null;
    let sessionId = null;
    let deepgramWs = null;
    let deepgramReady = false;
    let settingsSent = false;
    let pendingAudioFrames = [];
    let agentConfig = null;
    let callTimer = null;
    let keepAliveTimer = null;
    let setupTimer = null;
    let streamRegistered = false;
    let agentStartedAt = null;
    let cleanupStarted = false;
    let startReceived = false;
    let sessionValidated = false;
    let signalWireAudioFrames = 0;
    let deepgramAudioFrames = 0;
    const context = {
      signalWireWs, streamSid, callSid, sessionId, deepgramWs, agentConfig,
      detectionLocked: false, aiAudioGated: false, dtmfAttempts: 0,
      lastDtmfAt: 0, ivrTimeout: null, userSpeaking: false,
      lastProspectTurn: '', lastConversationRole: null, audioRepairTurns: 0, agentHasSpoken: false,
      openingText: null, firstReplySeen: false, firstReplyAttempts: 0, firstReplyTimer: null,
      firstAudioTimer: null, humanConfirmed: false, prospectSpeaking: false,
      agentResponsePending: false, lastAgentActivityAt: 0, closing: false,
      endSilentCall: () => closePhoneCall({ callSid, signalWireWs, sessionId, reason: 'first-audio-timeout', lastError: 'No AI audio reached the phone after confirmed human greeting and bounded recovery' }),
      playbackMarkSequence: 0, pendingPlaybackMarks: new Set(),
    };

    const cleanup = async (state = 'stopped') => {
      if (cleanupStarted) return;
      cleanupStarted = true;
      context.closing = true;
      clearFirstAudioRecovery(context);
      if (setupTimer) clearTimeout(setupTimer);
      if (callTimer) clearTimeout(callTimer);
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      clearIvrTimeout(context);
      callTimer = null;
      keepAliveTimer = null;
      if (streamRegistered && callSid) { activeStreamSids.delete(callSid); activeStreamLanes.delete(callSid); }
      streamRegistered = false;
      if (deepgramWs) deepgramWs.terminate();
      if (!sessionValidated) return;
      try {
        await confirmProviderTermination(callSid, sessionId);
      } catch (error) {
        await query(`UPDATE ai_call_sessions SET call_state = 'ending', last_error = $1 WHERE id = $2`, [error.message, sessionId]);
        await query(`UPDATE ai_calling_lanes SET status = 'error', last_error = $1
          WHERE id = (SELECT lane_id FROM ai_call_sessions WHERE id = $2)`, [error.message, sessionId]);
        console.error('[deepgram-bridge] Lane held until provider teardown is confirmed:', error.message);
        cleanupStarted = false;
        return;
      }
      const durationSec = agentStartedAt
        ? Math.max(0, Math.round((Date.now() - agentStartedAt) / 1000))
        : 0;
      const estimatedCost = Number(((durationSec / 60) * env.AI_ESTIMATED_COST_USD_PER_MINUTE).toFixed(4));
      await updateSession(
        sessionId,
        `UPDATE ai_call_sessions
         SET ended_at = COALESCE(ended_at, NOW()),
             duration_sec = GREATEST(COALESCE(duration_sec, 0), $1),
             cost_estimate_usd = GREATEST(COALESCE(cost_estimate_usd, 0), $2),
             call_state = CASE WHEN hangup_reason IN ('bridge-error', 'deepgram-error', 'deepgram-disconnected', 'first-audio-timeout', 'deepgram-setup-timeout') THEN 'failed' ELSE CASE WHEN $3::text IN ('closed', 'stopped') THEN 'completed' ELSE $3::text END END
         WHERE id = $4`,
        [durationSec, estimatedCost, state],
      );

      // Only new completed audio-failure calls trip this check; a manual
      // resume after repair is allowed to make a fresh verification call.
      await query(`UPDATE ai_calling_lanes l SET status = 'error',
        last_error = 'Two consecutive AI audio failures; check the voice connection before resuming'
        WHERE l.id = (SELECT lane_id FROM ai_call_sessions WHERE id = $1
          AND hangup_reason IN ('first-audio-timeout', 'deepgram-setup-timeout')) AND l.status = 'running'
          AND $1 = (SELECT id FROM ai_call_sessions WHERE lane_id = l.id ORDER BY created_at DESC, id DESC LIMIT 1)
          AND (SELECT COUNT(*) FROM (
            SELECT hangup_reason FROM ai_call_sessions WHERE lane_id = l.id
              AND signalwire_call_sid IS NOT NULL AND ended_at IS NOT NULL
            ORDER BY created_at DESC, id DESC LIMIT 2
          ) recent WHERE hangup_reason IN ('first-audio-timeout', 'deepgram-setup-timeout')) = 2`, [sessionId]);
      await finalizeEndedCall(sessionId);
    };

    signalWireWs.on('message', async (raw) => {
      const message = safeJsonParse(raw.toString());
      if (!message) return;

      try {
        if (message.event === 'start') {
          if (startReceived) return;
          startReceived = true;
          const start = message.start || {};
          const parameters = readParameters(start);
          streamSid = start.streamSid || start.stream_sid || message.streamSid || null;
          callSid = start.callSid || start.call_sid || parameters.CallSid || null;
          sessionId = parameters.sessionId || parameters.session_id || null;

          console.log('[deepgram-bridge] SignalWire stream started:', {
            callSid,
            streamSid,
            hasSessionId: Boolean(sessionId),
          });

          if (!streamSid || !sessionId || !callSid || !env.DEEPGRAM_API_KEY) {
            console.error('[deepgram-bridge] Missing stream, session, or Deepgram configuration; closing stream.');
            signalWireWs.close(1008, 'invalid-agent-stream');
            return;
          }

          const session = await loadSessionContext(sessionId);
          if (cleanupStarted) return;
          if (!session || session.ended_at || session.signalwire_call_sid !== callSid) {
            sessionId = null;
            callSid = null;
            signalWireWs.close(1008, 'invalid-session');
            return;
          }
          if (activeStreamSids.has(callSid)) {
            sessionId = null;
            callSid = null;
            signalWireWs.close(1008, 'duplicate-session');
            return;
          }
          sessionValidated = true;
          const isLaneCall = Boolean(session.lane_id && session.verified_lane_slot >= 1 && session.verified_lane_slot <= 4);
          const laneOccupied = isLaneCall && [...activeStreamLanes.values()].includes(session.lane_id);
          const singleActive = [...activeStreamLanes.values()].filter(laneId => !laneId).length;
          if (laneOccupied || (!isLaneCall && singleActive >= env.AI_MAX_ACTIVE_CALLS)) {
            await closePhoneCall({ callSid, signalWireWs, sessionId, reason: 'active-call-limit' });
            return;
          }
          // Reserve before the next await so simultaneous streams cannot exceed the cap.
          activeStreamSids.add(callSid);
          activeStreamLanes.set(callSid, isLaneCall ? session.lane_id : null);
          streamRegistered = true;
          if (!session.agent_config?.id) {
            console.error('[deepgram-bridge] No active agent configuration for session; closing stream.');
            await closePhoneCall({ callSid, signalWireWs, sessionId, reason: 'missing-agent-config' });
            return;
          }

          agentConfig = { ...session.agent_config, end_on_ai_receptionist: true };
          agentStartedAt = Date.now();
          context.streamSid = streamSid;
          context.callSid = callSid;
          context.sessionId = sessionId;
          context.agentConfig = agentConfig;
          await updateSession(
            sessionId,
            `UPDATE ai_call_sessions
             SET signalwire_stream_sid = $1, answered_at = COALESCE(answered_at, NOW()), call_state = 'streaming'
             WHERE id = $2`,
            [streamSid],
          );
          if (cleanupStarted) return;

          const maxSeconds = Math.min(
            env.AI_MAX_SECONDS_PER_CALL,
            Math.max(60, Number(agentConfig.max_call_duration_sec || env.AI_MAX_SECONDS_PER_CALL)),
          );
          callTimer = setTimeout(() => {
            closePhoneCall({ callSid, signalWireWs, sessionId, reason: 'max-call-duration' }).catch((error) => {
              console.error('[deepgram-bridge] Duration cap hangup failed:', error.message);
            });
          }, maxSeconds * 1000);

          setupTimer = setTimeout(() => {
            if (!cleanupStarted && !deepgramReady) closePhoneCall({ callSid, signalWireWs, sessionId,
              reason: 'deepgram-setup-timeout', lastError: 'Deepgram settings were not acknowledged within 15 seconds' }).catch(() => null);
          }, 15000);
          deepgramWs = new WebSocket('wss://agent.deepgram.com/v1/agent/converse', {
            headers: { Authorization: `Token ${env.DEEPGRAM_API_KEY}` },
          });
          context.deepgramWs = deepgramWs;

          const sendSettings = () => {
            if (settingsSent || deepgramWs?.readyState !== WebSocket.OPEN) return;
            const leadData = {
              company_name: session.company_name,
              company: session.company_name,
              niche_name: session.niche_name || session.industry_guess,
              industry: session.industry_guess,
              first_name: session.first_name || (session.contact_name ? session.contact_name.split(' ')[0] : ''),
              last_name: session.last_name || (session.contact_name ? session.contact_name.split(' ').slice(1).join(' ') : ''),
              name: session.contact_name || [session.first_name, session.last_name].filter(Boolean).join(' ') || session.company_name,
              phone: session.customer_phone_number || session.primary_phone,
              email: session.primary_email,
              website: session.domain,
              city: session.city,
              state: session.state,
              title: session.title,
              notes: session.notes,
              agent_name: agentConfig?.name || 'our representative',
              offer_name: agentConfig?.offer_name || 'our service',
              meeting_length: agentConfig?.meeting_length || '15 minutes'
            };
            try {
              const settings = buildDeepgramSettings(
                leadData,
                agentConfig,
                {
                  compiledScriptPrompt: session.compiled_script_prompt,
                  laneId: session.lane_id,
                  scriptVersionId: session.script_version_id
                }
              );
              const openingNode = session.script_definition?.nodes?.find(node => node.type === 'opening');
              const opening = openingNode?.data?.text || (!session.compiled_script_prompt ? agentConfig.greeting : null);
              if (typeof opening === 'string' && opening.trim()) context.openingText = replaceTemplateVars(opening, leadData).replaceAll('{company_name}', session.company_name || 'your business');
              deepgramWs.send(JSON.stringify(settings));
              settingsSent = true;
              
              const listenProvider = settings.agent?.listen?.provider || {};
              const speakProvider = settings.agent?.speak?.provider || {};
              console.log('[deepgram-bridge] Deepgram settings sent:', {
                callSid,
                sessionId,
                voice: speakProvider.model,
                speakSpeed: speakProvider.speed,
                listenModel: listenProvider.model,
                eotThreshold: listenProvider.eot_threshold,
                eotTimeoutMs: listenProvider.eot_timeout_ms,
              });
            } catch (err) {
              console.error('[deepgram-bridge] Failed to build or send settings:', err);
              closePhoneCall({ 
                callSid, 
                signalWireWs, 
                sessionId, 
                reason: 'bridge-error',
                lastError: err.message || 'Failed to initialize settings'
              }).catch(() => null);
              
              if (deepgramWs.readyState === WebSocket.OPEN) {
                deepgramWs.close();
              }
              return false;
            }
            return true;
          };

          // Follow the provider handshake: Welcome -> Settings -> SettingsApplied.
          deepgramWs.on('open', () => {
            console.log('[deepgram-bridge] Deepgram WebSocket connected:', { callSid, sessionId });
          });

          deepgramWs.on('unexpected-response', (_request, response) => {
            console.error(`[deepgram-bridge] Unexpected Deepgram response: ${response.statusCode}`);
            closePhoneCall({ callSid, signalWireWs, sessionId, reason: `deepgram-${response.statusCode}` }).catch(() => null);
          });

          deepgramWs.on('message', async (data, isBinary) => {
            try {
            if (cleanupStarted || context.closing) return;
            if (isBinary) {
              deepgramAudioFrames += 1;
              if (deepgramAudioFrames === 1) {
                console.log('[deepgram-bridge] First AI audio frame received from Deepgram:', {
                  callSid,
                  bytes: data.length,
                });
              }
              // Enforce audio gate: if we are supposed to wait, discard the AI's audio payload
              if (context.aiAudioGated || context.userSpeaking) {
                return;
              }
              if (signalWireWs.readyState === WebSocket.OPEN) {
                // Use the same boosted samples for the customer and live monitor.
                const outputAudio = applyMulawGain(data, env.AI_AGENT_OUTPUT_GAIN);
                const payload = outputAudio.toString('base64');
                // Calculate when this audio chunk will finish playing (PCMU is 8000 bytes/sec)
                const chunkDurationMs = (data.length / 8000) * 1000;
                const now = Date.now();
                if (!context.aiAudioExpectedEndTime || now > context.aiAudioExpectedEndTime) {
                  context.aiAudioExpectedEndTime = now + chunkDurationMs;
                } else {
                  context.aiAudioExpectedEndTime += chunkDurationMs;
                }
                signalWireWs.send(JSON.stringify({ event: 'media', streamSid, media: { payload } }), (error) => {
                  if (error) {
                    console.error('[deepgram-bridge] AI audio could not be sent to SignalWire:', error.message);
                  } else {
                    const firstForwarded = !context.firstReplySeen;
                    markFirstAudioForwarded(context);
                    if (firstForwarded) console.log('[deepgram-bridge] First AI audio frame sent to SignalWire:', { callSid, streamSid, outputGain: env.AI_AGENT_OUTPUT_GAIN });
                  }
                });
                if (callSid) broadcastCallAudio(callSid, 'ai', payload);
              }
              return;
            }

            const event = safeJsonParse(data.toString());
            if (!event) return;
            if (["AgentThinking", "ConversationText", "AgentAudioDone", "Warning", "Error", "UserStartedSpeaking"].includes(event.type)) {
              console.log('[deepgram-bridge] Deepgram event:', {
                callSid,
                type: event.type,
                role: event.role || null,
                description: event.description || event.message || null,
              });
            }
            if (event.type === 'Welcome') {
              console.log('[deepgram-bridge] Deepgram welcome received:', { callSid, sessionId });
              sendSettings();
            }
            if (event.type === 'SettingsApplied') {
              console.log('[deepgram-bridge] Deepgram settings applied:', { callSid, sessionId, pendingFrames: pendingAudioFrames.length });
              deepgramReady = true;
              if (setupTimer) clearTimeout(setupTimer);
              setupTimer = null;
              if (!keepAliveTimer) keepAliveTimer = setInterval(() => {
                if (!cleanupStarted && deepgramWs.readyState === WebSocket.OPEN) deepgramWs.send(JSON.stringify({ type: 'KeepAlive' }));
              }, 15000);
              for (const frame of pendingAudioFrames) {
                if (deepgramWs.readyState === WebSocket.OPEN) deepgramWs.send(frame);
              }
              pendingAudioFrames = [];
            }
            await handleDeepgramEvent(event, context);
            } catch (error) {
              console.error('[deepgram-bridge] Agent event failed:', error.message);
              await closePhoneCall({ callSid, signalWireWs, sessionId, reason: 'bridge-error' }).catch(() => null);
            }
          });

          deepgramWs.on('close', (code, reason) => {
            console.log('[deepgram-bridge] Deepgram WebSocket closed:', {
              callSid,
              sessionId,
              code,
              reason: reason?.toString() || '',
            });
            if (!cleanupStarted) closePhoneCall({ callSid, signalWireWs, sessionId, reason: 'deepgram-disconnected' }).catch(() => null);
          });
          deepgramWs.on('error', (error) => console.error('[deepgram-bridge] WebSocket error:', error.message));
          return;
        }

        if (message.event === 'media' && message.media?.payload) {
          if (!sessionValidated || !streamRegistered || cleanupStarted) return;
          const audio = Buffer.from(message.media.payload, 'base64');
          signalWireAudioFrames += 1;
          if (signalWireAudioFrames === 1) {
            console.log('[deepgram-bridge] First customer audio frame received from SignalWire:', {
              callSid,
              bytes: audio.length,
            });
          }
          if (callSid) broadcastCallAudio(callSid, 'prospect', message.media.payload);
          
          // Keep both directions live. Never discard a prospect's words merely
          // because our TTS has queued audio; that loses greetings and repairs.
          if (deepgramWs?.readyState === WebSocket.OPEN && deepgramReady) {
            deepgramWs.send(audio);
          } else {
            if (pendingAudioFrames.length >= MAX_PENDING_AUDIO_FRAMES) pendingAudioFrames.shift();
            pendingAudioFrames.push(audio);
          }
          return;
        }

        if (message.event === 'mark') {
          const name = message.mark?.name;
          if (context.pendingPlaybackMarks.delete(name)) {
            console.log('[deepgram-bridge] SignalWire acknowledged AI audio playback:', { callSid, mark: name });
          }
          return;
        }

        if (message.event === 'stop') {
          console.log('[deepgram-bridge] SignalWire stream stopped:', {
            callSid,
            sessionId,
            customerAudioFrames: signalWireAudioFrames,
            aiAudioFrames: deepgramAudioFrames,
          });
          await cleanup('stopped');
        }
      } catch (error) {
        console.error('[deepgram-bridge] SignalWire message failed:', error.message);
        if (sessionValidated) await closePhoneCall({ callSid, signalWireWs, sessionId, reason: 'bridge-error' });
        else signalWireWs.close(1008, 'invalid-agent-stream');
      }
    });

    signalWireWs.on('close', (code, reason) => {
      console.log('[deepgram-bridge] SignalWire media stream closed:', {
        callSid,
        sessionId,
        code,
        reason: reason?.toString() || '',
      });
      cleanup('closed').catch((error) => {
      console.error('[deepgram-bridge] Cleanup failed:', error.message);
      });
    });
  });

  console.log('[deepgram-bridge] SignalWire bridge attached at /api/voice/signalwire/deepgram-stream');
}
