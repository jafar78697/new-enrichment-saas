/**
 * Campaign Email Sender Service
 * Runs every 60 seconds. Picks active campaigns and sends emails to assigned contacts.
 * Features:
 *  - Business email as From: (via Gmail SMTP relay)
 *  - 1x1 tracking pixel for open detection
 *  - Unsubscribe link in footer
 *  - IMAP reply detection (every 5 min)
 */

import nodemailer from 'nodemailer';
import { VertexAI } from '@google-cloud/vertexai';
import { query } from '../db/index.js';

const project = 'maximal-kingdom-499107-f8';
const location = 'us-central1';
const vertexAI = new VertexAI({ project, location });
const generativeModel = vertexAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

async function generateEmailWithAI(prompt, contact) {
  try {
    const systemPrompt = prompt
      .replace(/\{\{contact_name\}\}/gi, contact.name || 'there')
      .replace(/\{\{company_name\}\}/gi, contact.company || 'your company')
      .replace(/\{\{website\}\}/gi, contact.website || '')
      .replace(/\{\{location\}\}/gi, contact.location || '')
      .replace(/\{\{services\}\}/gi, contact.niche || '')
      .replace(/\{\{company_description\}\}/gi, contact.company_description || '')
      .replace(/\{\{research_data\}\}/gi, contact.notes || '');

    const request = {
      contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
      generationConfig: {
        temperature: 0.7,
      }
    };

    const result = await generativeModel.generateContent(request);
    
    if (result.response && result.response.candidates && result.response.candidates.length > 0) {
      const generatedText = result.response.candidates[0].content.parts[0].text;
      return generatedText ? generatedText.trim() : null;
    }
    
    return null;
  } catch (error) {
    console.error('AI Generation Error:', error);
    return null;
  }
}

function parseEmailContent(rawText, contact) {
  if (!rawText) return null;

  const subjectMatch = rawText.match(/^Subject:\s*(.+)/im);
  const subject = subjectMatch
    ? subjectMatch[1].trim()
    : `A small improvement for ${contact.company || 'your company'}`;

  const body = rawText.replace(/^Subject:\s*.+\n?/im, '').trim();
  return { subject, body };
}

async function getAvailableSenderGlobal() {
  const { rows } = await query(
    `SELECT s.id as sender_id, ea.id as account_id, ea.email as gmail, ea.app_password,
            s.biz_email, s.display_name, ea.sent_today, ea.daily_limit
     FROM senders s
     JOIN email_accounts ea ON ea.id = s.gmail_id
     WHERE ea.status = 'active' 
       AND ea.sent_today < ea.daily_limit
       AND s.active = TRUE
     ORDER BY ea.last_used_at ASC NULLS FIRST, s.last_used_at ASC NULLS FIRST
     LIMIT 1`
  );
  return rows[0] || null;
}

function buildHtmlEmail(bodyText, contactId, trackingPixelUrl) {
  const htmlBody = bodyText.replace(/\n/g, '<br>');
  const unsubLink = `${API_BASE}/api/campaigns/unsubscribe?contact_id=${contactId}`;
  const pixel = `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;border:0;" alt="" />`;

  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.6;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    ${htmlBody}
    <br><br>
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
    <p style="font-size:11px;color:#999;margin:0;">
      If you no longer wish to receive these emails, 
      <a href="${unsubLink}" style="color:#999;">unsubscribe here</a>.
    </p>
    ${pixel}
  </div>
</body>
</html>`;
}

async function processAutomatedEmails() {
  try {
    // Check Pakistani Time Constraint (6:00 PM to 2:00 AM PKT)
    const pktDate = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Karachi"}));
    const pktHour = pktDate.getHours();
    if (pktHour >= 2 && pktHour < 18) {
      console.log('[AutomatedSender] Outside of active sending window (6:00 PM to 2:00 AM PKT). Skipping.');
      return;
    }

    // Set any un-started emails to 'emailing' stage
    await query(`
      UPDATE contacts
      SET omnichannel_stage = 'emailing', stage = 'in_progress'
      WHERE email IS NOT NULL AND email != '' AND (emails_sent IS NULL OR emails_sent = 0) AND (omnichannel_stage IS NULL OR omnichannel_stage = 'new')
    `);

    // Fetch up to 50 pending contacts globally
    const { rows: contacts } = await query(
      `SELECT * FROM contacts 
       WHERE (emails_sent IS NULL OR emails_sent = 0) 
         AND (unsubscribed IS NULL OR unsubscribed = FALSE)
         AND email IS NOT NULL AND email != ''
         AND omnichannel_stage = 'emailing'
       ORDER BY id ASC
       LIMIT 50`
    );

    if (contacts.length === 0) {
      console.log(`[AutomatedSender] No pending contacts to email right now.`);
      return;
    }

    console.log(`[AutomatedSender] Found ${contacts.length} pending contacts. Processing...`);

    const defaultPrompt = `
You are an expert B2B sales representative writing a personalized cold email. 
Write a highly personalized, professional, and concise cold email to {{contact_name}} at {{company_name}}.
Here is the website data or notes about their company:
"""
{{research_data}}
"""

The goal of the email is to offer our B2B services to help them scale and streamline their operations. Ask for a quick 5-minute chat next week to discuss potential synergies.
Keep the tone conversational and professional. Keep it under 100 words. Do NOT include a signature. Output ONLY the email body in HTML format (using <p> and <br> tags).
Subject line should be included at the very beginning in the format: "Subject: <your subject here>\n\n".
`;

    for (const contact of contacts) {
      const sender = await getAvailableSenderGlobal();
      if (!sender) {
        console.log(`[AutomatedSender] No sender available (all limits reached or no active senders). Stopping this batch.`);
        break; // stop processing if no sender is available
      }

      try {
        const rawText = await generateEmailWithAI(defaultPrompt, contact);
        let parsed = parseEmailContent(rawText, contact);

        if (!parsed || !parsed.body || parsed.body.includes('You are an expert B2B sales copywriter')) {
          console.error(`[AutomatedSender] AI failed for ${contact.email}, falling back to standard template.`);
          parsed = {
            subject: `Potential Collaboration with ${contact.company || 'your company'}`,
            body: `<p>Hi ${contact.name || 'there'},</p><p>I noticed your recent work and wanted to reach out regarding a potential collaboration. We offer B2B services to help scale and streamline operations.</p><p>Would you have time for a quick chat next week to discuss potential synergies?</p><p>Best regards,</p>`
          };
          await new Promise(r => setTimeout(r, 10000)); // Allow rate limits to recover
        }

        // Tracking pixel URL — contact_id based
        const trackingPixelUrl = `${API_BASE}/api/campaigns/track/${contact.id}`;

        const htmlBody = buildHtmlEmail(parsed.body, contact.id, trackingPixelUrl);

        // Send via Gmail SMTP but show business email as From
        const transporter = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 465,
          secure: true,
          auth: { user: sender.gmail, pass: sender.app_password }
        });

        const displayName = sender.display_name || 'Jento AI';
        const messageId = `<${Date.now()}.${contact.id}@${sender.biz_email.split('@')[1]}>`;

        await transporter.sendMail({
          from: `"${displayName}" <${sender.biz_email}>`,
          to: contact.email,
          subject: parsed.subject,
          html: htmlBody,
          messageId,
          envelope: {
            from: sender.gmail,
            to: contact.email
          }
        });

        // Ensure table exists
        await query(`
          CREATE TABLE IF NOT EXISTS contact_emails_history (
            id SERIAL PRIMARY KEY,
            contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
            subject TEXT,
            body TEXT,
            from_email TEXT,
            sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          )
        `);

        // Log the email in history
        await query(
          'INSERT INTO contact_emails_history (contact_id, subject, body, from_email) VALUES ($1, $2, $3, $4)',
          [contact.id, parsed.subject, htmlBody, sender.biz_email]
        );

        // Mark contact as emailed
        await query(
          `UPDATE contacts SET emails_sent = COALESCE(emails_sent, 0) + 1, 
           stage = 'email_sent', last_email_sent_at = NOW(), updated_at = NOW(),
           notes = COALESCE(notes, '') WHERE id = $1`,
          [contact.id]
        );

        // Increment account sent_today and update last_used_at
        await query(
          `UPDATE email_accounts SET sent_today = sent_today + 1, last_used_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [sender.account_id]
        );

        // Update sender last_used_at for rotation
        await query(
          `UPDATE senders SET last_used_at = NOW() WHERE id = $1`,
          [sender.sender_id]
        );

        console.log(`[AutomatedSender] ✅ Sent to ${contact.email} via ${sender.biz_email} (${contact.company || contact.name})`);

        // Human-like delay 10-15 seconds
        await new Promise(r => setTimeout(r, 10000 + Math.random() * 5000));

      } catch (sendErr) {
        console.error(`[AutomatedSender] ❌ Failed to send to ${contact.email}:`, sendErr.message);
        
        // Instant Bounce Detection
        const errStr = sendErr.message.toLowerCase();
        if (sendErr.responseCode >= 500 || errStr.includes('not found') || errStr.includes('rejected') || errStr.includes('does not exist')) {
          console.log(`[AutomatedSender] Email bounced/rejected for ${contact.email}. Moving to Cold Calling Pipeline.`);
          await query(
            `UPDATE contacts SET omnichannel_stage = 'cold_calling', stage = 'cold_calling', notes = concat(COALESCE(notes, ''), '\n[Auto] Email bounced: ', $1::text) WHERE id = $2`,
            [sendErr.message, contact.id]
          );
        }
      }
    }
  } catch (err) {
    console.error('[AutomatedSender] processAutomatedEmails error:', err.message);
  }
}

// ─── Reply Detection via IMAP ─────────────────────────────────────────────
async function syncReplies() {
  try {
    // Get all active Gmail accounts
    const { rows: accounts } = await query(
      `SELECT id, email, app_password FROM email_accounts 
       WHERE status = 'active' AND app_password IS NOT NULL AND app_password != ''
       LIMIT 45`
    );

    for (const acc of accounts) {
      try {
        await checkAccountReplies(acc);
      } catch (e) {
        // Silent — one account failing shouldn't stop others
      }
    }
  } catch (err) {
    console.error('[ReplySync] Error:', err.message);
  }
}

function checkAccountReplies(acc) {
  return new Promise((resolve) => {
    const imap = new Imap({
      user: acc.email,
      password: acc.app_password,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 20000,
      authTimeout: 10000
    });

    const done = () => { try { imap.end(); } catch(e){} resolve(); };

    imap.once('error', done);
    imap.once('end', resolve);

    imap.once('ready', () => {
      imap.openBox('INBOX', true, async (err, box) => {
        if (err) return done();

        // Search last 2 days for unseen messages
        const since = new Date();
        since.setDate(since.getDate() - 2);

        imap.search(['SINCE', since], async (err2, uids) => {
          if (err2 || !uids || uids.length === 0) return done();

          const fetch = imap.fetch(uids.slice(-50), { bodies: ['HEADER', 'TEXT'], struct: true });

          fetch.on('message', (msg) => {
            let headerBuffer = '';
            msg.on('body', (stream, info) => {
              if (info.which === 'HEADER') {
                stream.on('data', chunk => headerBuffer += chunk.toString());
                stream.once('end', async () => {
                  try {
                    const fromMatch = headerBuffer.match(/^From:\s*(.+)$/im);
                    const subjectMatch = headerBuffer.match(/^Subject:\s*(.+)$/im);
                    const fromEmail = fromMatch ? fromMatch[1].replace(/.*<(.+)>.*/, '$1').trim() : '';
                    const subject = subjectMatch ? subjectMatch[1].trim() : '';

                    if (!fromEmail || fromEmail === acc.email) return;

                    // Check if this is a reply from a contact we emailed
                    const { rows } = await query(
                      `SELECT id FROM contacts 
                       WHERE LOWER(email) = LOWER($1) 
                         AND emails_sent > 0 
                         AND stage != 'replied'
                       LIMIT 1`,
                      [fromEmail]
                    );

                    if (rows.length > 0) {
                      const contactId = rows[0].id;
                      await query(
                        `UPDATE contacts SET stage = 'replied', 
                         emails_received = COALESCE(emails_received, 0) + 1,
                         updated_at = NOW() WHERE id = $1`,
                        [contactId]
                      );
                      console.log(`[ReplySync] 📩 Reply detected from ${fromEmail} — marked as replied`);
                    }
                  } catch(e) {}
                });
              }
            });
          });

          fetch.once('end', done);
          fetch.once('error', done);
        });
      });
    });

    imap.connect();
  });
}

// Reset sent_today counters at midnight
async function resetDailyCounters() {
  try {
    await query(
      `UPDATE email_accounts SET sent_today = 0, updated_at = NOW() WHERE sent_today > 0`
    );
    console.log('[CampaignSender] Daily send counters reset.');
  } catch (err) {
    console.error('[CampaignSender] Failed to reset daily counters:', err.message);
  }
}

// Move unresponsive email leads to cold_calling pipeline
async function processOmnichannelFallback() {
  try {
    const result = await query(
      `UPDATE contacts 
       SET omnichannel_stage = 'cold_calling', stage = 'cold_calling', updated_at = NOW()
       WHERE omnichannel_stage = 'emailing'
         AND emails_sent > 0
         AND (emails_received IS NULL OR emails_received = 0)
         AND (email_opened IS NULL OR email_opened = 0)
         AND last_email_sent_at < NOW() - INTERVAL '24 hours'
       RETURNING id, email`
    );
    if (result.rowCount > 0) {
      console.log(`[Omnichannel] Moved ${result.rowCount} unresponsive email leads to the Cold Calling pipeline.`);
    }
  } catch (err) {
    console.error('[Omnichannel] Auto-Mover error:', err.message);
  }
}

// Initialize: run every 60 seconds
export function initCampaignSender() {
  console.log('[AutomatedSender] Initialized — checking for pending contacts every 60 seconds.');
  setInterval(processAutomatedEmails, 60 * 1000);

  // Reply sync every 5 minutes
  console.log('[ReplySync] Initialized — checking replies every 5 minutes.');
  setInterval(syncReplies, 5 * 60 * 1000);
  setTimeout(syncReplies, 30 * 1000); // first run after 30s

  // Omnichannel Auto-Mover (Email -> Social) every hour
  console.log('[Omnichannel] Initialized — checking for unresponsive email leads every hour.');
  setInterval(processOmnichannelFallback, 60 * 60 * 1000);
  setTimeout(processOmnichannelFallback, 60 * 1000); // first run after 60s

  // Reset daily counters at midnight
  const now = new Date();
  const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
  setTimeout(() => {
    resetDailyCounters();
    setInterval(resetDailyCounters, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
}
