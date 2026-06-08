import { Router } from 'express';
import { z } from 'zod';
import { twilio, createVoiceToken } from '../config/twilio.js';
import { env } from '../config/env.js';
import { query } from '../db/index.js';
import { asyncHandler, AppError } from '../utils/errors.js';
import { validateTwilioSignature } from '../middleware/twilio-signature.js';
import { absoluteUrl } from '../utils/http.js';
import {
  handleCallStatusWebhook,
  handleRecordingWebhook,
  upsertInboundParentCall,
  upsertOutboundParentCall
} from '../services/call-events.service.js';

const router = Router();

/**
 * Cleans any phone number format into E.164.
 * Handles: (844) 823-3132, 585-425-7224, 877.287.8634,
 *          18633735086, (844) 2421885, 408 426 6740,
 *          (844) 823 – 3132 (em-dash), etc.
 */
function cleanPhoneNumber(raw) {
  if (!raw) return '';

  // Strip everything except digits and leading +
  let digits = raw.replace(/[^\d+]/g, '');

  // If it already starts with +, return as-is
  if (digits.startsWith('+')) {
    return digits;
  }

  // Remove leading zeros
  digits = digits.replace(/^0+/, '');

  // US numbers: 10 digits → +1xxx, 11 digits starting with 1 → +1xxx
  if (digits.length === 10) {
    return '+1' + digits;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return '+' + digits;
  }

  // For other lengths, just prepend +
  if (digits.length > 0) {
    return '+' + digits;
  }

  return '';
}

router.get(
  '/token',
  asyncHandler(async (req, res) => {
    const params = z.object({
      agentId: z.coerce.number().int().positive()
    }).parse(req.query);

    const result = await query(
      `
        SELECT id, name, email, twilio_identity, is_available
        FROM agents
        WHERE id = $1
        LIMIT 1
      `,
      [params.agentId]
    );

    const agent = result.rows[0];
    if (!agent) {
      throw new AppError('Agent not found', 404);
    }

    const token = createVoiceToken(agent.twilio_identity);
    res.json({
      token,
      agent
    });
  })
);

router.post(
  '/twiml/outbound',
  validateTwilioSignature,
  asyncHandler(async (req, res) => {
    console.log('[OUTBOUND] === NEW OUTBOUND CALL ===');
    console.log('[OUTBOUND] Headers:', JSON.stringify(req.headers, null, 2));
    console.log('[OUTBOUND] Raw Body:', JSON.stringify(req.body, null, 2));
    const payload = z.object({
      To: z.string().min(3),
      agentId: z.string().optional(),
      contactId: z.string().optional(),
      record: z.string().optional(),
      CallSid: z.string().min(1).optional(),
      From: z.string().optional()
    }).parse(req.body);
    
    console.log('[OUTBOUND] Parsed To:', payload.To);
    const toStr = cleanPhoneNumber(payload.To);

    console.log('[OUTBOUND] Formatted To:', toStr);

    if (!toStr || toStr.length < 4) {
      console.log('[OUTBOUND] ERROR: Invalid phone number after cleaning:', payload.To, '->', toStr);
      const errResponse = new twilio.twiml.VoiceResponse();
      errResponse.say({ voice: 'alice' }, 'Sorry, the phone number entered is not valid.');
      errResponse.hangup();
      return res.type('text/xml').send(errResponse.toString());
    }

    if (payload.CallSid) {
      await upsertOutboundParentCall({
        parentCallSid: payload.CallSid,
        agentId: payload.agentId ? Number(payload.agentId) : null,
        contactId: payload.contactId ? Number(payload.contactId) : null,
        from: env.TWILIO_PHONE_NUMBER,
        to: toStr,
        status: 'initiated',
        shouldRecord: payload.record === 'true'
      });
    }

    const response = new twilio.twiml.VoiceResponse();
    const dialOptions = {
      callerId: env.TWILIO_PHONE_NUMBER,
      answerOnBridge: true
    };
    
    if (payload.record === 'true') {
      dialOptions.record = 'record-from-answer';
      dialOptions.recordingStatusCallback = absoluteUrl(req, '/api/webhooks/call-status');
      dialOptions.recordingStatusCallbackMethod = 'POST';
      dialOptions.recordingStatusCallbackEvent = 'in-progress completed absent';
    }

    const dial = response.dial(dialOptions);

    dial.number(
      {
        statusCallback: absoluteUrl(req, '/api/webhooks/call-status'),
        statusCallbackMethod: 'POST',
        statusCallbackEvent: 'initiated ringing answered completed'
      },
      toStr
    );

    res.type('text/xml').send(response.toString());
  })
);

router.post(
  '/twiml/inbound',
  validateTwilioSignature,
  asyncHandler(async (req, res) => {
    const payload = z.object({
      CallSid: z.string().min(1).optional(),
      From: z.string().optional(),
      To: z.string().optional()
    }).passthrough().parse(req.body);

    console.log('[INBOUND] ========== INBOUND CALL RECEIVED ==========');
    console.log('[INBOUND] Headers:', JSON.stringify(req.headers, null, 2));
    console.log('[INBOUND] Body:', JSON.stringify(payload, null, 2));
    console.log('[INBOUND] PUBLIC_BASE_URL:', env.PUBLIC_BASE_URL || '(not set)');
    console.log('[INBOUND] absoluteUrl test:', absoluteUrl(req, '/api/webhooks/call-status'));

    const agentResult = await query(
      `
        SELECT id, twilio_identity
        FROM agents
        WHERE is_available = true
        ORDER BY updated_at DESC, id ASC
        LIMIT 1
      `
    );

    const response = new twilio.twiml.VoiceResponse();
    const agent = agentResult.rows[0];

    console.log('[INBOUND] Available agent:', agent ? `${agent.twilio_identity} (id=${agent.id})` : 'NONE');

    if (!agent) {
      response.say(
        { voice: 'alice' },
        'Thanks for calling. No agents are available right now. Please try again later.'
      );
      response.hangup();
      const twiml = response.toString();
      console.log('[INBOUND] TwiML (no agent):', twiml);
      return res.type('text/xml').send(twiml);
    }

    if (payload.CallSid) {
      await upsertInboundParentCall({
        parentCallSid: payload.CallSid,
        agentId: agent.id,
        from: payload.From,
        to: payload.To,
        status: 'initiated'
      });
    }

    const dial = response.dial({
      answerOnBridge: true
    });

    dial.client(
      {
        statusCallback: absoluteUrl(req, '/api/webhooks/call-status'),
        statusCallbackMethod: 'POST',
        statusCallbackEvent: 'initiated ringing answered completed'
      },
      agent.twilio_identity
    );

    const twiml = response.toString();
    console.log('[INBOUND] TwiML (routing to agent):', twiml);
    res.type('text/xml').send(twiml);
  })
);

router.post(
  '/webhooks/call-status',
  validateTwilioSignature,
  asyncHandler(async (req, res) => {
    if (req.body.RecordingSid || req.body.RecordingStatus) {
      await handleRecordingWebhook(req.body);
    }

    if (req.body.CallSid && req.body.CallStatus) {
      await handleCallStatusWebhook(req.body);
    }

    res.status(200).json({ received: true });
  })
);

export default router;
