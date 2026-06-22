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
    try {
      // Find one lead that is 'enriched', assigned to AI, and has a phone number
      const { rows } = await query(`
        SELECT id, primary_phone, company_name, domain, ai_summary, ai_pain_points 
        FROM enrichment_results 
        WHERE lead_stage = 'enriched' 
          AND assigned_to_ai = true
          AND primary_phone IS NOT NULL
        LIMIT 1
      `);

      if (rows.length === 0) return;

      const lead = rows[0];

      // Mark as calling to prevent duplicate calls
      await query(`UPDATE enrichment_results SET lead_stage = 'calling' WHERE id = $1`, [lead.id]);
      
      console.log(`[outbound-caller] Initiating call to lead: ${lead.company_name || lead.domain} (${lead.primary_phone})`);

      // We append contactId to the URL so Twilio passes it back to our twiml endpoint
      // Ensure the endpoint is publicly accessible
      const webhookUrl = `${PUBLIC_BASE_URL}/api/voice/twiml/outbound?contactId=${lead.id}`;

      await twilioClient.calls.create({
        url: webhookUrl,
        to: lead.primary_phone,
        from: fromPhone,
        method: 'POST'
      });

      console.log(`[outbound-caller] Twilio call created for lead ${lead.id}.`);

    } catch (err) {
      console.error('[outbound-caller] Error during outbound call loop:', err);
    }
  }, 30000); // Check every 30s
}
