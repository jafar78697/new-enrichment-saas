import { Router } from 'express';
import { z } from 'zod';
import twilio from 'twilio';
import { env } from '../config/env.js';
import { asyncHandler, AppError } from '../utils/errors.js';

const router = Router();

/**
 * POST /api/voice/campaigns/call
 * Triggers an outbound call to a given number, connecting them to the AI agent.
 */
router.post('/call', asyncHandler(async (req, res) => {
  const { to } = z.object({
    to: z.string().min(1, 'Phone number is required')
  }).parse(req.body);

  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_PHONE_NUMBER) {
    throw new AppError('Twilio credentials are not configured properly.', 500);
  }

  const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

  try {
    const call = await client.calls.create({
      to,
      from: env.TWILIO_PHONE_NUMBER,
      url: `${env.PUBLIC_BASE_URL || 'https://api.jentoai.pro'}/api/voice/twiml/outbound`,
    });

    res.json({ success: true, callSid: call.sid, message: 'Call initiated successfully' });
  } catch (error) {
    console.error('[voice-agent] Error triggering outbound call:', error);
    throw new AppError(`Failed to trigger call: ${error.message}`, 500);
  }
}));

export default router;
