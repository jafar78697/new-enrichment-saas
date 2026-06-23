import { Router } from 'express';
import { z } from 'zod';
import twilio from 'twilio';
import { env, VOICE_AGENT_ENABLED } from '../config/env.js';
import { asyncHandler, AppError } from '../utils/errors.js';
import { validateTwilioSignature } from '../middleware/twilio-signature.js';
import { wsUrl } from '../utils/http.js';

const router = Router();

/**
 * Cleans any phone number format into E.164.
 */
function cleanPhoneNumber(raw) {
  if (!raw) return '';
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  digits = digits.replace(/^0+/, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  if (digits.length > 0) return '+' + digits;
  return '';
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
    if (!VOICE_AGENT_ENABLED) {
      throw new AppError('Voice Agent is not configured on this server', 503);
    }

    const payload = z.object({
      To: z.string().min(3),
      CallSid: z.string().min(1).optional(),
      From: z.string().optional(),
      voiceAgentId: z.string().optional(),
      contactId: z.string().optional(),
      record: z.string().optional(),
    }).parse({ ...req.body, ...req.query });

    const toStr = cleanPhoneNumber(payload.To);

    if (!toStr || toStr.length < 4) {
      const errResponse = new twilio.twiml.VoiceResponse();
      errResponse.say({ voice: 'alice' }, 'Sorry, the phone number entered is not valid.');
      errResponse.hangup();
      return res.type('text/xml').send(errResponse.toString());
    }

    console.log(`[voice-agent] Outbound AI call to: ${toStr} (CallSid: ${payload.CallSid})`);

    const response = new twilio.twiml.VoiceResponse();

    // Connect to Media Streams WebSocket for AI conversation
    let streamUrl = wsUrl(req, '/api/voice/media');
    if (payload.contactId) {
      streamUrl += `?contactId=${payload.contactId}`;
    }

    response.connect().stream({
      url: streamUrl,
      track: 'inbound_track',
    });

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
    console.log('[voice-agent] Call status webhook:', {
      CallSid: req.body.CallSid,
      CallStatus: req.body.CallStatus,
      Duration: req.body.CallDuration,
    });

    // Post-call processing will be triggered by the orchestrator
    // when it receives the Twilio Media Streams 'stop' event.

    res.status(200).json({ received: true });
  }),
);

export default router;
