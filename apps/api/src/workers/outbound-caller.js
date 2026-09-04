import { query } from '../calls-module/db/index.js';
import { RestClient } from '@signalwire/compatibility-api';
import { env } from '../voice-agent/config/env.js';
import { normalizeUSPhone } from '../utils/us-phone.js';

// Setup SignalWire Client
const projectId = env.SIGNALWIRE_PROJECT_ID;
const apiToken = env.SIGNALWIRE_API_TOKEN;
const spaceUrl = env.SIGNALWIRE_SPACE_URL;
const fromPhone = normalizeUSPhone(env.SIGNALWIRE_PHONE_NUMBER);

let signalwireClient = null;
if (projectId && apiToken && spaceUrl) {
  signalwireClient = RestClient(projectId, apiToken, { signalwireSpaceUrl: spaceUrl });
}

const PUBLIC_BASE_URL = env.PUBLIC_BASE_URL || 'http://localhost:3000';
let workerStarted = false;
let workerTickRunning = false;
let workerConfigWarned = false;

function getWorkerConfigError() {
  if (!signalwireClient) return 'SignalWire credentials missing.';
  if (!fromPhone) return 'SIGNALWIRE_PHONE_NUMBER is missing or is not a valid US E.164 number.';
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
    const { rows: controls } = await query('SELECT tenant_id FROM ai_calling_controls WHERE is_running = true');
    for (const control of controls) {
      let claimedLeadId = null;
      try {
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

        const { rows } = await query(
          `UPDATE enrichment_results 
           SET lead_stage = 'calling', last_contacted_at = NOW() 
           WHERE id = (
             SELECT id FROM enrichment_results
             WHERE tenant_id = $1 AND assigned_to_ai = true
               AND lead_stage IN ('assigned', 'followup')
               AND primary_phone IS NOT NULL AND primary_phone <> ''
               AND (next_followup_at IS NULL OR next_followup_at <= NOW())
             ORDER BY CASE lead_stage WHEN 'followup' THEN 0 ELSE 1 END, created_at ASC
             FOR UPDATE SKIP LOCKED
             LIMIT 1
           )
           RETURNING id, tenant_id, primary_phone, company_name, domain`,
          [control.tenant_id],
        );
        if (rows.length === 0) continue;

        const lead = rows[0];
        claimedLeadId = lead.id;

        const normalizedPhone = normalizeUSPhone(lead.primary_phone);
        if (!normalizedPhone) {
          await query(
            `UPDATE enrichment_results
             SET lead_stage = 'no_answer',
                 lead_notes = CONCAT_WS(E'\n', NULLIF(lead_notes, ''), '[AI Call] Skipped because phone number is not a valid USA number.')
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
        });

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
