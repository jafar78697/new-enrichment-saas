// JWT helper + request auth middleware.
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { db } from '../db/index.js';
import { AppError } from '../utils/errors.js';

export function signToken(agent) {
  const payload = {
    sub: agent.id,
    email: agent.email,
    role: agent.role || 'employee',
    name: agent.name,
  };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_TTL_SECONDS });
}

export function verifyToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}

function extractBearer(req) {
  const header = req.headers['authorization'] || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : null;
}

/** Attaches req.user if a valid token is present, but never rejects. */
export function softAuth(req, _res, next) {
  try {
    const token = extractBearer(req);
    if (!token) return next();
    const payload = verifyToken(token);
    const row = db
      .prepare('SELECT id, name, email, role, status, twilio_identity, twilio_phone_number FROM agents WHERE id = ?')
      .get(payload.sub);
    if (row && row.status !== 'suspended') {
      req.user = row;
    }
  } catch {
    /* ignore */
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) throw new AppError('Authentication required', 401);
  next();
}

export function requireManager(req, _res, next) {
  if (!req.user) throw new AppError('Authentication required', 401);
  if (req.user.role !== 'manager') throw new AppError('Manager role required', 403);
  next();
}
