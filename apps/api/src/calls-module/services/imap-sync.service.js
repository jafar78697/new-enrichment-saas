import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import { env } from '../config/env.js';
import { query } from '../db/index.js';

let syncInterval = null;
let isSyncing = false;

function _extractEmailAddr(raw) {
  const match = raw?.match(/<([^>]+)>/);
  return match ? match[1].trim().toLowerCase() : (raw || '').trim().toLowerCase();
}

function _isBounceMessage(fromEmail, subject) {
  const frmLower = (fromEmail || '').toLowerCase();
  const subLower = (subject || '').toLowerCase();
  return (
    frmLower.includes('mailer-daemon') ||
    frmLower.includes('postmaster') ||
    frmLower.includes('delivery subsystem') ||
    subLower.includes('delivery status notification') ||
    subLower.includes('undeliverable') ||
    subLower.includes('mail delivery') ||
    subLower.includes('failed delivery') ||
    subLower.includes('failure notice') ||
    subLower.includes('returned mail') ||
    subLower.includes('undelivered')
  );
}

function _isAutoReplyMessage(fromEmail, subject, body) {
  const fromLower = (fromEmail || '').toLowerCase();
  if (fromLower.startsWith('noreply@') || fromLower.startsWith('no-reply@') || fromLower.startsWith('donotreply@')) {
    return true;
  }

  const haystack = [fromLower, subject, (body || '').substring(0, 500)].join(' ').toLowerCase();
  const tokens = [
    'automatic reply', 'auto reply', 'autoreply', 'auto-response', 'auto response',
    'out of office', 'out of the office', 'away from the office',
    'vacation responder', 'on leave', 'i am away', 'maternity leave', 'paternity leave',
    'thank you for contacting', 'thank you for your email',
    'we have received your', 'will get back to you shortly',
    'message has been received', 'auto-generated', 'automated message',
    'do not reply to this email'
  ];
  return tokens.some(token => haystack.includes(token));
}

async function getActiveGmailAccounts() {
  try {
    const { rows } = await query(
      `SELECT id, email, app_password FROM email_accounts 
       WHERE status = 'active' AND app_password IS NOT NULL AND app_password != ''`
    );
    return rows;
  } catch (err) {
    console.warn(`[imap-sync] Failed to fetch accounts from Postgres: ${err.message}`);
    return [];
  }
}

async function processEmailAccount(account) {
  const config = {
    imap: {
      user: account.email,
      password: account.app_password,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      authTimeout: 15000,
      tlsOptions: { rejectUnauthorized: false }
    }
  };

  let connection;
  try {
    connection = await imaps.connect(config);
    await connection.openBox('INBOX');

    // Check UNSEEN emails + last 3 days (to catch replies already marked as seen)
    const since = new Date();
    since.setDate(since.getDate() - 3);
    const searchCriteria = [['OR', 'UNSEEN', ['SINCE', since.toDateString()]]];
    const fetchOptions = { bodies: [''], markSeen: false };
    const messages = await connection.search(searchCriteria, fetchOptions);

    if (messages.length > 0) {
      console.log(`[imap-sync] Found ${messages.length} unseen emails in ${account.email}`);
    }

    for (const item of messages) {
      try {
        const part = item.parts.find(p => p.which === '');
        if (!part) continue;

        const mail = await simpleParser(part.body);
        const fromEmail = _extractEmailAddr(mail.from?.text || '');
        const subject = mail.subject || '';
        const bodyText = mail.text || '';

        const isBounce = _isBounceMessage(fromEmail, subject);
        const isAutoReply = !isBounce && _isAutoReplyMessage(fromEmail, subject, bodyText);

        if (isBounce) {
          const failedEmailMatch = bodyText.match(/wasn't delivered to ([\\w.-]+@[\\w.-]+)/i) || 
                                   bodyText.match(/recipient failed permanently: ([\\w.-]+@[\\w.-]+)/i) ||
                                   bodyText.match(/failed to deliver to '?([\\w.-]+@[\\w.-]+)'?/i) ||
                                   bodyText.match(/undeliverable to ([\\w.-]+@[\\w.-]+)/i) ||
                                   bodyText.match(/delivery to the following recipient failed.*?\\n.*?([\\w.-]+@[\\w.-]+)/is);
          
          let failedEmail = null;
          if (failedEmailMatch) {
            failedEmail = failedEmailMatch[1].trim().toLowerCase();
          }

          if (failedEmail) {
            await query(
              "UPDATE contacts SET stage = 'bounced', updated_at = NOW() WHERE LOWER(email) = $1 AND stage != 'bounced'",
              [failedEmail]
            );
            console.log(`[imap-sync] Marked ${failedEmail} as BOUNCED (from ${account.email})`);
          } else {
             console.log(`[imap-sync] Bounce detected in ${account.email} but failed to extract original recipient. Subject: ${subject}`);
          }
        } else if (!isAutoReply) {
          if (fromEmail) {
            // NOTE: ALTER TABLE migration removed from loop — run once at startup only
            
            const { rows: contactRows } = await query(
              "SELECT id, stage FROM contacts WHERE LOWER(email) = $1 AND emails_sent > 0 LIMIT 1",
              [fromEmail]
            );
            
            if (contactRows.length > 0) {
              const contactId = contactRows[0].id;
              
              if (contactRows[0].stage !== 'replied') {
                 await query("UPDATE contacts SET stage = 'replied', emails_received = COALESCE(emails_received, 0) + 1, updated_at = NOW() WHERE id = $1", [contactId]);
                 console.log(`[imap-sync] Marked ${fromEmail} as REPLIED (from ${account.email})`);
              }
              
              // Check if we already saved this specific messageId to avoid duplicates if imap syncs twice
              const messageId = mail.messageId || '';
              const { rowCount: dupCount } = await query(
                "SELECT 1 FROM contact_emails_history WHERE contact_id = $1 AND message_id = $2 AND is_inbound = TRUE LIMIT 1",
                [contactId, messageId]
              );
              
              if (dupCount === 0 || !messageId) {
                await query(
                   "INSERT INTO contact_emails_history (contact_id, subject, body, from_email, message_id, is_inbound) VALUES ($1, $2, $3, $4, $5, TRUE)",
                   [contactId, subject, bodyText, fromEmail, messageId]
                );
              }
            }
          }
        }
      } catch (parseErr) {
        console.error(`[imap-sync] Error parsing email in ${account.email}: ${parseErr.message}`);
      }
    }
  } catch (err) {
    if (err.message && err.message.includes('Invalid credentials')) {
      console.warn(`[imap-sync] Invalid credentials for ${account.email}. Disabling account.`);
      await query(`UPDATE email_accounts SET status = 'error', updated_at = NOW() WHERE id = $1`, [account.id]);
      await query(
        `INSERT INTO system_alerts (type, message, account_id) VALUES ($1, $2, $3)`,
        ['auth_error', `Account ${account.email}: Invalid credentials. Please update password.`, account.id]
      );
    } else {
      console.warn(`[imap-sync] Failed to sync ${account.email}: ${err.message}`);
    }
  } finally {
    if (connection) connection.end();
  }
}

async function runSyncCycle() {
  if (isSyncing) return;
  isSyncing = true;
  try {
    const accounts = await getActiveGmailAccounts();
    if (accounts.length === 0) return;
    
    // Process accounts in parallel (up to 5 at a time) or sequentially
    // Since there shouldn't be too many, sequentially is safer for SQLite/Postgres locks
    for (const account of accounts) {
      await processEmailAccount(account);
    }
  } catch (err) {
    console.error(`[imap-sync] Cycle error: ${err.message}`);
  } finally {
    isSyncing = false;
  }
}

export function startImapSync() {
  if (syncInterval) return;
  console.log('[imap-sync] Starting IMAP Sync background service (runs every 5 minutes)');
  
  // Run immediately on start
  setTimeout(runSyncCycle, 5000);
  
  // Run every 5 minutes
  syncInterval = setInterval(runSyncCycle, 5 * 60 * 1000);
}

export function stopImapSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('[imap-sync] Stopped IMAP Sync service');
  }
}
