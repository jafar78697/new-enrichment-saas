// Live SignalWire phone number search + purchase helpers using Compatibility API.
import { signalwireClient } from '../config/signalwire.js';
import { env, CALLS_ENABLED } from '../config/env.js';
import { AppError } from '../utils/errors.js';

/**
 * Search US local numbers available to purchase on SignalWire.
 * @param {{ areaCode?: string, contains?: string, limit?: number }} opts
 */
export async function searchUsNumbers({ areaCode, contains, limit = 10 } = {}) {
  if (!CALLS_ENABLED || !signalwireClient) {
    throw new AppError('Calling is not configured on this server', 503);
  }
  const filters = {
    limit: Math.min(Math.max(Number(limit) || 10, 1), 25),
    voiceEnabled: true,
    smsEnabled: true,
  };
  if (areaCode) filters.areaCode = Number(areaCode);
  if (contains) filters.contains = String(contains);

  const results = await signalwireClient.availablePhoneNumbers('US').local.list(filters);
  return results.map((n) => ({
    phoneNumber: n.phoneNumber,
    friendlyName: n.friendlyName,
    locality: n.locality,
    region: n.region,
    postalCode: n.postalCode,
    capabilities: n.capabilities,
    isoCountry: n.isoCountry,
  }));
}

/** Purchase a SignalWire number. */
export async function purchaseNumber({ phoneNumber, friendlyName }) {
  if (!CALLS_ENABLED || !signalwireClient) {
    throw new AppError('Calling is not configured on this server', 503);
  }
  if (!phoneNumber) throw new AppError('phoneNumber is required', 400);

  const voiceUrl = env.PUBLIC_BASE_URL
    ? `${env.PUBLIC_BASE_URL}/api/signalwire/twiml/inbound`
    : undefined;
  const statusCallback = env.PUBLIC_BASE_URL
    ? `${env.PUBLIC_BASE_URL}/api/signalwire/webhooks/call-status`
    : undefined;

  const payload = {
    phoneNumber,
    friendlyName: friendlyName || `JentoAI · ${phoneNumber}`,
  };
  if (voiceUrl) payload.voiceUrl = voiceUrl;
  if (statusCallback) payload.statusCallback = statusCallback;

  const purchased = await signalwireClient.incomingPhoneNumbers.create(payload);
  return {
    sid: purchased.sid,
    phoneNumber: purchased.phoneNumber,
    friendlyName: purchased.friendlyName,
    voiceApplicationSid: purchased.voiceApplicationSid,
    dateCreated: purchased.dateCreated,
  };
}

/** Release a previously purchased number. */
export async function releaseNumber(sid) {
  if (!CALLS_ENABLED || !signalwireClient) {
    return false;
  }
  if (!sid) return false;
  try {
    await signalwireClient.incomingPhoneNumbers(sid).remove();
    return true;
  } catch (err) {
    console.warn('[signalwire] release number failed', sid, err?.message);
    return false;
  }
}
