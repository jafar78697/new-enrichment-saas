// Auth routes — login, accept-invite, me.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db/index.js';
import { asyncHandler, AppError } from '../utils/errors.js';
import { signToken, requireAuth } from '../middleware/auth.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const row = db
      .prepare(
        'SELECT id, name, email, role, status, password_hash, twilio_identity, twilio_phone_number FROM agents WHERE LOWER(email) = LOWER(?)',
      )
      .get(email);
    if (!row) throw new AppError('Invalid credentials', 401);
    if (row.status === 'suspended') throw new AppError('Account is suspended', 403);
    if (!row.password_hash) throw new AppError('Please accept your invite first', 403);
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) throw new AppError('Invalid credentials', 401);

    db.prepare('UPDATE agents SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(row.id);
    const token = signToken(row);
    res.json({
      token,
      user: {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        status: row.status,
        twilio_identity: row.twilio_identity,
        twilio_phone_number: row.twilio_phone_number,
      },
    });
  }),
);

const acceptSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(6),
});

router.post(
  '/accept-invite',
  asyncHandler(async (req, res) => {
    const { token, password } = acceptSchema.parse(req.body);
    const row = db
      .prepare(
        'SELECT id, name, email, role, invite_expires_at FROM agents WHERE invite_token = ?',
      )
      .get(token);
    if (!row) throw new AppError('Invite not found or already used', 404);
    if (row.invite_expires_at && new Date(row.invite_expires_at).getTime() < Date.now()) {
      throw new AppError('Invite expired', 410);
    }
    const hash = await bcrypt.hash(password, 10);
    db.prepare(
      `UPDATE agents
        SET password_hash = ?,
            invite_accepted_at = CURRENT_TIMESTAMP,
            invite_token = NULL,
            invite_expires_at = NULL,
            status = 'active',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
    ).run(hash, row.id);
    const fresh = db
      .prepare('SELECT id, name, email, role, status, twilio_identity, twilio_phone_number FROM agents WHERE id = ?')
      .get(row.id);
    const jwtToken = signToken(fresh);
    res.json({ token: jwtToken, user: fresh });
  }),
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  }),
);

// One-time bootstrap: creates the FIRST manager when no active manager exists yet.
// After the first manager is set, this endpoint refuses all subsequent calls.
const bootstrapSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(6),
});

router.get(
  '/bootstrap-status',
  asyncHandler(async (_req, res) => {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS n FROM agents
         WHERE role = 'manager' AND status = 'active' AND password_hash IS NOT NULL`,
      )
      .get();
    res.json({ needsBootstrap: (row?.n || 0) === 0 });
  }),
);

router.post(
  '/bootstrap-manager',
  asyncHandler(async (req, res) => {
    const existing = db
      .prepare(
        `SELECT COUNT(*) AS n FROM agents
         WHERE role = 'manager' AND status = 'active' AND password_hash IS NOT NULL`,
      )
      .get();
    if ((existing?.n || 0) > 0) {
      throw new AppError('Bootstrap already completed', 409);
    }
    const { name, email, password } = bootstrapSchema.parse(req.body);
    const hash = await bcrypt.hash(password, 10);
    const row = db.prepare('SELECT id FROM agents WHERE LOWER(email) = LOWER(?)').get(email);
    let agentId;
    if (row) {
      db.prepare(
        `UPDATE agents
           SET name = ?, password_hash = ?, role = 'manager', status = 'active',
               invite_token = NULL, invite_expires_at = NULL,
               invite_accepted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).run(name, hash, row.id);
      agentId = row.id;
    } else {
      const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      let identity = base || `manager_${Date.now()}`;
      let suffix = 1;
      while (db.prepare('SELECT id FROM agents WHERE twilio_identity = ?').get(identity)) {
        identity = `${base}_${suffix++}`;
      }
      const result = db
        .prepare(
          `INSERT INTO agents (name, email, twilio_identity, role, status, password_hash, is_available, invite_accepted_at)
           VALUES (?, ?, ?, 'manager', 'active', ?, 1, CURRENT_TIMESTAMP)`,
        )
        .run(name, email, identity, hash);
      agentId = result.lastInsertRowid;
    }
    const fresh = db
      .prepare('SELECT id, name, email, role, status, twilio_identity, twilio_phone_number FROM agents WHERE id = ?')
      .get(agentId);
    const jwtToken = signToken(fresh);
    res.json({ token: jwtToken, user: fresh });
  }),
);

export default router;
