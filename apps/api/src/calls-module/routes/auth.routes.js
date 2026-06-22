// Auth routes — login, accept-invite, me.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db/index.js';
import { asyncHandler, AppError } from '../utils/errors.js';
import { signToken, requireAuth } from '../middleware/auth.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().optional(),
  username: z.string().optional(),
  password: z.string().min(1),
}).refine(data => data.email || data.username, { message: 'Email or username is required' });

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, username, password } = loginSchema.parse(req.body);
    const identifier = username || email;
    const { rows: records } = await query(
      'SELECT id, name, email, username, role, status, password_hash, twilio_identity, twilio_phone_number FROM agents WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($2)',
      [identifier, identifier]
    );
    const row = records[0];
    if (!row) {
      console.log('LOGIN FAILED: User not found in DB');
      throw new AppError('Invalid credentials', 401);
    }
    if (row.status === 'suspended') {
      console.log('LOGIN FAILED: Account suspended');
      throw new AppError('Account is suspended', 403);
    }
    if (!row.password_hash) {
      console.log('LOGIN FAILED: No password hash (invite not accepted)');
      throw new AppError('Please accept your invite first', 403);
    }
    
    console.log('Comparing password of length', password.length, 'with hash of length', row.password_hash.length);
    const startCompare = Date.now();
    const ok = await bcrypt.compare(password, row.password_hash);
    console.log('bcrypt.compare took', Date.now() - startCompare, 'ms. Result:', ok);
    
    if (!ok) {
      console.log('LOGIN FAILED: bcrypt compare returned false');
      throw new AppError('Invalid credentials', 401);
    }

    await query('UPDATE agents SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [row.id]);
    const token = signToken(row);
    const { rows: modulesRows } = await query('SELECT module FROM agent_modules WHERE agent_id = $1', [row.id]);
    const assignedModules = modulesRows.map(r => r.module);
    res.json({
      token,
      user: {
        id: row.id,
        name: row.name,
        email: row.email,
        username: row.username,
        role: row.role,
        status: row.status,
        twilio_identity: row.twilio_identity,
        twilio_phone_number: row.twilio_phone_number,
        assigned_modules: assignedModules,
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
    const { rows: records } = await query(
      'SELECT id, name, email, role, invite_expires_at FROM agents WHERE invite_token = $1',
      [token]
    );
    const row = records[0];
    if (!row) throw new AppError('Invite not found or already used', 404);
    if (row.invite_expires_at && new Date(row.invite_expires_at).getTime() < Date.now()) {
      throw new AppError('Invite expired', 410);
    }
    const hash = await bcrypt.hash(password, 10);
    await query(`
      UPDATE agents
      SET password_hash = $1,
          invite_accepted_at = CURRENT_TIMESTAMP,
          invite_token = NULL,
          invite_expires_at = NULL,
          status = 'active',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [hash, row.id]);

    const { rows: freshRows } = await query(
      'SELECT id, name, email, role, status, twilio_identity, twilio_phone_number FROM agents WHERE id = $1',
      [row.id]
    );
    const fresh = freshRows[0];
    const jwtToken = signToken(fresh);
    res.json({
      token: jwtToken,
      user: {
        ...fresh,
        assigned_modules: [],
      }
    });
  }),
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    let assignedModules = [];
    if (req.user && (req.user.role === 'employee' || req.user.role === 'team_leader')) {
      const { rows: modulesRows } = await query('SELECT module FROM agent_modules WHERE agent_id = $1', [req.user.id]);
      assignedModules = modulesRows.map(r => r.module);
    }
    res.json({
      user: {
        ...req.user,
        assigned_modules: assignedModules,
      }
    });
  }),
);

router.get(
  '/me/dashboard',
  requireAuth,
  asyncHandler(async (req, res) => {
    const hours = Number(req.query.hours) || 24;
    const { rows: statsData } = await query(
        `SELECT 
          COUNT(c.id) as calls_in_period,
          SUM(COALESCE(c.duration_seconds, 0)) as talk_time_in_period,
          MAX(c.started_at) as last_call_at
         FROM calls c
         WHERE c.agent_id = $1
           AND c.started_at >= (NOW() - interval '1 hour' * $2)`,
        [req.user.id, hours]
    );
    const stats = statsData[0];

    res.json({ stats });
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
    const { rows: rowRows } = await query(
        `SELECT COUNT(*) AS n FROM agents
         WHERE role = 'manager' AND status = 'active' AND password_hash IS NOT NULL`
    );
    const row = rowRows[0];
    res.json({ needsBootstrap: (row?.n || 0) === 0 });
  }),
);

router.post(
  '/bootstrap-manager',
  asyncHandler(async (req, res) => {
    const { rows: existingRows } = await query(
        `SELECT COUNT(*) AS n FROM agents
         WHERE role = 'manager' AND status = 'active' AND password_hash IS NOT NULL`
    );
    const existing = existingRows[0];
    if ((existing?.n || 0) > 0) {
      throw new AppError('Bootstrap already completed', 409);
    }
    const { name, email, password } = bootstrapSchema.parse(req.body);
    const hash = await bcrypt.hash(password, 10);
    const { rows: rowRows } = await query('SELECT id FROM agents WHERE LOWER(email) = LOWER($1)', [email]);
    const row = rowRows[0];
    let agentId;
    if (row) {
      await query(`
        UPDATE agents 
        SET name = $1,
            password_hash = $2,
            role = 'manager',
            status = 'active',
            invite_token = NULL,
            invite_expires_at = NULL,
            invite_accepted_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [name, hash, row.id]);
      agentId = row.id;
    } else {
      const baseIdentity = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
      let identity = baseIdentity;
      
      while (true) {
        const { rows: res } = await query('SELECT id FROM agents WHERE twilio_identity = $1', [identity]);
        if (res.length === 0) break;
        identity = `${baseIdentity}_${crypto.randomBytes(2).toString('hex')}`;
      }
      const { rows: insertRows } = await query(
          `INSERT INTO agents (name, email, twilio_identity, role, status, password_hash, is_available, invite_accepted_at)
           VALUES ($1, $2, $3, 'manager', 'active', $4, true, CURRENT_TIMESTAMP) RETURNING id`,
           [name, email, identity, hash]
      );
      agentId = insertRows[0].id;
    }
    const { rows: freshRows } = await query('SELECT id, name, email, role, status, twilio_identity, twilio_phone_number FROM agents WHERE id = $1', [agentId]);
    const fresh = freshRows[0];
    const jwtToken = signToken(fresh);
    res.json({ token: jwtToken, user: fresh });
  }),
);

export default router;
