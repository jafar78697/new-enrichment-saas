import { RestClient } from '@signalwire/compatibility-api';
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config({ path: '.env.production' });

const projectId = process.env.SIGNALWIRE_PROJECT_ID;
const apiToken = process.env.SIGNALWIRE_API_TOKEN;
const spaceUrl = process.env.SIGNALWIRE_SPACE_URL;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL;

const client = RestClient(projectId, apiToken, { signalwireSpaceUrl: spaceUrl });
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function runDiagnostic() {
  console.log('🤖 Starting Diagnostic Bot...');
  
  try {
    const { rows } = await pool.query(`
      SELECT id, tenant_id, primary_phone, company_name, domain 
      FROM enrichment_results 
      WHERE is_phone_verified = true 
      AND lead_stage = 'no_answer'
      AND primary_phone IS NOT NULL
      LIMIT 1
    `);
    
    if (rows.length === 0) {
      console.log('🤖 No leads found for testing. Please ensure there is a lead with a valid phone number.');
      process.exit(1);
    }
    
    const lead = rows[0];
    const toPhone = '+13106368180'; // Force a known number for safety, or use lead.primary_phone
    const fromPhone = (process.env.SIGNALWIRE_PHONE_NUMBER || '').replace(/\D/g, '').replace(/^(\d)/, '+$1');
    
    console.log(`🤖 Step 1: Initiating call to ${toPhone} for lead ${lead.id}...`);
    
    const webhookUrl = `${PUBLIC_BASE_URL}/api/voice/twiml/outbound?contactId=${lead.id}&tenantId=${lead.tenant_id}`;
    
    let call;
    try {
      call = await client.calls.create({
        url: webhookUrl,
        to: toPhone,
        from: fromPhone,
        method: 'POST',
        statusCallback: `${PUBLIC_BASE_URL}/api/voice/webhooks/call-status?contactId=${lead.id}`,
        statusCallbackMethod: 'POST',
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        record: true,
        recordingChannels: 'mono',
        recordingTrack: 'both',
        recordingStatusCallback: `${PUBLIC_BASE_URL}/api/voice/webhooks/call-status?contactId=${lead.id}`,
        recordingStatusCallbackMethod: 'POST',
        recordingStatusCallbackEvent: ['in-progress', 'completed', 'absent'],
        trim: 'do-not-trim',
        machineDetection: 'Enable',
        machineDetectionTimeout: 8,
      });
      console.log(`🤖 Step 2: SignalWire accepted the call! Call SID: ${call.sid}`);
    } catch (apiErr) {
      console.error(`🤖 ❌ Step 2 Failed! SignalWire rejected the call:`, apiErr);
      process.exit(1);
    }
    
    console.log(`🤖 Step 3: Updating database with call SID...`);
    try {
      await pool.query(
        `UPDATE enrichment_results
         SET raw_data = jsonb_set(
               jsonb_set(COALESCE(raw_data, '{}'::jsonb), '{active_call_sid}', to_jsonb($1::text)),
               '{recording_enabled}',
               'true'::jsonb
             )
         WHERE id = $2`,
        [call.sid, lead.id],
      );
      console.log(`🤖 Step 3: Database successfully updated!`);
    } catch (dbErr) {
      console.error(`🤖 ❌ Step 3 Failed! Database update crashed:`, dbErr);
      process.exit(1);
    }

    console.log(`🤖 Step 4: Monitoring Call Status...`);
    let isCompleted = false;
    let retries = 0;
    while (!isCompleted && retries < 15) {
      await new Promise(r => setTimeout(r, 4000));
      retries++;
      const currentCall = await client.calls(call.sid).fetch();
      console.log(`   -> Call status: ${currentCall.status} (Duration: ${currentCall.duration || 0}s)`);
      if (['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(currentCall.status)) {
        isCompleted = true;
      }
    }
    
    console.log(`🤖 Step 5: Checking if Webhook fired by inspecting Notifications...`);
    try {
      const notifications = await client.calls(call.sid).notifications.list();
      if (notifications && notifications.length > 0) {
        console.log(`🤖 ⚠️ Found ${notifications.length} errors/notifications from SignalWire for this call:`);
        for (const n of notifications) {
          console.log(`   - Error ${n.errorCode}: ${n.messageText}`);
        }
      } else {
        console.log(`🤖 ✅ No webhook errors reported by SignalWire!`);
      }
    } catch (notifErr) {
      console.log(`🤖 ⚠️ Could not fetch notifications (might not be supported on this call):`, notifErr.message);
    }
    
    console.log(`🤖 Bot finished diagnostics.`);
    process.exit(0);
  } catch (err) {
    console.error('🤖 ❌ Bot crashed:', err);
    process.exit(1);
  }
}

runDiagnostic();
