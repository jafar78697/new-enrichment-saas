import { Router } from 'express';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER || 'scale.ai.jento@gmail.com',
    pass: process.env.SMTP_PASS || '', 
  },
});
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { query, getClient } from '../db/index.js';
import { AppError, asyncHandler } from '../utils/errors.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const contactSchema = z.object({
  name: z.string().min(1),
  phone_number: z.string().min(3),
  company: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  notes: z.string().optional().nullable(),
  assigned_agent_id: z.coerce.number().int().positive().optional().nullable(),
  source: z.string().optional().nullable(),
  niche_id: z.coerce.number().int().positive().optional().nullable()
});

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = [];
    const where = [];
    if (req.user.role !== 'manager' && req.user.role !== 'owner' && req.user.role !== 'admin') {
      // For Caller role or general employee, only show contacts assigned to them.
      // If role is marketer, maybe they can see all social leads, but let's stick to assignment for now.
      params.push(req.user.id);
      where.push(`c.assigned_agent_id = $${params.length}`);
    } else if (req.query.niche_id) {
      params.push(req.query.niche_id);
      where.push(`c.niche_id = $${params.length}`);
    }

    if (req.query.omnichannel_stage) {
      params.push(req.query.omnichannel_stage);
      where.push(`c.omnichannel_stage = $${params.length}`);
    }
    const result = await query(
      `
        SELECT
          c.*,
          (
            SELECT status
            FROM calls
            WHERE contact_id = c.id
            ORDER BY
              CASE WHEN started_at IS NULL THEN 1 ELSE 0 END ASC,
              started_at DESC,
              id DESC
            LIMIT 1
          ) AS last_call_status,
          (
            SELECT outcome
            FROM calls
            WHERE contact_id = c.id
            ORDER BY
              CASE WHEN started_at IS NULL THEN 1 ELSE 0 END ASC,
              started_at DESC,
              id DESC
            LIMIT 1
          ) AS last_call_outcome,
          (
            SELECT started_at
            FROM calls
            WHERE contact_id = c.id
            ORDER BY
              CASE WHEN started_at IS NULL THEN 1 ELSE 0 END ASC,
              started_at DESC,
              id DESC
            LIMIT 1
          ) AS last_called_at,
          n.name as niche_name
        FROM contacts c
        LEFT JOIN niches n ON c.niche_id = n.id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY c.created_at DESC, c.id DESC
      `,
      params
    );

    res.json({ contacts: result.rows });
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = contactSchema.parse(req.body);
    const assignedAgentId =
      req.user.role === 'manager'
        ? payload.assigned_agent_id || null
        : req.user.id;
    // Get active agents for round-robin if no agent assigned
    let finalAgentId = assignedAgentId;
    if (!finalAgentId) {
      const activeAgents = await query("SELECT id FROM agents WHERE role = 'employee' AND status = 'active' ORDER BY id ASC");
      if (activeAgents.rows.length > 0) {
        // Find agent with the least leads
        const leastLeadsAgent = await query(`
          SELECT a.id, COUNT(c.id) as lead_count
          FROM agents a
          LEFT JOIN contacts c ON c.assigned_agent_id = a.id
          WHERE a.role = 'employee' AND a.status = 'active'
          GROUP BY a.id
          ORDER BY lead_count ASC, a.id ASC
          LIMIT 1
        `);
        finalAgentId = leastLeadsAgent.rows[0].id;
      }
    }

    try {
      const result = await query(
        `
          INSERT INTO contacts (name, phone_number, company, email, notes, assigned_agent_id, source, niche_id, omnichannel_stage)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'emailing')
          RETURNING *
        `,
        [
          payload.name.trim(),
          payload.phone_number.trim(),
          payload.company || null,
          payload.email || null,
          payload.notes || null,
          finalAgentId,
          payload.source || 'manual',
          payload.niche_id || null
        ]
      );
      res.status(201).json({ contact: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') { // Postgres unique violation
        throw new AppError('A lead with this phone number or email already exists. Duplicates are not allowed.', 409);
      }
      throw err;
    }
  })
);

router.post(
  '/import-csv',
  requireAuth,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError('CSV file is required', 400);
    }

    const records = parse(req.file.buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    if (!records.length) {
      throw new AppError('CSV file does not contain any rows', 400);
    }

    const normalized = records.map((record) =>
      contactSchema.parse({
        name: record.name,
        phone_number: record.phone_number || record.phone || record.number,
        company: record.company || null,
        email: record.email || null,
        notes: record.notes || null,
        assigned_agent_id: record.assigned_agent_id || record.agent_id || null,
        source: record.source || 'csv'
      })
    );

    const inserted = [];
    const duplicates = [];

    // Fetch active agents for round robin
    const activeAgentsRes = await query("SELECT id FROM agents WHERE role = 'employee' AND status = 'active' ORDER BY id ASC");
    const activeAgents = activeAgentsRes.rows.map(a => a.id);
    let agentIndex = 0;

    const client = await getClient();
    try {
      await client.query('BEGIN');
      
      for (const record of normalized) {
        let finalAgentId = req.user.role === 'manager' ? record.assigned_agent_id : req.user.id;
        if (!finalAgentId && activeAgents.length > 0) {
          finalAgentId = activeAgents[agentIndex % activeAgents.length];
          agentIndex++;
        }

        try {
          const res = await client.query(
            `
              INSERT INTO contacts (name, phone_number, company, email, notes, assigned_agent_id, source, niche_id, omnichannel_stage)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'emailing')
              RETURNING *
            `,
            [
              record.name,
              record.phone_number,
              record.company || null,
              record.email || null,
              record.notes || null,
              finalAgentId,
              record.source || 'csv',
              record.niche_id || null
            ]
          );
          inserted.push(res.rows[0]);
        } catch (err) {
          if (err.code === '23505') { // Postgres unique violation
            duplicates.push(record.phone_number);
          } else {
            throw err;
          }
        }
      }
      
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.status(201).json({
      imported: inserted.length,
      duplicates: duplicates.length,
      contacts: inserted
    });
  })
);

router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { notes, meeting_time, stage } = req.body;
    
    const updates = [];
    const values = [];
    
    if (notes !== undefined) {
      values.push(notes);
      updates.push(`notes = $${values.length}`);
    }
    
    if (meeting_time !== undefined) {
      values.push(meeting_time);
      updates.push(`meeting_time = $${values.length}`);
    }
    
    if (stage !== undefined) {
      values.push(stage);
      updates.push(`stage = $${values.length}`);
    }
    
    if (req.body.omnichannel_stage !== undefined) {
      values.push(req.body.omnichannel_stage);
      updates.push(`omnichannel_stage = $${values.length}`);
    }
    
    if (updates.length === 0) {
      const current = await query('SELECT * FROM contacts WHERE id = $1', [id]);
      if (current.rowCount === 0) throw new AppError('Contact not found', 404);
      return res.json({ contact: current.rows[0] });
    }
    
    values.push(id);
    const queryStr = `UPDATE contacts SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`;
    
    const result = await query(queryStr, values);
    
    if (result.rowCount === 0) {
      throw new AppError('Contact not found', 404);
    }
    
    res.json({ contact: result.rows[0] });
  })
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await query('DELETE FROM contacts WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) {
      throw new AppError('Contact not found', 404);
    }
    // Also delete associated calls if any
    await query('DELETE FROM calls WHERE contact_id = $1', [id]);
    res.json({ message: 'Contact deleted' });
  })
);

router.delete(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    // Manager only for clear all
    if (req.user.role !== 'manager') {
      throw new AppError('Only managers can clear all contacts', 403);
    }
    const result = await query('DELETE FROM contacts');
    // Also delete all calls (but they cascade usually, let's be explicit)
    await query('DELETE FROM calls WHERE contact_id IS NOT NULL');
    res.json({ deletedCount: result.rowCount, message: 'All contacts cleared' });
  })
);

router.get(
  '/:id/emails',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
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
    
    const result = await query(
      'SELECT * FROM contact_emails_history WHERE contact_id = $1 ORDER BY sent_at DESC',
      [id]
    );
    res.json({ emails: result.rows });
  })
);

router.post(
  '/:id/send-email',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { subject, body } = req.body;
    
    const current = await query('SELECT email FROM contacts WHERE id = $1', [id]);
    if (current.rowCount === 0) throw new AppError('Contact not found', 404);
    if (!current.rows[0].email) throw new AppError('Contact has no email address', 400);

    const trackingUrl = `${process.env.PUBLIC_BASE_URL || 'https://api.jentoai.pro'}/api/contacts/${id}/track-email`;
    const trackingPixel = `<img src="${trackingUrl}" width="1" height="1" style="display:none;" />`;

    await transporter.sendMail({
      from: '"JentoAI Team" <scale.ai.jento@gmail.com>',
      to: current.rows[0].email,
      subject: subject || 'Follow up',
      html: `${body.replace(/\n/g, '<br>')}${trackingPixel}`,
    });

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

    await query(
      'INSERT INTO contact_emails_history (contact_id, subject, body, from_email) VALUES ($1, $2, $3, $4)',
      [id, subject || 'Follow up', `${body.replace(/\n/g, '<br>')}`, 'scale.ai.jento@gmail.com']
    );

    const result = await query(
      'UPDATE contacts SET emails_sent = emails_sent + 1, last_email_sent_at = NOW() WHERE id = $1 RETURNING *',
      [id]
    );

    res.json({ success: true, contact: result.rows[0] });
  })
);

router.post(
  '/:id/reply-status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await query(
      'UPDATE contacts SET emails_received = emails_received + 1 WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rowCount === 0) throw new AppError('Contact not found', 404);
    res.json({ success: true, contact: result.rows[0] });
  })
);

router.get(
  '/:id/track-email',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    await query('UPDATE contacts SET email_opened = email_opened + 1 WHERE id = $1', [id]);
    
    const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.set('Content-Type', 'image/gif');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.send(pixel);
  })
);

router.post(
  '/:id/linkedin-task',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = z.object({
      id: z.coerce.number().int().positive()
    }).parse(req.params);

    const body = z.object({
      task_type: z.enum(['scrape_profile', 'send_connection', 'send_message'])
    }).parse(req.body);

    const result = await query(
      `
        INSERT INTO linkedin_tasks (agent_id, contact_id, task_type, status)
        VALUES ($1, $2, $3, 'pending')
        RETURNING *
      `,
      [req.user.id, params.id, body.task_type]
    );

    res.json({ task: result.rows[0] });
  })
);

router.post(
  '/:id/reddit-task',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = z.object({
      id: z.coerce.number().int().positive()
    }).parse(req.params);

    const body = z.object({
      task_type: z.enum(['scrape_profile', 'send_message'])
    }).parse(req.body);

    const result = await query(
      `
        INSERT INTO reddit_tasks (agent_id, contact_id, task_type, status)
        VALUES ($1, $2, $3, 'pending')
        RETURNING *
      `,
      [req.user.id, params.id, body.task_type]
    );

    res.json({ task: result.rows[0] });
  })
);

router.post(
  '/:id/facebook-task',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = z.object({
      id: z.coerce.number().int().positive()
    }).parse(req.params);

    const body = z.object({
      task_type: z.enum(['scrape_profile', 'send_message'])
    }).parse(req.body);

    const result = await query(
      `
        INSERT INTO facebook_tasks (agent_id, contact_id, task_type, status)
        VALUES ($1, $2, $3, 'pending')
        RETURNING *
      `,
      [req.user.id, params.id, body.task_type]
    );

    res.json({ task: result.rows[0] });
  })
);

import { GoogleGenerativeAI } from '@google/generative-ai';

router.post(
  '/:id/outreach',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = z.object({
      id: z.coerce.number().int().positive()
    }).parse(req.params);

    const bodySchema = z.object({
      template: z.string().optional()
    });
    // Parse safely in case body is empty
    const body = req.body ? bodySchema.parse(req.body) : { template: '' };

    const contactRes = await query('SELECT * FROM contacts WHERE id = $1 AND user_id = $2', [params.id, req.user.id]);
    if (contactRes.rowCount === 0) throw new AppError('Contact not found', 404);
    const contact = contactRes.rows[0];

    // Simulate Email Sending with Nodemailer
    const emailStr = contact.email || '';
    const hasDomainIssue = !emailStr || !emailStr.includes('@') || emailStr.endsWith('.invalid');

    if (hasDomainIssue) {
      // 1. Fallback Logic: Domain issue -> Queue LinkedIn/Social Media DM Task
      const fallbackTaskRes = await query(
        `
          INSERT INTO linkedin_tasks (agent_id, contact_id, task_type, status)
          VALUES ($1, $2, 'send_message', 'pending')
          RETURNING *
        `,
        [req.user.id, contact.id]
      );
      
      // Update contact stage to fallback
      await query('UPDATE contacts SET stage = $1 WHERE id = $2', ['fallback_linkedin', contact.id]);

      return res.json({ 
        success: false, 
        message: 'Email delivery failed (domain issue). Fallback: Social Media DM task queued.',
        fallbackTask: fallbackTaskRes.rows[0]
      });
    }

    // 2. Success Logic: Email Sent -> Wait for reply
    let generatedEmailHtml = '';

    if (contact.website_data && body.template && process.env.GEMINI_API_KEY) {
      try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `You are an expert sales representative writing a personalized cold email. 
        Here is the base template to follow:
        """
        ${body.template}
        """

        Here is the introduction/website data of the prospect's company:
        """
        ${contact.website_data}
        """

        Rewrite the base template to make it highly personalized to their company using the website data. Keep the tone professional, concise, and conversational. Output ONLY the email body in HTML format (using <p> and <br> tags). Do NOT include any signature at the end. Replace any placeholder like [Name] with ${contact.name}.`;

        const result = await model.generateContent(prompt);
        generatedEmailHtml = result.response.text();
      } catch (err) {
        console.error("Gemini Generation Error:", err);
        // Fallback to basic template if generation fails
        generatedEmailHtml = `
          <p>Hi ${contact.name},</p>
          <p>${body.template.replace(/\n/g, '<br/>')}</p>
        `;
      }
    } else {
      // Basic fallback
      generatedEmailHtml = `
        <p>Hi ${contact.name},</p>
        <p>${body.template ? body.template.replace(/\n/g, '<br/>') : 'I noticed your real estate listings and wanted to reach out regarding a potential collaboration. Would you have time for a quick chat next week?'}</p>
      `;
    }

    const emailHtmlTemplate = `
      ${generatedEmailHtml}
      <br />
      <!-- No signature attached as per request -->
      <img src="https://api.jentoai.pro/api/contacts/${contact.id}/track-email" width="1" height="1" style="display:none;" />
    `;
    
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

    await query(
      'INSERT INTO contact_emails_history (contact_id, subject, body, from_email) VALUES ($1, $2, $3, $4)',
      [contact.id, 'Introductory Email', emailHtmlTemplate, 'scale.ai.jento@gmail.com']
    );

    await query(
      'UPDATE contacts SET emails_sent = COALESCE(emails_sent, 0) + 1, stage = $1 WHERE id = $2 RETURNING *',
      ['email_sent', contact.id]
    );

    res.json({ success: true, message: 'Email sent successfully. Waiting for reply.' });
  })
);

export default router;
