import { Router } from 'express';
import { z } from 'zod';
import twilio from 'twilio';
import { env, VOICE_AGENT_ENABLED } from '../config/env.js';
import { asyncHandler, AppError } from '../utils/errors.js';
import { validateTwilioSignature } from '../middleware/twilio-signature.js';
import { wsUrl } from '../utils/http.js';
import { broadcastCallStatus } from '../websocket/call-monitor.js';
import { query } from '../../calls-module/db/index.js';
import axios from 'axios';
import { normalizeUSPhone } from '../../utils/us-phone.js';

const router = Router();

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
    if (!VOICE_AGENT_ENABLED) {
      throw new AppError('Voice Agent is not configured on this server', 503);
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
    }).parse({ ...req.body, ...req.query });

    const toStr = normalizeUSPhone(payload.To);

    if (!toStr || toStr.length < 4) {
      const errResponse = new twilio.twiml.VoiceResponse();
      errResponse.say({ voice: 'alice' }, 'Sorry, only valid USA numbers are supported for this call.');
      errResponse.hangup();
      return res.type('text/xml').send(errResponse.toString());
    }

    console.log(`[voice-agent] Outbound AI call to: ${toStr} (CallSid: ${payload.CallSid})`);

    const response = new twilio.twiml.VoiceResponse();

    if (payload.AnsweredBy?.startsWith('machine') || payload.AnsweredBy === 'fax') {
      if (payload.contactId) {
        await query(
          `UPDATE enrichment_results
           SET lead_stage = 'no_answer',
               raw_data = COALESCE(raw_data, '{}'::jsonb) - 'active_call_sid',
               lead_notes = CONCAT_WS(E'\n', NULLIF(lead_notes, ''), $1)
           WHERE id = $2`,
          [`[AI Call] ${payload.AnsweredBy === 'fax' ? 'Fax' : 'Voicemail'} detected by Twilio; call ended automatically.`, payload.contactId],
        );
      }
      console.log(`[voice-agent] ${payload.AnsweredBy} detected for ${payload.CallSid}; hanging up before AI stream.`);
      response.hangup();
      return res.type('text/xml').send(response.toString());
    }

    // Connect to Media Streams WebSocket for AI conversation
    const stream = response.connect().stream({
      url: wsUrl(req, '/api/voice/media'),
      track: 'inbound_track',
    });
    if (payload.contactId) stream.parameter({ name: 'contactId', value: payload.contactId });
    if (payload.tenantId) stream.parameter({ name: 'tenantId', value: payload.tenantId });

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
      const response = new twilio.twiml.VoiceResponse();
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

    const response = new twilio.twiml.VoiceResponse();

    const streamUrl = wsUrl(req, '/api/voice/media');

    response.connect().stream({
      url: streamUrl,
      track: 'inbound_track',
    });

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
    const contactId = typeof req.query.contactId === 'string' ? req.query.contactId : null;
    console.log('[voice-agent] Call status webhook:', {
      CallSid: req.body.CallSid,
      CallStatus: req.body.CallStatus,
      Duration: req.body.CallDuration,
      contactId,
    });

    if (req.body.CallStatus && req.body.CallSid) {
      broadcastCallStatus(req.body.CallSid, req.body.CallStatus);
      if (req.body.ParentCallSid) {
        broadcastCallStatus(req.body.ParentCallSid, req.body.CallStatus);
      }
    }

    if (contactId && ['busy', 'failed', 'no-answer', 'canceled'].includes(req.body.CallStatus)) {
      await query(
        `UPDATE enrichment_results
         SET lead_stage = 'no_answer',
             raw_data = COALESCE(raw_data, '{}'::jsonb) - 'active_call_sid',
             lead_notes = CONCAT_WS(E'\n', NULLIF(lead_notes, ''), $1::text)
         WHERE id = $2::uuid AND lead_stage = 'calling'`,
        [`[AI Call] Twilio status: ${req.body.CallStatus}`, contactId],
      );
    }

    if (contactId && req.body.CallStatus === 'completed') {
      await query(
        `UPDATE enrichment_results
         SET lead_stage = 'called',
             raw_data = COALESCE(raw_data, '{}'::jsonb) - 'active_call_sid',
             lead_notes = CONCAT_WS(E'\n', NULLIF(lead_notes, ''), $1::text)
         WHERE id = $2::uuid AND lead_stage = 'calling'`,
        [`[AI Call] Completed${req.body.CallDuration ? ` (${req.body.CallDuration}s)` : ''}.`, contactId],
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
         WHERE id = $5::uuid`,
        [
          req.body.RecordingSid || null,
          req.body.RecordingStatus || null,
          req.body.RecordingUrl ? `${req.body.RecordingUrl}.mp3` : null,
          req.body.RecordingDuration || null,
          contactId,
        ],
      );
    }

    // Post-call processing will be triggered by the orchestrator
    // when it receives the Twilio Media Streams 'stop' event.

    res.status(200).json({ received: true });
  }),
);

router.get(
  '/recordings/:contactId/stream',
  asyncHandler(async (req, res) => {
    const { contactId } = req.params;
    const { rows } = await query(
      `SELECT
         raw_data->>'recording_url' AS recording_url,
         raw_data->>'recording_sid' AS recording_sid
       FROM enrichment_results
       WHERE id = $1`,
      [contactId],
    );

    const recordingUrl = rows[0]?.recording_url;
    const recordingSid = rows[0]?.recording_sid;
    if (!recordingUrl) {
      throw new AppError('Recording not found', 404);
    }

    const mediaUrl = recordingSid
      ? `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Recordings/${recordingSid}.mp3`
      : recordingUrl;


    let response = await axios({
      method: 'get',
      url: mediaUrl,
      responseType: 'stream',
      maxRedirects: 0,
      auth: {
        username: env.TWILIO_ACCOUNT_SID,
        password: env.TWILIO_AUTH_TOKEN,
      },
      headers: req.headers.range ? { Range: req.headers.range } : undefined,
      validateStatus: (status) => status >= 200 && status < 400,
    });

    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      response = await axios({
        method: 'get',
        url: response.headers.location,
        responseType: 'stream',
        headers: req.headers.range ? { Range: req.headers.range } : undefined,
        validateStatus: (status) => status >= 200 && status < 400,
      });
    }

    res.setHeader('Content-Type', response.headers['content-type'] || 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    if (response.headers['accept-ranges']) res.setHeader('Accept-Ranges', response.headers['accept-ranges']);
    if (response.headers['content-length']) res.setHeader('Content-Length', response.headers['content-length']);
    if (response.headers['content-range']) res.setHeader('Content-Range', response.headers['content-range']);
    res.status(response.status);
    response.data.pipe(res);
  }),
);

export default router;
