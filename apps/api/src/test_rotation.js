import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { query } from './calls-module/db/index.js';

async function getAvailableSender(userId) {
  const { rows } = await query(
    `SELECT s.id as sender_id, ea.id as account_id, ea.email as gmail, ea.app_password,
            s.biz_email, s.display_name, ea.sent_today, ea.daily_limit
     FROM senders s
     JOIN email_accounts ea ON ea.id = s.gmail_id
     WHERE ea.user_id = $1 
       AND ea.status = 'active' 
       AND ea.sent_today < ea.daily_limit
       AND s.active = TRUE
     ORDER BY ea.last_used_at ASC NULLS FIRST, s.last_used_at ASC NULLS FIRST
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function updateTimestamps(senderId, accountId) {
  await query(
    `UPDATE email_accounts SET last_used_at = NOW() WHERE id = $1`,
    [accountId]
  );
  await query(
    `UPDATE senders SET last_used_at = NOW() WHERE id = $1`,
    [senderId]
  );
}

async function runTest() {
  try {
    // We will test with a dummy user_id if needed, or just find any user_id that has senders.
    const { rows: users } = await query(`SELECT DISTINCT user_id FROM email_accounts LIMIT 1`);
    if (users.length === 0) {
      console.log('No users found in email_accounts. Cannot test.');
      return;
    }
    const userId = users[0].user_id;
    console.log(`Testing rotation for User ID: ${userId}\n`);

    console.log('--- Simulating 5 consecutive email sends ---');
    for (let i = 1; i <= 5; i++) {
      const sender = await getAvailableSender(userId);
      if (!sender) {
        console.log(`Attempt ${i}: No sender available.`);
        break;
      }
      
      console.log(`Attempt ${i} -> Selected:`);
      console.log(`   Gmail Account : ${sender.gmail}`);
      console.log(`   Biz Email     : ${sender.biz_email}`);
      console.log(`   -------------------------------------`);
      
      // Simulate successful send by updating timestamps
      await updateTimestamps(sender.sender_id, sender.account_id);
      
      // Small delay to ensure timestamp differences
      await new Promise(r => setTimeout(r, 100));
    }
    
    console.log('\nRotation Test Completed Successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
}

runTest();
