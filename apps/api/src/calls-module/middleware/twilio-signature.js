import { twilio } from '../config/twilio.js';
import { env } from '../config/env.js';
import { getRequestBaseUrl } from '../utils/http.js';

export function validateTwilioSignature(req, res, next) {
  console.log(`[TWILIO-SIG] ${req.method} ${req.originalUrl} | NODE_ENV=${env.NODE_ENV}`);

  const signature = req.headers['x-twilio-signature'];
  const url = `${getRequestBaseUrl(req)}${req.originalUrl}`;

  console.log('[TWILIO-SIG] Validating (Temporarily bypassed for debugging):', { url, hasSignature: !!signature });

  // Temporarily bypass validation
  return next();
}
