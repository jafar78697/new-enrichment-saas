import { Router } from 'express';
import { z } from 'zod';
import { signalwireClient, createVoiceToken, twilio } from '../config/signalwire.js';
import { env, CALLS_ENABLED } from '../config/env.js';
import { query, getClient } from '../db/index.js';
import { asyncHandler, AppError } from '../utils/errors.js';
import { validateTwilioSignature } from '../middleware/twilio-signature.js';
import { requireAuth, canAccessAgent } from '../middleware/auth.js';
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

  const digits = String(raw).replace(/\D/g, '');

  if (digits.startsWith('00')) return `+${digits.substring(2)}`;

  if (String(raw).trim().startsWith('+')) return `+${digits}`;

  // The manual dialer is US-only. Never infer a foreign country code.
  if (/^[2-9]\d{9}$/.test(digits)) {
    return '+1' + digits;
  }
  if (/^1[2-9]\d{9}$/.test(digits)) {
    return '+' + digits;
  }

  // Preserve malformed numbers only so validation can reject them clearly.
  if (digits.length > 0) {
    return '+' + digits;
  }

  return '';
}

function isValidUSNumber(phoneNumber) {
  return /^\+1[2-9]\d{9}$/.test(phoneNumber);
}

function isEmergencyDestination(raw) {
  return ['911', '112', '999', '1911'].includes(String(raw || '').replace(/\D/g, ''));
}

const CALL_RATE_PER_MINUTE_CENTS = Number(process.env.CALL_RATE_PER_MINUTE_CENTS || '1.5');
const DEMO_CALL_LIMIT = 3;

async function requireActiveCallingSubscription(client, tenantId) {
  const { rows } = await client.query(
    `SELECT id, plan_name, end_date
     FROM customer_subscriptions
     WHERE tenant_id = $1
       AND status = 'active'
       AND start_date <= NOW()
       AND (end_date IS NULL OR end_date > NOW())
     ORDER BY end_date ASC NULLS LAST, created_at DESC
     LIMIT 1`,
    [tenantId]
  );

  if (!rows[0]) {
    throw new AppError(
      'Your calling subscription is inactive or has expired. Contact your administrator to renew 30-day calling access.',
      402,
      { code: 'CALLING_SUBSCRIPTION_EXPIRED' }
    );
  }

  return rows[0];
}

function estimatedCallReservationCents(maxSeconds) {
  return Math.max(1, Math.ceil(Math.ceil(maxSeconds / 60) * CALL_RATE_PER_MINUTE_CENTS));
}

async function ensureWallet(client, tenantId, unit) {
  await client.query(
    `INSERT INTO wallets (tenant_id, unit, available, reserved)
     VALUES ($1, $2, 0, 0)
     ON CONFLICT (tenant_id, unit) DO NOTHING`,
    [tenantId, unit]
  );
}

async function reserveWallet(client, tenantId, amount, operationId, description) {
  await ensureWallet(client, tenantId, 'calling_cents');
  const { rows: walletRows } = await client.query(
    `SELECT id, available FROM wallets WHERE tenant_id = $1 AND unit = 'calling_cents' FOR UPDATE`,
    [tenantId]
  );
  const wallet = walletRows[0];
  if (!wallet || Number(wallet.available) < amount) {
    throw new AppError('Insufficient calling balance', 402);
  }

  const { rows: updatedRows } = await client.query(
    `UPDATE wallets
     SET available = available - $1, reserved = reserved + $1, updated_at = NOW()
     WHERE id = $2
     RETURNING available, reserved`,
    [amount, wallet.id]
  );
  const updated = updatedRows[0];

  const { rows: reservationRows } = await client.query(
    `INSERT INTO usage_reservations (wallet_id, tenant_id, amount, operation_type, operation_id)
     VALUES ($1, $2, $3, 'call', $4)
     RETURNING id`,
    [wallet.id, tenantId, amount, operationId]
  );

  await client.query(
    `INSERT INTO wallet_ledger (wallet_id, tenant_id, operation_type, amount, balance_after, reserved_after, reference_type, reference_id, description)
     VALUES ($1, $2, 'reserve', $3, $4, $5, 'call', $6, $7)`,
    [wallet.id, tenantId, amount, updated.available, updated.reserved, operationId, description]
  );

  return reservationRows[0].id;
}

async function settleWalletReservation(client, reservationId, finalAmount) {
  const { rows: reservationRows } = await client.query(
    `SELECT * FROM usage_reservations WHERE id = $1 FOR UPDATE`,
    [reservationId]
  );
  const reservation = reservationRows[0];
  if (!reservation || reservation.status !== 'held') return;

  const chargeAmount = Math.min(Number(reservation.amount), Math.max(0, Number(finalAmount) || 0));
  const releaseAmount = Number(reservation.amount) - chargeAmount;

  await client.query(
    `UPDATE usage_reservations
     SET status = 'settled', settled_amount = $1, settled_at = NOW()
     WHERE id = $2`,
    [chargeAmount, reservationId]
  );

  const { rows: walletRows } = await client.query(
    `UPDATE wallets
     SET reserved = reserved - $1, available = available + $2, updated_at = NOW()
     WHERE id = $3
     RETURNING available, reserved`,
    [reservation.amount, releaseAmount, reservation.wallet_id]
  );
  const wallet = walletRows[0];

  await client.query(
    `INSERT INTO wallet_ledger (wallet_id, tenant_id, operation_type, amount, balance_after, reserved_after, reference_type, reference_id, description)
     VALUES ($1, $2, 'settle', $3, $4, $5, 'call', $6, 'Settled outbound call')`,
    [reservation.wallet_id, reservation.tenant_id, chargeAmount, wallet.available, wallet.reserved, reservation.operation_id]
  );
}

async function authorizeTrackedOutboundCall(req, payload) {
  if (!req.tenantId) throw new AppError('Tenant context is required for calling', 403);
  if (!canAccessAgent(req.user, payload.agentId)) {
    throw new AppError('You can only call from your own phone', 403);
  }

  const toStr = cleanPhoneNumber(payload.to);
  if (isEmergencyDestination(payload.to)) {
    throw new AppError('Emergency destinations cannot be dialed from this application.', 400);
  }
  if (!isValidUSNumber(toStr)) {
    throw new AppError('A valid US phone number is required (+1 followed by 10 digits).', 400);
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // This is the server-side gate for every browser and REST outbound call.
    // A visible dashboard countdown alone must never permit an expired account to dial.
    await requireActiveCallingSubscription(client, req.tenantId);

    const { rows: tenantRows } = await client.query(
      `SELECT plan FROM tenants WHERE id = $1 FOR UPDATE`,
      [req.tenantId]
    );
    if (tenantRows[0]?.plan === 'demo') {
      const { rows: demoUsageRows } = await client.query(
        `SELECT COUNT(*)::int AS used
         FROM tracked_calls
         WHERE tenant_id = $1 AND direction = 'outbound'`,
        [req.tenantId]
      );
      const callsUsed = Number(demoUsageRows[0]?.used || 0);
      if (callsUsed >= DEMO_CALL_LIMIT) {
        throw new AppError(
          `Your free demo includes ${DEMO_CALL_LIMIT} calls. Upgrade your account to continue calling.`,
          402,
          { code: 'DEMO_CALL_LIMIT_REACHED', callsUsed, callLimit: DEMO_CALL_LIMIT }
        );
      }
    }

    const { rows: agentRows } = await client.query(
      `SELECT id, signalwire_phone_number, status
       FROM agents
       WHERE id = $1
         AND tenant_id = $2
         AND status = 'active'
       LIMIT 1`,
      [payload.agentId, req.tenantId]
    );
    const agent = agentRows[0];
    if (!agent) throw new AppError('Calling agent not found or inactive', 404);

    const callerId = cleanPhoneNumber(agent.signalwire_phone_number || env.SIGNALWIRE_PHONE_NUMBER || env.TWILIO_PHONE_NUMBER || '');
    if (!callerId) throw new AppError('No caller ID is configured for this account.', 400);

    const { rows: limitRows } = await client.query(
      `SELECT max_concurrent_calls, max_daily_call_attempts, max_daily_unique_destinations, max_call_seconds
       FROM tenant_limits
       WHERE tenant_id = $1
       FOR UPDATE`,
      [req.tenantId]
    );
    const limits = limitRows[0];
    if (!limits) throw new AppError('Tenant calling limits are not configured', 403);

    const maxCallSeconds = Math.min(
      Number(payload.expectedMaxDurationSeconds || limits.max_call_seconds || 1800),
      Number(limits.max_call_seconds || 1800)
    );

    const { rows: activeRows } = await client.query(
      `SELECT COUNT(*) AS active_calls
       FROM tracked_calls
       WHERE tenant_id = $1 AND status IN ('initiated', 'ringing', 'connected')`,
      [req.tenantId]
    );
    if (Number(activeRows[0]?.active_calls || 0) >= Number(limits.max_concurrent_calls || 1)) {
      throw new AppError(`Max concurrent calls limit reached (${limits.max_concurrent_calls})`, 429);
    }

    const { rows: counterRows } = await client.query(
      `SELECT total_attempts, unique_destinations, destination_numbers
       FROM daily_call_counters
       WHERE tenant_id = $1 AND date = CURRENT_DATE
       FOR UPDATE`,
      [req.tenantId]
    );
    const counter = counterRows[0];
    const destinationNumbers = counter?.destination_numbers || [];
    const isNewDestination = !destinationNumbers.includes(toStr);
    if (Number(counter?.total_attempts || 0) >= Number(limits.max_daily_call_attempts || 0)) {
      throw new AppError(`Daily call attempt limit reached (${limits.max_daily_call_attempts})`, 429);
    }
    if (isNewDestination && Number(counter?.unique_destinations || 0) >= Number(limits.max_daily_unique_destinations || 0)) {
      throw new AppError(`Daily unique destination limit reached (${limits.max_daily_unique_destinations})`, 429);
    }

    const operationId = `call_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const reservationCents = estimatedCallReservationCents(maxCallSeconds);
    const reservationId = await reserveWallet(
      client,
      req.tenantId,
      reservationCents,
      operationId,
      `Reserve for call to ${toStr}`
    );

    await client.query(
      `INSERT INTO daily_call_counters (tenant_id, date, total_attempts, unique_destinations, destination_numbers)
       VALUES ($1, CURRENT_DATE, 1, 1, ARRAY[$2]::TEXT[])
       ON CONFLICT (tenant_id, date) DO UPDATE SET
         total_attempts = daily_call_counters.total_attempts + 1,
         destination_numbers = CASE
           WHEN $2 = ANY(daily_call_counters.destination_numbers)
           THEN daily_call_counters.destination_numbers
           ELSE array_append(daily_call_counters.destination_numbers, $2)
         END,
         unique_destinations = (
           SELECT COUNT(DISTINCT destination)
           FROM unnest(CASE
             WHEN $2 = ANY(daily_call_counters.destination_numbers)
             THEN daily_call_counters.destination_numbers
             ELSE array_append(daily_call_counters.destination_numbers, $2)
           END) AS destination
         )`,
      [req.tenantId, toStr]
    );

    const { rows: trackedRows } = await client.query(
      `INSERT INTO tracked_calls (
        tenant_id, user_id, agent_id, caller_number, destination_number,
        reservation_id, rate_per_minute, status, metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'initiated', $8::jsonb)
       RETURNING id`,
      [
        req.tenantId,
        req.user.platform_user_id || null,
        String(payload.agentId),
        callerId,
        toStr,
        reservationId,
        CALL_RATE_PER_MINUTE_CENTS,
        JSON.stringify({ contact_id: payload.contactId || null, operation_id: operationId }),
      ]
    );

    await client.query('COMMIT');
    return {
      trackedCallId: trackedRows[0].id,
      reservationId,
      callerId,
      to: toStr,
      maxCallSeconds,
      reservationCents,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

router.get(
  '/token',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = z.object({
      agentId: z.coerce.number().int().positive().optional()
    }).parse(req.query);
    if (!CALLS_ENABLED) {
      throw new AppError('SignalWire calling is not configured on this server', 503);
    }

    const agentId = params.agentId || req.user.id;
    if (!canAccessAgent(req.user, agentId)) {
      throw new AppError('You can only request a token for your own phone', 403);
    }

    const result = await query(
      `
        SELECT id, name, email, signalwire_identity, signalwire_phone_number, is_available, role, status
        FROM agents
        WHERE id = $1 AND status = 'active'
          ${req.tenantId ? 'AND tenant_id = $2' : ''}
        LIMIT 1
      `,
      req.tenantId ? [agentId, req.tenantId] : [agentId]
    );

    const agent = result.rows[0];
    if (!agent) {
      throw new AppError('Agent not found', 404);
    }

    let voiceCredentials;
    try {
      voiceCredentials = await createVoiceToken();
    } catch (error) {
      throw error;
    }
    res.json({
      token: voiceCredentials.token,
      projectId: voiceCredentials.projectId,
      callerId: voiceCredentials.callerId,
      maxCallSeconds: voiceCredentials.maxCallSeconds,
      agent
    });
  })
);

router.post(
  '/authorize-outbound',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = z.object({
      to: z.string().min(3),
      agentId: z.coerce.number().int().positive(),
      contactId: z.coerce.number().int().positive().optional().nullable(),
      expectedMaxDurationSeconds: z.coerce.number().int().positive().optional(),
    }).parse(req.body);

    const authorization = await authorizeTrackedOutboundCall(req, payload);
    res.json({ success: true, ...authorization });
  })
);

router.post(
  '/settle-outbound',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = z.object({
      trackedCallId: z.string().uuid(),
      providerCallId: z.string().optional(),
      durationSeconds: z.coerce.number().int().min(0).default(0),
      billableSeconds: z.coerce.number().int().min(0).optional(),
      status: z.string().optional().default('completed'),
    }).parse(req.body);

    if (!req.tenantId) throw new AppError('Tenant context is required for calling', 403);

    const client = await getClient();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT * FROM tracked_calls WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [payload.trackedCallId, req.tenantId]
      );
      const tracked = rows[0];
      if (!tracked) throw new AppError('Tracked call not found', 404);
      if (tracked.settled) {
        await client.query('COMMIT');
        return res.json({ success: true, alreadySettled: true });
      }

      const billableSeconds = payload.billableSeconds ?? payload.durationSeconds;
      const finalCostCents = Math.ceil(Math.ceil(billableSeconds / 60) * Number(tracked.rate_per_minute || CALL_RATE_PER_MINUTE_CENTS));
      if (tracked.reservation_id) {
        await settleWalletReservation(client, tracked.reservation_id, finalCostCents);
      }

      await client.query(
        `UPDATE tracked_calls
         SET provider_call_id = COALESCE($2, provider_call_id),
             duration_seconds = $3,
             billable_seconds = $4,
             cost_cents = $5,
             status = $6,
             ended_at = NOW(),
             settled = TRUE
         WHERE id = $1`,
        [payload.trackedCallId, payload.providerCallId || null, payload.durationSeconds, billableSeconds, finalCostCents, payload.status]
      );

      await client.query('COMMIT');
      res.json({ success: true, costCents: finalCostCents });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
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
    if (isEmergencyDestination(payload.To)) {
      const errResponse = new twilio.twiml.VoiceResponse();
      errResponse.say({ voice: 'alice' }, 'Emergency numbers cannot be dialed from this application.');
      errResponse.hangup();
      return res.type('text/xml').send(errResponse.toString());
    }
    const toStr = cleanPhoneNumber(payload.To);
    const agentId = payload.agentId ? Number(payload.agentId) : null;

    console.log('[OUTBOUND] Formatted To:', toStr);

    if (!isValidUSNumber(toStr)) {
      console.log('[OUTBOUND] ERROR: Invalid phone number after cleaning:', payload.To, '->', toStr);
      const errResponse = new twilio.twiml.VoiceResponse();
      errResponse.say({ voice: 'alice' }, 'Sorry, the phone number entered is not valid.');
      errResponse.hangup();
      return res.type('text/xml').send(errResponse.toString());
    }

    let callerId = env.SIGNALWIRE_PHONE_NUMBER || env.TWILIO_PHONE_NUMBER;
    let agent = null;
    if (agentId) {
      const agentResult = await query(
        `
          SELECT id, tenant_id, signalwire_phone_number, status
          FROM agents
          WHERE id = $1
          LIMIT 1
        `,
        [agentId],
      );
      agent = agentResult.rows[0];
      if (!agent || agent.status === 'suspended') {
        const errResponse = new twilio.twiml.VoiceResponse();
        errResponse.say({ voice: 'alice' }, 'This calling account is not active.');
        errResponse.hangup();
        return res.type('text/xml').send(errResponse.toString());
      }
      callerId = agent.signalwire_phone_number || callerId;
    }

    if (!callerId) {
      const errResponse = new twilio.twiml.VoiceResponse();
      errResponse.say({ voice: 'alice' }, 'No caller ID is configured for this account.');
      errResponse.hangup();
      return res.type('text/xml').send(errResponse.toString());
    }

    if (payload.CallSid) {
      await upsertOutboundParentCall({
        tenantId: agent?.tenant_id || null,
        parentCallSid: payload.CallSid,
        agentId,
        contactId: payload.contactId ? Number(payload.contactId) : null,
        from: callerId,
        to: toStr,
        status: 'initiated',
        shouldRecord: payload.record === 'true'
      });
    }

    const response = new twilio.twiml.VoiceResponse();
    const dialOptions = {
      callerId,
      answerOnBridge: true
    };
    
    if (payload.record === 'true') {
      dialOptions.record = 'record-from-answer';
      dialOptions.recordingStatusCallback = absoluteUrl(req, '/api/signalwire/webhooks/call-status');
      dialOptions.recordingStatusCallbackMethod = 'POST';
      dialOptions.recordingStatusCallbackEvent = 'in-progress completed absent';
    }

    const dial = response.dial(dialOptions);

    dial.number(
      {
        statusCallback: absoluteUrl(req, '/api/signalwire/webhooks/call-status'),
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
    console.log('[INBOUND] absoluteUrl test:', absoluteUrl(req, '/api/signalwire/webhooks/call-status'));

    let agentResult = await query(
      `
        SELECT id, tenant_id, signalwire_identity
        FROM agents
        WHERE signalwire_phone_number = $1
          AND status = 'active'
          AND is_available = true
        LIMIT 1
      `,
      [payload.To || ''],
    );

    if (agentResult.rows.length === 0) {
      agentResult = await query(
      `
        SELECT id, tenant_id, signalwire_identity
        FROM agents
        WHERE is_available = true AND status = 'active'
        ORDER BY updated_at DESC, id ASC
        LIMIT 1
      `
      );
    }

    const response = new twilio.twiml.VoiceResponse();
    const agent = agentResult.rows[0];

    console.log('[INBOUND] Available agent:', agent ? `${agent.signalwire_identity} (id=${agent.id})` : 'NONE');

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
        tenantId: agent.tenant_id || null,
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

    // We use <Sip> instead of <Client> because v4 Fabric clients register as SIP endpoints internally.
    const sipUri = `sip:${agent.signalwire_identity}@${env.SIGNALWIRE_SPACE_URL}`;
    dial.sip(
      {
        statusCallback: absoluteUrl(req, '/api/signalwire/webhooks/call-status'),
        statusCallbackMethod: 'POST',
        statusCallbackEvent: 'initiated ringing answered completed'
      },
      sipUri
    );

    const twiml = response.toString();
    console.log('[INBOUND] TwiML (routing to agent via SIP):', twiml);
    res.type('text/xml').send(twiml);
  })
);

router.post('/webhooks/voice', validateTwilioSignature, (req, res, next) => {
  req.url = '/twiml/inbound';
  router.handle(req, res, next);
});

router.post(
  '/webhooks/call-status',
  validateTwilioSignature,
  asyncHandler(async (req, res) => {
    if (req.body.RecordingSid || req.body.RecordingStatus) {
      await handleRecordingWebhook(req.body);
    }

    if (req.body.CallSid && req.body.CallStatus) {
      await handleCallStatusWebhook(req.body);
      const terminalStatuses = new Set(['completed', 'busy', 'failed', 'no-answer', 'canceled']);
      if (terminalStatuses.has(req.body.CallStatus)) {
        const callSid = req.body.ParentCallSid || req.body.CallSid;
        const client = await getClient();
        try {
          await client.query('BEGIN');
          const { rows } = await client.query(
            `SELECT * FROM tracked_calls
             WHERE provider_call_id = $1
               AND settled = FALSE
             LIMIT 1
             FOR UPDATE`,
            [callSid]
          );
          const tracked = rows[0];
          if (tracked) {
            const durationSeconds = Number(req.body.CallDuration || 0);
            const finalCostCents = Math.ceil(Math.ceil(durationSeconds / 60) * Number(tracked.rate_per_minute || CALL_RATE_PER_MINUTE_CENTS));
            if (tracked.reservation_id) {
              await settleWalletReservation(client, tracked.reservation_id, finalCostCents);
            }
            await client.query(
              `UPDATE tracked_calls
               SET duration_seconds = $2,
                   billable_seconds = $2,
                   cost_cents = $3,
                   status = $4,
                   ended_at = NOW(),
                   settled = TRUE
               WHERE id = $1`,
              [tracked.id, durationSeconds, finalCostCents, req.body.CallStatus]
            );
          }
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      }
    }

    res.status(200).json({ received: true });
  })
);

router.post(
  '/log-outbound',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = z.object({
      to: z.string(),
      agentId: z.coerce.number(),
      contactId: z.coerce.number().optional().nullable(),
      callSid: z.string(),
      trackedCallId: z.string().uuid().optional().nullable(),
      record: z.boolean().optional()
    }).parse(req.body);

    if (!canAccessAgent(req.user, payload.agentId)) {
      throw new AppError('You can only log calls for your own phone', 403);
    }

    const toStr = cleanPhoneNumber(payload.to);
    
    // Get agent Caller ID
    const agentResult = await query(
      `SELECT signalwire_phone_number FROM agents WHERE id = $1 ${req.tenantId ? 'AND tenant_id = $2' : ''} LIMIT 1`,
      req.tenantId ? [payload.agentId, req.tenantId] : [payload.agentId]
    );
    const callerId = agentResult.rows[0]?.signalwire_phone_number || env.SIGNALWIRE_PHONE_NUMBER || env.TWILIO_PHONE_NUMBER;

    if (payload.trackedCallId && req.tenantId) {
      const trackedResult = await query(
        `UPDATE tracked_calls
         SET provider_call_id = $1, status = 'ringing'
         WHERE id = $2 AND tenant_id = $3
         RETURNING id`,
        [payload.callSid, payload.trackedCallId, req.tenantId]
      );
      if (trackedResult.rowCount === 0) {
        throw new AppError('Tracked call not found for this tenant', 404);
      }
    }

    await upsertOutboundParentCall({
      tenantId: req.tenantId || null,
      parentCallSid: payload.callSid,
      agentId: payload.agentId,
      contactId: payload.contactId || null,
      from: callerId,
      to: toStr,
      status: 'initiated',
      shouldRecord: payload.record === true
    });

    res.json({ success: true, callId: payload.callSid });
  })
);

// ─── SERVER-SIDE OUTBOUND CALL (no browser WebRTC, no subscribers) ───────────
router.post(
  '/call-outbound',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (process.env.ENABLE_SERVER_SIDE_OUTBOUND_CALLS !== 'true') {
      throw new AppError('Server-side outbound calling is disabled. Use the browser dialer for a manual call.', 403);
    }

    if (!CALLS_ENABLED || !signalwireClient) {
      throw new AppError('Calling is not configured', 503);
    }

    const payload = z.object({
      to: z.string().min(3),
      agentId: z.coerce.number().int(),
      contactId: z.coerce.number().int().optional(),
      record: z.boolean().optional().default(false),
    }).parse(req.body);

    if (isEmergencyDestination(payload.to)) {
      throw new AppError('Emergency destinations cannot be dialed from this application.', 400);
    }

    const toStr = cleanPhoneNumber(payload.to);
    if (!isValidUSNumber(toStr)) {
      throw new AppError('A valid US phone number is required (+1 followed by 10 digits).', 400);
    }

    const authorization = await authorizeTrackedOutboundCall(req, {
      to: payload.to,
      agentId: payload.agentId,
      contactId: payload.contactId || null,
    });

    // Create the call via SignalWire REST API
    let call;
    try {
      call = await signalwireClient.calls.create({
      from: authorization.callerId,
      to: authorization.to,
      url: absoluteUrl(req, '/api/signalwire/twiml/outbound'),
      statusCallback: absoluteUrl(req, '/api/signalwire/webhooks/call-status'),
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      record: payload.record,
      });
    } catch (err) {
      const client = await getClient();
      try {
        await client.query('BEGIN');
        await settleWalletReservation(client, authorization.reservationId, 0);
        await client.query(
          `UPDATE tracked_calls SET status = 'failed', ended_at = NOW(), settled = TRUE WHERE id = $1 AND tenant_id = $2`,
          [authorization.trackedCallId, req.tenantId]
        );
        await client.query('COMMIT');
      } catch (settleErr) {
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
      throw err;
    }

    await query(
      `UPDATE tracked_calls SET provider_call_id = $1, status = $2 WHERE id = $3 AND tenant_id = $4`,
      [call.sid, call.status || 'initiated', authorization.trackedCallId, req.tenantId]
    );

    // Log it
    await upsertOutboundParentCall({
      tenantId: req.tenantId || null,
      parentCallSid: call.sid,
      agentId: payload.agentId,
      contactId: payload.contactId || null,
      from: authorization.callerId,
      to: authorization.to,
      status: 'initiated',
      shouldRecord: payload.record
    });

    res.json({ callSid: call.sid, status: call.status });
  })
);

// ─── CALL STATUS (polling) ───────────────────────────────────────────────────
router.get(
  '/call-status/:callSid',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!CALLS_ENABLED || !signalwireClient) {
      throw new AppError('Calling is not configured', 503);
    }

    const { callSid } = req.params;
    try {
      const call = await signalwireClient.calls(callSid).fetch();
      res.json({ callSid: call.sid, status: call.status });
    } catch (err) {
      // If call not found, return completed
      res.json({ callSid, status: 'completed' });
    }
  })
);

// ─── END CALL ────────────────────────────────────────────────────────────────
router.post(
  '/call-end/:callSid',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!CALLS_ENABLED || !signalwireClient) {
      throw new AppError('Calling is not configured', 503);
    }

    const { callSid } = req.params;
    try {
      await signalwireClient.calls(callSid).update({ status: 'completed' });
      res.json({ success: true });
    } catch (err) {
      // Call may already be completed
      res.json({ success: true });
    }
  })
);

export default router;
