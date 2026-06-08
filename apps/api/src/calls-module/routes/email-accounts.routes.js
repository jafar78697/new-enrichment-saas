import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import nodemailer from 'nodemailer';

const router = Router();
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// List email accounts
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const result = await query(
    'SELECT id, email, daily_limit, sent_today, status, day_reset, created_at FROM email_accounts WHERE user_id = $1 ORDER BY created_at DESC',
    [req.user.id]
  );
  res.json({ accounts: result.rows });
}));

// Add new email account
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const params = z.object({
    email: z.string().email(),
    app_password: z.string().min(1)
  }).parse(req.body);

  // Test the connection before saving
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: params.email,
        pass: params.app_password
      }
    });
    await transporter.verify();
  } catch (err) {
    return res.status(400).json({ error: 'Invalid credentials. Could not verify SMTP connection with Google.' });
  }

  try {
    const result = await query(
      'INSERT INTO email_accounts (email, app_password, user_id) VALUES ($1, $2, $3) RETURNING id, email, daily_limit, sent_today, status',
      [params.email, params.app_password, req.user.id]
    );
    res.json({ account: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') { // unique violation
      return res.status(400).json({ error: 'This email account is already connected.' });
    }
    throw err;
  }
}));

export default router;
