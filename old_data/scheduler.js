import { query, getPool } from './db.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from './config/env.js';
import nodemailer from 'nodemailer';

let isRunning = false;

async function processCampaigns() {
  if (isRunning) return;
  isRunning = true;

  const client = await getPool().connect();

  try {
    // --- EST Timezone Check (USA Daytime Only) ---
    const estHour = new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour: '2-digit', hour12: false });
    const currentHour = parseInt(estHour, 10);
    // Only send between 9 AM and 5 PM EST (17:00)
    if (currentHour < 9 || currentHour >= 17) {
      isRunning = false;
      client.release();
      return;
    }
    // ---------------------------------------------

    // 1. Transaction to safely lock a pending lead
    await client.query('BEGIN');
    
    // Find ONE pending lead in an active campaign whose scheduled send_time has arrived
    const leadRes = await client.query(`
      SELECT c.*, camp.base_template, camp.status as camp_status
      FROM contacts c
      JOIN campaigns camp ON c.campaign_id = camp.id
      WHERE camp.status = 'active'
        AND c.emails_sent = 0
        AND c.stage != 'email_sent'
        AND (CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')::time >= camp.send_time::time
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `);

    if (leadRes.rowCount === 0) {
      await client.query('COMMIT');
      isRunning = false;
      client.release();
      return; // Nothing to process
    }

    const contact = leadRes.rows[0];
    
    // 2. Next Sender Logic (Round Robin)
    // We reset the counts if it's a new day
    await client.query(`
      UPDATE email_accounts 
      SET sent_today = 0, day_reset = CURRENT_DATE 
      WHERE day_reset != CURRENT_DATE
    `);

    const senderRes = await client.query(`
      SELECT e.*, b.email as business_email 
      FROM email_accounts e
      LEFT JOIN business_emails b ON b.gmail_account_id = e.id AND b.active = true
      WHERE e.status = 'active' AND e.sent_today < 25 AND e.sent_today < e.daily_limit
      ORDER BY e.sent_today ASC, RANDOM()
      LIMIT 1
    `);

    if (senderRes.rowCount === 0) {
      console.log('[Campaign Scheduler] No active email accounts available with remaining limits.');
      await client.query('ROLLBACK'); // Unlock the lead
      isRunning = false;
      client.release();
      return;
    }

    const sender = senderRes.rows[0];
    console.log(`[Campaign Scheduler] Using sender ${sender.email} for lead ${contact.id} (${contact.name})`);

    // 3. Generate Email via Gemini
    let generatedEmailHtml = '';
    const subjectLine = `Quick question regarding ${contact.company || contact.name}`;

    if (contact.website_data && contact.base_template && env.GEMINI_API_KEY) {
      try {
        const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `You are an expert sales representative writing a personalized cold email. 
        Here is the base template to follow:
        """
        ${contact.base_template}
        """

        Here is the introduction/website data of the prospect's company:
        """
        ${contact.website_data}
        """

        Rewrite the base template to make it highly personalized to their company using the website data. Keep the tone professional, concise, and conversational. Output ONLY the email body in HTML format (using <p> and <br> tags). Do NOT include any signature at the end. Replace any placeholder like [Name] with ${contact.name}.`;

        const result = await model.generateContent(prompt);
        generatedEmailHtml = result.response.text();
      } catch (err) {
        console.error("[Campaign Scheduler] Gemini Generation Error:", err);
        generatedEmailHtml = `
          <p>Hi ${contact.name},</p>
          <p>${contact.base_template.replace(/\\n/g, '<br/>')}</p>
        `;
      }
    } else {
      generatedEmailHtml = `
        <p>Hi ${contact.name},</p>
        <p>${contact.base_template ? contact.base_template.replace(/\\n/g, '<br/>') : 'I noticed your business and wanted to connect.'}</p>
      `;
    }

    const emailHtmlTemplate = `
      ${generatedEmailHtml}
      <br />
      <img src="${env.PUBLIC_BASE_URL}/api/contacts/${contact.id}/track-email" width="1" height="1" style="display:none;" />
    `;

    // 4. Send Email via Nodemailer using sender credentials
    try {
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
          user: sender.email,
          pass: sender.app_password
        }
      });

      const senderEmailAlias = sender.business_email || sender.email;
      await transporter.sendMail({
        from: `"Jento AI" <${senderEmailAlias}>`,
        to: contact.email || contact.contact_email,
        subject: subjectLine,
        html: emailHtmlTemplate,
        text: generatedEmailHtml.replace(/<[^>]+>/g, '') // strip html
      });

      console.log(`[Campaign Scheduler] Successfully sent email to ${contact.email || contact.name} via ${senderEmailAlias}`);

      // Save email to history so it shows up in the UI popup
      await client.query(`
        CREATE TABLE IF NOT EXISTS contact_emails_history (
          id SERIAL PRIMARY KEY,
          contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
          subject TEXT,
          body TEXT,
          from_email TEXT,
          sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      await client.query(
        'INSERT INTO contact_emails_history (contact_id, subject, body, from_email) VALUES ($1, $2, $3, $4)',
        [contact.id, subjectLine, generatedEmailHtml, senderEmailAlias]
      );

      // 5. Update State
      await client.query(
        'UPDATE contacts SET emails_sent = COALESCE(emails_sent, 0) + 1, stage = $1, last_email_sent_at = NOW() WHERE id = $2',
        ['email_sent', contact.id]
      );
      
      await client.query(
        'UPDATE email_accounts SET sent_today = sent_today + 1 WHERE id = $1',
        [sender.id]
      );

      await client.query('COMMIT');
    } catch (smtpErr) {
      console.error('[Campaign Scheduler] SMTP Send Error:', smtpErr);
      // Pause account due to limit or invalid credentials
      if (smtpErr.response && smtpErr.response.includes('limit')) {
        await client.query('UPDATE email_accounts SET status = $1 WHERE id = $2', ['rate_limited', sender.id]);
      }
      await client.query('ROLLBACK'); // Unlock the lead so another account can try it next tick
    }

  } catch (err) {
    console.error('[Campaign Scheduler] Loop error:', err);
    await client.query('ROLLBACK');
  } finally {
    client.release();
    isRunning = false;
  }
}

function scheduleNextCampaignProcess() {
  // Random delay between 30 and 45 seconds
  const min = 30000;
  const max = 45000;
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  
  setTimeout(async () => {
    await processCampaigns();
    scheduleNextCampaignProcess();
  }, delay);
}

export function startCampaignScheduler() {
  console.log('[Campaign Scheduler] Started background loop with random interval (30s - 45s)');
  // Start the first run immediately, then schedule the next ones randomly
  processCampaigns().then(() => scheduleNextCampaignProcess());
}
