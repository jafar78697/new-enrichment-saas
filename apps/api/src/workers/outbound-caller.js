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

/**
 * Worker that fetches assigned leads that need to be called and calls them.
 */
export async function runOutboundCallerLoop() {
  if (!twilioClient) {
    console.log('[outbound-caller] Twilio credentials missing. Skipping worker.');
    return;
  }

  console.log('[outbound-caller] Started looking for leads to call...');

  // Simple loop: every 30 seconds
  setInterval(async () => {
    let claimedLeadId = null;
    try {
      const { rows: activeRows } = await query(`
        SELECT COUNT(*)::int AS count
        FROM enrichment_results
        WHERE assigned_to_ai = true AND lead_stage = 'calling'
      `);
      if ((activeRows[0]?.count || 0) > 0) return;

      // Find one queued AI lead with a phone number.
      // CRM stages use "new"; older enrichment imports may still use "enriched".
      const { rows } = await query(`
        SELECT id, tenant_id, primary_phone, company_name, domain, ai_summary, ai_pain_points 
        FROM enrichment_results 
        WHERE assigned_to_ai = true
          AND lead_stage IN ('new', 'enriched', 'followup')
          AND primary_phone IS NOT NULL
          AND primary_phone <> ''
          AND (next_followup_at IS NULL OR next_followup_at <= NOW())
        ORDER BY
          CASE lead_stage WHEN 'followup' THEN 0 WHEN 'new' THEN 1 ELSE 2 END,
          created_at ASC
        LIMIT 1
      `);

      if (rows.length === 0) return;

      const lead = rows[0];
      claimedLeadId = lead.id;

      // Mark as calling to prevent duplicate calls
      await query(
        `UPDATE enrichment_results
         SET lead_stage = 'calling',
             last_contacted_at = NOW()
         WHERE id = $1`,
        [lead.id]
      );
      
      console.log(`[outbound-caller] Initiating call to lead: ${lead.company_name || lead.domain} (${lead.primary_phone})`);

      // We append contactId to the URL so Twilio passes it back to our twiml endpoint
      // Ensure the endpoint is publicly accessible
      const webhookUrl = `${PUBLIC_BASE_URL}/api/voice/twiml/outbound?contactId=${lead.id}&tenantId=${lead.tenant_id}`;

      const call = await twilioClient.calls.create({
        url: webhookUrl,
        to: lead.primary_phone,
        from: fromPhone,
        method: 'POST',
        statusCallback: `${PUBLIC_BASE_URL}/api/voice/webhooks/call-status?contactId=${lead.id}`,
        statusCallbackMethod: 'POST',
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      });

      console.log(`[outbound-caller] Twilio call created for lead ${lead.id}: ${call.sid}.`);

    } catch (err) {
      console.error('[outbound-caller] Error during outbound call loop:', err);
      if (claimedLeadId) {
        await query(
          `UPDATE enrichment_results SET lead_stage = 'no_answer' WHERE id = $1 AND lead_stage = 'calling'`,
          [claimedLeadId],
        ).catch((resetErr) => console.error('[outbound-caller] Failed to reset lead stage:', resetErr.message));
      }
    }
  }, 30000); // Check every 30s
}
