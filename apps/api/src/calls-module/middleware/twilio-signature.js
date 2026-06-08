import { twilio } from '../config/twilio.js';
import { env } from '../config/env.js';
import { getRequestBaseUrl } from '../utils/http.js';

export function validateTwilioSignature(req, res, next) {
  console.log(`[TWILIO-SIG] ${req.method} ${req.originalUrl} | NODE_ENV=${env.NODE_ENV}`);

  if (env.NODE_ENV !== 'production') {
    console.log('[TWILIO-SIG] Skipping validation (non-production)');
    return next();
  }

  const signature = req.headers['x-twilio-signature'];
  const url = `${getRequestBaseUrl(req)}${req.originalUrl}`;

  console.log('[TWILIO-SIG] Validating:', { url, hasSignature: !!signature });

  const isValid = twilio.validateRequest(
    env.TWILIO_AUTH_TOKEN,
    signature,
    url,
    req.body
  );

  if (!isValid) {
    console.error('[TWILIO-SIG] ❌ SIGNATURE VALIDATION FAILED for URL:', url);
    return res.status(403).json({ error: 'Invalid Twilio signature' });
  }

  console.log('[TWILIO-SIG] ✅ Signature valid');
  return next();
}
