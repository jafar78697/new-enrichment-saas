import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { AuthManager } from '@enrichment-saas/auth';
import { AUTH_CONFIG, ROLES } from '../config/saas';
import { recordAuditLog } from '../services/audit-log.service';
import { WalletService } from '../services/wallet.service';
import { OAuth2Client } from 'google-auth-library';

const DEMO_CALL_LIMIT = 3;
const DEMO_KEYWORD_LIMIT = 2;
const DEMO_DURATION_DAYS = 7;
const DEMO_CALLING_CENTS = 50;
const DEMO_MAPS_CREDITS = 20;

function demoCallerNumbers(): string[] {
  return String(
    process.env.DEMO_CALLER_NUMBERS
      || process.env.SIGNALWIRE_PHONE_NUMBER
      || process.env.TWILIO_PHONE_NUMBER
      || ''
  )
    .split(',')
    .map((number) => number.trim())
    .filter(Boolean);
}

function callerNumberFor(identifier: string): string | null {
  const numbers = demoCallerNumbers();
  if (!numbers.length) return null;
  const position = crypto.createHash('sha256').update(identifier).digest().readUInt32BE(0) % numbers.length;
  return numbers[position];
}

async function generatePublicUsername(db: any, name: string, email: string): Promise<string> {
  const emailPrefix = email.split('@')[0] || name;
  const normalized = emailPrefix.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 18) || 'user';
  const base = normalized.length >= 3 ? normalized : `${normalized}user`;

  for (let suffix = 0; suffix < 100; suffix++) {
    const candidate = suffix === 0 ? base : `${base}${suffix}`;
    const { rows } = await db.query(
      `SELECT 1 FROM users WHERE lower(username) = lower($1)
       UNION ALL
       SELECT 1 FROM agents WHERE lower(username) = lower($1)
       LIMIT 1`,
      [candidate]
    );
    if (!rows.length) return candidate;
  }

  return `${base}${crypto.randomBytes(4).toString('hex')}`;
}

async function generatePublicIdentity(db: any, username: string): Promise<string> {
  const base = username.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 28) || 'demo_user';
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = attempt === 0 ? base : `${base}_${crypto.randomBytes(2).toString('hex')}`;
    const { rows } = await db.query(
      'SELECT 1 FROM agents WHERE signalwire_identity = $1 LIMIT 1',
      [candidate]
    );
    if (!rows.length) return candidate;
  }
  return `demo_${crypto.randomBytes(8).toString('hex')}`;
}

export default async function authRoutes(fastify: FastifyInstance) {
  const authManager = new AuthManager(process.env.JWT_PRIVATE_KEY || '', process.env.JWT_PUBLIC_KEY || '');

  function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async function recordSession(request: any, token: string, userId: string, tenantId: string) {
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + AUTH_CONFIG.SESSION_EXPIRY_HOURS * 60 * 60 * 1000);
    await fastify.db.query(
      `INSERT INTO user_sessions (user_id, tenant_id, token_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, tenantId, tokenHash, expiresAt, request.ip || 'unknown', request.headers['user-agent'] || '']
    );
  }

  // POST /v1/auth/signup — creates a self-service demo workspace.
  fastify.post('/v1/auth/signup', async (request: any, reply) => {
    const firstName = String(request.body?.first_name || '').trim();
    const lastName = String(request.body?.last_name || '').trim();
    const legacyName = String(request.body?.name || '').trim();
    const name = [firstName, lastName].filter(Boolean).join(' ') || legacyName;
    const email = String(request.body?.email || '').trim().toLowerCase();
    const password = String(request.body?.password || '');

    if ((firstName || lastName) && (!firstName || !lastName)) {
      return reply.code(400).send({ error: 'First name and last name are both required.' });
    }
    if (name.length < 2 || name.length > 100) {
      return reply.code(400).send({ error: 'First name and last name are required.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.code(400).send({ error: 'Enter a valid email address.' });
    }
    if (password.length < AUTH_CONFIG.PASSWORD_MIN_LENGTH) {
      return reply.code(400).send({
        error: `Password must be at least ${AUTH_CONFIG.PASSWORD_MIN_LENGTH} characters.`,
      });
    }

    const db = fastify.db;
    const client = await (db as any).connect();
    let tenantId = '';
    let userId = '';
    let workspaceId = '';
    let username = '';

    try {
      await client.query('BEGIN');

      const { rows: existingUsers } = await client.query(
        'SELECT 1 FROM users WHERE lower(email) = $1 LIMIT 1',
        [email]
      );
      if (existingUsers.length) {
        await client.query('ROLLBACK');
        return reply.code(409).send({
          error: 'An account with this email already exists. Please sign in instead.',
          code: 'EMAIL_TAKEN',
        });
      }

      username = await generatePublicUsername(client, name, email);
      const signalwireIdentity = await generatePublicIdentity(client, username);
      const passwordHash = bcrypt.hashSync(password, 12);
      const callerNumber = callerNumberFor(email);

      const { rows: tenantRows } = await client.query(
        `INSERT INTO tenants (name, slug, plan, status, customer_name, onboarded_at)
         VALUES ($1, $2, 'demo', 'active', $1, NOW())
         RETURNING id`,
        [name, username]
      );
      tenantId = tenantRows[0].id;

      const { rows: userRows } = await client.query(
        `INSERT INTO users (
           tenant_id, username, email, password_hash, role,
           must_change_password, display_name, password_changed_at
         )
         VALUES ($1, $2, $3, $4, $5, false, $6, NOW())
         RETURNING id`,
        [tenantId, username, email, passwordHash, ROLES.TENANT_OWNER, name]
      );
      userId = userRows[0].id;

      const { rows: workspaceRows } = await client.query(
        `INSERT INTO workspaces (tenant_id, name)
         VALUES ($1, $2)
         RETURNING id`,
        [tenantId, `${name}'s Workspace`]
      );
      workspaceId = workspaceRows[0].id;

      await client.query(
        `INSERT INTO tenant_limits (
           tenant_id, max_phone_numbers, max_seats, max_concurrent_calls,
           max_daily_unique_destinations, max_daily_call_attempts,
           allowed_destination_countries, max_call_seconds, monthly_spending_limit_cents
         )
         VALUES ($1, 1, 1, 1, $2, $2, ARRAY['US','CA'], 300, 0)`,
        [tenantId, DEMO_CALL_LIMIT]
      );

      await client.query(
        `INSERT INTO agents (
           tenant_id, name, username, email, signalwire_identity, signalwire_phone_number,
           role, status, password_hash, is_available, invite_accepted_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'manager', 'active', $7, true, NOW())`,
        [tenantId, name, username, email, signalwireIdentity, callerNumber, passwordHash]
      );

      await client.query(
        `INSERT INTO customer_subscriptions (
           tenant_id, plan_name, pkr_price, start_date, end_date, status, snapshot
         )
         VALUES (
           $1, 'Free Demo', 0, NOW(), NOW() + ($2 * INTERVAL '1 day'), 'active', $3::jsonb
         )`,
        [tenantId, DEMO_DURATION_DAYS, JSON.stringify({
          source: 'public_signup',
          demo_call_limit: DEMO_CALL_LIMIT,
          demo_keyword_limit: DEMO_KEYWORD_LIMIT,
        })]
      );

      const walletService = new WalletService(db);
      await walletService.credit({
        tenantId,
        unit: 'calling_cents',
        amount: DEMO_CALLING_CENTS,
        referenceType: 'demo_signup',
        referenceId: tenantId,
        description: 'Free demo calling allowance',
      }, client);
      await walletService.credit({
        tenantId,
        unit: 'maps_credits',
        amount: DEMO_MAPS_CREDITS,
        referenceType: 'demo_signup',
        referenceId: tenantId,
        description: 'Free demo Maps allowance',
      }, client);

      await client.query('COMMIT');
    } catch (error: any) {
      try { await client.query('ROLLBACK'); } catch {}
      fastify.log.error(error, 'Public demo signup failed');
      if (error?.code === '23505') {
        return reply.code(409).send({ error: 'This email or username is already registered.' });
      }
      return reply.code(500).send({ error: 'Your demo account could not be created. Please try again.' });
    } finally {
      client.release();
    }

    await recordAuditLog(db, {
      tenantId,
      actorUserId: userId,
      actorRole: ROLES.TENANT_OWNER,
      action: 'public_demo_signup',
      resource: 'tenant',
      targetId: tenantId,
      details: {
        first_name: firstName || name.split(/\s+/)[0] || name,
        last_name: lastName || name.split(/\s+/).slice(1).join(' ') || null,
        name,
        email,
        username,
      },
    }).catch((error) => fastify.log.warn({ error, tenantId }, 'Demo signup audit log was not written'));

    const token = authManager.signUserToken({
      user_id: userId,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      role: ROLES.TENANT_OWNER,
      plan: 'demo',
    }, AUTH_CONFIG.JWT_EXPIRY_SECONDS);

    try {
      await recordSession(request, token, userId, tenantId);
    } catch (error) {
      fastify.log.warn({ error, userId }, 'Demo signup session record was not written');
    }

    return reply.code(201).send({
      token,
      user: {
        id: userId,
        username,
        email,
        display_name: name,
        role: ROLES.TENANT_OWNER,
        plan: 'demo',
        must_change_password: false,
      },
      tenant: { id: tenantId, name, status: 'active' },
      demo: {
        call_limit: DEMO_CALL_LIMIT,
        keyword_limit: DEMO_KEYWORD_LIMIT,
        duration_days: DEMO_DURATION_DAYS,
      },
    });
  });

  // POST /v1/auth/login — supports username OR email
  fastify.post('/v1/auth/login', async (request, reply) => {
    const { username, email, password } = request.body as any;
    const identifier = username || email;

    if (!identifier || !password) {
      return reply.code(400).send({ error: 'Username/email and password are required' });
    }

    // Throttle check
    const throttleWindow = new Date(Date.now() - AUTH_CONFIG.LOGIN_THROTTLE_WINDOW_MINUTES * 60 * 1000);
    try {
      const { rows: attempts } = await fastify.db.query(
        `SELECT COUNT(*) as cnt FROM login_attempts
         WHERE identifier = $1 AND attempted_at > $2 AND success = false`,
        [identifier.toLowerCase(), throttleWindow]
      );
      if (parseInt(attempts[0]?.cnt || '0') >= AUTH_CONFIG.MAX_LOGIN_ATTEMPTS) {
        return reply.code(429).send({
          error: 'Too many login attempts. Please try again later.',
          code: 'LOGIN_THROTTLED',
        });
      }
    } catch {
      // login_attempts table may not exist yet, continue
    }

    // Find user by username or email
    const { rows } = await fastify.db.query(
      `SELECT u.*, t.plan, t.status as tenant_status, t.name as tenant_name,
              w.id as workspace_id
       FROM users u
       JOIN tenants t ON u.tenant_id = t.id
       LEFT JOIN workspaces w ON w.tenant_id = t.id
       WHERE (lower(u.username) = $1 OR lower(u.email) = $1)
       AND t.deleted_at IS NULL
       LIMIT 1`,
      [identifier.toLowerCase()]
    );
    const user = rows[0];

    // Record attempt
    const clientIp = request.ip || 'unknown';

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      // Log failed attempt
      try {
        await fastify.db.query(
          `INSERT INTO login_attempts (identifier, success, ip_address) VALUES ($1, false, $2)`,
          [identifier.toLowerCase(), clientIp]
        );
      } catch { /* table may not exist */ }
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    // Check tenant status
    if (user.tenant_status === 'suspended') {
      return reply.code(403).send({
        error: 'Your account has been suspended. Contact support.',
        code: 'ACCOUNT_SUSPENDED',
      });
    }

    if (user.account_status === 'suspended') {
      return reply.code(403).send({
        error: 'Your access has been suspended by your administrator.',
        code: 'USER_SUSPENDED',
      });
    }

    // Log successful attempt
    try {
      await fastify.db.query(
        `INSERT INTO login_attempts (identifier, success, ip_address) VALUES ($1, true, $2)`,
        [identifier.toLowerCase(), clientIp]
      );
    } catch { /* table may not exist */ }

    // Check if password is temporary and expired
    if (user.must_change_password) {
      // Check expiry (24h from creation or last reset)
      const passwordAge = user.password_changed_at
        ? Date.now() - new Date(user.password_changed_at).getTime()
        : Date.now() - new Date(user.created_at).getTime();
      const expiryMs = AUTH_CONFIG.TEMP_PASSWORD_EXPIRY_HOURS * 60 * 60 * 1000;

      if (passwordAge > expiryMs) {
        return reply.code(403).send({
          error: 'Temporary password has expired. Contact admin for a new one.',
          code: 'TEMP_PASSWORD_EXPIRED',
        });
      }
    }

    const tokenPayload = {
      user_id: user.id,
      tenant_id: user.tenant_id,
      workspace_id: user.workspace_id,
      role: user.role,
      plan: user.plan,
    };

    const token = authManager.signUserToken(tokenPayload, AUTH_CONFIG.JWT_EXPIRY_SECONDS);

    // Create session record
    try {
      await recordSession(request, token, user.id, user.tenant_id);
    } catch { /* table may not exist */ }

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        display_name: user.display_name || user.email || user.username,
        role: user.role,
        plan: user.plan,
        must_change_password: user.must_change_password || false,
      },
      tenant: {
        id: user.tenant_id,
        name: user.tenant_name,
        status: user.tenant_status,
      },
    };
  });

  // POST /v1/auth/google — Handle Google OAuth login and signup
  fastify.post('/v1/auth/google', async (request: any, reply) => {
    const { token } = request.body as any;
    if (!token) {
      return reply.code(400).send({ error: 'Token is required' });
    }

    let payload;
    try {
      const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
      const ticket = await client.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (err) {
      fastify.log.error(err);
      return reply.code(401).send({ error: 'Invalid Google token' });
    }

    if (!payload || !payload.email) {
      return reply.code(401).send({ error: 'Invalid Google token payload' });
    }

    const email = payload.email.toLowerCase();
    const name = payload.name || payload.email.split('@')[0];

    const client = await fastify.db.connect();
    let user;
    try {
      await client.query('BEGIN');
      
      const { rows } = await client.query(
        `SELECT u.*, t.plan, t.status as tenant_status, t.name as tenant_name, w.id as workspace_id
         FROM users u
         JOIN tenants t ON u.tenant_id = t.id
         LEFT JOIN workspaces w ON w.tenant_id = t.id
         WHERE lower(u.email) = $1 AND t.deleted_at IS NULL
         LIMIT 1`,
        [email]
      );

      if (rows.length > 0) {
        user = rows[0];
      } else {
        // User does not exist, create them
        let tenantId: string;
        let userId: string;
        let workspaceId: string;
        const username = await generatePublicUsername(client, name, email);
        const signalwireIdentity = await generatePublicIdentity(client, username);
        const callerNumber = callerNumberFor(email);
        
        const passwordHash = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 12);

        const { rows: tenantRows } = await client.query(
          `INSERT INTO tenants (name, slug, plan, status, customer_name, onboarded_at)
           VALUES ($1, $2, 'demo', 'active', $1, NOW())
           RETURNING id`,
          [name, username]
        );
        tenantId = tenantRows[0].id;

        const { rows: userRows } = await client.query(
          `INSERT INTO users (
             tenant_id, username, email, password_hash, role,
             must_change_password, display_name, password_changed_at
           )
           VALUES ($1, $2, $3, $4, $5, false, $6, NOW())
           RETURNING id, username, email, role, display_name`,
          [tenantId, username, email, passwordHash, ROLES.TENANT_OWNER, name]
        );
        user = userRows[0];
        userId = userRows[0].id;

        const { rows: workspaceRows } = await client.query(
          `INSERT INTO workspaces (tenant_id, name)
           VALUES ($1, $2)
           RETURNING id`,
          [tenantId, `${name}'s Workspace`]
        );
        workspaceId = workspaceRows[0].id;

        await client.query(
          `INSERT INTO tenant_limits (
             tenant_id, max_phone_numbers, max_seats, max_concurrent_calls,
             max_daily_unique_destinations, max_daily_call_attempts,
             allowed_destination_countries, max_call_seconds, monthly_spending_limit_cents
           )
           VALUES ($1, 1, 1, 1, $2, $2, ARRAY['US','CA'], 300, 0)`,
          [tenantId, DEMO_CALL_LIMIT]
        );

        await client.query(
          `INSERT INTO agents (
             tenant_id, name, username, email, signalwire_identity, signalwire_phone_number,
             role, status, password_hash, is_available, invite_accepted_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, 'manager', 'active', $7, true, NOW())`,
          [tenantId, name, username, email, signalwireIdentity, callerNumber, passwordHash]
        );

        await client.query(
          `INSERT INTO customer_subscriptions (
             tenant_id, plan_name, pkr_price, start_date, end_date, status, snapshot
           )
           VALUES (
             $1, 'Free Demo', 0, NOW(), NOW() + ($2 * INTERVAL '1 day'), 'active', $3::jsonb
           )`,
          [tenantId, DEMO_DURATION_DAYS, JSON.stringify({
            source: 'public_signup_google',
            demo_call_limit: DEMO_CALL_LIMIT,
            demo_keyword_limit: DEMO_KEYWORD_LIMIT,
          })]
        );

        const walletService = new WalletService(fastify.db);
        await walletService.credit({
          tenantId,
          unit: 'calling_cents',
          amount: DEMO_CALLING_CENTS,
          referenceType: 'demo_signup',
          referenceId: userId,
          description: 'Demo signup credit',
        }, client);
        await walletService.credit({
          tenantId,
          unit: 'maps_credits',
          amount: DEMO_MAPS_CREDITS,
          referenceType: 'demo_signup',
          referenceId: userId,
          description: 'Demo maps credit',
        }, client);
        
        user.plan = 'demo';
        user.tenant_status = 'active';
        user.tenant_name = name;
        user.workspace_id = workspaceId;
        user.tenant_id = tenantId;
        user.must_change_password = false;
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal server error during Google login' });
    } finally {
      client.release();
    }

    if (user.tenant_status === 'suspended') {
      return reply.code(403).send({
        error: 'Your account has been suspended. Contact support.',
        code: 'ACCOUNT_SUSPENDED',
      });
    }

    if (user.account_status === 'suspended') {
      return reply.code(403).send({
        error: 'Your access has been suspended by your administrator.',
        code: 'USER_SUSPENDED',
      });
    }

    const tokenPayload = {
      user_id: user.id,
      tenant_id: user.tenant_id,
      workspace_id: user.workspace_id,
      role: user.role,
      plan: user.plan,
    };

    const jwtToken = authManager.signUserToken(tokenPayload, AUTH_CONFIG.JWT_EXPIRY_SECONDS);

    try {
      await recordSession(request, jwtToken, user.id, user.tenant_id);
    } catch { /* table may not exist */ }

    return {
      token: jwtToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        display_name: user.display_name || user.email || user.username,
        role: user.role,
        plan: user.plan,
        must_change_password: user.must_change_password,
      },
      tenant: {
        id: user.tenant_id,
        name: user.tenant_name,
        status: user.tenant_status,
      },
    };
  });

  // POST /v1/auth/change-password
  fastify.post('/v1/auth/change-password', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any, reply) => {
    const { current_password, new_password } = request.body as any;
    const { userId } = request.tenant;

    if (!current_password || !new_password) {
      return reply.code(400).send({ error: 'current_password and new_password are required' });
    }

    if (new_password.length < AUTH_CONFIG.PASSWORD_MIN_LENGTH) {
      return reply.code(400).send({
        error: `Password must be at least ${AUTH_CONFIG.PASSWORD_MIN_LENGTH} characters`,
      });
    }

    // Verify current password
    const { rows } = await fastify.db.query(
      `SELECT password_hash, auth_version FROM users WHERE id = $1`,
      [userId]
    );
    if (!rows[0] || !bcrypt.compareSync(current_password, rows[0].password_hash)) {
      return reply.code(401).send({ error: 'Current password is incorrect' });
    }

    // Update password
    const newHash = bcrypt.hashSync(new_password, 12);
    const newAuthVersion = (rows[0].auth_version || 1) + 1;
    await fastify.db.query(
      `UPDATE users SET
        password_hash = $1,
        must_change_password = false,
        password_changed_at = NOW(),
        auth_version = $3
       WHERE id = $2`,
      [newHash, userId, newAuthVersion]
    );

    // Revoke all previous sessions (force re-login with new password)
    try {
      await fastify.db.query(
        `UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId]
      );
    } catch { /* table may not exist */ }

    await recordAuditLog(fastify.db, {
      tenantId: request.tenant.tenantId,
      actorUserId: userId,
      actorRole: request.tenant.role,
      action: 'password_changed',
      resource: 'user',
      targetId: userId,
    }).catch((error) => fastify.log.warn({ error, userId }, 'Password change audit log was not written'));

    // Issue new token
    const token = authManager.signUserToken({
      user_id: userId,
      tenant_id: request.tenant.tenantId,
      workspace_id: request.tenant.workspaceId,
      role: request.tenant.role,
      plan: request.tenant.plan,
    }, AUTH_CONFIG.JWT_EXPIRY_SECONDS);

    try {
      await recordSession(request, token, userId, request.tenant.tenantId);
    } catch { /* table may not exist */ }

    return { success: true, token, message: 'Password changed successfully' };
  });

  // POST /v1/auth/logout
  fastify.post('/v1/auth/logout', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any) => {
    // Revoke current session
    const authHeader = request.headers.authorization;
    if (authHeader) {
      const currentToken = authHeader.split(' ')[1];
      const tokenHash = hashToken(currentToken);
      try {
        await fastify.db.query(
          `UPDATE user_sessions SET revoked_at = NOW() WHERE token_hash = $1`,
          [tokenHash]
        );
      } catch { /* table may not exist */ }
    }
    return { success: true, message: 'Logged out' };
  });

  // GET /v1/me — current user profile with tenant info and limits
  fastify.get('/v1/me', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any) => {
    const { tenantId, userId } = request.tenant;

    const { rows: userRows } = await fastify.db.query(
      `SELECT u.id, u.username, u.email, u.display_name, u.role, u.must_change_password,
              u.account_status,
              u.contact_phone, u.created_at,
              t.name as tenant_name, t.plan, t.status as tenant_status,
              t.customer_name, t.contact_phone as tenant_phone
       FROM users u
       JOIN tenants t ON u.tenant_id = t.id
       WHERE u.id = $1 AND t.id = $2`,
      [userId, tenantId]
    );

    if (!userRows[0]) {
      return { error: 'User not found' };
    }

    // Get tenant limits
    let limits = null;
    try {
      const { rows: limitRows } = await fastify.db.query(
        `SELECT * FROM tenant_limits WHERE tenant_id = $1`,
        [tenantId]
      );
      limits = limitRows[0] || null;
    } catch { /* table may not exist */ }

    // Get active subscription
    let subscription = null;
    try {
      const { rows: subRows } = await fastify.db.query(
        `SELECT * FROM customer_subscriptions
         WHERE tenant_id = $1 AND status = 'active'
         ORDER BY created_at DESC LIMIT 1`,
        [tenantId]
      );
      subscription = subRows[0] || null;
    } catch { /* table may not exist */ }

    let demoUsage = null;
    if (userRows[0].plan === 'demo') {
      const [{ rows: callRows }, { rows: mapsRows }] = await Promise.all([
        fastify.db.query(
          `SELECT COUNT(*)::int AS used
           FROM tracked_calls
           WHERE tenant_id = $1 AND direction = 'outbound'`,
          [tenantId]
        ),
        fastify.db.query(
          `SELECT COALESCE(SUM(cardinality(keywords)), 0)::int AS used
           FROM metered_maps_jobs
           WHERE tenant_id = $1 AND status IN ('queued', 'running', 'completed')`,
          [tenantId]
        ),
      ]);
      const callsUsed = Number(callRows[0]?.used || 0);
      const keywordsUsed = Number(mapsRows[0]?.used || 0);
      demoUsage = {
        call_limit: DEMO_CALL_LIMIT,
        calls_used: callsUsed,
        calls_remaining: Math.max(0, DEMO_CALL_LIMIT - callsUsed),
        keyword_limit: DEMO_KEYWORD_LIMIT,
        keywords_used: keywordsUsed,
        keywords_remaining: Math.max(0, DEMO_KEYWORD_LIMIT - keywordsUsed),
      };
    }

    const user = userRows[0];
    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        display_name: user.display_name || user.email || user.username,
        role: user.role,
        must_change_password: user.must_change_password,
        account_status: user.account_status,
        contact_phone: user.contact_phone,
        created_at: user.created_at,
      },
      tenant: {
        id: tenantId,
        name: user.tenant_name,
        customer_name: user.customer_name,
        plan: user.plan,
        status: user.tenant_status,
      },
      limits,
      subscription,
      demo_usage: demoUsage,
    };
  });

  // POST /v1/auth/refresh — keep existing but improve
  fastify.post('/v1/auth/refresh', async (request, reply) => {
    const { refresh_token } = request.body as any;
    if (!refresh_token) return reply.code(400).send({ error: 'refresh_token required' });
    try {
      const payload = authManager.verifyUserToken(refresh_token);
      const token = authManager.signUserToken(payload, AUTH_CONFIG.JWT_EXPIRY_SECONDS);
      return { token };
    } catch {
      return reply.code(401).send({ error: 'Invalid refresh token' });
    }
  });

  // POST /v1/auth/youtube/callback — keep existing
  fastify.post('/v1/auth/youtube/callback', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any, reply) => {
    const { code, redirectUri } = request.body as any;
    const { tenantId, userId } = request.tenant;

    if (!code) return reply.code(400).send({ error: 'Missing code' });

    try {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID || '1071909841111-sfa36eroerh8ggr58cu6v7upcvop380g.apps.googleusercontent.com',
          client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }).toString(),
      });

      const tokens = await tokenResponse.json() as any;
      if (tokens.error) {
        fastify.log.error(tokens, 'YouTube Token Error');
        return reply.code(400).send({ error: tokens.error_description || tokens.error });
      }

      const refreshToken = tokens.refresh_token || null;
      const accessToken = tokens.access_token;
      const expiry = new Date(Date.now() + tokens.expires_in * 1000);

      const channelRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const channelData = await channelRes.json() as any;
      let channelId = null, channelTitle = null, channelLogo = null;
      let totalViews = 0, totalComments = 0, totalVideos = 0, subscriberCount = 0;

      if (channelData.items?.length > 0) {
        const item = channelData.items[0];
        channelId = item.id;
        channelTitle = item.snippet?.title;
        channelLogo = item.snippet?.thumbnails?.default?.url || null;
        totalViews = parseInt(item.statistics?.viewCount || '0', 10);
        subscriberCount = parseInt(item.statistics?.subscriberCount || '0', 10);
        totalVideos = parseInt(item.statistics?.videoCount || '0', 10);
      }

      await fastify.db.query(
        `INSERT INTO youtube_accounts (tenant_id, user_id, channel_id, channel_title, access_token, refresh_token, token_expiry, channel_logo, total_views, total_comments, total_videos, subscriber_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [tenantId, userId, channelId, channelTitle, accessToken, refreshToken, expiry, channelLogo, totalViews, totalComments, totalVideos, subscriberCount]
      );

      return { success: true, channelId, channelTitle };
    } catch (err: any) {
      fastify.log.error(err, 'Error in YouTube auth callback');
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });

  // POST /v1/auth/linkedin/callback — keep existing
  fastify.post('/v1/auth/linkedin/callback', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any, reply) => {
    const { code, redirectUri } = request.body as any;
    const { tenantId, userId } = request.tenant;

    if (!code) return reply.code(400).send({ error: 'Missing code' });

    try {
      const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: process.env.LINKEDIN_CLIENT_ID || '',
          client_secret: process.env.LINKEDIN_CLIENT_SECRET || '',
          redirect_uri: redirectUri,
        }).toString(),
      });

      const tokens = await tokenResponse.json() as any;
      if (tokens.error) {
        fastify.log.error(tokens, 'LinkedIn Token Error');
        return reply.code(400).send({ error: tokens.error_description || tokens.error });
      }

      const accessToken = tokens.access_token;
      const refreshToken = tokens.refresh_token || null;
      const expiry = new Date(Date.now() + tokens.expires_in * 1000);

      const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const profileData = await profileRes.json() as any;
      const linkedinUrn = `urn:li:person:${profileData.sub}`;
      const profileName = `${profileData.given_name} ${profileData.family_name}`;

      await fastify.db.query(
        `INSERT INTO linkedin_accounts (tenant_id, user_id, linkedin_urn, profile_name, access_token, refresh_token, token_expiry)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [tenantId, userId, linkedinUrn, profileName, accessToken, refreshToken, expiry]
      );

      return { success: true, linkedinUrn, profileName };
    } catch (err: any) {
      fastify.log.error(err, 'Error in LinkedIn auth callback');
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });

  // DELETE /v1/account (GDPR) — keep existing
  fastify.delete('/v1/account', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any, reply) => {
    const { tenantId } = request.tenant;
    await fastify.db.query(
      `UPDATE tenants SET deleted_at = now() + interval '30 days' WHERE id = $1`,
      [tenantId]
    );
    return { message: 'Account scheduled for deletion in 30 days' };
  });
}
