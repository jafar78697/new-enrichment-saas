// Employees + Twilio number provisioning routes (manager-only).
import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db/index.js';
import { asyncHandler, AppError } from '../utils/errors.js';
import { requireManager } from '../middleware/auth.js';
import { env } from '../config/env.js';
import { sendMail, buildInviteEmail } from '../services/email.service.js';
import {
  searchUsNumbers,
  purchaseNumber,
  releaseNumber,
} from '../services/twilio-numbers.service.js';

const router = Router();

// ─── List employees with rollup stats ─────────────────────────────────
router.get(
  '/employees',
  requireManager,
  asyncHandler(async (_req, res) => {
    const rows = db
      .prepare(
        `SELECT a.id, a.name, a.email, a.role, a.status, a.twilio_identity,
                a.twilio_phone_number, a.twilio_phone_sid, a.twilio_phone_area_code,
                a.twilio_phone_purchased_at, a.is_available,
                a.last_login_at, a.invite_accepted_at, a.created_at,
                COALESCE(stats.total_calls, 0) AS total_calls,
                COALESCE(stats.connected_calls, 0) AS connected_calls,
                COALESCE(stats.total_seconds, 0) AS total_seconds,
                COALESCE(stats.recordings_count, 0) AS recordings_count
           FROM agents a
           LEFT JOIN (
             SELECT agent_id,
                    COUNT(*) AS total_calls,
                    SUM(CASE WHEN outcome = 'connected' THEN 1 ELSE 0 END) AS connected_calls,
                    SUM(COALESCE(duration_seconds, 0)) AS total_seconds,
                    SUM(CASE WHEN recording_url IS NOT NULL AND recording_url != '' THEN 1 ELSE 0 END) AS recordings_count
               FROM calls
              GROUP BY agent_id
           ) stats ON stats.agent_id = a.id
          WHERE a.role = 'employee'
          ORDER BY a.created_at DESC`,
      )
      .all();
    res.json({ employees: rows });
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

// ─── Invite a new employee and auto-assign a US number ────────────────
const inviteSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  areaCode: z.string().optional(),
  phoneNumber: z.string().optional(), // if manager pre-selected from search
});

function slugifyIdentity(base, fallback) {
  const cleaned = String(base || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || fallback;
}

router.post(
  '/employees',
  requireManager,
  asyncHandler(async (req, res) => {
    const payload = inviteSchema.parse(req.body);
    const existing = db
      .prepare('SELECT id FROM agents WHERE LOWER(email) = LOWER(?)')
      .get(payload.email);
    if (existing) throw new AppError('An employee with that email already exists', 409);

    // Pick a number: either the one manager selected, or first match by areaCode.
    let chosenPhone = payload.phoneNumber;
    let areaCode = payload.areaCode;
    if (!chosenPhone) {
      const candidates = await searchUsNumbers({ areaCode, limit: 1 });
      if (candidates.length === 0) {
        throw new AppError(
          areaCode
            ? `No US numbers available in area code ${areaCode}`
            : 'No US numbers available right now',
          502,
        );
      }
      chosenPhone = candidates[0].phoneNumber;
    }

    // Purchase it
    const purchased = await purchaseNumber({
      phoneNumber: chosenPhone,
      friendlyName: `JentoAI · ${payload.name}`,
    });

    // Generate identity unique per email
    const baseIdentity = slugifyIdentity(payload.email.split('@')[0], `user_${Date.now()}`);
    let identity = baseIdentity;
    let suffix = 1;
    while (db.prepare('SELECT id FROM agents WHERE twilio_identity = ?').get(identity)) {
      identity = `${baseIdentity}_${suffix++}`;
    }

    const inviteToken = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    const result = db
      .prepare(
        `INSERT INTO agents
          (name, email, twilio_identity, role, status, invite_token, invite_expires_at,
           twilio_phone_number, twilio_phone_sid, twilio_phone_area_code, twilio_phone_purchased_at,
           is_available)
         VALUES (?, ?, ?, 'employee', 'pending', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1)`,
      )
      .run(
        payload.name,
        payload.email,
        identity,
        inviteToken,
        expiresAt,
        purchased.phoneNumber,
        purchased.sid,
        areaCode || null,
      );
    const newId = Number(result.lastInsertRowid);

    const baseUrl = env.INVITE_BASE_URL || env.PUBLIC_BASE_URL || 'http://localhost:5173';
    const acceptUrl = `${baseUrl.replace(/\/$/, '')}/accept-invite?token=${inviteToken}`;
    const emailPayload = buildInviteEmail({
      name: payload.name,
      acceptUrl,
      managerName: req.user?.name,
    });
    const mailResult = await sendMail({ to: payload.email, ...emailPayload });

    const fresh = db
      .prepare(
        `SELECT id, name, email, role, status, twilio_identity,
                twilio_phone_number, twilio_phone_sid, twilio_phone_area_code, twilio_phone_purchased_at
           FROM agents WHERE id = ?`,
      )
      .get(newId);
    res.status(201).json({
      employee: fresh,
      invite: {
        url: acceptUrl,
        expires_at: expiresAt,
        email: mailResult,
      },
    });
  }),
);

// ─── Resend invite (generates new token) ──────────────────────────────
router.post(
  '/employees/:id/resend-invite',
  requireManager,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT id, name, email FROM agents WHERE id = ? AND role = ?').get(id, 'employee');
    if (!row) throw new AppError('Employee not found', 404);
    const inviteToken = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    db.prepare(
      `UPDATE agents SET invite_token = ?, invite_expires_at = ?, status = 'pending', password_hash = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    ).run(inviteToken, expiresAt, id);

    const baseUrl = env.INVITE_BASE_URL || env.PUBLIC_BASE_URL || 'http://localhost:5173';
    const acceptUrl = `${baseUrl.replace(/\/$/, '')}/accept-invite?token=${inviteToken}`;
    const emailPayload = buildInviteEmail({ name: row.name, acceptUrl, managerName: req.user?.name });
    const mailResult = await sendMail({ to: row.email, ...emailPayload });
    res.json({ invite: { url: acceptUrl, expires_at: expiresAt, email: mailResult } });
  }),
);

// ─── Suspend / reactivate ─────────────────────────────────────────────
router.patch(
  '/employees/:id/status',
  requireManager,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { status } = z.object({ status: z.enum(['active', 'suspended']) }).parse(req.body);
    const result = db
      .prepare('UPDATE agents SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND role = ?')
      .run(status, id, 'employee');
    if (result.changes === 0) throw new AppError('Employee not found', 404);
    res.json({ ok: true, status });
  }),
);

// ─── Delete employee (releases Twilio number) ─────────────────────────
router.delete(
  '/employees/:id',
  requireManager,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const row = db
      .prepare('SELECT id, twilio_phone_sid FROM agents WHERE id = ? AND role = ?')
      .get(id, 'employee');
    if (!row) throw new AppError('Employee not found', 404);

    if (row.twilio_phone_sid) {
      await releaseNumber(row.twilio_phone_sid);
    }
    db.prepare('UPDATE calls SET agent_id = NULL WHERE agent_id = ?').run(id);
    db.prepare('DELETE FROM agents WHERE id = ?').run(id);
    res.json({ ok: true });
  }),
);

export default router;
