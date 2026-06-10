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
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { query } from '../db/index.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const API_BASE = 'https://api.jentoai.pro';

async function generateEmailWithAI(prompt, contact) {
  if (!OPENAI_API_KEY) return null;
  try {
    const systemPrompt = prompt
      .replace(/\{\{contact_name\}\}/gi, contact.name || 'there')
      .replace(/\{\{company_name\}\}/gi, contact.company || 'your company')
      .replace(/\{\{website\}\}/gi, contact.website || '')
      .replace(/\{\{location\}\}/gi, contact.location || '')
      .replace(/\{\{services\}\}/gi, contact.niche || '')
      .replace(/\{\{company_description\}\}/gi, contact.company_description || '')
      .replace(/\{\{research_data\}\}/gi, contact.notes || '');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: systemPrompt }],
        temperature: 0.75,
        max_tokens: 500
      })
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error('[CampaignSender] AI generation failed:', err.message);
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
     ORDER BY ea.sent_today ASC, s.id ASC
     LIMIT 1`,
    [userId]
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

async function processActiveCampaigns() {
  try {
    const { rows: campaigns } = await query(
      `SELECT * FROM campaigns WHERE status = 'active' AND channel = 'email'`
    );

    for (const campaign of campaigns) {
      const sender = await getAvailableSender(campaign.user_id);
      if (!sender) {
        console.log(`[CampaignSender] No sender available for campaign ${campaign.id}`);
        continue;
      }

      const { rows: contacts } = await query(
        `SELECT * FROM contacts 
         WHERE campaign_id = $1 AND (emails_sent IS NULL OR emails_sent = 0) 
           AND (unsubscribed IS NULL OR unsubscribed = FALSE)
           AND email IS NOT NULL AND email != ''
         LIMIT $2`,
        [campaign.id, campaign.daily_limit || 50]
      );

      if (contacts.length === 0) {
        console.log(`[CampaignSender] No pending contacts for campaign ${campaign.id}`);
        continue;
      }

      console.log(`[CampaignSender] Campaign ${campaign.name}: sending to ${contacts.length} contacts`);

      for (const contact of contacts) {
        try {
          const rawText = await generateEmailWithAI(campaign.base_template, contact);
          const parsed = rawText
            ? parseEmailContent(rawText, contact)
            : {
                subject: `A small improvement for ${contact.company || 'your company'}`,
                body: campaign.base_template
                  .replace(/\{\{contact_name\}\}/gi, contact.name || 'there')
                  .replace(/\{\{company_name\}\}/gi, contact.company || 'your company')
              };

          if (!parsed) continue;

          // Tracking pixel URL — contact_id based
          const trackingPixelUrl = `${API_BASE}/api/campaigns/track/${contact.id}`;

          const htmlBody = buildHtmlEmail(parsed.body, contact.id, trackingPixelUrl);

          // Send via Gmail SMTP but show business email as From (jento-mailer style)
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
              from: sender.gmail,   // actual SMTP sender (Gmail)
              to: contact.email
            }
          });

          // Mark contact as emailed — store msg_id for reply matching
          await query(
            `UPDATE contacts SET emails_sent = COALESCE(emails_sent, 0) + 1, 
             stage = 'email_sent', last_email_sent_at = NOW(), updated_at = NOW(),
             notes = COALESCE(notes, '') WHERE id = $1`,
            [contact.id]
          );

          // Increment account sent_today
          await query(
            `UPDATE email_accounts SET sent_today = sent_today + 1, updated_at = NOW() WHERE id = $1`,
            [sender.account_id]
          );

          console.log(`[CampaignSender] ✅ Sent to ${contact.email} via ${sender.biz_email} (${contact.company || contact.name})`);

          // Human-like delay 3-8 seconds
          await new Promise(r => setTimeout(r, 3000 + Math.random() * 5000));

        } catch (sendErr) {
          console.error(`[CampaignSender] ❌ Failed to send to ${contact.email}:`, sendErr.message);
        }
      }
    }
  } catch (err) {
    console.error('[CampaignSender] processActiveCampaigns error:', err.message);
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
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const dateStr = `${since.getDate()}-${months[since.getMonth()]}-${since.getFullYear()}`;

        imap.search(['SINCE', dateStr], async (err2, uids) => {
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

// Initialize: run every 60 seconds
export function initCampaignSender() {
  console.log('[CampaignSender] Initialized — checking campaigns every 60 seconds.');
  setInterval(processActiveCampaigns, 60 * 1000);

  // Reply sync every 5 minutes
  console.log('[ReplySync] Initialized — checking replies every 5 minutes.');
  setInterval(syncReplies, 5 * 60 * 1000);
  setTimeout(syncReplies, 30 * 1000); // first run after 30s

  // Reset daily counters at midnight
  const now = new Date();
  const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
  setTimeout(() => {
    resetDailyCounters();
    setInterval(resetDailyCounters, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
}
