// JWT helper + request auth middleware.
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../db/index.js';
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
  if (match) return match[1];
  return req.query?.token || null;
}

export async function softAuth(req, _res, next) {
  try {
    const token = extractBearer(req);
    if (!token) return next();
    
    // First try to decode as a regular Calls token
    try {
      const payload = verifyToken(token);
      const { rows: agents } = await query('SELECT id, name, email, role, status, twilio_identity, twilio_phone_number FROM agents WHERE id = $1', [payload.sub]);
      const user = agents[0];
      if (user && user.status !== 'suspended') {
        req.user = user;
      }
      return next();
    } catch (e) {
      // If it fails, try to decode as an Enrichment token
      const enrichmentSecret = process.env.JWT_PRIVATE_KEY || 'jento-enrichment-secret-key-2024-change-this';
      const enrichmentPayload = jwt.verify(token, enrichmentSecret);
      
      // If valid, and role is owner, grant manager access
      if (enrichmentPayload && enrichmentPayload.role === 'owner') {
        req.user = {
          id: enrichmentPayload.user_id, // Map owner's ID
          email: enrichmentPayload.email || 'admin@jentoai.com',
          role: 'manager',
          status: 'active'
        };
      }
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

export function requireManagerOrLeader(req, _res, next) {
  if (!req.user) throw new AppError('Authentication required', 401);
  if (req.user.role !== 'manager' && req.user.role !== 'team_leader') {
    throw new AppError('Manager or Team Leader role required', 403);
  }
  next();
}

export function canAccessAgent(user, agentId) {
  if (!user) return false;
  if (user.role === 'manager') return true;
  return Number(user.id) === Number(agentId);
}

export function requireAgentAccess(req, _res, next) {
  if (!req.user) throw new AppError('Authentication required', 401);
  const agentId = Number(req.params.agentId || req.params.id || req.query.agentId || req.body?.agentId);
  if (!Number.isFinite(agentId) || !canAccessAgent(req.user, agentId)) {
    throw new AppError('You can only access your own call-center account', 403);
  }
  next();
}
