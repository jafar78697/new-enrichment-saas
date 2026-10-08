import { Router } from 'express';
import { z } from 'zod';
import { RestClient } from '@signalwire/compatibility-api';
import { env } from '../config/env.js';
import { asyncHandler, AppError } from '../utils/errors.js';
import { query } from '../../calls-module/db/index.js';
import { normalizeNorthAmericanPhone } from '../../utils/us-phone.js';

const router = Router();

const projectId = env.SIGNALWIRE_PROJECT_ID;
const apiToken = env.SIGNALWIRE_API_TOKEN;
const spaceUrl = env.SIGNALWIRE_SPACE_URL;

let signalwireClient = null;
if (projectId && apiToken && spaceUrl) {
  signalwireClient = RestClient(projectId, apiToken, { signalwireSpaceUrl: spaceUrl });
}

router.post(
  '/call',
  asyncHandler(async (req, res) => {
    if (!signalwireClient) {
      throw new AppError('SignalWire is not configured on this server', 503);
    }
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      throw new AppError('Missing tenant context', 401);
    }

    const payload = z.object({
      phone_number: z.string().min(10),
      script: z.string().min(1),
    }).parse(req.body);

    const toPhone = normalizeNorthAmericanPhone(payload.phone_number);
    if (!toPhone) {
      throw new AppError('Invalid USA/Canada phone number', 400);
    }

    // Pick a from number from this tenant's phone_numbers
    const { rows: phoneRows } = await query(
      `SELECT id, phone_number FROM phone_numbers WHERE tenant_id = $1 AND status = 'active' LIMIT 1`,
      [tenantId]
    );

    if (phoneRows.length === 0) {
      throw new AppError('No active phone numbers available for this tenant', 400);
    }

    const fromPhone = phoneRows[0].phone_number;
    const phoneNumberId = phoneRows[0].id;

    const agentConfigSnapshot = {
      voice: env.DEEPGRAM_AGENT_VOICE || 'aura-orion-en',
      language: 'en',
      speech_speed: env.DEEPGRAM_AGENT_SPEAK_SPEED || 1.0,
      listen_eot_threshold: 0.70,
      listen_eot_timeout_ms: 900
    };

    const { rows: sessionRes } = await query(
      `INSERT INTO ai_call_sessions (
         tenant_id, phone_number_id, call_state, agent_config_snapshot, compiled_script_prompt, provider
       ) VALUES ($1, $2, 'starting', $3, $4, 'deepgram_voice_agent') RETURNING id`,
      [tenantId, phoneNumberId, JSON.stringify(agentConfigSnapshot), payload.script]
    );

    const sessionId = sessionRes[0].id;

    const PUBLIC_BASE_URL = env.PUBLIC_BASE_URL || 'http://localhost:3000';

    const callArgs = {
      from: fromPhone,
      to: toPhone,
      url: `${PUBLIC_BASE_URL}/api/voice/twiml/outbound?sessionId=${sessionId}`,
      statusCallback: `${PUBLIC_BASE_URL}/api/voice/webhooks/call-status?sessionId=${sessionId}`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      machineDetection: 'Enable',
      timeout: 45,
      record: false
    };

    const swCall = await signalwireClient.calls.create(callArgs);

    await query(`UPDATE ai_call_sessions SET provider_request_id = $1, signalwire_call_sid = $1 WHERE id = $2`, [swCall.sid, sessionId]);

    res.json({ ok: true, sessionId, callSid: swCall.sid, fromPhone, toPhone });
  })
);

export default router;
