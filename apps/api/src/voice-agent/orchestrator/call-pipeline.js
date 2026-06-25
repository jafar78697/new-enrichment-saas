/**
 * Call Orchestrator — Voice Architecture v3 (Event-Driven Voice Kernel)
 */

import { createOpenAISession } from '../services/llm/openai-realtime.service.js';
import { getSystemPrompt, getNicheGuidance } from '../services/llm/prompts/system-prompts.js';
import { broadcastCallAudio, broadcastCallTranscript } from '../websocket/call-monitor.js';
import { VoiceKernel } from './voice.kernel.js';

import {
  createSession,
  getSession,
  updateSession,
  addConversationTurn,
  setState,
  incrementInterruptions,
  deleteSession,
} from '../services/session/session-store.js';
import { onStreamEvent, sendMediaToTwilio, clearTwilioAudio, sendDtmfToTwilio } from '../websocket/media-server.js';
import { env } from '../config/env.js';
import { processPostCall } from '../services/post-call/processor.js';
import { query } from '../../calls-module/db/index.js';
import twilio from 'twilio';

// Active pipeline instances per streamSid
const activePipelines = new Map();

function classifyCallSignal(text = '') {
  const lower = String(text || '').toLowerCase().trim();
  let ownerConfidenceDelta = 0;
  let detectedRole = null;
  let suggestedMode = 'openai_owner';
  let auditLabel = null;

  if (!lower) {
    return { ownerConfidenceDelta, detectedRole, suggestedMode, auditLabel };
  }

  if (/(press\s+\d|for sales|for support|for billing|for appointments|main menu|please listen carefully|operator)/.test(lower)) {
    detectedRole = 'ivr';
    suggestedMode = 'openai_owner';
    auditLabel = 'ivr_detected';
  } else if (/(owner speaking|i am the owner|i'm the owner|this is the owner|speaking|i handle that|i'm the manager|i am the manager|person who handles calls)/.test(lower)) {
    detectedRole = 'owner';
    suggestedMode = 'openai_owner';
    auditLabel = 'owner_connected';

    if (/(owner speaking|i am the owner|i'm the owner|this is the owner)/.test(lower)) ownerConfidenceDelta += 0.4;
    if (/(speaking)/.test(lower)) ownerConfidenceDelta += 0.4;
    if (/(i handle that|person who handles calls)/.test(lower)) ownerConfidenceDelta += 0.25;
    if (/(i'm the manager|i am the manager)/.test(lower)) ownerConfidenceDelta += 0.4;
  } else if (/(how can i help you|please hold|hold on|one moment|let me transfer|who is calling|what is this about|front desk|reception)/.test(lower)) {
    detectedRole = 'gatekeeper';
    suggestedMode = 'openai_owner';
    auditLabel = /transfer/.test(lower) ? 'transferred_to_owner' : 'receptionist_reached';

    if (/(let me transfer|hold on|one moment)/.test(lower)) ownerConfidenceDelta += 0.2;
  } else if (/(support|billing|customer service|wrong department)/.test(lower)) {
    detectedRole = 'non_owner_department';
    suggestedMode = 'openai_owner';
    auditLabel = 'wrong_department';
    ownerConfidenceDelta -= 0.5;
  } else if (/(not interested|stop calling|do not call|remove me)/.test(lower)) {
    detectedRole = 'opt_out';
    suggestedMode = 'ended';
    auditLabel = 'do_not_call';
  } else if (/(call back|callback|try again later|owner is not here|not available)/.test(lower)) {
    detectedRole = 'callback';
    suggestedMode = 'openai_owner';
    auditLabel = 'callback_requested';
  }

  return { ownerConfidenceDelta, detectedRole, suggestedMode, auditLabel };
}

async function processTranscriptSignal({ streamSid, callSid, customParams, text, source = 'openai' }) {
  const session = await getSession(callSid);
  const currentMeta = session?.metadata || {};
  const currentConfidence = Number(currentMeta.ownerConfidence || 0);
  const signal = classifyCallSignal(text);
  const nextConfidence = Math.max(0, Math.min(1, currentConfidence + signal.ownerConfidenceDelta));
  const ownerConfirmed = nextConfidence >= 0.75 || signal.detectedRole === 'owner';
  const voiceMode = ownerConfirmed ? 'openai_owner' : signal.suggestedMode || currentMeta.voiceMode || 'openai_owner';
  const ownerHandoffTriggered = Boolean(currentMeta.ownerHandoffTriggered);

  if (session) {
    await updateSession(callSid, {
      metadata: {
        ...currentMeta,
        ownerConfidence: nextConfidence,
        ownerConfirmed,
        voiceMode,
        detectedRole: signal.detectedRole || currentMeta.detectedRole || 'unknown',
        premiumStartedAt: ownerConfirmed ? (currentMeta.premiumStartedAt || new Date().toISOString()) : (currentMeta.premiumStartedAt || null),
        lastTranscriptSource: source,
      },
    });
  }

  if (ownerConfirmed && !ownerHandoffTriggered) {
    const pipeline = activePipelines.get(streamSid);
    const leadContext = currentMeta.leadFastContext || null;
    const handoffPacket = leadContext
      ? `OWNER CONFIRMED. Fast handoff packet:
Company: ${leadContext.company}
Niche: ${leadContext.niche}
What they do: ${leadContext.pitch}
Pain points: ${leadContext.pain}
Goal: ${leadContext.ownerGoal}

The owner just said: "${text}"

Reply immediately in one short natural sentence. First answer what the owner said, then continue briefly.`
      : `OWNER CONFIRMED. The owner just said: "${text}". Reply immediately in one short natural sentence. First answer what the owner said, then continue briefly.`;

    pipeline?.gatekeeperEngine?.stopSpeaking?.();
    pipeline?.gatekeeperEngine?.close?.();
    if (pipeline) {
      pipeline.mode = 'openai_owner';
      pipeline.gatekeeperEngine = null;
    }
    pipeline?.openaiSession?.triggerResponse(handoffPacket);

    if (session) {
      await updateSession(callSid, {
        metadata: {
          ...currentMeta,
          ownerConfidence: nextConfidence,
          ownerConfirmed: true,
          voiceMode: 'openai_owner',
          detectedRole: signal.detectedRole || 'owner',
          premiumStartedAt: currentMeta.premiumStartedAt || new Date().toISOString(),
          ownerHandoffTriggered: true,
          lastTranscriptSource: source,
        },
      });
    }

    if (customParams.contactId) {
      await updateLeadVoiceState(customParams.contactId, {
        voice_mode: 'openai_owner',
        owner_confirmed: true,
        owner_confidence: nextConfidence,
        premium_started_at: new Date().toISOString(),
        owner_handoff_triggered: true,
      }, '[AI Call] Owner confirmed. Fast OpenAI handoff triggered.');
    }
  }

  if (customParams.contactId && (signal.auditLabel || signal.ownerConfidenceDelta !== 0)) {
    await updateLeadVoiceState(customParams.contactId, {
      voice_mode: voiceMode,
      owner_confidence: nextConfidence,
      owner_confirmed: ownerConfirmed,
      premium_started_at: ownerConfirmed ? new Date().toISOString() : null,
      current_role: signal.detectedRole || 'unknown',
      last_signal: signal.auditLabel || null,
      last_transcript_source: source,
    }, signal.auditLabel ? `[AI Call] ${signal.auditLabel} | role=${signal.detectedRole || 'unknown'} | confidence=${nextConfidence.toFixed(2)}` : null);
  }

  return { signal, nextConfidence, ownerConfirmed, voiceMode };
}

async function updateLeadVoiceState(contactId, patch = {}, auditLine = null) {
  if (!contactId) return;

  const patchJson = JSON.stringify(patch);
  await query(
    `UPDATE enrichment_results
     SET raw_data = COALESCE(raw_data, '{}'::jsonb) || $2::jsonb,
         lead_notes = CASE
           WHEN $3::text IS NULL OR $3::text = '' THEN lead_notes
           ELSE CONCAT_WS(E'\n', NULLIF(lead_notes, ''), $3)
         END,
         ai_updated_at = NOW()
     WHERE id = $1`,
    [contactId, patchJson, auditLine],
  );
}

function buildLeadFastContext(lead = {}) {
  const company = lead.company_name || 'Unknown company';
  const niche = lead.niche_name || lead.industry_guess || 'Unknown niche';
  const pitch = lead.one_line_pitch || 'No short description available';
  const pain = lead.ai_pain_points || 'No pain points saved';

  return {
    company,
    niche,
    pitch,
    pain,
    ownerGoal: `Reach the owner of ${company}, confirm if missed calls or slow booking follow-up is a problem, and try to book a short demo.`,
  };
}

function parseMeetingTime(value) {
  const raw = String(value || '').trim();
  if (!raw || !/(Z|[+-]\d{2}:\d{2})$/i.test(raw)) {
    throw new Error('meeting_time must be ISO 8601 and include a UTC offset, for example 2026-06-25T15:00:00-04:00');
  }

  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) throw new Error('meeting_time is not a valid date and time');
  if (timestamp < Date.now() + 5 * 60 * 1000) throw new Error('meeting_time must be in the future');
  if (timestamp > Date.now() + 2 * 365 * 24 * 60 * 60 * 1000) throw new Error('meeting_time is too far in the future');

  return new Date(timestamp).toISOString();
}

async function persistMeeting(callSid, contactId, args) {
  if (!contactId) throw new Error('This call is not linked to a CRM lead');

  const meetingTime = parseMeetingTime(args?.meeting_time);
  const email = String(args?.email || '').trim().toLowerCase();
  const timezone = String(args?.timezone || '').trim();
  const durationMinutes = Math.min(120, Math.max(10, Number(args?.duration_minutes) || 15));
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('A valid email is required to book the meeting');
  if (!timezone) throw new Error('The client timezone is required to book the meeting');

  const note = `[AI Meeting] ${meetingTime} (${timezone}), ${durationMinutes} minutes, ${email}`;
  const meetingMetadata = JSON.stringify({
    meeting_time: meetingTime,
    timezone,
    duration_minutes: durationMinutes,
    email,
    name: String(args?.name || '').trim() || null,
    call_sid: callSid,
  });

  const { rows } = await query(
    `UPDATE enrichment_results
     SET lead_stage = 'interested',
         assigned_to_ai = false,
         primary_email = COALESCE(NULLIF(primary_email, ''), $2),
         next_followup_at = $3,
         lead_notes = CONCAT_WS(E'\n\n', NULLIF(lead_notes, ''), $4),
         ai_updated_at = NOW(),
         raw_data = jsonb_set(COALESCE(raw_data, '{}'::jsonb), '{meeting}', $5::jsonb, true)
     WHERE id = $1
     RETURNING tenant_id, company_name, raw_data`,
    [contactId, email, meetingTime, note, meetingMetadata],
  );

  if (!rows.length) throw new Error('CRM lead was not found');
  const lead = rows[0];
  const sourceContactId = lead.raw_data?.source_contact_id;

  if (sourceContactId && /^\d+$/.test(String(sourceContactId))) {
    try {
      await query(
        `UPDATE contacts
         SET meeting_time = $1,
             email = COALESCE(NULLIF(email, ''), $2),
             stage = 'discovery',
             notes = CONCAT_WS(E'\n\n', NULLIF(notes, ''), $3),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [meetingTime, email, note, Number(sourceContactId)],
      );
    } catch (err) {
      console.warn(`[voice-agent:orchestrator] Meeting saved to AI pipeline, but contact sync failed: ${err.message}`);
    }
  }

  await query(
    `INSERT INTO tasks (tenant_id, lead_id, title, description, task_type, due_at, priority)
     SELECT $1, $2, $3, $4, 'followup', $5, 'high'
     WHERE NOT EXISTS (
       SELECT 1 FROM tasks
       WHERE lead_id = $2 AND status = 'open' AND due_at = $5
         AND title LIKE 'Meeting:%'
     )`,
    [lead.tenant_id, contactId, `Meeting: ${lead.company_name || email}`, note, meetingTime],
  );

  let calendarInviteSent = false;
  if (env.N8N_WEBHOOK_URL) {
    try {
      const axios = (await import('axios')).default;
      await axios.post(env.N8N_WEBHOOK_URL, {
        event: 'book_meeting',
        callSid,
        contactId,
        email,
        meeting_time: meetingTime,
        timezone,
        duration_minutes: durationMinutes,
        name: args?.name || null,
      });
      calendarInviteSent = true;
    } catch (err) {
      console.warn(`[voice-agent:orchestrator] CRM meeting saved but calendar workflow failed: ${err.message}`);
    }
  }

  const session = await getSession(callSid);
  if (session) {
    await updateSession(callSid, {
      metadata: {
        ...session.metadata,
        meeting: JSON.parse(meetingMetadata),
      },
    });
  }

  return {
    success: true,
    meeting_time: meetingTime,
    timezone,
    duration_minutes: durationMinutes,
    crm_updated: true,
    calendar_invite_sent: calendarInviteSent,
  };
}

/**
 * Initialize the orchestrator — listen for new media stream events.
 */
export function initOrchestrator() {
  console.log('[voice-agent:orchestrator] Initializing Voice Architecture v3...');

  onStreamEvent('stream:start', (data) => {
    const { streamSid, callSid, customParams, contactId, tenantId } = data;
    console.log(`[voice-agent:orchestrator] New call: ${callSid} (stream: ${streamSid})`);
    if (contactId) {
      customParams.contactId = contactId;
    }
    if (tenantId) {
      customParams.tenantId = tenantId;
    }
    startCallPipeline(streamSid, callSid, customParams);
  });

  onStreamEvent('stream:audio', (data) => {
    const { streamSid, callSid, payload } = data;
    const pipeline = activePipelines.get(streamSid);
    if (!pipeline) return;

    if (callSid) {
      broadcastCallAudio(callSid, 'prospect', payload);
    }

    pipeline.kernel?.emit('audio.in', { base64Audio: payload });
  });

  onStreamEvent('stream:stop', (data) => {
    const { streamSid, callSid } = data;
    console.log(`[voice-agent:orchestrator] Call ended: ${callSid}`);
    endCallPipeline(streamSid, callSid);
  });

  console.log('[voice-agent:orchestrator] v3 Ready');
}

/**
 * Start the voice pipeline using Voice Kernel.
 */
export async function startCallPipeline(streamSid, callSid, customParams = {}, adapter = null) {
  const activeAdapter = adapter || {
    type: 'twilio',
    sendAudio: sendMediaToTwilio,
    clearAudio: clearTwilioAudio,
    sendDtmf: sendDtmfToTwilio,
    audioFormat: 'g711_ulaw'
  };

  try {
    const session = await createSession(callSid, {
      streamSid,
      direction: customParams.direction || 'outbound',
      from: customParams.from || '',
      to: customParams.to || '',
      metadata: {
        agentId: customParams.voiceAgentId || 'default',
        tenantId: customParams.tenantId || 'default',
        contactId: customParams.contactId || null,
        agentType: customParams.agentType || 'sales',
        industry: customParams.industry || null,
        voiceId: customParams.voiceId || env.ELEVENLABS_VOICE_ID,
      },
    });

    await updateLeadVoiceState(customParams.contactId, {
      voice_mode: 'openai_owner',
      owner_confidence: 0,
      owner_confirmed: false,
      ivr_attempts: 0,
      premium_started_at: null,
      current_role: 'unknown',
    }, '[AI Call] Call connected. OpenAI voice mode started.');

    let systemPrompt = getSystemPrompt({
      agentType: session.metadata.agentType,
      industry: session.metadata.industry,
    });

    let companyName = null;
    let leadFastContext = null;

    if (customParams.contactId) {
      try {
        const { rows } = await query(
          `SELECT company_name, industry_guess, one_line_pitch, ai_pain_points,
                  raw_data->>'niche_name' AS niche_name
           FROM enrichment_results WHERE id = $1`,
          [customParams.contactId],
        );
        if (rows.length > 0) {
          const lead = rows[0];
          companyName = lead.company_name;
          leadFastContext = buildLeadFastContext(lead);
          const niche = lead.niche_name || lead.industry_guess || 'Unknown';
          systemPrompt += `\n\n# Current niche and lead context\nCompany: ${lead.company_name || 'Unknown'}
Niche: ${niche}
What they do: ${lead.one_line_pitch || 'Unknown'}
Pain Points: ${lead.ai_pain_points || 'None identified'}
Niche guidance: ${getNicheGuidance(niche)}
Use only relevant facts from this context. Do not read this block aloud.`;
        }
      } catch (err) {
        console.error('[voice-agent:orchestrator] Error fetching lead context:', err.message);
      }
    }

    await setState(callSid, 'listening');

    if (leadFastContext) {
      await updateSession(callSid, {
        metadata: {
          ...session.metadata,
          leadFastContext,
          voiceMode: 'openai_owner',
          ownerConfidence: 0,
          ownerConfirmed: false,
          ownerHandoffTriggered: false,
        },
      });
    }

    startOpenAIPipeline(streamSid, callSid, customParams, activeAdapter, systemPrompt, null, companyName);

  } catch (err) {
    console.error(`[voice-agent:orchestrator] Failed to start pipeline for ${callSid}:`, err.message);
  }
}

/**
 * Start the OpenAI Realtime pipeline using VoiceKernel
 */
export function startOpenAIPipeline(streamSid, callSid, customParams, activeAdapter, systemPrompt, initialUtterance, companyName = null) {
  console.log(`[voice-agent:orchestrator] Bridging ${callSid} to OpenAI Realtime via VoiceKernel`);
  
  const tools = [
    {
      name: 'book_meeting',
      description: 'Books a confirmed meeting in the CRM and triggers the calendar invite workflow when configured.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Client name' },
          email: { type: 'string', description: 'Confirmed client email address' },
          meeting_time: { type: 'string', description: 'Confirmed ISO 8601 date/time including UTC offset' },
          timezone: { type: 'string', description: 'Confirmed IANA timezone or explicit timezone name' },
          duration_minutes: { type: 'number', description: 'Meeting duration; default 15 minutes' },
        },
        required: ['name', 'email', 'meeting_time', 'timezone']
      }
    },
    {
      name: 'press_keypad',
      description: 'Sends a DTMF tone.',
      parameters: {
        type: 'object',
        properties: {
          digit: { type: 'string' }
        },
        required: ['digit']
      }
    },
    {
      name: 'end_call',
      description: 'Hangs up the call immediately.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string' }
        },
        required: ['reason']
      }
    }
  ];

  let kernel;

  const openaiSession = createOpenAISession({
    systemPrompt,
    tools,
    audioFormat: activeAdapter.audioFormat || 'g711_ulaw',
    
    onUsage: (usage) => {
      import('../services/session/session-store.js').then(async ({ getSession, updateSession }) => {
        const session = await getSession(callSid);
        if (session) {
          const currentInput = session.metadata.inputTokens || 0;
          const currentOutput = session.metadata.outputTokens || 0;
          const inputDetails = usage.input_token_details || {};
          const outputDetails = usage.output_token_details || {};
          await updateSession(callSid, {
            metadata: {
              ...session.metadata,
              inputTokens: currentInput + (usage.input_tokens || 0),
              outputTokens: currentOutput + (usage.output_tokens || 0),
              inputAudioTokens: (session.metadata.inputAudioTokens || 0) + (inputDetails.audio_tokens || 0),
              inputTextTokens: (session.metadata.inputTextTokens || 0) + (inputDetails.text_tokens || 0),
              outputAudioTokens: (session.metadata.outputAudioTokens || 0) + (outputDetails.audio_tokens || 0),
              outputTextTokens: (session.metadata.outputTextTokens || 0) + (outputDetails.text_tokens || 0),
              cachedInputTokens: (session.metadata.cachedInputTokens || 0) + (inputDetails.cached_tokens || 0),
            }
          });
        }
      }).catch(e => console.error(e.message));
    },

    onAudioDelta: (base64Audio) => {
      if (kernel) kernel.emit('ai.response', { delta: base64Audio, adapter: activeAdapter });
    },
    
    onTranscription: async (text) => {
      console.log(`[voice-agent:orchestrator] User said (${callSid}): "${text}"`);
      await addConversationTurn(callSid, 'user', text);
      broadcastCallTranscript(callSid, 'prospect', text);

      await processTranscriptSignal({ streamSid, callSid, customParams, text, source: 'openai_owner' });
    },
    
    onAssistantText: async (text) => {
      console.log(`[voice-agent:orchestrator] AI responded (${callSid}): "${text}"`);
      await addConversationTurn(callSid, 'assistant', text);
      broadcastCallTranscript(callSid, 'ai', text);
    },
    
    onToolCall: async (toolCall) => {
      if (kernel) kernel.emit('tool.call', { call_id: toolCall.call_id, name: toolCall.name, args: toolCall.args });
    },
    
    // Server VAD detected speech -> hard interrupt Twilio
    onBargeIn: () => {
      if (kernel) kernel.emit('barge.in', {});
    },
    
    // NEW v3 READY SIGNAL: Clean, deterministic, and event-driven!
    onSystemReady: async () => {
      console.log(`[voice-agent:orchestrator] 🚀 OpenAI System Ready for ${callSid}. Triggering greeting.`);
      await setState(callSid, 'listening');
      if (initialUtterance) {
        openaiSession.triggerResponse(`User said: "${initialUtterance}". Respond naturally.`);
      } else if (companyName) {
        openaiSession.triggerResponse(`The phone call has just connected. Say exactly: "Hi, this is Jento AI calling about ${companyName}. Am I speaking with the owner?" Then stop and listen.`);
      } else {
        openaiSession.triggerResponse('The phone call has just connected. Say exactly: "Hi, this is Jento AI calling about your company. Am I speaking with the owner?" Then stop and listen.');
      }
    },
    
    onError: (err) => {
      console.error(`[voice-agent:orchestrator] OpenAI Pipeline Error:`, err.message);
    }
  });

  kernel = new VoiceKernel(callSid, streamSid, openaiSession);

  // Override handlers using kernel.on() so the event bus map is properly updated
  kernel.on('ai.response', (event, state) => {
    const { delta, adapter } = event.payload;
    if (state.bargeInActive) return;
    adapter.sendAudio(streamSid, delta);
    broadcastCallAudio(callSid, 'ai', delta);
  });

  // Override handleBargeIn adapter logic
  kernel.on('barge.in', (event, state) => {
    kernel.logger.log(`[VoiceKernel] 🛑 BARGE-IN DETECTED for ${kernel.callSid}`);
    state.bargeInActive = true;
    
    activeAdapter.clearAudio(streamSid);

    setTimeout(() => {
      state.bargeInActive = false;
    }, 250);
  });
  
  // Custom tool call override for end_call delay etc
  kernel.on('tool.call', async (event, state) => {
    const { call_id, name, args } = event.payload;
    
    if (name === 'end_call') {
      kernel.logger.log(`[VoiceKernel] 🛑 End call triggered for ${callSid}`);
      broadcastCallAudio(callSid, 'ai', null); // clear
      
      const delay = args?.delay_ms ?? 300;
      setTimeout(async () => {
        try {
          if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
            const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
            await client.calls(callSid).update({ status: 'completed' });
          }
        } catch (err) {
          kernel.logger.error(`[VoiceKernel] ❌ Failed to hang up ${callSid}: ${err.message}`);
        }
        activeAdapter.clearAudio(streamSid);
      }, delay);
      
      if (kernel.openaiSession) {
        kernel.openaiSession.submitToolResult(call_id, JSON.stringify({ success: true, action: 'ending_call' }), false);
      }
      return;
    }
    
    // Fallback to kernel queue
    kernel.logger.log(`[VoiceKernel] 🛠️ Queuing Tool: ${name} (${call_id})`);
    
    kernel.toolQueue.push(async () => {
      try {
        let resultStr = '';
        
        if (name === 'book_meeting') {
          const result = await persistMeeting(callSid, customParams.contactId, args);
          resultStr = JSON.stringify(result);
        } else if (name === 'press_keypad') {
          const digit = String(args?.digit ?? args?.digits ?? '').trim();
          if (!digit || !/^[0-9*#]$/.test(digit)) {
            resultStr = JSON.stringify({ success: false, error: `Invalid DTMF digit: ${digit || '(empty)'}` });
          } else if (activeAdapter.sendDtmf) {
            const sent = await activeAdapter.sendDtmf(streamSid, digit);
            resultStr = JSON.stringify(sent
              ? { success: true, digits_sent: digit }
              : { success: false, error: 'Active audio stream unavailable' });
          } else {
            resultStr = JSON.stringify({ success: true, digits_sent: digit, message: 'Simulated keypad press' });
          }
        } else {
          resultStr = JSON.stringify({ error: 'Tool not found or not executable' });
        }

        if (kernel.openaiSession) {
          kernel.openaiSession.submitToolResult(call_id, resultStr, name !== 'press_keypad');
        }
      } catch (err) {
        kernel.logger.error(`[VoiceKernel] ❌ Tool execution error: ${err.message}`);
        if (kernel.openaiSession) {
          kernel.openaiSession.submitToolResult(call_id, JSON.stringify({ error: err.message }));
        }
      }
    });
    
    kernel.processToolQueue();
  });

  activePipelines.set(streamSid, {
    streamSid,
    callSid,
    adapter: activeAdapter,
    kernel,
    openaiSession,
    contactId: customParams.contactId || null,
    mode: 'openai_owner',
    gatekeeperEngine: null,
  });
}

/**
 * Handle barge-in (interruption)
 */
export async function handleBargeIn(streamSid, callSid) {
  const pipeline = activePipelines.get(streamSid);
  if (!pipeline || !pipeline.kernel) return;

  pipeline.kernel.emit('barge.in', {});
  await incrementInterruptions(callSid);
}

/**
 * End the call pipeline and trigger post-call processing.
 */
export async function endCallPipeline(streamSid, callSid) {
  const pipeline = activePipelines.get(streamSid);
  if (!pipeline) return;

  try {
    if (pipeline.gatekeeperEngine) pipeline.gatekeeperEngine.close();
    if (pipeline.openaiSession) pipeline.openaiSession.close();
    
    activePipelines.delete(streamSid);
    await setState(callSid, 'ended');
    
    console.log(`[voice-agent:orchestrator] Starting post-call processing for ${callSid}`);
    await processPostCall(callSid);

    setTimeout(async () => {
      await deleteSession(callSid);
    }, 60000);

  } catch (err) {
    console.error(`[voice-agent:orchestrator] Error ending pipeline for ${callSid}:`, err.message);
  }
}

export function getPipelineStats() {
  return {
    activeCalls: activePipelines.size,
    pipelines: Array.from(activePipelines.values()).map((p) => ({
      streamSid: p.streamSid,
      callSid: p.callSid,
      contactId: p.contactId
    })),
  };
}

export default {
  initOrchestrator,
  getPipelineStats,
};
