import twilio from 'twilio';
import { env } from '../config/env.js';
import { absoluteUrl } from '../utils/http.js';

export function validateTwilioSignature(req, res, next) {
  const url = absoluteUrl(req, req.originalUrl);
  const signature = req.headers['x-twilio-signature'];
  const params = req.body;

  console.log('[voice-agent] [TWILIO-SIG] Validating (Temporarily bypassed for debugging):', { url, hasSignature: !!signature });

  // Temporarily bypass validation
  return next();
}
