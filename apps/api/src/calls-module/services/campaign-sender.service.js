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
    // Check Pakistani Time Constraint (6:00 PM to 2:00 AM PKT)
    const pktDate = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Karachi"}));
    const pktHour = pktDate.getHours();
    if (pktHour >= 2 && pktHour < 18) {
      console.log('[CampaignSender] Outside of active sending window (6:00 PM to 2:00 AM PKT). Skipping.');
      return;
    }

    // Auto-assign unassigned leads to the user's active email campaign (Automated First Email)
    await query(`
      UPDATE contacts
      SET campaign_id = (
        SELECT id FROM campaigns 
        WHERE campaigns.user_id = contacts.assigned_agent_id 
          AND campaigns.status = 'active' 
          AND campaigns.channel = 'email' 
        LIMIT 1
      ), omnichannel_stage = 'emailing'
      WHERE campaign_id IS NULL AND email IS NOT NULL AND email != '' AND (emails_sent IS NULL OR emails_sent = 0)
    `);

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
          const parsed = parseEmailContent(rawText, contact);

          if (!parsed || !parsed.body || parsed.body.includes('You are an expert B2B sales copywriter')) {
            console.error(`[CampaignSender] Skipping contact ${contact.email} because AI email generation failed or returned prompt.`);
            continue;
          }

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

          console.log(`[CampaignSender] ✅ Sent to ${contact.email} via ${sender.biz_email} (${contact.company || contact.name})`);

          // Human-like delay 3-8 seconds
          await new Promise(r => setTimeout(r, 3000 + Math.random() * 5000));

        } catch (sendErr) {
          console.error(`[CampaignSender] ❌ Failed to send to ${contact.email}:`, sendErr.message);
          
          // Instant Bounce Detection -> Fallback to Cold Calling Pipeline
          const errStr = sendErr.message.toLowerCase();
          if (sendErr.responseCode >= 500 || errStr.includes('not found') || errStr.includes('rejected') || errStr.includes('does not exist')) {
            console.log(`[CampaignSender] Email bounced/rejected for ${contact.email}. Moving to Cold Calling Pipeline.`);
            await query(
              `UPDATE contacts SET omnichannel_stage = 'cold_calling', stage = 'cold_calling', notes = concat(COALESCE(notes, ''), '\n[Auto] Email bounced: ', $1::text) WHERE id = $2`,
              [sendErr.message, contact.id]
            );
          }
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
  console.log('[CampaignSender] Initialized — checking campaigns every 60 seconds.');
  setInterval(processActiveCampaigns, 60 * 1000);

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
