import { query } from './apps/api/src/calls-module/db/index.js';

async function check() {
  const outreach = await query('SELECT count(*) as total, count(case when date(sent_at) = CURRENT_DATE then 1 end) as today FROM outreach_logs');
  console.log('outreach_logs:', outreach.rows[0]);

  const history = await query('SELECT count(*) as total, count(case when date(sent_at) = CURRENT_DATE then 1 end) as today FROM contact_emails_history');
  console.log('contact_emails_history:', history.rows[0]);

  process.exit(0);
}
check();
