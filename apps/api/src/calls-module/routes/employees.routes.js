// Employees + Twilio number provisioning routes (manager-only).
//
// New flow (no email):
//   1. Admin POSTs { name, email } → backend auto-generates a 16-char password,
//      bcrypt-hashes it, creates agent with status='active', and returns the
//      plain-text password ONCE in the response. The admin reads it to the
//      employee out-of-band (Slack, in person, etc).
//   2. Admin separately POSTs to /employees/:id/assign-number with either an
//      existing pool number or an areaCode for a fresh purchase.
//   3. Admin can call /reset-password to regenerate a new one-time password,
//      and /release-number to send a number back to the pool.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { query } from '../db/index.js';
import { asyncHandler, AppError } from '../utils/errors.js';
import { requireManager, requireManagerOrLeader } from '../middleware/auth.js';
import { twilioClient } from '../config/twilio.js';
import { CALLS_ENABLED } from '../config/env.js';
import {
  searchUsNumbers,
  purchaseNumber,
  releaseNumber,
} from '../services/twilio-numbers.service.js';

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────
function generateMemorablePassword() {
  // 16 chars, mix of upper/lower/digits — avoids ambiguous (0/O, 1/l/I).
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(16);
  let out = '';
  for (let i = 0; i < 16; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function slugifyIdentity(base, fallback) {
  const cleaned = String(base || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || fallback;
}

async function uniqueIdentity(name) {
  let identity = name.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
  
  while (true) {
    const res = await query('SELECT id FROM agents WHERE twilio_identity = $1', [identity]);
    if (res.rows.length === 0) break;
    identity = `${identity}_${crypto.randomBytes(2).toString('hex')}`;
  }
  return identity;
}

// ─── List employees with rollup stats ─────────────────────────────────
router.get(
  '/employees',
  requireManagerOrLeader,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT a.id, a.name, a.email, a.username, a.role, a.status, a.twilio_identity,
              a.twilio_phone_number, a.twilio_phone_sid, a.twilio_phone_area_code,
              a.twilio_phone_purchased_at, a.is_available,
              a.last_login_at, a.invite_accepted_at, a.created_at,
              COALESCE(stats.total_calls, 0) AS total_calls,
              COALESCE(stats.connected_calls, 0) AS connected_calls,
              COALESCE(stats.total_seconds, 0) AS total_seconds,
              COALESCE(stats.recordings_count, 0) AS recordings_count,
              COALESCE(today_calls_stats.today_calls, 0) AS today_calls,
              COALESCE(today_leads_stats.today_leads, 0) AS today_leads,
              GROUP_CONCAT(DISTINCT n.id) as niche_ids,
              GROUP_CONCAT(DISTINCT n.name) as niche_names,
              a.team_id,
              t.name as team_name
         FROM agents a
         LEFT JOIN teams t ON a.team_id = t.id
         LEFT JOIN employee_niches en ON en.agent_id = a.id
         LEFT JOIN niches n ON n.id = en.niche_id
         LEFT JOIN (
           SELECT agent_id,
                  COUNT(*) AS total_calls,
                  SUM(CASE WHEN outcome = 'connected' THEN 1 ELSE 0 END) AS connected_calls,
                  SUM(COALESCE(duration_seconds, 0)) AS total_seconds,
                  SUM(CASE WHEN recording_url IS NOT NULL AND recording_url != '' THEN 1 ELSE 0 END) AS recordings_count
             FROM calls
            GROUP BY agent_id
         ) stats ON stats.agent_id = a.id
         LEFT JOIN (
           SELECT agent_id, COUNT(*) AS today_calls
             FROM calls
            WHERE date(started_at, 'localtime') = date('now', 'localtime')
            GROUP BY agent_id
         ) today_calls_stats ON today_calls_stats.agent_id = a.id
         LEFT JOIN (
           SELECT assigned_agent_id, COUNT(*) AS today_leads
             FROM contacts
            WHERE date(created_at, 'localtime') = date('now', 'localtime')
            GROUP BY assigned_agent_id
         ) today_leads_stats ON today_leads_stats.assigned_agent_id = a.id
        WHERE a.role IN ('employee', 'team_leader')
        GROUP BY a.id
        ORDER BY a.created_at DESC`,
      []
    );
    
    let rowsToReturn = rows;
    const myTeamRes = await query('SELECT id FROM teams WHERE leader_id = $1', [req.user.id]);
    const myTeam = myTeamRes.rows[0];
    if (myTeam) {
      rowsToReturn = rows.filter(r => r.team_id === myTeam.id);
    } else if (req.user.role === 'team_leader') {
      rowsToReturn = [];
    }
    
    const employees = rowsToReturn.map(row => {
      const niches = [];
      if (row.niche_ids && row.niche_names) {
        const ids = row.niche_ids.split(',').map(Number);
        const names = row.niche_names.split(',');
        ids.forEach((id, i) => {
          niches.push({ id, name: names[i] });
        });
      }
      return {
        ...row,
        assigned_niches: niches,
        niche_ids: undefined,
        niche_names: undefined,
      };
    });
    
    res.json({ employees });
  }),
);

// ─── Search available US numbers (live Twilio) ───────────────────────
router.get(
  '/twilio/numbers/search',
  requireManager,
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        areaCode: z.string().optional(),
        contains: z.string().optional(),
        limit: z.coerce.number().min(1).max(25).optional(),
      })
      .parse(req.query);
    const numbers = await searchUsNumbers(q);
    res.json({ numbers });
  }),
);

// ─── Pool: numbers we own, joined with current assignment ─────────────
router.get(
  '/twilio/numbers/pool',
  requireManager,
  asyncHandler(async (_req, res) => {
    if (!CALLS_ENABLED || !twilioClient) {
      return res.json({ numbers: [], assigned: [] });
    }
    const owned = await twilioClient.incomingPhoneNumbers.list({ limit: 100 });
    const { rows: assignmentRows } = await query(
      `SELECT id AS agent_id, name, email, twilio_phone_number, twilio_phone_sid
         FROM agents
        WHERE twilio_phone_sid IS NOT NULL`,
      []
    );
    const bySid = new Map(assignmentRows.map((r) => [r.twilio_phone_sid, r]));
    const numbers = owned.map((n) => {
      const a = bySid.get(n.sid);
      return {
        sid: n.sid,
        phoneNumber: n.phoneNumber,
        friendlyName: n.friendlyName,
        assigned: a
          ? { agent_id: a.agent_id, name: a.name, email: a.email }
          : null,
      };
    });
    res.json({ numbers });
  }),
);

// ─── Create employee — auto-generates password (no email) ─────────────
const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  username: z.string().trim().min(1).max(120),
  nicheIds: z.array(z.number().int().positive()).optional(),
  team_id: z.number().int().positive().nullable().optional(),
});

router.post(
  '/employees',
  requireManager,
  asyncHandler(async (req, res) => {
    const payload = createSchema.parse(req.body);
    const { rows: existing } = await query('SELECT id FROM agents WHERE LOWER(username) = LOWER($1)', [payload.username]);
    if (existing.length > 0) throw new AppError('An employee with that username already exists', 409);

    const tempPassword = generateMemorablePassword();
    const hash = await bcrypt.hash(tempPassword, 10);
    const identity = await uniqueIdentity(payload.username);
    const dummyEmail = `${payload.username.toLowerCase().replace(/[^a-z0-9]+/g, '_')}@employee.local`;

    const result = await query(
      `INSERT INTO agents
        (name, username, email, twilio_identity, role, status, password_hash,
         is_available, invite_accepted_at, team_id)
       VALUES ($1, $2, $3, $4, 'employee', 'active', $5, 0, CURRENT_TIMESTAMP, $6)
       RETURNING id`,
      [payload.name, payload.username, dummyEmail, identity, hash, payload.team_id || null]
    );
    const newId = result.rows[0].id;

    if (payload.nicheIds && payload.nicheIds.length > 0) {
      for (const nicheId of payload.nicheIds) {
        await query('INSERT INTO employee_niches (agent_id, niche_id) VALUES ($1, $2)', [newId, nicheId]);
      }
    }

    const { rows: fresh } = await query(
      `SELECT id, name, email, username, role, status, twilio_identity,
              twilio_phone_number, twilio_phone_sid, twilio_phone_area_code,
              twilio_phone_purchased_at, is_available, last_login_at,
              invite_accepted_at, created_at
         FROM agents WHERE id = $1`,
      [newId]
    );
    
    const { rows: assignedNiches } = await query(
      `SELECT n.id, n.name
         FROM niches n
         JOIN employee_niches en ON en.niche_id = n.id
        WHERE en.agent_id = $1`,
      [newId]
    );
    
    res.status(201).json({
      employee: {
        ...fresh[0],
        assigned_niches: assignedNiches,
      },
      generatedPassword: tempPassword,
    });
  }),
);

// ─── Reset password (admin) — generates a fresh one-time password ─────
router.post(
  '/employees/:id/reset-password',
  requireManager,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { rows: employees } = await query('SELECT id, name, username FROM agents WHERE id = $1 AND role = $2', [id, 'employee']);
    if (employees.length === 0) throw new AppError('Employee not found', 404);

    const newPassword = generateMemorablePassword();
    const hash = await bcrypt.hash(newPassword, 10);
    await query(
      `UPDATE agents
          SET password_hash = $1, status = 'active',
              invite_token = NULL, invite_expires_at = NULL,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $2`,
      [hash, id]
    );

    res.json({ ok: true, generatedPassword: newPassword });
  }),
);

// ─── Assign / reassign a Twilio number ────────────────────────────────
const assignSchema = z
  .object({
    phoneNumber: z.string().optional(),
    twilioSid: z.string().optional(),
    areaCode: z.string().optional(),
  })
  .refine((v) => v.phoneNumber || v.twilioSid || v.areaCode, {
    message: 'Provide phoneNumber, twilioSid, or areaCode',
  });

router.post(
  '/employees/:id/assign-number',
  requireManager,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { rows: employees } = await query('SELECT id, name, twilio_phone_sid FROM agents WHERE id = $1 AND role = $2', [id, 'employee']);
    const emp = employees[0];
    if (!emp) throw new AppError('Employee not found', 404);
    const { phoneNumber, twilioSid, areaCode } = assignSchema.parse(req.body);

    if (!CALLS_ENABLED || !twilioClient) {
      throw new AppError('Twilio calling is not configured on this server', 503);
    }

    if (emp.twilio_phone_sid) {
      throw new AppError(
        'Employee already has a number. Release the current one before reassigning.',
        409,
      );
    }

    let chosen = null;

    if (phoneNumber || twilioSid) {
      const owned = await twilioClient.incomingPhoneNumbers.list({ limit: 100 });
      const match = owned.find((n) =>
        twilioSid ? n.sid === twilioSid : n.phoneNumber === phoneNumber,
      );
      if (!match) throw new AppError('That number is not in your Twilio account', 404);
      const { rows: conflicts } = await query('SELECT id, name FROM agents WHERE twilio_phone_sid = $1 AND id != $2', [match.sid, id]);
      if (conflicts.length > 0) {
        throw new AppError(`That number is already assigned to ${conflicts[0].name}`, 409);
      }
      chosen = {
        sid: match.sid,
        phoneNumber: match.phoneNumber,
        areaCode: areaCode || null,
      };
    } else {
      const candidates = await searchUsNumbers({ areaCode, limit: 1 });
      if (candidates.length === 0) {
        throw new AppError(
          areaCode
            ? `No US numbers available in area code ${areaCode}`
            : 'No US numbers available right now',
          502,
        );
      }
      const purchased = await purchaseNumber({
        phoneNumber: candidates[0].phoneNumber,
        friendlyName: `JentoAI · ${emp.name}`,
      });
      chosen = {
        sid: purchased.sid,
        phoneNumber: purchased.phoneNumber,
        areaCode: areaCode || null,
      };
    }

    await query(
      `UPDATE agents
          SET twilio_phone_number = $1, twilio_phone_sid = $2,
              twilio_phone_area_code = $3, twilio_phone_purchased_at = CURRENT_TIMESTAMP,
              is_available = 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $4`,
      [chosen.phoneNumber, chosen.sid, chosen.areaCode, id]
    );

    const { rows: fresh } = await query(
      `SELECT id, name, email, username, role, status, twilio_identity,
              twilio_phone_number, twilio_phone_sid, twilio_phone_area_code,
              twilio_phone_purchased_at, is_available, last_login_at,
              invite_accepted_at, created_at
         FROM agents WHERE id = $1`,
      [id]
    );
    res.json({ employee: fresh[0] });
  }),
);

// ─── Release a Twilio number (back to pool, keeps DID purchased) ──────
router.post(
  '/employees/:id/release-number',
  requireManager,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { rows: employees } = await query(
      'SELECT id, twilio_phone_number, twilio_phone_sid FROM agents WHERE id = $1 AND role = $2',
      [id, 'employee']
    );
    const row = employees[0];
    if (!row) throw new AppError('Employee not found', 404);
    if (!row.twilio_phone_sid) throw new AppError('Employee has no number assigned', 400);

    await query(
      `UPDATE agents
          SET twilio_phone_number = NULL, twilio_phone_sid = NULL,
              twilio_phone_area_code = NULL, twilio_phone_purchased_at = NULL,
              is_available = 0, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [id]
    );

    res.json({
      ok: true,
      released: {
        phoneNumber: row.twilio_phone_number,
        sid: row.twilio_phone_sid,
      },
    });
  }),
);

// ─── Suspend / reactivate ─────────────────────────────────────────────
router.patch(
  '/employees/:id/status',
  requireManager,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { status } = z.object({ status: z.enum(['active', 'suspended']) }).parse(req.body);
    const result = await query('UPDATE agents SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND role = $3', [status, id, 'employee']);
    if (result.rowCount === 0) throw new AppError('Employee not found', 404);
    res.json({ ok: true, status });
  }),
);

// ─── Delete employee (keeps Twilio number in pool, unassigned) ────────
router.delete(
  '/employees/:id',
  requireManager,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { rows: employees } = await query(
      'SELECT id, twilio_phone_number, twilio_phone_sid FROM agents WHERE id = $1 AND role = $2',
      [id, 'employee']
    );
    const row = employees[0];
    if (!row) throw new AppError('Employee not found', 404);

    await query('UPDATE calls SET agent_id = NULL WHERE agent_id = $1', [id]);
    await query('DELETE FROM agents WHERE id = $1', [id]);

    res.json({
      ok: true,
      numberReturnedToPool: row.twilio_phone_sid
        ? { phoneNumber: row.twilio_phone_number, sid: row.twilio_phone_sid }
        : null,
    });
  }),
);

// ─── Get employee hourly activity ─────────────────────────────────────
router.get(
  '/employees/:id/activity',
  requireManager,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const hours = Number(req.query.hours) || 24;
    
    const { rows: hourlyStats } = await query(
        `SELECT 
          to_char(started_at, 'YYYY-MM-DD HH24:00:00') as hour,
          COUNT(*) as total_calls,
          SUM(CASE WHEN outcome = 'connected' THEN 1 ELSE 0 END) as connected_calls,
          SUM(COALESCE(duration_seconds, 0)) as total_seconds,
          SUM(CASE WHEN recording_url IS NOT NULL AND recording_url != '' THEN 1 ELSE 0 END) as recordings
         FROM calls
         WHERE agent_id = $1
           AND started_at >= (NOW() - interval '1 hour' * $2)
         GROUP BY hour
         ORDER BY hour DESC`,
         [id, hours]
    );
    
    res.json({ activity: hourlyStats });
  }),
);

// ─── Get all employees summary (for team dashboard) ───────────────────
router.get(
  '/employees/summary',
  requireManager,
  asyncHandler(async (req, res) => {
    const hours = Number(req.query.hours) || 1;
    
    const { rows: summary } = await query(
        `SELECT 
          a.id, a.name, a.email, a.username, a.status, a.twilio_phone_number,
          a.last_login_at,
          COUNT(c.id) as calls_in_period,
          SUM(COALESCE(c.duration_seconds, 0)) as talk_time_in_period,
          MAX(c.started_at) as last_call_at,
          (SELECT COUNT(*) FROM employee_niches WHERE agent_id = a.id) as niche_count
         FROM agents a
         LEFT JOIN calls c ON c.agent_id = a.id 
           AND c.started_at >= (NOW() - interval '1 hour' * $1)
         WHERE a.role = 'employee'
         GROUP BY a.id
         ORDER BY a.name`,
         [hours]
    );
    
    res.json({ employees: summary });
  }),
);

export default router;
