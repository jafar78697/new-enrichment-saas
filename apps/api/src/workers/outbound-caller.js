import { query, getPool } from '../calls-module/db/index.js';
import { acquireOutboundLock } from '../utils/outbound-lock.js';
import { RestClient } from '@signalwire/compatibility-api';
import { env } from '../voice-agent/config/env.js';
import { normalizeNorthAmericanPhone } from '../utils/us-phone.js';

// Setup SignalWire Client
const projectId = env.SIGNALWIRE_PROJECT_ID;
const apiToken = env.SIGNALWIRE_API_TOKEN;
const spaceUrl = env.SIGNALWIRE_SPACE_URL;
const fromPhones = (env.SIGNALWIRE_PHONE_NUMBER || '').split(',').map(n => normalizeNorthAmericanPhone(n.trim())).filter(Boolean);


let signalwireClient = null;
if (projectId && apiToken && spaceUrl) {
  signalwireClient = RestClient(projectId, apiToken, { signalwireSpaceUrl: spaceUrl });
}

const PUBLIC_BASE_URL = env.PUBLIC_BASE_URL || 'http://localhost:3000';
let workerStarted = false;
let workerTickRunning = false;
let workerConfigWarned = false;
const MIN_CALL_START_INTERVAL_SECONDS = 30;

const CALLING_TIMEZONES = new Set([
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Vancouver',
]);

function numberInRange(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function normalizedControl(control) {
  const callsPerMinuteCap = numberInRange(process.env.AI_MAX_CALLS_PER_MINUTE, 3, 1, 10);
  const maxCallsCap = env.AI_MAX_OUTBOUND_CALLS_PER_DAY;
  const maxMinutesCap = env.AI_MAX_MINUTES_PER_DAY;
  const maxCostCap = env.AI_MAX_COST_USD_PER_DAY;
  const timezone = CALLING_TIMEZONES.has(control.calling_timezone)
    ? control.calling_timezone
    : 'America/New_York';
  const startHour = Math.round(numberInRange(control.calling_window_start_hour, 9, 0, 23));
  const endHour = Math.round(numberInRange(control.calling_window_end_hour, 17, 1, 24));

  return {
    ...control,
    callsPerMinute: Math.round(numberInRange(control.calls_per_minute, 1, 1, callsPerMinuteCap)),
    maxCallsPerDay: Math.round(numberInRange(control.max_calls_per_day, maxCallsCap, 1, maxCallsCap)),
    maxMinutesPerDay: Math.round(numberInRange(control.max_minutes_per_day, maxMinutesCap, 1, maxMinutesCap)),
    maxCostUsdPerDay: numberInRange(control.max_cost_usd_per_day, maxCostCap, 0.1, maxCostCap),
    callingTimezone: timezone,
    callingWindowStartHour: startHour,
    callingWindowEndHour: Math.max(startHour + 1, endHour),
  };
}

function isWithinCallingWindow(control) {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: control.callingTimezone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(new Date()));
  return hour >= control.callingWindowStartHour && hour < control.callingWindowEndHour;
}

function getWorkerConfigError() {
  if (!signalwireClient) return 'SignalWire credentials missing.';
  if (fromPhones.length === 0) return 'SIGNALWIRE_PHONE_NUMBER is missing or is not a valid USA/Canada E.164 number.';
  if (!env.PUBLIC_BASE_URL) return 'PUBLIC_BASE_URL is missing.';
  if (!PUBLIC_BASE_URL.startsWith('https://')) return 'PUBLIC_BASE_URL must be a public HTTPS URL reachable by SignalWire.';
  return null;
}

async function hasActiveCallingSubscription(tenantId) {
  const { rows } = await query(
    `SELECT 1
     FROM customer_subscriptions
     WHERE tenant_id = $1
       AND status = 'active'
       AND start_date <= NOW()
       AND (end_date IS NULL OR end_date > NOW())
     LIMIT 1`,
    [tenantId],
  );
  return Boolean(rows[0]);
}

async function runWorkerTick() {
  if (process.env.ENABLE_AI_OUTBOUND_CALLER !== 'true' || process.env.AI_OUTBOUND_ENABLED !== 'true') return;
  if (workerTickRunning) return;
  const configError = getWorkerConfigError();
  if (configError) {
    if (!workerConfigWarned) {
      console.error(`[outbound-caller] ${configError} Worker paused before claiming leads.`);
      workerConfigWarned = true;
    }
    return;
  }
  workerTickRunning = true;
  try {
    const { rows: controls } = await query('SELECT * FROM ai_calling_controls WHERE is_running = true');
    for (const rawControl of controls) {
      const control = normalizedControl(rawControl);
      let claimedLeadId = null;
      let releaseLock = null;
      try {
        releaseLock = await acquireOutboundLock(getPool(), control.tenant_id);
        if (!releaseLock) continue;
        const { rows: currentControls } = await query('SELECT is_running FROM ai_calling_controls WHERE tenant_id = $1', [control.tenant_id]);
        if (!currentControls[0]?.is_running) continue;
        if (!await hasActiveCallingSubscription(control.tenant_id)) {
          await query(
            `UPDATE ai_calling_controls
             SET is_running = false, updated_at = NOW()
             WHERE tenant_id = $1`,
            [control.tenant_id],
          );
          console.warn(`[outbound-caller] Subscription expired for tenant ${control.tenant_id}; calling paused.`);
          continue;
        }
        if (!isWithinCallingWindow(control)) continue;

        // A missing webhook must never block a tenant's campaign forever.
        await query(
          `UPDATE enrichment_results
           SET lead_stage = 'no_answer',
               raw_data = COALESCE(raw_data, '{}'::jsonb) - 'active_call_sid',
               lead_notes = CONCAT_WS(E'\n', NULLIF(lead_notes, ''), '[AI Call] Stale calling state recovered automatically.')
           WHERE tenant_id = $1 AND assigned_to_ai = true AND lead_stage = 'calling'
             AND last_contacted_at < NOW() - INTERVAL '10 minutes'`,
          [control.tenant_id],
        );

        // A crashed media stream must not keep the tenant permanently active.
        // Normal calls have a much shorter configured duration; 15 minutes is
        // a conservative recovery boundary.
        await query(
          `UPDATE ai_call_sessions
           SET ended_at = COALESCE(ended_at, NOW()),
               call_state = 'stopped',
               hangup_reason = COALESCE(hangup_reason, 'stale-session-recovered')
           WHERE tenant_id = $1 AND ended_at IS NULL
             AND started_at < NOW() - INTERVAL '15 minutes'`,
          [control.tenant_id],
        );

        const { rows: activeRows } = await query(
          `SELECT
             EXISTS (
               SELECT 1 FROM enrichment_results
               WHERE tenant_id = $1 AND assigned_to_ai = true AND lead_stage = 'calling'
             ) OR EXISTS (
               SELECT 1 FROM ai_call_sessions
               WHERE tenant_id = $1
                 AND started_at >= NOW() - INTERVAL '15 minutes'
                 AND call_state NOT IN ('completed', 'closed', 'stopped', 'error')
             ) AS active`,
          [control.tenant_id],
        );
        if (activeRows[0]?.active) continue;

        // The previous call's elapsed duration counts towards this interval.
        // Persisted dialing timestamps keep short-call spacing across restarts;
        // this does not add another 30 seconds after a longer call ends.
        const { rows: spacingRows } = await query(
          `SELECT EXISTS (
             SELECT 1 FROM enrichment_results
             WHERE tenant_id = $1 AND assigned_to_ai = true
               AND ai_calling_lane_id IS NULL
               AND raw_data->>'call_origin' = 'automatic'
               AND (raw_data->>'call_started_at')::timestamptz > NOW() - ($2 * INTERVAL '1 second')
           ) AS waiting`,
          [control.tenant_id, MIN_CALL_START_INTERVAL_SECONDS],
        );
        if (spacingRows[0]?.waiting) continue;

        // P1 FIX: Cleanup zombie "called" or "calling" leads that got stuck
        // (e.g. process crashed or bridge failed to clean up)
        await query(
          `UPDATE enrichment_results
           SET lead_stage = 'assigned',
               lead_notes = CONCAT_WS(E'\n', NULLIF(lead_notes, ''), '[System] Call timed out in called state, reset to assigned')
           WHERE tenant_id = $1
             AND assigned_to_ai = true
             AND lead_stage IN ('calling', 'called')
             AND last_contacted_at < NOW() - INTERVAL '15 minutes'`,
          [control.tenant_id]
        );

        const { rows } = await query(
          `UPDATE enrichment_results 
           SET lead_stage = 'calling', last_contacted_at = NOW() 
           WHERE id = (
             SELECT id FROM enrichment_results
             WHERE tenant_id = $1 AND assigned_to_ai = true
               AND lead_stage IN ('assigned', 'followup')
               AND primary_phone IS NOT NULL AND primary_phone <> ''
               AND do_not_call = false
               AND (last_contacted_at IS NULL OR last_contacted_at < NOW() - INTERVAL '24 hours')
               AND (next_followup_at IS NULL OR next_followup_at <= NOW())
               AND NOT EXISTS (
                 SELECT 1 FROM enrichment_results dup
                 WHERE dup.tenant_id = $1
                   AND dup.primary_phone = enrichment_results.primary_phone
                   AND dup.lead_stage NOT IN ('assigned', 'followup')
               )
               AND EXISTS (
                 SELECT 1 FROM ai_agent_configs ac
                 WHERE ac.id = enrichment_results.assigned_ai_agent_id
                   AND ac.tenant_id = enrichment_results.tenant_id
                   AND ac.is_active = true AND ac.mode = 'outbound'
               )
               AND enrichment_results.ai_calling_lane_id IS NULL
               AND NOT EXISTS (
                 SELECT 1 FROM ai_call_queue_items q
                 WHERE q.lead_id = enrichment_results.id
                   AND q.state IN ('queued', 'claimed', 'dialing', 'ringing', 'streaming', 'active')
               )
             ORDER BY CASE lead_stage WHEN 'followup' THEN 0 ELSE 1 END, created_at ASC
             FOR UPDATE SKIP LOCKED
             LIMIT 1
           )
           RETURNING id, tenant_id, primary_phone, company_name, domain`,
          [control.tenant_id],
        );
        if (rows.length === 0) {
          await query(
            `UPDATE ai_calling_controls SET is_running = false, updated_at = NOW() WHERE tenant_id = $1`,
            [control.tenant_id],
          );
          console.log(`[outbound-caller] Queue finished for tenant ${control.tenant_id}; calling paused.`);
          continue;
        }

        const lead = rows[0];
        claimedLeadId = lead.id;

        const normalizedPhone = normalizeNorthAmericanPhone(lead.primary_phone);
        if (!normalizedPhone) {
          await query(
            `UPDATE enrichment_results
             SET lead_stage = 'no_answer',
                 lead_notes = CONCAT_WS(E'\n', NULLIF(lead_notes, ''), '[AI Call] Skipped because phone number is not a valid USA or Canada number.')
             WHERE id = $1`,
            [lead.id],
          );
          continue;
        }

        console.log(`[outbound-caller] Initiating call to lead: ${lead.company_name || lead.domain} (${normalizedPhone})`);
        const webhookUrl = `${PUBLIC_BASE_URL}/api/voice/twiml/outbound?contactId=${lead.id}&tenantId=${lead.tenant_id}`;
        
        // Strict rotation: each completed attempt advances to the next
        // configured SignalWire caller ID. No area-code override can skip one.
        const { rows: sequenceRows } = await query(
          `SELECT COUNT(*)::int AS attempts
           FROM enrichment_results
           WHERE tenant_id = $1 AND assigned_to_ai = true AND last_contacted_at IS NOT NULL`,
          [control.tenant_id],
        );
        const callerId = fromPhones[Number(sequenceRows[0]?.attempts || 0) % fromPhones.length];
        
        const callStartedAt = new Date().toISOString();
        const call = await signalwireClient.calls.create({
          url: webhookUrl,
          to: normalizedPhone,
          from: callerId,
          method: 'POST',
          statusCallback: `${PUBLIC_BASE_URL}/api/voice/webhooks/call-status?contactId=${lead.id}`,
          statusCallbackMethod: 'POST',
          statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
          // Give a business line enough time to ring/transfer before the
          // carrier returns no-answer. This value applies before connection.
          timeout: 45,
          record: false,
        });

        const { rows: runningControls } = await query('SELECT is_running FROM ai_calling_controls WHERE tenant_id = $1', [control.tenant_id]);
        if (!runningControls[0]?.is_running) {
          await signalwireClient.calls(call.sid).update({ status: 'completed' });
          throw new Error('Calling was stopped while this attempt was starting.');
        }

        await query(
          `UPDATE enrichment_results
           SET raw_data = COALESCE(raw_data, '{}'::jsonb)
               || jsonb_build_object(
                    'active_call_sid', $1::text,
                    'call_origin', 'automatic',
                    'call_started_at', $4::text,
                    'call_status', 'initiated',
                    'call_duration_seconds', 0,
                    'recording_enabled', false,
                    'from_phone', $3::text
                  )
           WHERE id = $2`,
          [call.sid, lead.id, callerId, callStartedAt],
        );
        console.log(`[outbound-caller] SignalWire call created for lead ${lead.id}: ${call.sid}.`);
      } catch (err) {
        console.error('[outbound-caller] Error during tenant call loop:', err);
        if (claimedLeadId) {
          const errorCode = err?.code ? String(err.code) : null;
          const errorMessage = err?.message || 'SignalWire call create failed';
          await query(
            `UPDATE enrichment_results
             SET lead_stage = 'no_answer',
                 raw_data = COALESCE(raw_data, '{}'::jsonb)
                   || jsonb_strip_nulls(jsonb_build_object(
                        'call_status', 'failed_to_create',
                        'call_error_code', $1::text,
                        'call_error_message', $2::text,
                        'call_started_at', NOW()::text,
                        'call_ended_at', NOW()::text,
                        'call_duration_seconds', 0
                      )),
                 lead_notes = CONCAT_WS(E'\n', NULLIF(lead_notes, ''), $3::text)
             WHERE id = $4 AND lead_stage = 'calling'`,
            [
              errorCode,
              errorMessage,
              `[AI Call] SignalWire could not create call${errorCode ? ` (${errorCode})` : ''}: ${errorMessage}`,
              claimedLeadId,
            ],
          ).catch((resetErr) => console.error('[outbound-caller] Failed to reset lead stage:', resetErr.message));

          if (errorCode === '21611') {
            await query(
              `UPDATE ai_calling_controls
               SET is_running = false, updated_at = NOW()
               WHERE tenant_id = $1`,
              [control.tenant_id],
            ).catch((pauseErr) => console.error('[outbound-caller] Failed to pause after SignalWire queue limit:', pauseErr.message));
            console.error('[outbound-caller] SignalWire outbound queue limit hit. Paused calling for tenant.');
          }
        }
      } finally {
        if (releaseLock) await releaseLock();
      }
    }
  } catch (err) {
    console.error('[outbound-caller] Error during outbound call loop:', err);
  } finally {
    workerTickRunning = false;
  }
}

/**
 * Worker that fetches assigned leads that need to be called and calls them.
 */
export async function runOutboundCallerLoop() {
  if (workerStarted) return;
  if (process.env.ENABLE_AI_OUTBOUND_CALLER !== 'true' || process.env.AI_OUTBOUND_ENABLED !== 'true') {
    console.log('[outbound-caller] Disabled. ENABLE_AI_OUTBOUND_CALLER=true and AI_OUTBOUND_ENABLED=true are both required. Sleeping to prevent restart loop.');
    setInterval(() => {}, 1000 * 60 * 60); // Sleep forever
    return;
  }
  if (!signalwireClient) {
    console.log('[outbound-caller] SignalWire credentials missing. Sleeping to prevent restart loop.');
    setInterval(() => {}, 1000 * 60 * 60);
    return;
  }

  const configError = getWorkerConfigError();
  if (configError) {
    console.log(`[outbound-caller] ${configError} Sleeping to prevent restart loop.`);
    setInterval(() => {}, 1000 * 60 * 60);
    return;
  }

  console.log('[outbound-caller] Started looking for leads to call...');

  await query(`
    CREATE TABLE IF NOT EXISTS ai_calling_controls (
      tenant_id UUID PRIMARY KEY,
      is_running BOOLEAN NOT NULL DEFAULT false,
      calls_per_minute INT NOT NULL DEFAULT 1,
      max_calls_per_day INT NOT NULL DEFAULT 5,
      max_minutes_per_day INT NOT NULL DEFAULT 10,
      max_cost_usd_per_day NUMERIC NOT NULL DEFAULT 1,
      calling_timezone TEXT NOT NULL DEFAULT 'America/New_York',
      calling_window_start_hour INT NOT NULL DEFAULT 9,
      calling_window_end_hour INT NOT NULL DEFAULT 17,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  workerStarted = true;
  const schedule = async () => {
    await runWorkerTick();
    // Poll quickly after a terminal callback so the next sequential call does
    // not sit idle for up to 20 seconds. The active-call lock still prevents
    // overlapping calls.
    setTimeout(schedule, 3000);
  };
  void schedule();
}
