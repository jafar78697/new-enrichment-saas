import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
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

// Setup business_emails table dynamically
const initBusinessEmailsTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS business_emails (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      gmail_account_id INTEGER REFERENCES email_accounts(id) ON DELETE CASCADE,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);
};

// Get business emails for an account
router.get('/:id/business-emails', requireAuth, asyncHandler(async (req, res) => {
  await initBusinessEmailsTable();
  const result = await query(
    'SELECT * FROM business_emails WHERE gmail_account_id = $1 ORDER BY created_at ASC',
    [req.params.id]
  );
  res.json({ business_emails: result.rows });
}));

// Add business email
router.post('/:id/business-emails', requireAuth, asyncHandler(async (req, res) => {
  await initBusinessEmailsTable();
  const { email } = req.body;
  
  // Verify ownership of the gmail account
  const accCheck = await query('SELECT id FROM email_accounts WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (accCheck.rowCount === 0) return res.status(403).json({ error: 'Account not found' });

  const result = await query(
    'INSERT INTO business_emails (email, gmail_account_id) VALUES ($1, $2) RETURNING *',
    [email, req.params.id]
  );
  res.json({ business_email: result.rows[0] });
}));

// Delete business email
router.delete('/:id/business-emails/:business_id', requireAuth, asyncHandler(async (req, res) => {
  await initBusinessEmailsTable();
  const accCheck = await query('SELECT id FROM email_accounts WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (accCheck.rowCount === 0) return res.status(403).json({ error: 'Account not found' });

  await query('DELETE FROM business_emails WHERE id = $1 AND gmail_account_id = $2', [req.params.business_id, req.params.id]);
  res.json({ success: true });
}));

export default router;
