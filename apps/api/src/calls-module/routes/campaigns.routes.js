import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { asyncHandler, AppError } from '../utils/errors.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/campaigns/track/:id  — 1x1 Tracking Pixel (Public)
router.get(
  '/track/:id',
  asyncHandler(async (req, res) => {
    const contact_id = parseInt(req.params.id);
    if (!isNaN(contact_id)) {
      // Mark as opened if not already
      await query(
        `UPDATE contacts 
         SET email_opened = COALESCE(email_opened, 0) + 1,
             stage = CASE WHEN stage = 'email_sent' THEN 'email_opened' ELSE stage END,
             updated_at = NOW()
         WHERE id = $1`,
        [contact_id]
      );
    }
    // Return 1x1 transparent GIF
    const pixel = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64'
    );
    res.set({
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.send(pixel);
  })
);

// GET /api/campaigns/unsubscribe (Public)
router.get(
  '/unsubscribe',
  asyncHandler(async (req, res) => {
    const contact_id = parseInt(req.query.contact_id);
    if (!contact_id || isNaN(contact_id)) {
      return res.status(400).send('Invalid unsubscribe link.');
    }

    await query(
      'UPDATE contacts SET unsubscribed = TRUE, stage = \'unsubscribed\', updated_at = NOW() WHERE id = $1',
      [contact_id]
    );

    res.type('html').send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Unsubscribed</title>
        <style>
          body { font-family: 'Inter', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f9fafb; margin: 0; }
          .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); text-align: center; }
          h1 { color: #111827; margin-bottom: 10px; }
          p { color: #6b7280; }
          .icon { font-size: 48px; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">✅</div>
          <h1>You have been unsubscribed</h1>
          <p>You will no longer receive automated emails from us.</p>
        </div>
      </body>
      </html>
    `);
  })
);


// GET /api/campaigns
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const channel = req.query.channel || 'email';
    const result = await query(
      `SELECT c.*, 
        COUNT(co.id) as total_leads,
        COUNT(co.id) FILTER (WHERE co.emails_sent > 0) as sent_leads
       FROM campaigns c
       LEFT JOIN contacts co ON co.campaign_id = c.id
       WHERE c.user_id = $1 AND c.channel = $2
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [req.user.id, channel]
    );
    res.json({ campaigns: result.rows });
  })
);
// GET /api/campaigns/replies
router.get(
  '/replies',
  requireAuth,
  asyncHandler(async (req, res) => {
    // Fetch inbound emails
    const { rows: replies } = await query(
      `SELECT h.id, h.subject, h.body, h.from_email, h.sent_at as received_at,
              c.name as contact_name, c.company as contact_company, c.email as contact_email
       FROM contact_emails_history h
       JOIN contacts c ON c.id = h.contact_id
       WHERE h.is_inbound = TRUE
       ORDER BY h.sent_at DESC
       LIMIT 100`
    );

    res.json({ replies });
  })
);


// POST /api/campaigns
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = z.object({
      name: z.string().min(1),
      base_template: z.string().min(1),
      send_time: z.string().default('09:00'),
      daily_limit: z.coerce.number().default(50),
      start_date: z.string().optional(),
      end_date: z.string().optional().nullable(),
      channel: z.enum(['email', 'linkedin', 'reddit']).default('email')
    }).parse(req.body);

    const result = await query(
      'INSERT INTO campaigns (name, base_template, send_time, daily_limit, start_date, end_date, channel, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [
        params.name, 
        params.base_template, 
        params.send_time, 
        params.daily_limit, 
        params.start_date || new Date().toISOString().split('T')[0], 
        params.end_date || null,
        params.channel,
        req.user.id
      ]
    );

    res.json({ campaign: result.rows[0] });
  })
);

// PATCH /api/campaigns/:id
router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = z.object({
      id: z.coerce.number()
    }).parse(req.params);

    const body = z.object({
      status: z.enum(['active', 'paused', 'completed'])
    }).parse(req.body);

    const result = await query(
      'UPDATE campaigns SET status = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *',
      [body.status, params.id, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json({ campaign: result.rows[0] });
  })
);

// POST /api/campaigns/:id/assign
router.post(
  '/:id/assign',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = z.object({
      id: z.coerce.number()
    }).parse(req.params);

    const body = z.object({
      contact_ids: z.array(z.number())
    }).parse(req.body);

    if (body.contact_ids.length === 0) {
      return res.json({ success: true, count: 0 });
    }

    // Assign multiple contacts to the campaign
    // Make sure they belong to the user
    const idsString = body.contact_ids.join(',');
    
    // In raw PG we need parameterized arrays
    const result = await query(
      'UPDATE contacts SET campaign_id = $1 WHERE id = ANY($2::int[]) AND user_id = $3 RETURNING id',
      [params.id, body.contact_ids, req.user.id]
    );

    res.json({ success: true, count: result.rowCount });
  })
);

export default router;
