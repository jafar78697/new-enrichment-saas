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
import OpenAI from 'openai';
import { query } from '../db/index.js';
import { resolvePrompt, getPromptForContact } from './template-resolver.service.js';
import { processPrompt, trackUsage } from './token-control.service.js';

const API_BASE = process.env.API_URL || 'https://api.jentoai.pro';

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY || 'dummy_key_to_prevent_crash'
});

async function generateEmailWithAI(prompt, contact, senderName, nicheName) {
  try {
    const rawSystemPrompt = resolvePrompt(prompt, contact, senderName, nicheName);
    
    // Apply centralized token control — truncates oversized prompts + tracks daily usage
    const { prompt: systemPrompt, estimatedTokens: inputTokens } = processPrompt(rawSystemPrompt, {
      label: `email:${contact.email || contact.id}`,
    });

    const chatCompletion = await openai.chat.completions.create({
      messages: [
        {
          role: "user",
          content: systemPrompt,
        },
      ],
      model: "deepseek-chat",
      temperature: 0.7,
      max_tokens: 1024,
    });
    
    // Track actual token usage from API response
    if (chatCompletion.usage) {
      trackUsage(chatCompletion.usage, `email:${contact.email || contact.id}`);
    }
    
    if (chatCompletion.choices && chatCompletion.choices.length > 0) {
      const generatedText = chatCompletion.choices[0].message?.content;
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

async function getAvailableSenderGlobal(requiredSenderId = null) {
  let queryStr = `
    SELECT be.id as sender_id, ea.id as account_id, ea.email as gmail, ea.app_password,
           be.email as biz_email, '' as display_name, ea.sent_today, ea.daily_limit
    FROM business_emails be
    JOIN email_accounts ea ON ea.id = be.gmail_account_id
    WHERE ea.status = 'active' 
      AND ea.sent_today < ea.daily_limit
      AND be.active = TRUE
  `;
  const params = [];

  if (requiredSenderId) {
    queryStr += ` AND ea.id = $1 `;
    params.push(requiredSenderId);
  }

  queryStr += ` ORDER BY ea.last_used_at ASC NULLS FIRST LIMIT 1`;

  const { rows } = await query(queryStr, params);
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

let aiRateLimitPauseUntil = 0;
let quotaPauseUntil = 0;
let isSendingEmails = false;

async function processAutomatedEmails() {
  if (isSendingEmails) {
    console.log('[AutomatedSender] Previous batch is still running. Skipping this interval.');
    return;
  }

  isSendingEmails = true;
  try {
    if (Date.now() < aiRateLimitPauseUntil) {
      console.log(`[AutomatedSender] Paused due to AI Rate Limit. Resuming in ${Math.round((aiRateLimitPauseUntil - Date.now()) / 60000)} minutes.`);
      return;
    }

    if (Date.now() < quotaPauseUntil) {
      console.log(`[AutomatedSender] Intelligent Quota Pause Active. Resuming in ${Math.round((quotaPauseUntil - Date.now()) / 60000)} minutes.`);
      return;
    }

    // Check Pakistani Time Constraint (6:00 PM to 2:00 AM PKT)
    const pktDate = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Karachi"}));
    const pktHour = pktDate.getHours();
    if (pktHour >= 2 && pktHour < 18) {
      console.log('[AutomatedSender] Outside of active sending window (6:00 PM to 2:00 AM PKT). Skipping.');
      return;
    }

    // Check if ANY global sender is available before processing
    const globalSenderCheck = await getAvailableSenderGlobal();
    if (!globalSenderCheck) {
      console.log("[AutomatedSender] Aaj ka quota pura ho gaya hai! (Today's global email quota is complete).");
      console.log('[AutomatedSender] Agent intelligently pausing for 1 hour before retrying.');
      console.log('[AutomatedSender] Agar phir bhi quota complete hua, tou raat 12 baje ke baad (1 AM to 2 AM) automatically retry hoga.');
      
      quotaPauseUntil = Date.now() + 60 * 60 * 1000; // Pause for 1 hour
      return;
    }

    // Bypassing stage updates - sending directly to anyone with an email

    // Ensure system_alerts table exists
    await query(`
      CREATE TABLE IF NOT EXISTS system_alerts (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        account_id INTEGER,
        resolved BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Fetch contacts for INITIAL SEND (emails_sent = 0) OR FOLLOW-UP (up to 3 follow-ups, 3 days apart)
    const { rows: contacts } = await query(
      `SELECT c.*, camp.base_template as campaign_prompt,
              n.custom_prompt as niche_prompt, n.name as niche_name
       FROM contacts c
       LEFT JOIN campaigns camp ON c.campaign_id = camp.id
       LEFT JOIN niches n ON c.niche_id = n.id
       WHERE (c.unsubscribed IS NULL OR c.unsubscribed = FALSE)
         AND c.stage NOT IN ('bounced', 'replied')
         AND c.email IS NOT NULL AND c.email != ''
         AND c.email NOT LIKE '%25%'
         AND c.email NOT LIKE '%40%'
         AND c.email NOT LIKE '% %'
         AND c.email NOT LIKE '%<%'
         AND c.email NOT LIKE '%>%'
         AND (
           (c.emails_sent IS NULL OR c.emails_sent = 0) 
           OR 
           (c.emails_sent BETWEEN 1 AND 3 AND c.last_email_sent_at < NOW() - INTERVAL '3 days')
         )
       ORDER BY c.emails_sent ASC, c.id ASC
       LIMIT 50`
    );

    if (contacts.length === 0) {
      console.log(`[AutomatedSender] No pending contacts to email right now.`);
      return;
    }

    console.log(`[AutomatedSender] Found ${contacts.length} pending contacts. Processing...`);

    const fallbackPrompt = `
You are an expert B2B sales representative writing a personalized cold email. 
Write a highly personalized, professional, and concise cold email.
The goal of the email is to pitch our core services: 
1. Fixing and optimizing their business sales funnels.
2. Creating high-converting landing pages.
3. Building automated follow-up message sequences.
4. Setting up instant booking and confirmation automations.

Use professional yet easy-to-understand industry language (e.g., "streamlining the customer journey", "optimizing conversion rates", "frictionless booking flows", "nurturing leads on autopilot").
Keep the tone conversational, professional, and avoid generic AI buzzwords.
Do NOT use placeholder names like [Your Name].
`;

    for (const contact of contacts) {
      const isFollowUp = contact.emails_sent === 1;
      const sender = await getAvailableSenderGlobal(contact.sender_account_id);
      
      if (!sender) {
        console.log(`[AutomatedSender] No sender available for ${contact.email} (Limit reached or account inactive). Skipping.`);
        continue; // skip this contact but keep going for others
      }
      
      const senderDisplayName = sender.display_name || 'Jento AI';

      try {
        const userPrompt = getPromptForContact(contact, fallbackPrompt);
        
        let finalPrompt = '';
        if (isFollowUp) {
           finalPrompt = `
Here is the user's base template or instructions for the email campaign:
"""
${userPrompt}
"""

Contact Details: Name: {{contact_name}}, Company: {{company_name}}
Sender Name: {{sender_name}}

INSTRUCTIONS FOR FOLLOW-UP:
1. Write a short, highly personalized follow-up email (Step 2) to bump the previous message.
2. Keep it under 3-4 sentences. Ask a quick clarifying question or provide one quick new value point.
3. Sign off with the Sender Name.
4. Output ONLY the email body in HTML format (using <p> and <br> tags).
5. Subject line MUST be exactly: "Subject: Re: <make up a relevant subject>\\n\\n".
`;
        } else {
           finalPrompt = `
Here is the user's base template or instructions for the email:
"""
${userPrompt}
"""

Contact Details: Name: {{contact_name}}, Company: {{company_name}}, Website: {{website}}, Location: {{location}}, Services: {{services}}, Niche: {{niche_name}}
Website Data: {{website_data}}
Headline: {{headline}}
Research Notes: {{research_data}}
Sender Name: {{sender_name}}

INSTRUCTIONS:
1. Write a highly personalized email using the base template/instructions above and the contact's details.
2. Use the website_data and headline to reference specific details about their business.
3. Sign off the email with the Sender Name provided above. NEVER use placeholders like [Your Name].
4. Output ONLY the email body in HTML format (using <p> and <br> tags).
5. Subject line MUST be included at the very beginning in the exact format: "Subject: <your subject here>\\n\\n".
6. Keep the call to action soft and open-ended.
`;
        }

        const rawText = await generateEmailWithAI(finalPrompt, contact, senderDisplayName, contact.niche_name);
        let parsed = parseEmailContent(rawText, contact);

        if (!parsed || !parsed.body || parsed.body.includes('You are an expert B2B sales copywriter')) {
          console.error(`[AutomatedSender] AI failed for ${contact.email} due to rate limits. Pausing for 15 minutes...`);
          aiRateLimitPauseUntil = Date.now() + 15 * 60 * 1000;
          return; // Stop processing this batch
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

        // Threading Logic (In-Reply-To)
        let inReplyTo = undefined;
        let originalSubject = parsed.subject;
        
        if (isFollowUp) {
          const { rows: historyRows } = await query(
            `SELECT message_id, subject FROM contact_emails_history WHERE contact_id = $1 ORDER BY id ASC LIMIT 1`,
            [contact.id]
          );
          if (historyRows.length > 0 && historyRows[0].message_id) {
            inReplyTo = historyRows[0].message_id;
            // Force subject to be Re: Original Subject to thread correctly
            if (historyRows[0].subject) {
              originalSubject = historyRows[0].subject.toLowerCase().startsWith('re:') ? historyRows[0].subject : `Re: ${historyRows[0].subject}`;
            }
          }
        }

        const messageOptions = {
          from: `"${displayName}" <${sender.biz_email}>`,
          to: contact.email,
          subject: originalSubject,
          html: htmlBody,
          messageId,
          envelope: {
            from: sender.gmail,
            to: contact.email
          }
        };

        if (inReplyTo) {
          messageOptions.inReplyTo = inReplyTo;
          messageOptions.references = [inReplyTo];
        }

        await transporter.sendMail(messageOptions);

        // Ensure table exists
        await query(`
          CREATE TABLE IF NOT EXISTS contact_emails_history (
            id SERIAL PRIMARY KEY,
            contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
            subject TEXT,
            body TEXT,
            from_email TEXT,
            message_id TEXT,
            sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          )
        `);

        // Log the email in history
        await query(
          'INSERT INTO contact_emails_history (contact_id, subject, body, from_email, message_id) VALUES ($1, $2, $3, $4, $5)',
          [contact.id, originalSubject, htmlBody, sender.biz_email, messageId]
        );

        // Mark contact as emailed and lock the sender account to this contact
        await query(
          `UPDATE contacts SET 
             emails_sent = COALESCE(emails_sent, 0) + 1, 
             stage = 'email_sent', 
             last_email_sent_at = NOW(), 
             updated_at = NOW(),
             notes = COALESCE(notes, ''),
             sender_account_id = $2
           WHERE id = $1`,
          [contact.id, sender.account_id]
        );

        // Increment account sent_today and update last_used_at
        await query(
          `UPDATE email_accounts SET sent_today = sent_today + 1, last_used_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [sender.account_id]
        );

        // The email_accounts table last_used_at was already updated above.

        console.log(`[AutomatedSender] ✅ Sent to ${contact.email} via ${sender.biz_email} (${contact.company || contact.name})`);

        // Human-like delay 10-15 seconds
        await new Promise(r => setTimeout(r, 10000 + Math.random() * 5000));

      } catch (sendErr) {
        console.error(`[AutomatedSender] ❌ Failed to send to ${contact.email}:`, sendErr.message);
        
        // Error Classification
        const errStr = sendErr.message.toLowerCase();
        
        const isQuotaError = errStr.includes('daily user sending limit') || errStr.includes('quota');
        const isAuthError = errStr.includes('authenticationfailed') || errStr.includes('invalid credentials') || errStr.includes('login failed');
        
        if (isQuotaError || isAuthError) {
          console.error(`[AutomatedSender] Account error for ${sender.biz_email} (Quota/Auth). Disabling account temporarily.`);
          
          const alertType = isQuotaError ? 'email_limit' : 'auth_error';
          const errorMsg = isQuotaError ? 'Daily user sending limit exceeded.' : 'Invalid credentials. Please update password.';
          
          await query(
            `UPDATE email_accounts SET status = 'error', updated_at = NOW() WHERE id = $1`,
            [sender.account_id]
          );
          
          await query(
            `INSERT INTO system_alerts (type, message, account_id) VALUES ($1, $2, $3)`,
            [alertType, `Account ${sender.biz_email}: ${errorMsg}`, sender.account_id]
          );
          
          // Do not bounce the contact. It will be picked up again in the next loop with a new sender.
          continue;
        }

        // Instant Bounce Detection for Contact-level errors
        if (sendErr.responseCode >= 500 || errStr.includes('not found') || errStr.includes('rejected') || errStr.includes('does not exist') || errStr.includes('blocked')) {
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
  } finally {
    isSendingEmails = false;
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

        imap.search([['SINCE', since]], async (err2, uids) => {
          if (err2 || !uids || uids.length === 0) return done();

          const fetch = imap.fetch(uids.slice(-150), { bodies: ['HEADER', 'TEXT'], struct: true });

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

// Move unresponsive email leads to cold_calling pipeline ONLY after 2 emails sent
async function processOmnichannelFallback() {
  try {
    const result = await query(
      `UPDATE contacts 
       SET omnichannel_stage = 'cold_calling', stage = 'cold_calling', updated_at = NOW()
       WHERE omnichannel_stage = 'emailing'
         AND emails_sent >= 2
         AND (emails_received IS NULL OR emails_received = 0)
         AND (email_opened IS NULL OR email_opened = 0)
         AND last_email_sent_at < NOW() - INTERVAL '3 days'
       RETURNING id, email`
    );
    if (result.rowCount > 0) {
      console.log(`[Omnichannel] Moved ${result.rowCount} completely unresponsive email leads to the Cold Calling pipeline.`);
    }
  } catch (err) {
    console.error('[Omnichannel] Auto-Mover error:', err.message);
  }
}

// Initialize: run every 60 seconds
export function initCampaignSender() {
  console.log('[AutomatedSender] Initialized — checking for pending contacts every 60 seconds.');
  setInterval(processAutomatedEmails, 60 * 1000);

// Old syncReplies removed because imap-sync.service.js handles it now

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
