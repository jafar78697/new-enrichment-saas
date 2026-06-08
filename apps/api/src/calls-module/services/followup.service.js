import cron from 'node-cron';
import { query } from '../db/index.js';
import { sendOutreachEmail } from './email.service.js';

// Run every day at 10:00 AM
cron.schedule('0 10 * * *', async () => {
  console.log('Running daily follow-up automation job...');
  try {
    // Find contacts who received an email more than 3 days ago, have not replied, and haven't been sent a follow-up yet
    const leadsToFollowUp = await query(`
      SELECT * FROM contacts 
      WHERE emails_sent > 0 
      AND emails_received = 0 
      AND last_email_sent_at <= NOW() - INTERVAL '3 days'
      AND followup_status = 'pending'
      AND email IS NOT NULL
    `);

    console.log(`Found ${leadsToFollowUp.rowCount} leads for follow-up.`);

    for (const lead of leadsToFollowUp.rows) {
      const followUpHtml = `
        <div style="font-family: sans-serif;">
          <p>Hi ${lead.name.split(' ')[0] || 'there'},</p>
          <p>I'm just following up on my previous email. I know things can get busy, but I'd love to quickly show you how we can help ${lead.company || 'your business'}.</p>
          <p>Let me know if you have 5 minutes to chat this week.</p>
          <p>Best regards,<br>JentoAI Team</p>
        </div>
      `;

      try {
        await sendOutreachEmail(
          lead.email,
          lead.name,
          `Following up: ${lead.company || 'Your Business'}`,
          followUpHtml
        );
        
        // Update DB
        await query(`
          UPDATE contacts 
          SET emails_sent = emails_sent + 1, 
              last_email_sent_at = NOW(), 
              followup_status = 'sent' 
          WHERE id = $1
        `, [lead.id]);
        
        console.log(`Follow-up sent successfully to ${lead.email}`);
      } catch (err) {
        console.error(`Failed to send follow-up to ${lead.email}:`, err);
      }
    }
  } catch (error) {
    console.error('Error in follow-up automation job:', error);
  }
});
