"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutreachImapService = void 0;
const imap_simple_1 = __importDefault(require("imap-simple"));
const mailparser_1 = require("mailparser");
class OutreachImapService {
    db;
    constructor(db) {
        this.db = db;
    }
    /**
     * Syncs replies from all active IMAP accounts.
     * This should be called via a cron job every 15 minutes.
     */
    async syncReplies() {
        try {
            // 1. Fetch all active outreach accounts that have a password
            const { rows: accounts } = await this.db.query(`
        SELECT * FROM outreach_accounts 
        WHERE is_active = true AND status = 'ok' AND app_password IS NOT NULL
      `);
            for (const account of accounts) {
                await this.syncAccount(account);
            }
        }
        catch (error) {
            console.error('[IMAP Sync] Global error:', error);
        }
    }
    async syncAccount(account) {
        let connection = null;
        try {
            const config = {
                imap: {
                    user: account.email,
                    password: account.app_password,
                    host: 'imap.gmail.com', // Defaulting to gmail for now as per legacy system
                    port: 993,
                    tls: true,
                    authTimeout: 30000,
                },
            };
            connection = await imap_simple_1.default.connect(config);
            await connection.openBox('INBOX');
            // Search for emails from the last 2 days
            const twoDaysAgo = new Date();
            twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
            const searchCriteria = ['UNSEEN', ['SINCE', twoDaysAgo.toISOString()]];
            const fetchOptions = {
                bodies: ['HEADER', 'TEXT', ''],
                markSeen: false, // We leave it as unseen in Gmail so the user can still see it in their normal inbox if they want
            };
            const messages = await connection.search(searchCriteria, fetchOptions);
            for (const item of messages) {
                const allPart = item.parts.find((p) => p.which === '');
                if (!allPart)
                    continue;
                const mail = await (0, mailparser_1.simpleParser)(allPart.body);
                const msgId = mail.messageId || String(item.attributes.uid);
                const inReplyTo = mail.inReplyTo || '';
                const fromEmail = Array.isArray(mail.from) ? mail.from[0]?.value[0]?.address : mail.from?.value[0]?.address || '';
                const toEmail = Array.isArray(mail.to) ? mail.to[0]?.value[0]?.address : mail.to?.value[0]?.address || account.email;
                const subject = mail.subject || '';
                const bodyText = mail.text || '';
                const bodyHtml = mail.html || '';
                // Check if message already exists in unified_inbox
                const { rowCount } = await this.db.query(`SELECT id FROM unified_inbox WHERE tenant_id = $1 AND msg_id = $2`, [account.tenant_id, msgId]);
                if (rowCount && rowCount > 0) {
                    continue; // Already processed
                }
                // Check if this reply matches an existing outreach_log
                // Match by In-Reply-To header OR by lead email address
                let leadId = null;
                let campaignId = null;
                // Try matching via In-Reply-To
                if (inReplyTo) {
                    const { rows: matchByHeaders } = await this.db.query(`SELECT lead_id, campaign_id, id FROM outreach_logs 
             WHERE tenant_id = $1 AND msg_id = $2 LIMIT 1`, [account.tenant_id, inReplyTo]);
                    if (matchByHeaders.length > 0) {
                        leadId = matchByHeaders[0].lead_id;
                        campaignId = matchByHeaders[0].campaign_id;
                    }
                }
                // If no match by header, try matching by sender email
                if (!leadId && fromEmail) {
                    const { rows: matchByEmail } = await this.db.query(`SELECT ol.lead_id, ol.campaign_id, ol.id
             FROM outreach_logs ol
             JOIN enrichment_results er ON er.id = ol.lead_id
             WHERE ol.tenant_id = $1 AND er.primary_email = $2 
             ORDER BY ol.created_at DESC LIMIT 1`, [account.tenant_id, fromEmail]);
                    if (matchByEmail.length > 0) {
                        leadId = matchByEmail[0].lead_id;
                        campaignId = matchByEmail[0].campaign_id;
                    }
                }
                // Insert into unified inbox
                await this.db.query(`INSERT INTO unified_inbox 
           (tenant_id, account_id, lead_id, msg_id, in_reply_to, from_email, to_email, subject, body_text, body_html, received_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (tenant_id, msg_id) DO NOTHING`, [
                    account.tenant_id, account.id, leadId, msgId, inReplyTo,
                    fromEmail, toEmail, subject, bodyText, bodyHtml, mail.date || new Date()
                ]);
                // If matched to a lead, update the outreach_logs status to "replied"
                if (leadId) {
                    await this.db.query(`UPDATE outreach_logs 
             SET status = 'replied', replied_at = now() 
             WHERE tenant_id = $1 AND lead_id = $2 AND campaign_id = $3`, [account.tenant_id, leadId, campaignId]);
                    // Also update the lead pipeline stage
                    await this.db.query(`UPDATE enrichment_results 
             SET lead_stage = 'replied' 
             WHERE id = $1 AND tenant_id = $2`, [leadId, account.tenant_id]);
                }
            }
        }
        catch (error) {
            console.error(`[IMAP Sync] Error syncing account ${account.email}:`, error);
            // Optional: Set status='error' on the account so the user knows they need to re-authenticate
        }
        finally {
            if (connection) {
                connection.end();
            }
        }
    }
}
exports.OutreachImapService = OutreachImapService;
//# sourceMappingURL=outreach-imap.service.js.map