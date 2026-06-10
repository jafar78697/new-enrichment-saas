/**
 * Campaign Email Sender Service
 * Runs every 60 seconds. Picks active campaigns and sends emails to assigned contacts.
 * Uses: campaigns table, contacts table, email_accounts table (all calls-module DB)
 */

import nodemailer from 'nodemailer';
import { query } from '../db/index.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function generateEmailWithAI(prompt, contact) {
  if (!OPENAI_API_KEY) return null;
  try {
    const systemPrompt = prompt
      .replace(/\{\{contact_name\}\}/gi, contact.name || 'there')
      .replace(/\{\{company_name\}\}/gi, contact.company_name || 'your company')
      .replace(/\{\{website\}\}/gi, contact.website || '')
      .replace(/\{\{location\}\}/gi, contact.location || '')
      .replace(/\{\{services\}\}/gi, contact.niche || '')
      .replace(/\{\{company_description\}\}/gi, contact.company_description || '')
      .replace(/\{\{research_data\}\}/gi, contact.research_data || '');

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

  // Try to parse Subject: ... \n\n Body
  const subjectMatch = rawText.match(/^Subject:\s*(.+)/im);
  const subject = subjectMatch
    ? subjectMatch[1].trim()
    : `A small improvement for ${contact.company_name || 'your company'}`;

  // Remove the subject line from body
  const body = rawText.replace(/^Subject:\s*.+\n?/im, '').trim();
  return { subject, body };
}

async function getAvailableSender(userId) {
  // Pick a sender with available quota — round-robin via senders table
  // Returns: { gmail, app_password, biz_email, display_name, sender_id, account_id }
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

async function processActiveCampaigns() {
  try {
    // Get all active email campaigns
    const { rows: campaigns } = await query(
      `SELECT * FROM campaigns WHERE status = 'active' AND channel = 'email'`
    );

    for (const campaign of campaigns) {
      // Check if it's the right time to send (within 5 min window of send_time)
      const now = new Date();
      const [sendHour, sendMin] = (campaign.send_time || '09:00').split(':').map(Number);
      const campaignTime = new Date();
      campaignTime.setHours(sendHour, sendMin, 0, 0);
      const diffMinutes = Math.abs((now - campaignTime) / 60000);

      // Only send within 5-minute window of scheduled time, OR if manual trigger
      // For now send always (every minute check) but limit to daily_limit
      const sender = await getAvailableSender(campaign.user_id);
      if (!sender) {
        console.log(`[CampaignSender] No sender available for campaign ${campaign.id}`);
        continue;
      }

      // Get contacts assigned to this campaign that haven't been emailed yet
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
          // Generate email content with AI
          const rawText = await generateEmailWithAI(campaign.base_template, contact);
          const parsed = rawText
            ? parseEmailContent(rawText, contact)
            : {
                subject: `A small improvement for ${contact.company_name || 'your company'}`,
                body: campaign.base_template
                  .replace(/\{\{contact_name\}\}/gi, contact.name || 'there')
                  .replace(/\{\{company_name\}\}/gi, contact.company_name || 'your company')
              };

          if (!parsed) continue;

          // Send via Gmail SMTP but show business email as From (jento-mailer style)
          const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: { user: sender.gmail, pass: sender.app_password }
          });

          const unsubLink = `https://api.jentoai.pro/api/campaigns/unsubscribe?contact_id=${contact.id}`;
          const htmlBody = parsed.body.replace(/\n/g, '<br>') +
            `<br><br><p style="font-size:11px;color:#999;">If you no longer wish to receive these emails, <a href="${unsubLink}">unsubscribe here</a>.</p>`;

          const displayName = sender.display_name || 'Jento AI';
          await transporter.sendMail({
            from: `"${displayName}" <${sender.biz_email}>`,
            to: contact.email,
            subject: parsed.subject,
            html: htmlBody,
            envelope: {
              from: sender.gmail,   // actual SMTP sender (Gmail)
              to: contact.email
            }
          });

          // Mark contact as emailed
          await query(
            `UPDATE contacts SET emails_sent = COALESCE(emails_sent, 0) + 1, 
             stage = 'email_sent', updated_at = NOW() WHERE id = $1`,
            [contact.id]
          );

          // Increment account sent_today
          await query(
            `UPDATE email_accounts SET sent_today = sent_today + 1, updated_at = NOW() WHERE id = $1`,
            [sender.account_id]
          );

          console.log(`[CampaignSender] ✅ Sent to ${contact.email} via ${sender.biz_email} (${contact.company_name || contact.company})`); 

          // Small delay between sends
          await new Promise(r => setTimeout(r, 2000));

        } catch (sendErr) {
          console.error(`[CampaignSender] ❌ Failed to send to ${contact.email}:`, sendErr.message);
          // Continue with next contact
        }
      }
    }
  } catch (err) {
    console.error('[CampaignSender] processActiveCampaigns error:', err.message);
  }
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

  // Reset daily counters at midnight
  const now = new Date();
  const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
  setTimeout(() => {
    resetDailyCounters();
    setInterval(resetDailyCounters, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
}
