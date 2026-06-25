import { query } from './apps/api/src/calls-module/db/index.js';
async function run() {
  try {
    const res = await query("SELECT count(*) as cnt FROM contacts WHERE omnichannel_stage = 'emailing' AND emails_sent > 0 AND (emails_received IS NULL OR emails_received = 0) AND (email_opened IS NULL OR email_opened = 0) AND last_email_sent_at < NOW() - INTERVAL '24 hours'");
    console.log("Eligible for fallback:", res.rows[0].cnt);
    
    const res2 = await query("SELECT count(*) as cnt FROM contacts WHERE stage = 'cold_calling' OR omnichannel_stage = 'cold_calling'");
    console.log("Already in cold_calling:", res2.rows[0].cnt);
  } catch (e) { console.error(e); }
  process.exit(0);
}
run();
