// Live Twilio phone number search + purchase helpers.
import { twilioClient } from '../config/twilio.js';
import { env, CALLS_ENABLED } from '../config/env.js';
import { AppError } from '../utils/errors.js';

/**
 * Search US local numbers available to purchase.
 * @param {{ areaCode?: string, contains?: string, limit?: number }} opts
 */
export async function searchUsNumbers({ areaCode, contains, limit = 10 } = {}) {
  if (!CALLS_ENABLED || !twilioClient) {
    throw new AppError('Twilio calling is not configured on this server', 503);
  }
  const filters = {
    limit: Math.min(Math.max(Number(limit) || 10, 1), 25),
    voiceEnabled: true,
    smsEnabled: true,
  };
  if (areaCode) filters.areaCode = Number(areaCode);
  if (contains) filters.contains = String(contains);

  const results = await twilioClient.availablePhoneNumbers('US').local.list(filters);
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

/** Purchase a Twilio number and wire it to the configured TwiML app. */
export async function purchaseNumber({ phoneNumber, friendlyName }) {
  if (!CALLS_ENABLED || !twilioClient) {
    throw new AppError('Twilio calling is not configured on this server', 503);
  }
  if (!phoneNumber) throw new AppError('phoneNumber is required', 400);

  const voiceUrl = env.PUBLIC_BASE_URL
    ? `${env.PUBLIC_BASE_URL}/api/twilio/twiml/inbound`
    : undefined;
  const statusCallback = env.PUBLIC_BASE_URL
    ? `${env.PUBLIC_BASE_URL}/api/twilio/webhooks/call-status`
    : undefined;

  const payload = {
    phoneNumber,
    friendlyName: friendlyName || `JentoAI · ${phoneNumber}`,
    voiceApplicationSid: env.TWILIO_TWIML_APP_SID,
  };
  if (voiceUrl) payload.voiceUrl = voiceUrl;
  if (statusCallback) payload.statusCallback = statusCallback;

  const purchased = await twilioClient.incomingPhoneNumbers.create(payload);
  return {
    sid: purchased.sid,
    phoneNumber: purchased.phoneNumber,
    friendlyName: purchased.friendlyName,
    voiceApplicationSid: purchased.voiceApplicationSid,
    dateCreated: purchased.dateCreated,
  };
}

/** Release a previously purchased number (used when removing an employee). */
export async function releaseNumber(sid) {
  if (!CALLS_ENABLED || !twilioClient) {
    return false;
  }
  if (!sid) return false;
  try {
    await twilioClient.incomingPhoneNumbers(sid).remove();
    return true;
  } catch (err) {
    console.warn('[twilio] release number failed', sid, err?.message);
    return false;
  }
}
