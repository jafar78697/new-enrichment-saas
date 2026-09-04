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
    
    // Step 1: Try as a regular Calls-module JWT token
    try {
      const payload = verifyToken(token);
      const { rows: agents } = await query('SELECT id, name, email, role, status, signalwire_identity, signalwire_phone_number FROM agents WHERE id = $1', [payload.sub]);
      const user = agents[0];
      if (user && user.status !== 'suspended') {
        req.user = user;
        return next();
      }
    } catch (_callsTokenErr) {
      // Not a calls token — try enrichment token next
    }

    // Step 2: Try as an Enrichment platform JWT token (manager login)
    try {
      const { AuthManager } = await import('@enrichment-saas/auth');
      const authManager = new AuthManager(
        process.env.JWT_PRIVATE_KEY || '',
        process.env.JWT_PUBLIC_KEY || ''
      );
      const enrichmentPayload = authManager.verifyUserToken(token);

      if (enrichmentPayload) {
        const userEmail = enrichmentPayload.email || null;
        const { rows: agents } = await query(
          'SELECT id, name, email, role, status FROM agents WHERE LOWER(email) = LOWER($1)',
          [userEmail]
        );
        const agent = agents[0] || {};
        req.user = {
          id: agent.id || 0,
          email: userEmail || 'admin@jentoai.com',
          role: 'manager',
          status: 'active'
        };
        req.tenantId = enrichmentPayload.tenantId || enrichmentPayload.tenant_id || null;
        return next();
      }
    } catch (_enrichmentErr) {
      // Not an enrichment token either — try raw JWT decode as last resort
    }

    // Step 3: Last resort — try direct JWT decode with PRIVATE_KEY (symmetric)
    try {
      const privateKey = process.env.JWT_PRIVATE_KEY || '';
      if (privateKey) {
        const decoded = jwt.verify(token, privateKey);
        if (decoded) {
          const userEmail = decoded.email || null;
          req.user = {
            id: decoded.user_id || decoded.sub || 0,
            email: userEmail || 'admin@jentoai.com',
            role: 'manager',
            status: 'active'
          };
          req.tenantId = decoded.tenantId || decoded.tenant_id || null;
          return next();
        }
      }
    } catch (_lastResortErr) {
      // All verification methods failed — req.user stays undefined
    }

  } catch {
    /* ignore all errors — unauthenticated request proceeds without req.user */
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
