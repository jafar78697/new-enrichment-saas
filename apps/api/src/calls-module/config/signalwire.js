import { RestClient } from '@signalwire/compatibility-api';
import axios from 'axios';
import { env, CALLS_ENABLED } from './env.js';

// Lazy client — only construct when SignalWire creds are present.
// Routes that need it should check CALLS_ENABLED first.
export const signalwireClient =
  env.SIGNALWIRE_PROJECT_ID && env.SIGNALWIRE_API_TOKEN
    ? RestClient(env.SIGNALWIRE_PROJECT_ID, env.SIGNALWIRE_API_TOKEN, {
        signalwireSpaceUrl: env.SIGNALWIRE_SPACE_URL,
      })
    : null;

// Re-export twilio for TwiML generation (SignalWire compatibility API uses it)
import twilio from 'twilio';
export { twilio };

function signalwireApiBaseUrl() {
  const spaceUrl = env.SIGNALWIRE_SPACE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `https://${spaceUrl}`;
}

/**
 * Creates a WebRTC JWT via SignalWire's Relay REST /jwt endpoint.
 * This does NOT create subscribers ($3/each).
 * Relay JWTs authenticate a browser endpoint and do not create Fabric
 * Subscribers. The resource is deliberately fixed in the environment.
 */
export async function createVoiceToken() {
  if (!CALLS_ENABLED) {
    throw new Error('Calling is not configured on this server');
  }

  try {
    const { data } = await axios.post(
      `${signalwireApiBaseUrl()}/api/relay/rest/jwt`,
      {
        resource: env.SIGNALWIRE_RELAY_RESOURCE,
        expires_in: env.SIGNALWIRE_RELAY_TOKEN_MINUTES,
      },
      {
        auth: {
          username: env.SIGNALWIRE_PROJECT_ID,
          password: env.SIGNALWIRE_API_TOKEN
        },
        headers: { 'Content-Type': 'application/json' },
        timeout: 10_000
      }
    );

    if (!data?.jwt_token) {
      throw new Error('SignalWire did not return a JWT token');
    }

    return {
      token: data.jwt_token,
      projectId: env.SIGNALWIRE_PROJECT_ID,
      callerId: (env.SIGNALWIRE_PHONE_NUMBER || '').replace(/\D/g, '').replace(/^(\d)/, '+$1'),
      maxCallSeconds: env.MANUAL_CALL_MAX_SECONDS,
      sipDomain: env.SIGNALWIRE_SIP_DOMAIN || undefined,
    };
  } catch (error) {
    const detail = error?.response?.data?.message || error?.response?.data?.error || error?.message;
    const tokenError = new Error(`Unable to create SignalWire voice token${detail ? `: ${detail}` : ''}`);
    throw tokenError;
  }
}
