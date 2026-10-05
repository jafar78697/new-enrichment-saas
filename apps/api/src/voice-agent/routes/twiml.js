import { Router } from 'express';
import { z } from 'zod';
import { RestClient } from '@signalwire/compatibility-api';
import { env, VOICE_AGENT_ENABLED } from '../config/env.js';
import { asyncHandler, AppError } from '../utils/errors.js';
import { validateTwilioSignature } from '../middleware/twilio-signature.js';
import { wsUrl } from '../utils/http.js';
import { broadcastCallStatus } from '../websocket/call-monitor.js';
import { query } from '../../calls-module/db/index.js';
import { normalizeNorthAmericanPhone } from '../../utils/us-phone.js';

const router = Router();

function connectDeepgramStream(response, req, sessionId) {
  const stream = response.connect().stream({
    url: wsUrl(req, '/api/voice/signalwire/deepgram-stream'),
    track: 'inbound_track',
    codec: 'PCMU@8000h',
    realtime: true,
  });
  // SignalWire does not accept query parameters in a Stream URL. The nested
  // Parameter is delivered as start.customParameters on the WebSocket.
  stream.parameter({ name: 'sessionId', value: String(sessionId) });
}

/**
 * POST /api/voice/twiml/outbound
 * Returns TwiML that connects the outbound call to the AI Voice Agent
 * via Twilio Media Streams (<Connect><Stream>).
 *
 * Called by Twilio when an outbound AI call is initiated.
 */
router.post(
  '/twiml/outbound',
  validateTwilioSignature,
  asyncHandler(async (req, res) => {
    console.log('[voice-agent] /twiml/outbound received req.body:', req.body);
    console.log('[voice-agent] /twiml/outbound received req.query:', req.query);
    if (!VOICE_AGENT_ENABLED) {
      throw new AppError('Voice Agent is not configured on this server', 503);
    }

    // There is deliberately no route that can start AI outbound calls unless
    // an operator explicitly switches this server-side flag on.
    if (!env.AI_OUTBOUND_ENABLED) {
      const response = new RestClient.LaML.VoiceResponse();
      response.hangup();
      return res.type('text/xml').send(response.toString());
    }

    const payload = z.object({
      To: z.string().min(3),
      CallSid: z.string().min(1).optional(),
      From: z.string().optional(),
      voiceAgentId: z.string().optional(),
      contactId: z.string().optional(),
      tenantId: z.string().optional(),
      record: z.string().optional(),
      AnsweredBy: z.string().optional(),
      sessionId: z.string().optional(),
    }).parse({ ...req.body, ...req.query });

    const toStr = normalizeNorthAmericanPhone(payload.To);

    if (!toStr || toStr.length < 4) {
      const errResponse = new RestClient.LaML.VoiceResponse();
      errResponse.say({ voice: 'alice' }, 'Sorry, only valid USA or Canada numbers are supported for this call.');
      errResponse.hangup();
      return res.type('text/xml').send(errResponse.toString());
    }

    console.log(`[voice-agent] Outbound AI call to: ${toStr} (CallSid: ${payload.CallSid})`);

    const response = new RestClient.LaML.VoiceResponse();

    const answeredBy = String(payload.AnsweredBy || '').toLowerCase();
    // AMD can classify a greeting as a machine. Keep the stream open so the
    // operator can hear the greeting and choose the final result in the popup.

    let provider = null;
    let sessionId = payload.sessionId || null;

    if (sessionId) {
      // Session was pre-created (e.g. multi-lane caller)
      const { rows } = await query(`SELECT provider FROM ai_call_sessions WHERE id = $1`, [sessionId]);
      if (rows.length > 0) {
        provider = rows[0].provider || 'deepgram_voice_agent';
        // Ensure signalwire_call_sid is recorded so status webhooks work!
        await query(`UPDATE ai_call_sessions SET signalwire_call_sid = $1 WHERE id = $2`, [payload.CallSid, sessionId]);
      }
    } else if (payload.contactId) {
      // 1. Get provider
      const { rows } = await query(
        `SELECT er.ai_agent_provider, er.assigned_ai_agent_id, er.tenant_id,
                er.ai_voice_consent, er.do_not_call,
                er.raw_data->>'call_origin' AS call_origin,
                ac.id AS active_agent_id
         FROM enrichment_results er
         LEFT JOIN ai_agent_configs ac
           ON ac.id = er.assigned_ai_agent_id
          AND ac.tenant_id = er.tenant_id
          AND ac.is_active = true
          AND ac.mode = 'outbound'
         WHERE er.id = $1
           AND er.do_not_call = false`,
        [payload.contactId],
      );
      if (rows.length > 0) {
        provider = rows[0].active_agent_id ? rows[0].ai_agent_provider || null : null;
        const tenantId = rows[0].tenant_id;
        // 2. Create ai_call_sessions record
        try {
          const res = await query(`
            INSERT INTO ai_call_sessions (
              tenant_id, lead_id, provider, signalwire_call_sid, agent_config_id,
              started_at, call_state, first_answer_type
            ) VALUES ($1, $2, $3, $4, $5, NOW(), 'starting', $6) RETURNING id
          `, [
            tenantId,
            payload.contactId,
            provider,
            payload.CallSid,
            rows[0].assigned_ai_agent_id || null,
            answeredBy === 'human' ? 'HUMAN_LIVE' : null,
          ]);
          sessionId = res.rows[0].id;
        } catch (e) {
          console.error('[voice-agent] Failed to create call session:', e.message);
        }
      }
    }

    if (provider !== 'deepgram_voice_agent' || !sessionId || !env.DEEPGRAM_API_KEY) {
      console.error(`[voice-agent] Outbound AI request rejected: provider=${provider || 'none'}, session=${Boolean(sessionId)}.`);
      response.hangup();
      return res.type('text/xml').send(response.toString());
    }

    connectDeepgramStream(response, req, sessionId);

    const twiml = response.toString();
    console.log('[voice-agent] TwiML:', twiml);
    res.type('text/xml').send(twiml);
  }),
);

/**
 * POST /api/voice/twiml/inbound
 * Handles inbound calls by connecting them to the AI Voice Agent.
 */
router.post(
  '/twiml/inbound',
  validateTwilioSignature,
  asyncHandler(async (req, res) => {
    if (!VOICE_AGENT_ENABLED) {
      const response = new RestClient.LaML.VoiceResponse();
      response.say({ voice: 'alice' }, 'Sorry, the AI Voice Agent is not available right now.');
      response.hangup();
      return res.type('text/xml').send(response.toString());
    }

    const payload = z.object({
      CallSid: z.string().min(1).optional(),
      From: z.string().optional(),
      To: z.string().optional(),
    }).passthrough().parse(req.body);

    console.log(`[voice-agent] Inbound call from: ${payload.From} (CallSid: ${payload.CallSid})`);

    const response = new RestClient.LaML.VoiceResponse();

    if (!env.DEEPGRAM_API_KEY) {
      response.say({ voice: 'alice' }, 'Sorry, the voice agent is not available right now.');
      response.hangup();
      return res.type('text/xml').send(response.toString());
    }

    const { rows: agents } = await query(
      `SELECT id, tenant_id
       FROM ai_agent_configs
       WHERE is_active = true
         AND mode = 'inbound'
         AND regexp_replace(COALESCE(assigned_phone_number, ''), '\\D', '', 'g') = regexp_replace(COALESCE($1, ''), '\\D', '', 'g')
       ORDER BY updated_at DESC
       LIMIT 1`,
      [payload.To || ''],
    );
    const agent = agents[0];
    if (!agent) {
      console.warn(`[voice-agent] No inbound Deepgram agent is mapped to ${payload.To || 'the called number'}.`);
      response.say({ voice: 'alice' }, 'Sorry, this phone assistant is not configured yet.');
      response.hangup();
      return res.type('text/xml').send(response.toString());
    }

    const { rows: sessions } = await query(
      `INSERT INTO ai_call_sessions (tenant_id, lead_id, agent_config_id, provider, signalwire_call_sid, started_at, call_state)
       VALUES ($1, NULL, $2, 'deepgram_voice_agent', $3, NOW(), 'starting')
       RETURNING id`,
      [agent.tenant_id, agent.id, payload.CallSid || null],
    );

    connectDeepgramStream(response, req, sessions[0].id);

    const twiml = response.toString();
    console.log('[voice-agent] TwiML (inbound):', twiml);
    res.type('text/xml').send(twiml);
  }),
);

/**
 * POST /api/voice/webhooks/call-status
 * Receives call status updates from Twilio.
 */
router.post(
  '/webhooks/call-status',
  validateTwilioSignature,
  asyncHandler(async (req, res) => {
    let contactId = typeof req.query.contactId === 'string' ? req.query.contactId : null;
    let sessionAccepted = false;
    console.log('[voice-agent] Call status webhook:', {
      CallSid: req.body.CallSid,
      CallStatus: req.body.CallStatus,
      Duration: req.body.CallDuration,
      contactId,
    });

    if (contactId && req.body.CallSid) {
      const terminalNoAnswer = ['busy', 'failed', 'no-answer', 'canceled'].includes(req.body.CallStatus);
      const terminal = terminalNoAnswer || req.body.CallStatus === 'completed';

      await query(
        `UPDATE enrichment_results
         SET raw_data = COALESCE(raw_data, '{}'::jsonb)
             || jsonb_strip_nulls(jsonb_build_object(
                  'call_sid', $1::text,
                  'call_status', $2::text,
                  'call_duration_seconds', NULLIF($3::text, '')::int,
                  'answered_by', $4::text,
                  'call_started_at', COALESCE(raw_data->>'call_started_at', NOW()::text),
                  'call_updated_at', NOW()::text
                ))
         WHERE id = $5::uuid
           AND $1 = (SELECT s2.signalwire_call_sid FROM ai_call_sessions s2 WHERE s2.lead_id = enrichment_results.id AND (s2.ended_at IS NULL OR $6 = true) ORDER BY s2.created_at DESC, s2.id DESC LIMIT 1)`,
        [
          req.body.CallSid,
          req.body.CallStatus || null,
          req.body.CallDuration || req.body.Duration || null,
          req.body.AnsweredBy || null,
          contactId,
          terminal
        ],
      );
    }

    if (req.body.CallSid && req.body.CallStatus) {
      const terminalNoAnswer = ['busy', 'failed', 'no-answer', 'canceled'].includes(req.body.CallStatus);
      const terminal = terminalNoAnswer || req.body.CallStatus === 'completed';
      const { rows: sessionRows } = await query(
        `UPDATE ai_call_sessions
         SET call_state = $2,
             answered_at = CASE WHEN $2 = 'answered' THEN COALESCE(answered_at, NOW()) ELSE answered_at END,
             ended_at = CASE WHEN $4 THEN COALESCE(ended_at, NOW()) ELSE ended_at END,
             duration_sec = GREATEST(
               COALESCE(duration_sec, 0),
               COALESCE(NULLIF($3::text, '')::int, 0)
             ),
             outcome = CASE WHEN $5 THEN COALESCE(outcome, 'no_answer') ELSE outcome END,
             hangup_reason = CASE WHEN $5 THEN COALESCE(hangup_reason, $2) ELSE hangup_reason END
         WHERE signalwire_call_sid = $1
           AND (ended_at IS NULL OR $4 = true)
         RETURNING id, queue_item_id, lead_id, outcome, hangup_reason`,
        [
          req.body.CallSid,
          req.body.CallStatus,
          req.body.CallDuration || req.body.Duration || null,
          terminal,
          terminalNoAnswer,
        ],
      );

      if (sessionRows.length > 0) {
        sessionAccepted = true;
      }

      // Finalize the queue item for terminal calls that never established a media connection
      if (terminal && sessionRows.length > 0 && sessionRows[0].queue_item_id) {
        const session = sessionRows[0];
        const finalState = ['failed', 'canceled'].includes(req.body.CallStatus) ? 'failed' : 'completed';
        await query(
          `UPDATE ai_call_queue_items SET state = $1, last_error = $2 WHERE id = $3 AND state NOT IN ('completed', 'failed', 'cancelled')`,
          [finalState, session.hangup_reason || null, session.queue_item_id]
        );
      }
      
      // Use the session lead_id if contactId is missing
      if (!contactId && sessionRows.length > 0 && sessionRows[0].lead_id) {
        contactId = sessionRows[0].lead_id;
      }
    }

    if (contactId && ['busy', 'failed', 'no-answer', 'canceled'].includes(req.body.CallStatus)) {
      await query(
        `UPDATE enrichment_results
         SET lead_stage = CASE WHEN lead_stage = 'calling' THEN 'no_answer' ELSE lead_stage END,
             raw_data = (COALESCE(raw_data, '{}'::jsonb) - 'active_call_sid')
               || jsonb_build_object(
                    'call_status', $1::text,
                    'ai_outcome', 'no_answer',
                    'ai_outcome_source', 'telecom_event',
                    'call_ended_at', NOW()::text,
                    'call_duration_seconds', COALESCE(NULLIF($2::text, '')::int, COALESCE((raw_data->>'call_duration_seconds')::int, 0))
                  ),
             lead_notes = CONCAT_WS(E'\n', NULLIF(lead_notes, ''), $3::text)
         WHERE id = $4::uuid AND lead_stage IN ('calling', 'assigned', 'dialing', 'ringing')
           AND $5::text = (SELECT s2.signalwire_call_sid FROM ai_call_sessions s2 WHERE s2.lead_id = enrichment_results.id ORDER BY s2.created_at DESC, s2.id DESC LIMIT 1)`,
        [
          req.body.CallStatus,
          req.body.CallDuration || req.body.Duration || null,
          `[AI Call] SignalWire status: ${req.body.CallStatus}${req.body.CallDuration ? ` (${req.body.CallDuration}s)` : ''}.`,
          contactId,
          req.body.CallSid,
        ],
      );
    }

    if (contactId && req.body.CallStatus === 'completed') {
      await query(
        `UPDATE enrichment_results
         SET lead_stage = CASE WHEN lead_stage IN ('calling', 'assigned', 'dialing', 'ringing') THEN 'called' ELSE lead_stage END,
             raw_data = (COALESCE(raw_data, '{}'::jsonb) - 'active_call_sid')
               || jsonb_build_object(
                    'call_status', 'completed',
                    'call_ended_at', NOW()::text,
                    'call_duration_seconds', COALESCE(NULLIF($1::text, '')::int, COALESCE((raw_data->>'call_duration_seconds')::int, 0))
                  ),
             lead_notes = CONCAT_WS(E'\n', NULLIF(lead_notes, ''), $2::text)
         WHERE id = $3::uuid AND lead_stage IN ('calling', 'assigned', 'dialing', 'ringing')
           AND $4::text = (SELECT s2.signalwire_call_sid FROM ai_call_sessions s2 WHERE s2.lead_id = enrichment_results.id ORDER BY s2.created_at DESC, s2.id DESC LIMIT 1)`,
        [
          req.body.CallDuration || req.body.Duration || null,
          `[AI Call] Completed${req.body.CallDuration ? ` (${req.body.CallDuration}s)` : ''}.`,
          contactId,
          req.body.CallSid,
        ],
      );
    }

    if (contactId && (req.body.RecordingSid || req.body.RecordingStatus || req.body.RecordingUrl)) {
      await query(
        `UPDATE enrichment_results
         SET raw_data = COALESCE(raw_data, '{}'::jsonb)
           || jsonb_build_object(
                'recording_sid', $1::text,
                'recording_status', $2::text,
                'recording_url', $3::text,
                'recording_duration', $4::text,
               'recording_enabled', true
              ),
             lead_notes = CASE
               WHEN $2::text = 'completed'
                 THEN CONCAT_WS(E'\n', NULLIF(lead_notes, ''), '[AI Call] Recording available.')
               ELSE lead_notes
             END
         WHERE id = $5::uuid
           AND $6::text = (SELECT s2.signalwire_call_sid FROM ai_call_sessions s2 WHERE s2.lead_id = enrichment_results.id ORDER BY s2.created_at DESC, s2.id DESC LIMIT 1)`,
        [
          req.body.RecordingSid || null,
          req.body.RecordingStatus || null,
          req.body.RecordingUrl ? `${req.body.RecordingUrl}.mp3` : null,
          req.body.RecordingDuration || null,
          contactId,
          req.body.CallSid,
        ],
      );
    }

    // Notify the browser only after the lead record carries the final state.
    if (req.body.CallStatus && req.body.CallSid && sessionAccepted) {
      broadcastCallStatus(req.body.CallSid, req.body.CallStatus);
      if (req.body.ParentCallSid) broadcastCallStatus(req.body.ParentCallSid, req.body.CallStatus);
    }

    // Post-call processing will be triggered by the orchestrator
    // when it receives the Twilio Media Streams 'stop' event.

    res.status(200).json({ received: true });
  }),
);

/**
 * POST /api/voice/webhooks/amd-status
 * Receives Answering Machine Detection (AMD) status updates.
 */
router.post(
  '/webhooks/amd-status',
  validateTwilioSignature,
  asyncHandler(async (req, res) => {
    const { CallSid, AnsweredBy } = req.body;
    console.log('[voice-agent] AMD status webhook:', { CallSid, AnsweredBy });

    if (CallSid && ['machine_start', 'machine_end_beep', 'machine_end_silence', 'machine_end_other'].includes(AnsweredBy)) {
      const finalMachineResult = ['machine_end_beep', 'machine_end_silence', 'machine_end_other'].includes(AnsweredBy);
      await query(
        `UPDATE ai_call_sessions
         SET first_answer_type = COALESCE(first_answer_type, $2),
             outcome = CASE WHEN $3 THEN COALESCE(outcome, 'voicemail') ELSE outcome END,
             call_state = CASE WHEN $3 THEN 'voicemail' ELSE call_state END
         WHERE signalwire_call_sid = $1`,
        [CallSid, AnsweredBy, finalMachineResult],
      );
      const contactId = typeof req.query.contactId === 'string' ? req.query.contactId : null;
      if (contactId) {
        await query(
          `UPDATE enrichment_results
           SET raw_data = COALESCE(raw_data, '{}'::jsonb)
             || jsonb_build_object('answered_by', $1::text, 'call_status', 'voicemail_detected', 'voicemail_detected_at', NOW()::text)
             || CASE WHEN $3::boolean
                  THEN jsonb_build_object('ai_outcome', 'voicemail', 'ai_outcome_source', 'telecom_event')
                  ELSE '{}'::jsonb
                END
           WHERE id = $2::uuid`,
          [AnsweredBy, contactId, finalMachineResult],
        );
      }
      console.log(`[voice-agent] Machine detected for ${CallSid}; keeping stream open for live voicemail audio.`);
      broadcastCallStatus(CallSid, 'voicemail-detected');
    }

    res.status(200).json({ received: true });
  }),
);

export default router;
