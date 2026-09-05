import { query, getPool } from '../calls-module/db/index.js';
import { acquireOutboundLock } from '../utils/outbound-lock.js';
import { RestClient } from '@signalwire/compatibility-api';
import { env } from '../voice-agent/config/env.js';
import { normalizeNorthAmericanPhone } from '../utils/us-phone.js';

// Setup SignalWire Client
const projectId = env.SIGNALWIRE_PROJECT_ID;
const apiToken = env.SIGNALWIRE_API_TOKEN;
const spaceUrl = env.SIGNALWIRE_SPACE_URL;
const fromPhone = normalizeNorthAmericanPhone(env.SIGNALWIRE_PHONE_NUMBER);

let signalwireClient = null;
if (projectId && apiToken && spaceUrl) {
  signalwireClient = RestClient(projectId, apiToken, { signalwireSpaceUrl: spaceUrl });
}

const PUBLIC_BASE_URL = env.PUBLIC_BASE_URL || 'http://localhost:3000';
let workerStarted = false;
let workerTickRunning = false;
let workerConfigWarned = false;

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
  if (!fromPhone) return 'SIGNALWIRE_PHONE_NUMBER is missing or is not a valid USA/Canada E.164 number.';
  if (!env.PUBLIC_BASE_URL) return 'PUBLIC_BASE_URL is missing.';
  if (!PUBLIC_BASE_URL.startsWith('https://')) return 'PUBLIC_BASE_URL must be a public HTTPS URL reachable by SignalWire.';
  return null;
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
        if (!isWithinCallingWindow(control)) continue;

        const { rows: dailyRows } = await query(
          `SELECT
             (SELECT COUNT(*)::int
              FROM enrichment_results
              WHERE tenant_id = $1 AND assigned_to_ai = true
                AND (last_contacted_at AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date) AS attempts,
             COALESCE((SELECT SUM(duration_sec)
                       FROM ai_call_sessions
                       WHERE tenant_id = $1
                         AND (started_at AT TIME ZONE 'UTC' AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date), 0)::int AS seconds,
             COALESCE((SELECT SUM(cost_estimate_usd)
                       FROM ai_call_sessions
                       WHERE tenant_id = $1
                         AND (started_at AT TIME ZONE 'UTC' AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date), 0)::numeric
             + COALESCE((SELECT SUM(estimated_cost_usd) FROM ai_usage_ledger
                         WHERE tenant_id = $1 AND created_at >= date_trunc('day', NOW())), 0)::numeric AS cost`,
          [control.tenant_id, control.callingTimezone],
        );
        const daily = dailyRows[0] || {};
        const nextMaxCost = (env.AI_MAX_SECONDS_PER_CALL / 60) * env.AI_ESTIMATED_COST_USD_PER_MINUTE;
        const dailyLimitReached = Number(daily.attempts || 0) >= control.maxCallsPerDay
          || Number(daily.seconds || 0) >= control.maxMinutesPerDay * 60
          || Number(daily.cost || 0) + nextMaxCost > control.maxCostUsdPerDay;
        if (dailyLimitReached) {
          await query(
            `UPDATE ai_calling_controls SET is_running = false, updated_at = NOW() WHERE tenant_id = $1`,
            [control.tenant_id],
          );
          console.warn(`[outbound-caller] Daily safety limit reached for tenant ${control.tenant_id}; calling paused.`);
          continue;
        }

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

        const { rows: activeRows } = await query(
          `SELECT COUNT(*)::int AS count FROM enrichment_results
           WHERE tenant_id = $1 AND assigned_to_ai = true AND lead_stage = 'calling'`,
          [control.tenant_id],
        );
        if ((activeRows[0]?.count || 0) > 0) continue;

        const { rows: minuteRows } = await query(
          `SELECT COUNT(*)::int AS count
           FROM enrichment_results
           WHERE tenant_id = $1 AND assigned_to_ai = true
             AND last_contacted_at >= NOW() - INTERVAL '1 minute'`,
          [control.tenant_id],
        );
        if (Number(minuteRows[0]?.count || 0) >= control.callsPerMinute) continue;

        const { rows } = await query(
          `UPDATE enrichment_results 
           SET lead_stage = 'calling', last_contacted_at = NOW() 
           WHERE id = (
             SELECT id FROM enrichment_results
             WHERE tenant_id = $1 AND assigned_to_ai = true
               AND lead_stage IN ('assigned', 'followup')
               AND primary_phone IS NOT NULL AND primary_phone <> ''
               AND ai_voice_consent = true
               AND do_not_call = false
               AND (last_contacted_at IS NULL OR last_contacted_at < NOW() - INTERVAL '24 hours')
               AND (next_followup_at IS NULL OR next_followup_at <= NOW())
               AND EXISTS (
                 SELECT 1 FROM ai_agent_configs ac
                 WHERE ac.id = enrichment_results.assigned_ai_agent_id
                   AND ac.tenant_id = enrichment_results.tenant_id
                   AND ac.is_active = true AND ac.mode = 'outbound'
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
        const call = await signalwireClient.calls.create({
          url: webhookUrl,
          to: normalizedPhone,
          from: fromPhone,
          method: 'POST',
          statusCallback: `${PUBLIC_BASE_URL}/api/voice/webhooks/call-status?contactId=${lead.id}`,
          statusCallbackMethod: 'POST',
          statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
          timeout: 30,
          machineDetection: 'Enable',
          machineDetectionTimeout: 10,
          machineDetectionSpeechThreshold: 2400,
          machineDetectionSpeechEndThreshold: 1200,
          machineDetectionSilenceTimeout: 5000,
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
                    'call_started_at', NOW()::text,
                    'call_status', 'initiated',
                    'call_duration_seconds', 0,
                    'recording_enabled', false
                  )
           WHERE id = $2`,
          [call.sid, lead.id],
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
    console.log('[outbound-caller] Disabled. ENABLE_AI_OUTBOUND_CALLER=true and AI_OUTBOUND_ENABLED=true are both required.');
    return;
  }
  if (!signalwireClient) {
    console.log('[outbound-caller] SignalWire credentials missing. Skipping worker.');
    return;
  }

  const configError = getWorkerConfigError();
  if (configError) {
    console.log(`[outbound-caller] ${configError} Skipping worker.`);
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
    setTimeout(schedule, 20000);
  };
  void schedule();
}
