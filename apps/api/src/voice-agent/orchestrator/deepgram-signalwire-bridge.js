import { WebSocket } from 'ws';
import fs from 'node:fs/promises';
import path from 'node:path';
import { RestClient } from '@signalwire/compatibility-api';
import { env } from '../config/env.js';
import { buildDeepgramSettings } from '../providers/deepgram-agent.js';
import { query } from '../../calls-module/db/index.js';
import { broadcastCallAudio, broadcastCallTranscript, broadcastCallAudioClear, broadcastCallStatus } from '../websocket/call-monitor.js';
import { detectCallStateFromTranscript, detectCallStateFromTranscriptML, CallStates } from '../detection/call-state-detector.js';
import { createVoiceAgentWebSocketServer } from '../websocket/upgrade-router.js';

const MAX_PENDING_AUDIO_FRAMES = 100;
const activeStreamSids = new Set();

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
    && [CallStates.VOICEMAIL, CallStates.IVR_OR_MENU, CallStates.CLOSED_OR_HOURS].includes(detection?.state);
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

  const voicemailPatterns = [
    /\b(?:leave|record)\s+(?:a\s+)?message\b/,
    /\b(?:after|at)\s+the\s+(?:tone|beep)\b/,
    /\b(?:mailbox|voice\s*mail)\s+(?:is\s+)?(?:full|not\s+set\s+up|unavailable)\b/,
    /\b(?:your\s+call\s+has\s+been\s+forwarded|person\s+you\s+are\s+trying\s+to\s+reach)\b/,
  ];
  const ivrPatterns = [
    /\b(?:press|dial)\s+(?:the\s+)?(?:[0-9]|zero|one|two|three|four|five|six|seven|eight|nine)\b/,
    /\b(?:listen\s+carefully|menu\s+options|for\s+(?:sales|service|support|billing))\b/,
    /\b(?:recorded|monitored)\s+for\s+(?:quality|training)\b/,
  ];
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
  const hasVoicemail = voicemailPatterns.some((pattern) => pattern.test(allUserText));
  const hasIvr = ivrPatterns.some((pattern) => pattern.test(allUserText));
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
  if (hasRejection && !hasInterest) return { outcome: 'not_interested', summary: `Prospect clearly declined the offer (${durationSec}s).` };
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

async function closePhoneCall({ callSid, signalWireWs, sessionId, reason }) {
  await updateSession(
    sessionId,
    `UPDATE ai_call_sessions
     SET hangup_reason = COALESCE($1, hangup_reason),
         call_state = 'ending',
         ended_at = COALESCE(ended_at, NOW())
     WHERE id = $2`,
    [reason || 'agent-ended'],
  );

  if (callSid) {
    const client = createSignalWireClient();
    if (client) {
      try {
        await client.calls(callSid).update({ status: 'completed' });
        return;
      } catch (error) {
        console.error('[deepgram-bridge] SignalWire hangup failed:', error.message);
      }
    }
  }

  if (signalWireWs.readyState === WebSocket.OPEN) {
    signalWireWs.close(1000, reason || 'agent-ended');
  }
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
       sv.compiled_prompt as compiled_script_prompt,
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
            && parsedFollowupAt.getTime() >= Date.now() + 5 * 60 * 1000
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
            // Giving a valid address for information/management review is a
            // positive handoff. Never discard it as a rejection.
            if (email && outcome === 'not_interested') outcome = 'interested';
            const { rows } = await query(
            `WITH session AS (
               UPDATE ai_call_sessions SET outcome = $1, summary = $2 WHERE id = $3
               RETURNING lead_id, tenant_id
             ), lead AS (
               UPDATE enrichment_results er
               SET lead_stage = CASE
                     WHEN $1 = 'interested' THEN 'interested'
                     WHEN $1 = 'followup' THEN 'followup'
                     WHEN $1 IN ('not_interested', 'do_not_call') THEN 'closed_lost'
                     ELSE er.lead_stage
                   END,
                   next_followup_at = CASE
                     WHEN $1 = 'followup' THEN $5::timestamptz
                     WHEN $1 IN ('not_interested', 'do_not_call') THEN NULL
                     ELSE er.next_followup_at
                   END,
                   last_contacted_at = NOW(),
                   ai_summary = $2,
                   primary_email = COALESCE($9::text, NULLIF(er.primary_email, '')),
                   ai_updated_at = NOW(),
                   lead_notes = CONCAT_WS(E'\\n', NULLIF(er.lead_notes, ''), $2),
                   do_not_call = er.do_not_call OR $4,
                   ai_voice_consent = er.ai_voice_consent AND NOT $4,
                   raw_data = COALESCE(er.raw_data, '{}'::jsonb)
                     || jsonb_strip_nulls(jsonb_build_object(
                          'ai_outcome', $1::text,
                          'ai_outcome_source', 'live_tool',
                          'followup_at', $5::text,
                          'followup_timezone', NULLIF($6::text, ''),
                          'contact_name', $7::text,
                          'callback_phone', $8::text,
                          'email', $9::text
                        ))
               FROM session s WHERE er.id = s.lead_id AND er.tenant_id = s.tenant_id
               RETURNING er.id, er.tenant_id, COALESCE(er.company_name, er.domain, 'Lead') AS display_name,
                         er.raw_data->>'source_contact_id' AS contact_id
             ), followup_task AS (
               INSERT INTO tasks (tenant_id, lead_id, title, description, task_type, due_at, status, priority)
               SELECT l.tenant_id, l.id,
                      CASE WHEN $9::text IS NOT NULL THEN 'Email follow-up: ' || l.display_name ELSE 'AI follow-up: ' || l.display_name END,
                      $2, 'followup',
                      CASE WHEN $1 = 'followup' THEN $5::timestamptz ELSE NOW() END,
                      'open', 'high'
               FROM lead l
               WHERE (($1 = 'followup' AND $5::timestamptz IS NOT NULL) OR $9::text IS NOT NULL)
                 AND NOT EXISTS (
                   SELECT 1 FROM tasks t
                   WHERE t.lead_id = l.id AND t.task_type = 'followup' AND t.status = 'open'
                     AND (
                       ($1 = 'followup' AND t.due_at = $5::timestamptz)
                       OR ($9::text IS NOT NULL AND t.title = 'Email follow-up: ' || l.display_name)
                     )
                 )
               RETURNING id
             ), contact_update AS (
               UPDATE contacts SET do_not_call = true, ai_voice_consent = false
               WHERE $4 AND id::text IN (SELECT contact_id FROM lead)
               RETURNING id
             )
             SELECT
               EXISTS(SELECT 1 FROM lead) AS saved,
               EXISTS(SELECT 1 FROM followup_task) AS followup_task_created`,
              [outcome, note, context.sessionId, optOut, followupAt, followupTimezone, contactName, callbackPhone, email],
            );
            content = JSON.stringify({
              ok: rows[0]?.saved === true,
              saved: rows[0]?.saved === true,
              outcome,
              followup_at: followupAt,
              followup_timezone: followupTimezone || null,
              followup_task_created: rows[0]?.followup_task_created === true,
            });
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
  if (event.type === 'UserStartedSpeaking') {
    /* VAD clear removed to prevent chopping on noise */
    return;
  }

  if (event.type === 'ConversationText') {
    const transcript = extractConversationText(event);
    if (!transcript) return;

    // ConversationText for the user is emitted at a confirmed end of turn.
    // Until this point, no AI audio is released to the phone or live monitor.
    if (transcript.role === 'user') context.userSpeaking = false;

    if (context.callSid) {
      broadcastCallTranscript(context.callSid, transcript.role === 'assistant' ? 'ai' : 'prospect', transcript.text);
    }
    await persistConversationText({ sessionId: context.sessionId, ...transcript });

    // P2 FIX: Remove 10-second detection lock so we analyze continuously
    if (transcript.role === 'user') {
      const detection = await detectCallStateFromTranscriptML(transcript.text, context.agentConfig);

      // Enforce audio gate: block AI audio while an automated menu/announcement
      // is speaking. Flush any speculative greeting that Deepgram queued.
      context.aiAudioGated = detection?.action === 'wait' || isTerminalDetection(detection);
      if (context.aiAudioGated && context.signalWireWs.readyState === WebSocket.OPEN) {
        context.signalWireWs.send(JSON.stringify({ event: 'clear', streamSid: context.streamSid }));
        broadcastCallAudioClear(context.callSid);
      }

      if (detection?.state === CallStates.HUMAN_LIVE) {
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
             AND er.tenant_id = s.tenant_id`,
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
    };

    const cleanup = async (state = 'stopped') => {
      if (cleanupStarted) return;
      cleanupStarted = true;
      if (callTimer) clearTimeout(callTimer);
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      clearIvrTimeout(context);
      callTimer = null;
      keepAliveTimer = null;
      if (streamRegistered && callSid) activeStreamSids.delete(callSid);
      streamRegistered = false;
      if (deepgramWs) deepgramWs.terminate();
      if (!sessionValidated) return;
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
             call_state = CASE WHEN call_state IN ('ending', 'error') THEN call_state ELSE $3 END
         WHERE id = $4`,
        [durationSec, estimatedCost, state],
      );

      // P0 FIX: Always write a fallback outcome+summary when the AI tool didn't fire.
      // Previously 97% of calls had NULL outcome because the prospect hung up before
      // the AI could call save_call_note. Now bridge cleanup derives outcome from
      // hangup_reason + duration + TRANSCRIPT CONTENT as a reliable fallback.
      if (sessionId) {
        let session = null;
        let fallbackOutcome = 'called';
        try {
          const { rows: sessionRows } = await query(
            `SELECT s.outcome, s.hangup_reason, s.duration_sec, s.first_answer_type, s.call_state, s.queue_item_id, s.lane_id,
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
            } else if (['deepgram-error', 'deepgram-disconnected', 'bridge-error'].includes(hr)) {
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
            await query(
              `UPDATE ai_call_sessions
               SET outcome = COALESCE(outcome, $1),
                   summary = COALESCE(summary, $2)
               WHERE id = $3 AND outcome IS NULL`,
              [fallbackOutcome, fallbackSummary, sessionId],
            );
            console.log(`[deepgram-bridge] Fallback outcome written: ${fallbackOutcome} — ${fallbackSummary}`);
          }

          const capturedEmail = reconcileEmailWithLeadDomain(
            extractEmailFromTranscript(session?.transcript),
            session?.lead_domain,
          );
          if (capturedEmail) {
            await query(
              `WITH updated_session AS (
                 UPDATE ai_call_sessions
                 SET outcome = CASE WHEN outcome IN ('not_interested', 'called') OR outcome IS NULL THEN 'interested' ELSE outcome END,
                     summary = CASE
                       WHEN outcome IN ('not_interested', 'called') OR outcome IS NULL
                         THEN 'Prospect provided an email for information or management follow-up.'
                       ELSE summary
                     END
                 WHERE id = $1
                 RETURNING lead_id, tenant_id
               ), updated_lead AS (
                 UPDATE enrichment_results er
                 SET primary_email = $2,
                     raw_data = COALESCE(er.raw_data, '{}'::jsonb)
                       || jsonb_build_object('email', $2::text, 'email_source', 'ai_transcript'),
                     ai_updated_at = NOW()
                 FROM updated_session s
                 WHERE er.id = s.lead_id AND er.tenant_id = s.tenant_id
                 RETURNING er.id, er.tenant_id, COALESCE(er.company_name, er.domain, 'Lead') AS display_name
               ), email_task AS (
                 INSERT INTO tasks (tenant_id, lead_id, title, description, task_type, due_at, status, priority)
                 SELECT l.tenant_id, l.id, 'Email follow-up: ' || l.display_name,
                        'Prospect provided ' || $2::text || ' for information or management follow-up.',
                        'followup', NOW(), 'open', 'high'
                 FROM updated_lead l
                 WHERE NOT EXISTS (
                   SELECT 1 FROM tasks t
                   WHERE t.lead_id = l.id AND t.task_type = 'followup' AND t.status = 'open'
                     AND t.title = 'Email follow-up: ' || l.display_name
                 )
                 RETURNING id
               )
               SELECT EXISTS(SELECT 1 FROM updated_lead) AS saved`,
              [sessionId, capturedEmail],
            );
            console.log(`[deepgram-bridge] Prospect email captured from transcript for session ${sessionId}.`);
          }
        } catch (fallbackErr) {
          console.error('[deepgram-bridge] Fallback outcome write failed:', fallbackErr.message);
        }

        await query(
          `UPDATE enrichment_results er
           SET lead_stage = CASE
                 WHEN s.outcome IN ('do_not_call', 'not_interested') THEN 'closed_lost'
                 WHEN s.outcome = 'interested' THEN 'interested'
                 WHEN s.outcome = 'followup' THEN 'followup'
                 WHEN s.outcome IN ('voicemail', 'no_answer', 'technical_error') THEN 'no_answer'
                 WHEN s.hangup_reason IN ('VOICEMAIL', 'IVR_OR_MENU', 'AI_RECEPTIONIST_OR_BOT', 'CLOSED_OR_HOURS', 'deepgram-error', 'deepgram-disconnected', 'bridge-error') THEN 'no_answer'
                 ELSE 'called' END,
               ai_summary = COALESCE(s.summary, er.ai_summary),
               do_not_call = COALESCE(er.do_not_call, false) OR s.outcome = 'do_not_call',
               ai_voice_consent = COALESCE(er.ai_voice_consent, false) AND s.outcome <> 'do_not_call',
               raw_data = (COALESCE(er.raw_data, '{}'::jsonb) - 'active_call_sid') || jsonb_build_object(
                 'call_duration_seconds', $2::int,
                 'call_ended_at', NOW()::text,
                 'ai_outcome', COALESCE(s.outcome, 'called'),
                 'ai_outcome_source', 'ai'
               )
           FROM ai_call_sessions s
           WHERE s.id = $1 AND er.id = s.lead_id AND er.tenant_id = s.tenant_id
             AND er.lead_stage IN ('calling', 'called', 'no_answer', 'completed', 'interested', 'not_interested', 'followup', 'closed_lost')
             AND s.id = (SELECT s2.id FROM ai_call_sessions s2 WHERE s2.lead_id = s.lead_id ORDER BY s2.created_at DESC, s2.id DESC LIMIT 1)`,
          [sessionId, durationSec],
        );
        
        if (session && session.queue_item_id) {
          const finalState = ['technical_error', 'bridge-error', 'deepgram-error', 'provider_error'].includes(fallbackOutcome) ? 'failed' : 'completed';
          await query(
            `UPDATE ai_call_queue_items SET state = $1, last_error = $2 WHERE id = $3 AND state NOT IN ('completed', 'failed', 'cancelled')`,
            [finalState, session.hangup_reason || null, session.queue_item_id]
          );
        }
        await writeTranscriptFile(sessionId, callSid);

      }
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
          if (process.env.ENABLE_MULTI_AI_CALLING !== 'true' && activeStreamSids.size >= env.AI_MAX_ACTIVE_CALLS) {
            await closePhoneCall({ callSid, signalWireWs, sessionId, reason: 'active-call-limit' });
            return;
          }
          // Reserve before the next await so simultaneous streams cannot exceed the cap.
          activeStreamSids.add(callSid);
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
            };
            const settings = buildDeepgramSettings(
              leadData,
              agentConfig,
              {
                compiledScriptPrompt: session.compiled_script_prompt,
                laneId: session.lane_id,
                scriptVersionId: session.script_version_id
              }
            );
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
          };

          // Deepgram expects Settings as soon as its WebSocket is ready. Waiting
          // only for a Welcome event can leave a live phone call with no greeting.
          deepgramWs.on('open', () => {
            console.log('[deepgram-bridge] Deepgram WebSocket connected:', { callSid, sessionId });
            sendSettings();
            keepAliveTimer = setInterval(() => {
              if (deepgramWs.readyState === WebSocket.OPEN) deepgramWs.send(JSON.stringify({ type: 'KeepAlive' }));
            }, 15000);
          });

          deepgramWs.on('unexpected-response', (_request, response) => {
            console.error(`[deepgram-bridge] Unexpected Deepgram response: ${response.statusCode}`);
            closePhoneCall({ callSid, signalWireWs, sessionId, reason: `deepgram-${response.statusCode}` }).catch(() => null);
          });

          deepgramWs.on('message', async (data, isBinary) => {
            try {
            if (cleanupStarted) return;
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
                const payload = data.toString('base64');
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
                  } else if (deepgramAudioFrames === 1) {
                    console.log('[deepgram-bridge] First AI audio frame sent to SignalWire:', { callSid, streamSid });
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
          
          // Mute user audio if the AI is actively speaking on the phone. This prevents
          // background noise or speakerphone echo from triggering Deepgram's VAD
          // and abruptly cutting off the AI's sentence.
          if (context.aiAudioExpectedEndTime && Date.now() < context.aiAudioExpectedEndTime) {
            return;
          }

          if (deepgramWs?.readyState === WebSocket.OPEN && deepgramReady) {
            deepgramWs.send(audio);
          } else {
            if (pendingAudioFrames.length >= MAX_PENDING_AUDIO_FRAMES) pendingAudioFrames.shift();
            pendingAudioFrames.push(audio);
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
