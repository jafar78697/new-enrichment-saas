import nodemailer from 'nodemailer';
import { Pool } from 'pg';
import axios from 'axios';

export class OutreachSenderService {
  constructor(private db: Pool) {}

  /**
   * Processes the pending email outreach queue.
   * Can be triggered via cron or BullMQ.
   */
  async processQueue() {
    try {
      console.log("[Outreach Sender] Starting processQueue...");
      let pendingLogs = [];
      try {
        const res = await this.db.query(`
          SELECT ol.id, ol.tenant_id, ol.campaign_id, ol.lead_id, 
                 oc.subject as campaign_subject, oc.body as campaign_body,
                 er.primary_email, er.company_name, er.industry_guess, er.one_line_pitch
          FROM outreach_logs ol
          JOIN outreach_campaigns oc ON ol.campaign_id::uuid = oc.id::uuid
          JOIN enrichment_results er ON ol.lead_id::uuid = er.id::uuid
          WHERE ol.status = 'pending' AND ol.channel = 'email' 
          LIMIT 20
        `);
        pendingLogs = res.rows;
      } catch (err: any) {
        console.error("[Outreach Sender] Error in SELECT pendingLogs query:", err.message);
        throw err;
      }

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

        // Attach tracking pixel and unsubscribe link
        const unsubscribeLink = `<br><br><p style="font-size:12px; color:#666; margin-top:20px;">If you no longer wish to receive these emails, you can <a href="${process.env.PUBLIC_BASE_URL || 'https://api.jentoai.pro'}/api/campaigns/unsubscribe?contact_id=${log.lead_id}">unsubscribe here</a>.</p>`;
        const trackingPixel = `<img src="${process.env.PUBLIC_BASE_URL || 'https://api.jentoai.pro'}/api/outreach/track?log_id=${log.id}" width="1" height="1" style="display:none;" />`;
        const finalHtml = body.replace(/\n/g, '<br>') + unsubscribeLink + trackingPixel;

        // Send Email
        try {
          const transporter = nodemailer.createTransport({
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
          try {
            await this.db.query(`
              UPDATE outreach_logs 
              SET status = 'sent', sent_subject = $1, sent_body = $2, 
                  account_id = $3, msg_id = $4, sent_at = now()
              WHERE id = $5
            `, [subject, body, account.id, info.messageId, log.id]);
          } catch (err: any) {
            console.error("[Outreach Sender] Error in UPDATE outreach_logs query:", err.message);
            throw err;
          }

          // Increment sent count
          try {
            await this.db.query(`
              UPDATE outreach_accounts SET sent_today = sent_today + 1 WHERE id = $1
            `, [account.id]);
          } catch (err: any) {
            console.error("[Outreach Sender] Error in UPDATE outreach_accounts query:", err.message);
            throw err;
          }

        } catch (sendError: any) {
          console.error(`[Outreach Sender] Failed to send email to ${log.primary_email}`, sendError);
          await this.markLogFailed(log.id, sendError.message);
        }
      }
    } catch (error: any) {
      console.error('[Outreach Sender] Global queue error:', error.message);
    }
  }

  private async getAvailableAccount(tenantId: string) {
    try {
      const { rows } = await this.db.query(`
        SELECT id, email, app_password 
        FROM outreach_accounts 
        WHERE tenant_id = $1::uuid AND is_active = true AND status = 'ok' 
          AND sent_today < daily_limit
        ORDER BY sent_today ASC
        LIMIT 1
      `, [tenantId]);
      return rows.length > 0 ? rows[0] : null;
    } catch (err: any) {
      console.error("[Outreach Sender] Error in getAvailableAccount query:", err.message);
      throw err;
    }
  }

  private async markLogFailed(logId: string, errorMsg: string) {
    try {
      await this.db.query(`
        UPDATE outreach_logs 
        SET status = 'failed', error_message = $1 
        WHERE id = $2::uuid
      `, [errorMsg, logId]);
    } catch (err: any) {
      console.error("[Outreach Sender] Error in markLogFailed query:", err.message);
      throw err;
    }
  }

  private async generateEmailContent(leadData: any, baseSubject: string, baseBody: string) {
    // If the body contains [AI_PERSONALIZE], we call OpenAI
    if (baseBody.includes('[AI_PERSONALIZE]') || baseSubject.includes('[AI_PERSONALIZE]')) {
      try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error("OPENAI_API_KEY is missing");

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

        const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0.7
          },
          { headers: { Authorization: `Bearer ${apiKey}` } }
        );

        const result = JSON.parse(response.data.choices[0].message.content);
        return {
          subject: result.subject || baseSubject.replace('[AI_PERSONALIZE]', ''),
          body: result.body || baseBody.replace('[AI_PERSONALIZE]', '')
        };
      } catch (err) {
        console.error('[Outreach Sender] AI Generation failed, falling back to base templates', err);
      }
    }

    // Fallback: simple text replacement
    let subject = baseSubject.replace(/{company}/ig, leadData.company_name || 'your company');
    let body = baseBody.replace(/{company}/ig, leadData.company_name || 'your company');
    
    return { subject, body };
  }
}
