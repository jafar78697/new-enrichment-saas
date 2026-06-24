import { query } from '../calls-module/db/index.js';
import twilio from 'twilio';
import { env } from '../voice-agent/config/env.js';

// Setup Twilio Client
const accountSid = env.TWILIO_ACCOUNT_SID;
const authToken = env.TWILIO_AUTH_TOKEN;
const fromPhone = env.TWILIO_PHONE_NUMBER;

let twilioClient = null;
if (accountSid && authToken) {
  twilioClient = twilio(accountSid, authToken);
}

const PUBLIC_BASE_URL = env.PUBLIC_BASE_URL || 'http://localhost:3000';
let workerStarted = false;
let workerTickRunning = false;

async function runWorkerTick() {
  if (workerTickRunning) return;
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
          `SELECT id, tenant_id, primary_phone, company_name, domain
           FROM enrichment_results
           WHERE tenant_id = $1 AND assigned_to_ai = true
             AND lead_stage IN ('assigned', 'followup')
             AND primary_phone IS NOT NULL AND primary_phone <> ''
             AND (next_followup_at IS NULL OR next_followup_at <= NOW())
           ORDER BY CASE lead_stage WHEN 'followup' THEN 0 ELSE 1 END, created_at ASC
           LIMIT 1`,
          [control.tenant_id],
        );
        if (rows.length === 0) continue;

        const lead = rows[0];
        claimedLeadId = lead.id;
        await query(
          `UPDATE enrichment_results SET lead_stage = 'calling', last_contacted_at = NOW() WHERE id = $1`,
          [lead.id],
        );

        console.log(`[outbound-caller] Initiating call to lead: ${lead.company_name || lead.domain} (${lead.primary_phone})`);
        const webhookUrl = `${PUBLIC_BASE_URL}/api/voice/twiml/outbound?contactId=${lead.id}&tenantId=${lead.tenant_id}`;
        const call = await twilioClient.calls.create({
          url: webhookUrl,
          to: lead.primary_phone,
          from: fromPhone,
          method: 'POST',
          statusCallback: `${PUBLIC_BASE_URL}/api/voice/webhooks/call-status?contactId=${lead.id}`,
          statusCallbackMethod: 'POST',
          statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
          machineDetection: 'Enable',
          machineDetectionTimeout: 8,
        });

        await query(
          `UPDATE enrichment_results
           SET raw_data = jsonb_set(COALESCE(raw_data, '{}'::jsonb), '{active_call_sid}', to_jsonb($1::text))
           WHERE id = $2`,
          [call.sid, lead.id],
        );
        console.log(`[outbound-caller] Twilio call created for lead ${lead.id}: ${call.sid}.`);
      } catch (err) {
        console.error('[outbound-caller] Error during tenant call loop:', err);
        if (claimedLeadId) {
          await query(
            `UPDATE enrichment_results SET lead_stage = 'no_answer' WHERE id = $1 AND lead_stage = 'calling'`,
            [claimedLeadId],
          ).catch((resetErr) => console.error('[outbound-caller] Failed to reset lead stage:', resetErr.message));
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
  if (!twilioClient) {
    console.log('[outbound-caller] Twilio credentials missing. Skipping worker.');
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
    setTimeout(schedule, 3000);
  };
  void schedule();
}
