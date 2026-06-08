import twilio from 'twilio';
import { env, CALLS_ENABLED } from './env.js';

const AccessToken = twilio.jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;

// Lazy client — only construct when Twilio creds are present, otherwise null.
// Routes that need it should check CALLS_ENABLED first and return 503 when false.
export const twilioClient =
  env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN
    ? twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN)
    : null;

export function createVoiceToken(identity) {
  if (!CALLS_ENABLED) {
    throw new Error('Twilio is not configured on this server');
  }
  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: env.TWILIO_TWIML_APP_SID,
    incomingAllow: true
  });

  const token = new AccessToken(
    env.TWILIO_ACCOUNT_SID,
    env.TWILIO_API_KEY,
    env.TWILIO_API_SECRET,
    { identity, ttl: 3600 }
  );

  token.addGrant(voiceGrant);

  return token.toJwt();
}

export { twilio };

