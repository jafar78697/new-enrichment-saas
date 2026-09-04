import { WebSocket } from 'ws';
import { RestClient } from '@signalwire/compatibility-api';
import { env } from '../config/env.js';
import { buildDeepgramSettings } from '../providers/deepgram-agent.js';
import { query } from '../../calls-module/db/index.js';
import { broadcastCallAudio, broadcastCallTranscript } from '../websocket/call-monitor.js';
import { detectCallStateFromTranscript, CallStates } from '../detection/call-state-detector.js';
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
  return detection?.action === 'hangup' && [
    CallStates.VOICEMAIL,
    CallStates.IVR_OR_MENU,
    CallStates.AI_RECEPTIONIST_OR_BOT,
    CallStates.CLOSED_OR_HOURS,
  ].includes(detection.state);
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

async function enforceDailyLimit() {
  const { rows } = await query(
    `SELECT
       COALESCE((SELECT SUM(duration_sec) FROM ai_call_sessions WHERE started_at >= date_trunc('day', NOW())), 0)::int AS seconds_today,
       COALESCE((SELECT SUM(cost_estimate_usd) FROM ai_call_sessions WHERE started_at >= date_trunc('day', NOW())), 0)::numeric AS call_cost,
       COALESCE((SELECT SUM(estimated_cost_usd) FROM ai_usage_ledger WHERE created_at >= date_trunc('day', NOW())), 0)::numeric AS preview_cost`,
  );
  const usedSeconds = Number(rows[0]?.seconds_today || 0);
  const usedCost = Number(rows[0]?.call_cost || 0) + Number(rows[0]?.preview_cost || 0);
  const nextCallCost = (env.AI_MAX_SECONDS_PER_CALL / 60) * env.AI_ESTIMATED_COST_USD_PER_MINUTE;
  return usedSeconds < env.AI_MAX_MINUTES_PER_DAY * 60
    && usedCost + nextCallCost <= env.AI_MAX_COST_USD_PER_DAY;
}

async function loadSessionContext(sessionId) {
  const { rows } = await query(
    `SELECT
       acs.*,
       er.company_name,
       jsonb_build_object(
         'id', ac.id,
         'name', ac.name,
         'voice', ac.voice,
         'language', ac.language,
         'prompt', ac.prompt,
         'greeting', ac.greeting,
         'max_call_duration_sec', ac.max_call_duration_sec
       ) AS agent_config
     FROM ai_call_sessions acs
     LEFT JOIN enrichment_results er ON er.id = acs.lead_id
     LEFT JOIN ai_agent_configs ac ON ac.id = acs.agent_config_id
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

async function handleFunctionRequests(event, context) {
  const functions = Array.isArray(event.functions) ? event.functions : [];
  for (const fn of functions) {
    const name = String(fn?.name || '');
    const args = safeJsonParse(fn?.arguments, {}) || {};
    let content;
    let shouldEndCall = false;

    if (name === 'save_call_note' && context.sessionId) {
      await updateSession(
        context.sessionId,
        `UPDATE ai_call_sessions
         SET outcome = COALESCE($1, outcome), summary = COALESCE($2, summary)
         WHERE id = $3`,
        [typeof args.outcome === 'string' ? args.outcome.slice(0, 120) : null,
          typeof args.note === 'string' ? args.note.slice(0, 2000) : null],
      );
      content = JSON.stringify({ ok: true, saved: true });
    } else if (name === 'end_call') {
      shouldEndCall = true;
      content = JSON.stringify({ ok: true, ending: true });
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
    if (context.signalWireWs.readyState === WebSocket.OPEN) {
      context.signalWireWs.send(JSON.stringify({ event: 'clear', streamSid: context.streamSid }));
    }
    return;
  }

  if (event.type === 'ConversationText') {
    const transcript = extractConversationText(event);
    if (!transcript) return;

    if (context.callSid) {
      broadcastCallTranscript(context.callSid, transcript.role === 'assistant' ? 'ai' : 'prospect', transcript.text);
    }
    await persistConversationText({ sessionId: context.sessionId, ...transcript });

    if (transcript.role === 'user' && !context.detectionLocked) {
      const detection = detectCallStateFromTranscript(transcript.text, context.agentConfig);
      if (detection?.state && detection.state !== CallStates.HUMAN_LIVE) {
        await updateSession(
          context.sessionId,
          `UPDATE ai_call_sessions
           SET first_answer_type = COALESCE(first_answer_type, $1), call_state = $2
           WHERE id = $3`,
          [detection.state, detection.action || 'detected'],
        );
      }
      if (isTerminalDetection(detection)) {
        context.detectionLocked = true;
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
    let streamSid = null;
    let callSid = null;
    let sessionId = null;
    let deepgramWs = null;
    let deepgramReady = false;
    let settingsSent = false;
    let pendingAudioFrames = [];
    let agentConfig = null;
    let callTimer = null;
    let streamRegistered = false;
    let agentStartedAt = null;
    const context = { signalWireWs, streamSid, callSid, sessionId, deepgramWs, agentConfig, detectionLocked: false };

    const cleanup = async (state = 'stopped') => {
      if (callTimer) clearTimeout(callTimer);
      callTimer = null;
      if (streamRegistered && streamSid) activeStreamSids.delete(streamSid);
      streamRegistered = false;
      if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) deepgramWs.close();
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
    };

    signalWireWs.on('message', async (raw) => {
      const message = safeJsonParse(raw.toString());
      if (!message) return;

      try {
        if (message.event === 'start') {
          const start = message.start || {};
          const parameters = readParameters(start);
          streamSid = start.streamSid || start.stream_sid || message.streamSid || null;
          callSid = start.callSid || start.call_sid || parameters.CallSid || null;
          sessionId = parameters.sessionId || parameters.session_id || null;

          if (!streamSid || !sessionId || !env.DEEPGRAM_API_KEY) {
            console.error('[deepgram-bridge] Missing stream, session, or Deepgram configuration; closing stream.');
            signalWireWs.close(1008, 'invalid-agent-stream');
            return;
          }

          if (activeStreamSids.size >= env.AI_MAX_ACTIVE_CALLS) {
            console.warn('[deepgram-bridge] AI active-call cap reached; rejecting stream.');
            await closePhoneCall({ callSid, signalWireWs, sessionId, reason: 'active-call-limit' });
            return;
          }

          if (!(await enforceDailyLimit())) {
            console.warn('[deepgram-bridge] AI daily minutes cap reached; rejecting stream.');
            await closePhoneCall({ callSid, signalWireWs, sessionId, reason: 'daily-minute-limit' });
            return;
          }

          const session = await loadSessionContext(sessionId);
          if (!session?.agent_config?.id) {
            console.error('[deepgram-bridge] No active agent configuration for session; closing stream.');
            await closePhoneCall({ callSid, signalWireWs, sessionId, reason: 'missing-agent-config' });
            return;
          }

          agentConfig = session.agent_config;
          agentStartedAt = Date.now();
          context.streamSid = streamSid;
          context.callSid = callSid;
          context.sessionId = sessionId;
          context.agentConfig = agentConfig;

          activeStreamSids.add(streamSid);
          streamRegistered = true;
          await updateSession(
            sessionId,
            `UPDATE ai_call_sessions
             SET signalwire_stream_sid = $1, answered_at = COALESCE(answered_at, NOW()), call_state = 'streaming'
             WHERE id = $2`,
            [streamSid],
          );

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
            deepgramWs.send(JSON.stringify(buildDeepgramSettings({ company_name: session.company_name }, agentConfig)));
            settingsSent = true;
          };

          deepgramWs.on('unexpected-response', (_request, response) => {
            console.error(`[deepgram-bridge] Unexpected Deepgram response: ${response.statusCode}`);
            closePhoneCall({ callSid, signalWireWs, sessionId, reason: `deepgram-${response.statusCode}` }).catch(() => null);
          });

          deepgramWs.on('message', async (data, isBinary) => {
            if (isBinary) {
              if (signalWireWs.readyState === WebSocket.OPEN) {
                const payload = data.toString('base64');
                signalWireWs.send(JSON.stringify({ event: 'media', streamSid, media: { payload } }));
                if (callSid) broadcastCallAudio(callSid, 'ai', payload);
              }
              return;
            }

            const event = safeJsonParse(data.toString());
            if (!event) return;
            if (event.type === 'Welcome') sendSettings();
            if (event.type === 'SettingsApplied') {
              deepgramReady = true;
              for (const frame of pendingAudioFrames) {
                if (deepgramWs.readyState === WebSocket.OPEN) deepgramWs.send(frame);
              }
              pendingAudioFrames = [];
            }
            await handleDeepgramEvent(event, context);
          });

          deepgramWs.on('error', (error) => console.error('[deepgram-bridge] WebSocket error:', error.message));
          return;
        }

        if (message.event === 'media' && message.media?.payload) {
          const audio = Buffer.from(message.media.payload, 'base64');
          if (callSid) broadcastCallAudio(callSid, 'prospect', message.media.payload);
          if (deepgramWs?.readyState === WebSocket.OPEN && deepgramReady) {
            deepgramWs.send(audio);
          } else {
            if (pendingAudioFrames.length >= MAX_PENDING_AUDIO_FRAMES) pendingAudioFrames.shift();
            pendingAudioFrames.push(audio);
          }
          return;
        }

        if (message.event === 'stop') await cleanup('stopped');
      } catch (error) {
        console.error('[deepgram-bridge] SignalWire message failed:', error.message);
        await closePhoneCall({ callSid, signalWireWs, sessionId, reason: 'bridge-error' });
      }
    });

    signalWireWs.on('close', () => cleanup('closed').catch((error) => {
      console.error('[deepgram-bridge] Cleanup failed:', error.message);
    }));
  });

  console.log('[deepgram-bridge] SignalWire bridge attached at /api/voice/signalwire/deepgram-stream');
}
