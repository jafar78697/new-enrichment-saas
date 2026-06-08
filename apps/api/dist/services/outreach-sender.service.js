"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutreachSenderService = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const axios_1 = __importDefault(require("axios"));
class OutreachSenderService {
    db;
    constructor(db) {
        this.db = db;
    }
    /**
     * Processes the pending email outreach queue.
     * Can be triggered via cron or BullMQ.
     */
    async processQueue() {
        try {
            // Fetch up to 20 pending emails
            const { rows: pendingLogs } = await this.db.query(`
        SELECT ol.id, ol.tenant_id, ol.campaign_id, ol.lead_id, 
               oc.subject as campaign_subject, oc.body as campaign_body,
               er.primary_email, er.company_name, er.industry_guess, er.one_line_pitch
        FROM outreach_logs ol
        JOIN outreach_campaigns oc ON ol.campaign_id = oc.id
        JOIN enrichment_results er ON ol.lead_id = er.id
        WHERE ol.status = 'pending' AND ol.channel = 'email'
        LIMIT 20
      `);
            for (const log of pendingLogs) {
                if (!log.primary_email) {
                    await this.markLogFailed(log.id, 'No email address found for lead.');
                    continue;
                }
                // Get an available sending account for this tenant
                const account = await this.getAvailableAccount(log.tenant_id);
                if (!account) {
                    console.log(`[Outreach Sender] No available accounts for tenant ${log.tenant_id}`);
                    break; // Stop processing for this tenant right now
                }
                // Generate personalized email content
                const { subject, body } = await this.generateEmailContent(log, log.campaign_subject, log.campaign_body);
                // Attach tracking pixel
                const trackingPixel = `<img src="https://app.jentoai.pro/api/outreach/track?log_id=${log.id}" width="1" height="1" style="display:none;" />`;
                const finalHtml = body.replace(/\n/g, '<br>') + trackingPixel;
                // Send Email
                try {
                    const transporter = nodemailer_1.default.createTransport({
                        host: 'smtp.gmail.com',
                        port: 465,
                        secure: true,
                        auth: {
                            user: account.email,
                            pass: account.app_password,
                        },
                    });
                    const info = await transporter.sendMail({
                        from: account.email,
                        to: log.primary_email,
                        subject: subject,
                        html: finalHtml,
                    });
                    // Mark as sent
                    await this.db.query(`
            UPDATE outreach_logs 
            SET status = 'sent', sent_subject = $1, sent_body = $2, 
                account_id = $3, msg_id = $4, sent_at = now()
            WHERE id = $5
          `, [subject, body, account.id, info.messageId, log.id]);
                    // Increment sent count
                    await this.db.query(`
            UPDATE outreach_accounts SET sent_today = sent_today + 1 WHERE id = $1
          `, [account.id]);
                }
                catch (sendError) {
                    console.error(`[Outreach Sender] Failed to send email to ${log.primary_email}`, sendError);
                    await this.markLogFailed(log.id, sendError.message);
                }
            }
        }
        catch (error) {
            console.error('[Outreach Sender] Global queue error:', error);
        }
    }
    async getAvailableAccount(tenantId) {
        const { rows } = await this.db.query(`
      SELECT id, email, app_password 
      FROM outreach_accounts 
      WHERE tenant_id = $1 AND is_active = true AND status = 'ok' 
        AND sent_today < daily_limit
      ORDER BY sent_today ASC
      LIMIT 1
    `, [tenantId]);
        return rows.length > 0 ? rows[0] : null;
    }
    async markLogFailed(logId, errorMsg) {
        await this.db.query(`
      UPDATE outreach_logs 
      SET status = 'failed', error_message = $1 
      WHERE id = $2
    `, [errorMsg, logId]);
    }
    async generateEmailContent(leadData, baseSubject, baseBody) {
        // If the body contains [AI_PERSONALIZE], we call OpenAI
        if (baseBody.includes('[AI_PERSONALIZE]') || baseSubject.includes('[AI_PERSONALIZE]')) {
            try {
                const apiKey = process.env.OPENAI_API_KEY;
                if (!apiKey)
                    throw new Error("OPENAI_API_KEY is missing");
                const prompt = `
          You are writing a cold outreach email.
          Company: ${leadData.company_name || 'Unknown'}
          Industry: ${leadData.industry_guess || 'Unknown'}
          Context: ${leadData.one_line_pitch || 'Unknown'}
          
          Base Subject: ${baseSubject}
          Base Body: ${baseBody}
          
          Please rewrite the email and subject to be highly personalized based on the company data.
          Return ONLY a JSON object with two keys: "subject" and "body".
        `;
                const response = await axios_1.default.post('https://api.openai.com/v1/chat/completions', {
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: prompt }],
                    response_format: { type: "json_object" },
                    temperature: 0.7
                }, { headers: { Authorization: `Bearer ${apiKey}` } });
                const result = JSON.parse(response.data.choices[0].message.content);
                return {
                    subject: result.subject || baseSubject.replace('[AI_PERSONALIZE]', ''),
                    body: result.body || baseBody.replace('[AI_PERSONALIZE]', '')
                };
            }
            catch (err) {
                console.error('[Outreach Sender] AI Generation failed, falling back to base templates', err);
            }
        }
        // Fallback: simple text replacement
        let subject = baseSubject.replace(/{company}/ig, leadData.company_name || 'your company');
        let body = baseBody.replace(/{company}/ig, leadData.company_name || 'your company');
        return { subject, body };
    }
}
exports.OutreachSenderService = OutreachSenderService;
//# sourceMappingURL=outreach-sender.service.js.map