import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { RestClient } from '@signalwire/compatibility-api';
import { requireRole } from '../middleware/require-role';
import { ROLES, AUTH_CONFIG, CALLING_DEFAULTS } from '../config/saas';
import { WalletService } from '../services/wallet.service';
import { recordAuditLog } from '../services/audit-log.service';

// Route modules are evaluated before index.ts runs its dotenv setup in ESM.
// Load here so provider constants are never captured as empty at startup.
dotenv.config();

const signalwireProjectId = process.env.SIGNALWIRE_PROJECT_ID || '';
const signalwireApiToken = process.env.SIGNALWIRE_API_TOKEN || '';
const signalwireSpaceUrl = process.env.SIGNALWIRE_SPACE_URL || 'jentoai.signalwire.com';
const PHONE_SETUP_FEE_CENTS = Number(process.env.PHONE_SETUP_FEE_CENTS || '200');

function inboundRouting() {
  const baseUrl = String(process.env.PUBLIC_BASE_URL || 'https://api.jentoai.pro').replace(/\/$/, '');
  return {
    voiceUrl: `${baseUrl}/api/signalwire/twiml/inbound`,
    voiceMethod: 'POST',
    statusCallback: `${baseUrl}/api/signalwire/webhooks/call-status`,
    statusCallbackMethod: 'POST',
  };
}

/**
 * Generate a cryptographically random password of specified length.
 */
function generateTempPassword(length = AUTH_CONFIG.TEMP_PASSWORD_LENGTH): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

/**
 * Generate a normalized username. If collision exists, add a numeric suffix.
 */
async function generateUsername(db: any, baseName: string): Promise<string> {
  let username = baseName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  if (!username || username.length < 3) {
    username = 'user' + crypto.randomBytes(3).toString('hex');
  }

  let candidate = username;
  let suffix = 1;
  while (true) {
    const { rows } = await db.query(
      `SELECT 1 FROM users WHERE username = $1
       UNION ALL
       SELECT 1 FROM agents WHERE username = $1
       LIMIT 1`,
      [candidate]
    );
    if (rows.length === 0) return candidate;
    candidate = `${username}${suffix}`;
    suffix++;
    if (suffix > 100) {
      // Fallback to random
      return username + crypto.randomBytes(3).toString('hex');
    }
  }
}

async function uniqueSignalwireIdentity(db: any, baseName: string): Promise<string> {
  const base = baseName.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 28) || `agent${crypto.randomBytes(3).toString('hex')}`;
  let candidate = base;
  while (true) {
    const { rows } = await db.query(
      `SELECT 1 FROM agents WHERE signalwire_identity = $1 LIMIT 1`,
      [candidate]
    );
    if (rows.length === 0) return candidate;
    candidate = `${base}_${crypto.randomBytes(2).toString('hex')}`;
  }
}

async function getOrCreateTenantAgent(db: any, tenantId: string, customerName: string, username: string, passwordHash?: string) {
  const { rows: existing } = await db.query(
    `SELECT id FROM agents
     WHERE tenant_id = $1
     ORDER BY CASE WHEN role = 'manager' THEN 0 ELSE 1 END, id ASC
     LIMIT 1`,
    [tenantId]
  );
  if (existing[0]) return existing[0].id;

  const identity = await uniqueSignalwireIdentity(db, username);
  const agentEmail = `${username}@tenant.local`;
  const { rows } = await db.query(
    `INSERT INTO agents (
      tenant_id, name, username, email, signalwire_identity, role, status,
      password_hash, is_available, invite_accepted_at
    )
    VALUES ($1, $2, $3, $4, $5, 'manager', 'active', $6, false, CURRENT_TIMESTAMP)
    RETURNING id`,
    [tenantId, customerName, username, agentEmail, identity, passwordHash || null]
  );
  return rows[0].id;
}

export default async function adminCustomerRoutes(fastify: FastifyInstance) {
  const adminAuth = [
    fastify.authenticate as any,
    requireRole(ROLES.PLATFORM_ADMIN),
  ];

  // POST /v1/admin/customers — Create new customer
  fastify.post('/v1/admin/customers', {
    preHandler: adminAuth
  }, async (request: any, reply) => {
    const {
      customer_name,
      contact_phone,
      username: requestedUsername,
      email,
      limits,
    } = request.body as any;

    if (!customer_name) {
      return reply.code(400).send({ error: 'customer_name is required' });
    }

    const db = fastify.db;
    const usesTransactionClient = typeof (db as any).connect === 'function';
    const client = await (db as any).connect?.() || db;
    let committed = false;

    try {
      if (usesTransactionClient) await client.query('BEGIN');

      // Generate username
      const username = requestedUsername
        ? requestedUsername.toLowerCase().replace(/[^a-z0-9]/g, '')
        : await generateUsername(client, customer_name);

      if (username.length < 3) {
        if (usesTransactionClient) await client.query('ROLLBACK');
        return reply.code(400).send({ error: 'username must contain at least 3 letters or numbers' });
      }

      // Check username uniqueness
      const { rows: existingUsers } = await client.query(
        `SELECT 1 FROM users WHERE username = $1
         UNION ALL
         SELECT 1 FROM agents WHERE username = $1
         LIMIT 1`,
        [username]
      );
      if (existingUsers.length > 0) {
        if (usesTransactionClient) await client.query('ROLLBACK');
        return reply.code(409).send({
          error: `Username "${username}" is already taken`,
          code: 'USERNAME_TAKEN',
        });
      }

      // Generate temporary password
      const tempPassword = generateTempPassword();
      const passwordHash = bcrypt.hashSync(tempPassword, 12);
      
      // Create tenant
      const { rows: tenantRows } = await client.query(
        `INSERT INTO tenants (name, slug, plan, status, customer_name, contact_phone, onboarded_at)
         VALUES ($1, $2, 'starter', 'active', $3, $4, NOW())
         RETURNING id`,
        [customer_name, username, customer_name, contact_phone || null]
      );
      const tenantId = tenantRows[0].id;

      // Create user
      const { rows: userRows } = await client.query(
        `INSERT INTO users (tenant_id, username, email, password_hash, role, must_change_password, display_name, contact_phone)
         VALUES ($1, $2, $3, $4, $5, true, $6, $7)
         RETURNING id`,
        [tenantId, username, email || null, passwordHash, ROLES.TENANT_OWNER, customer_name, contact_phone || null]
      );
      const userId = userRows[0].id;

      // Create workspace
      await client.query(
        `INSERT INTO workspaces (tenant_id, name) VALUES ($1, $2)`,
        [tenantId, `${customer_name}'s Workspace`]
      );

      // Create tenant limits
      const l = limits || {};
      await client.query(
        `INSERT INTO tenant_limits (
          tenant_id, max_phone_numbers, max_seats, max_concurrent_calls,
          max_daily_unique_destinations, max_daily_call_attempts,
          allowed_destination_countries, max_call_seconds, monthly_spending_limit_cents
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          tenantId,
          l.max_phone_numbers || CALLING_DEFAULTS.MAX_PHONE_NUMBERS,
          l.max_seats || CALLING_DEFAULTS.MAX_SEATS,
          l.max_concurrent_calls || CALLING_DEFAULTS.MAX_CONCURRENT_CALLS,
          l.max_daily_unique_destinations || CALLING_DEFAULTS.MAX_DAILY_UNIQUE_DESTINATIONS,
          l.max_daily_call_attempts || CALLING_DEFAULTS.MAX_DAILY_CALL_ATTEMPTS,
          l.allowed_destination_countries || CALLING_DEFAULTS.ALLOWED_DESTINATION_COUNTRIES,
          l.max_call_seconds || CALLING_DEFAULTS.MAX_CALL_SECONDS,
          l.monthly_spending_limit_cents || 0,
        ]
      );

      const signalwireIdentity = await uniqueSignalwireIdentity(client, username);
      const agentEmail = `${username}@tenant.local`;
      const { rows: agentRows } = await client.query(
        `INSERT INTO agents (
          tenant_id, name, username, email, signalwire_identity, role, status,
          password_hash, is_available, invite_accepted_at
        )
        VALUES ($1, $2, $3, $4, $5, 'manager', 'active', $6, false, CURRENT_TIMESTAMP)
        RETURNING id, signalwire_identity`,
        [tenantId, customer_name, username, agentEmail, signalwireIdentity, passwordHash]
      );

      // Every new tenant starts with a finite 30-day calling period. The
      // SignalWire authorization route enforces this date on every call.
      await client.query(
        `INSERT INTO customer_subscriptions (
          tenant_id, plan_name, pkr_price, start_date, end_date, status, snapshot
        )
        VALUES ($1, 'Starter 30-Day Access', 0, NOW(), NOW() + INTERVAL '30 days', 'active', $2::jsonb)`,
        [tenantId, JSON.stringify({ source: 'customer_created', duration_days: 30 })]
      );

      if (usesTransactionClient) {
        await client.query('COMMIT');
        committed = true;
      }

      // Do not hand out credentials until the committed account can be read back.
      const { rows: persistedUsers } = await client.query(
        `SELECT id FROM users WHERE id = $1 AND tenant_id = $2 AND username = $3`,
        [userId, tenantId, username]
      );
      if (!persistedUsers[0]) {
        throw new Error('Customer account was not persisted after creation');
      }

      await recordAuditLog(client, {
        tenantId,
        actorUserId: request.tenant.userId,
        actorRole: request.tenant.role,
        action: 'customer_created',
        resource: 'tenant',
        targetId: tenantId,
        details: { customer_name, username, contact_phone: contact_phone || null },
      }).catch((error) => fastify.log.warn({ error, tenantId }, 'Customer audit log was not written'));

      // Return credentials ONCE — never stored in plaintext
      return reply.code(201).send({
        success: true,
        customer: {
          tenant_id: tenantId,
          user_id: userId,
          customer_name,
          username,
          contact_phone: contact_phone || null,
          agent_id: agentRows[0]?.id || null,
          signalwire_identity: agentRows[0]?.signalwire_identity || null,
        },
        credentials: {
          username,
          temporary_password: tempPassword,
          expires_in_hours: AUTH_CONFIG.TEMP_PASSWORD_EXPIRY_HOURS,
          must_change_password: true,
          warning: 'This password is shown ONCE. Share it securely with the customer.',
        },
      });
    } catch (err: any) {
      if (usesTransactionClient && !committed) {
        try { await client.query('ROLLBACK'); } catch {}
      }
      fastify.log.error(err, 'Failed to create customer');
      if (err.code === '23505') {
        return reply.code(409).send({ error: 'A customer with this identifier already exists.' });
      }
      return reply.code(500).send({ error: 'Failed to create customer' });
    } finally {
      if (client.release) client.release();
    }
  });

  // GET /v1/admin/customers — List all customers
  fastify.get('/v1/admin/customers', {
    preHandler: adminAuth
  }, async (request: any) => {
    const { page = 1, limit = 50, status, search } = request.query as any;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClause = 'WHERE t.deleted_at IS NULL';
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      whereClause += ` AND t.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (search) {
      whereClause += ` AND (t.customer_name ILIKE $${paramIndex} OR u.username ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    const { rows } = await fastify.db.query(
      `SELECT t.id as tenant_id, t.name, t.customer_name, t.status, t.plan, t.created_at, t.onboarded_at,
              u.id as user_id, u.username, u.email, u.display_name, u.role, u.must_change_password,
              tl.max_phone_numbers, tl.max_seats, tl.max_concurrent_calls,
              sub.plan_name AS subscription_plan_name,
              sub.end_date AS subscription_end_date,
              COALESCE(usage.total_calls, 0)::int AS total_calls,
              COALESCE(usage.connected_calls, 0)::int AS connected_calls,
              COALESCE(usage.billable_seconds, 0)::int AS billable_seconds
       FROM tenants t
       LEFT JOIN users u ON u.tenant_id = t.id AND u.role = '${ROLES.TENANT_OWNER}'
       LEFT JOIN tenant_limits tl ON tl.tenant_id = t.id
       LEFT JOIN LATERAL (
         SELECT plan_name, end_date
         FROM customer_subscriptions
         WHERE tenant_id = t.id
         ORDER BY (status = 'active' AND (end_date IS NULL OR end_date > NOW())) DESC,
                  end_date DESC NULLS LAST,
                  created_at DESC
         LIMIT 1
       ) sub ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*) FILTER (WHERE direction = 'outbound') AS total_calls,
           COUNT(*) FILTER (WHERE direction = 'outbound' AND status IN ('connected', 'completed')) AS connected_calls,
           COALESCE(SUM(billable_seconds) FILTER (WHERE direction = 'outbound'), 0) AS billable_seconds
         FROM tracked_calls
         WHERE tenant_id = t.id
       ) usage ON TRUE
       ${whereClause}
       ORDER BY t.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, parseInt(limit), offset]
    );

    // Count total
    const { rows: countRows } = await fastify.db.query(
      `SELECT COUNT(*) as total FROM tenants t
       LEFT JOIN users u ON u.tenant_id = t.id AND u.role = '${ROLES.TENANT_OWNER}'
       ${whereClause}`,
      params
    );

    return {
      customers: rows,
      total: parseInt(countRows[0]?.total || '0'),
      page: parseInt(page),
      limit: parseInt(limit),
    };
  });

  // GET /v1/admin/customers/:id — Customer detail
  fastify.get('/v1/admin/customers/:id', {
    preHandler: adminAuth
  }, async (request: any, reply) => {
    const { id } = request.params as any;

    const { rows: tenantRows } = await fastify.db.query(
      `SELECT t.*, u.id as user_id, u.username, u.email, u.display_name, u.role,
              u.must_change_password, u.created_at as user_created_at
       FROM tenants t
       LEFT JOIN users u ON u.tenant_id = t.id AND u.role = '${ROLES.TENANT_OWNER}'
       WHERE t.id = $1`,
      [id]
    );

    if (!tenantRows[0]) {
      return reply.code(404).send({ error: 'Customer not found' });
    }

    // Get limits
    const { rows: limitRows } = await fastify.db.query(
      `SELECT * FROM tenant_limits WHERE tenant_id = $1`, [id]
    );

    // Get phone numbers count
    let phoneCount = 0;
    try {
      const { rows: phoneRows } = await fastify.db.query(
        `SELECT COUNT(*) as cnt FROM phone_numbers WHERE tenant_id = $1 AND status = 'active'`, [id]
      );
      phoneCount = parseInt(phoneRows[0]?.cnt || '0');
    } catch { /* table may not exist */ }

    // Latest subscription is returned even when expired, so admin can renew it.
    let subscription = null;
    try {
      const { rows: subRows } = await fastify.db.query(
        `SELECT *,
                CASE
                  WHEN status = 'active' AND start_date <= NOW()
                    AND (end_date IS NULL OR end_date > NOW()) THEN true
                  ELSE false
                END AS calling_active,
                CASE
                  WHEN end_date IS NULL THEN NULL
                  ELSE GREATEST(0, CEIL(EXTRACT(EPOCH FROM (end_date - NOW())) / 86400.0))::int
                END AS days_remaining
         FROM customer_subscriptions
         WHERE tenant_id = $1
         ORDER BY (status = 'active' AND (end_date IS NULL OR end_date > NOW())) DESC,
                  end_date DESC NULLS LAST,
                  created_at DESC
         LIMIT 1`, [id]
      );
      subscription = subRows[0] || null;
    } catch { /* table may not exist */ }

    let callUsage = { total_calls: 0, connected_calls: 0, billable_seconds: 0, last_call_at: null };
    try {
      const { rows } = await fastify.db.query(
        `SELECT
           COUNT(*) FILTER (WHERE direction = 'outbound')::int AS total_calls,
           COUNT(*) FILTER (WHERE direction = 'outbound' AND status IN ('connected', 'completed'))::int AS connected_calls,
           COALESCE(SUM(billable_seconds) FILTER (WHERE direction = 'outbound'), 0)::int AS billable_seconds,
           MAX(started_at) FILTER (WHERE direction = 'outbound') AS last_call_at
         FROM tracked_calls
         WHERE tenant_id = $1`,
        [id]
      );
      callUsage = rows[0] || callUsage;
    } catch { /* tracked_calls may not exist during an older migration */ }

    // Get recent audit logs
    let auditLogs: any[] = [];
    try {
      const { rows } = await fastify.db.query(
        `SELECT * FROM audit_logs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 20`, [id]
      );
      auditLogs = rows;
    } catch { /* table may not exist */ }

    // Get Wallet Balances
    let balances = null;
    try {
      const walletService = new WalletService(fastify.db);
      balances = await walletService.getBalances(id);
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch wallet balances');
    }

    return {
      tenant: tenantRows[0],
      limits: limitRows[0] || null,
      phone_numbers_count: phoneCount,
      subscription,
      call_usage: callUsage,
      audit_logs: auditLogs,
      balances,
    };
  });

  // POST /v1/admin/customers/:id/subscription/extend — add a fresh 30-day calling period.
  fastify.post('/v1/admin/customers/:id/subscription/extend', {
    preHandler: adminAuth
  }, async (request: any, reply) => {
    const { id } = request.params as any;
    const requestedDays = Number(request.body?.duration_days ?? 30);
    const durationDays = requestedDays === 30 ? 30 : 0;

    if (!durationDays) {
      return reply.code(400).send({ error: 'Only a 30-day calling extension is available.' });
    }

    const client = await (fastify.db as any).connect();
    try {
      await client.query('BEGIN');

      const { rows: tenantRows } = await client.query(
        `SELECT plan FROM tenants WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [id]
      );
      if (!tenantRows[0]) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Customer not found' });
      }

      const { rows: currentRows } = await client.query(
        `SELECT id, end_date, snapshot
         FROM customer_subscriptions
         WHERE tenant_id = $1 AND status = 'active' AND end_date > NOW()
         ORDER BY end_date DESC
         LIMIT 1
         FOR UPDATE`,
        [id]
      );
      const currentSubscription = currentRows[0];
      const startDate = currentSubscription?.end_date
        ? new Date(currentSubscription.end_date)
        : new Date();
      const endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
      const extensionSnapshot = JSON.stringify({
        ...(currentSubscription?.snapshot || {}),
        source: 'admin_extension',
        last_extension_days: durationDays,
        last_extended_at: new Date().toISOString(),
      });

      const subscriptionRows = currentSubscription
        ? await client.query(
            `UPDATE customer_subscriptions
             SET end_date = $2,
                 snapshot = $3::jsonb
             WHERE id = $1
             RETURNING *`,
            [currentSubscription.id, endDate, extensionSnapshot]
          )
        : await client.query(
            `INSERT INTO customer_subscriptions (
              tenant_id, plan_name, pkr_price, start_date, end_date, status, snapshot
            )
            VALUES ($1, $2, 0, NOW(), $3, 'active', $4::jsonb)
            RETURNING *`,
            [
              id,
              `${tenantRows[0].plan || 'Starter'} 30-Day Calling Access`,
              endDate,
              extensionSnapshot,
            ]
          );

      await client.query('COMMIT');

      await recordAuditLog(fastify.db, {
        tenantId: id,
        actorUserId: request.tenant.userId,
        actorRole: request.tenant.role,
        action: 'calling_subscription_extended',
        resource: 'subscription',
        targetId: subscriptionRows.rows[0].id,
        details: { duration_days: durationDays, start_date: startDate, end_date: endDate },
      }).catch((error) => fastify.log.warn({ error, tenantId: id }, 'Subscription extension audit log was not written'));

      return { success: true, subscription: subscriptionRows.rows[0] };
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch {}
      fastify.log.error(err, 'Failed to extend calling subscription');
      return reply.code(500).send({ error: 'Failed to extend calling subscription' });
    } finally {
      client.release();
    }
  });

  // POST /v1/admin/customers/:id/wallet/topup — Manual top-up
  fastify.post('/v1/admin/customers/:id/wallet/topup', {
    preHandler: adminAuth
  }, async (request: any, reply) => {
    const { id } = request.params as any;
    const { unit, amount, description } = request.body as any;

    if (!unit || !['calling_cents', 'maps_credits'].includes(unit)) {
      return reply.code(400).send({ error: 'Valid unit is required (calling_cents, maps_credits)' });
    }
    if (!amount || typeof amount !== 'number') {
      return reply.code(400).send({ error: 'Valid amount is required' });
    }

    const walletService = new WalletService(fastify.db);
    
    try {
      if (amount > 0) {
        await walletService.credit({
          tenantId: id,
          unit,
          amount,
          referenceType: 'admin_topup',
          referenceId: `admin-${Date.now()}`,
          description: description || 'Admin manual top-up',
          idempotencyKey: `admin-topup-${id}-${Date.now()}`
        });
      } else if (amount < 0) {
        await walletService.debit({
          tenantId: id,
          unit,
          amount: Math.abs(amount),
          referenceType: 'admin_deduction',
          referenceId: `admin-${Date.now()}`,
          description: description || 'Admin manual deduction',
          idempotencyKey: `admin-deduct-${id}-${Date.now()}`
        });
      }
      
      const balances = await walletService.getBalances(id);
      
      await recordAuditLog(fastify.db, {
        tenantId: id,
        actorUserId: request.tenant.userId,
        actorRole: request.tenant.role,
        action: 'wallet_topup_manual',
        resource: 'tenant',
        targetId: id,
        details: { unit, amount, description: description || null },
      }).catch((error) => fastify.log.warn({ error, tenantId: id }, 'Wallet audit log was not written'));

      return { success: true, balances };
    } catch (err: any) {
      fastify.log.error(err, 'Failed to top-up wallet');
      return reply.code(400).send({ error: err.message || 'Failed to process top-up' });
    }
  });

  // GET /v1/admin/customers/:id/phone-numbers — List customer numbers
  fastify.get('/v1/admin/customers/:id/phone-numbers', {
    preHandler: adminAuth
  }, async (request: any, reply) => {
    const { id } = request.params as any;
    const { rows: tenantRows } = await fastify.db.query(
      `SELECT id FROM tenants WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [id]
    );
    if (!tenantRows[0]) return reply.code(404).send({ error: 'Customer not found' });

    const { rows } = await fastify.db.query(
      `SELECT pn.*, a.id as assigned_agent_id, a.username as assigned_username
       FROM phone_numbers pn
       LEFT JOIN agents a ON a.tenant_id = pn.tenant_id
        AND a.signalwire_phone_sid = pn.provider_sid
       WHERE pn.tenant_id = $1
       ORDER BY pn.purchased_at DESC NULLS LAST, pn.id DESC`,
      [id]
    );
    return { success: true, phoneNumbers: rows };
  });

  // POST /v1/admin/customers/:id/phone-numbers/:numberId/enable-incoming
  // Backfills inbound routing for numbers purchased before this configuration existed.
  fastify.post('/v1/admin/customers/:id/phone-numbers/:numberId/enable-incoming', {
    preHandler: adminAuth,
  }, async (request: any, reply) => {
    const { id, numberId } = request.params as any;
    if (!signalwireProjectId || !signalwireApiToken) {
      return reply.code(503).send({ error: 'Calling is not configured.' });
    }

    const { rows } = await fastify.db.query(
      `SELECT id, provider_sid, phone_number
       FROM phone_numbers
       WHERE id = $1 AND tenant_id = $2 AND provider = 'signalwire' AND status = 'active'
       LIMIT 1`,
      [numberId, id],
    );
    const number = rows[0];
    if (!number) return reply.code(404).send({ error: 'Active phone number not found.' });

    const swClient = RestClient(signalwireProjectId, signalwireApiToken, { signalwireSpaceUrl });
    await swClient.incomingPhoneNumbers(number.provider_sid).update(inboundRouting());
    return { success: true, phoneNumber: number.phone_number };
  });

  // GET /v1/admin/customers/:id/phone-numbers/search — Search numbers for a customer
  fastify.get('/v1/admin/customers/:id/phone-numbers/search', {
    preHandler: adminAuth
  }, async (request: any, reply) => {
    const { id } = request.params as any;
    const { countryCode = 'US', areaCode } = request.query as any;

    const { rows: tenantRows } = await fastify.db.query(
      `SELECT id FROM tenants WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [id]
    );
    if (!tenantRows[0]) return reply.code(404).send({ error: 'Customer not found' });

    if (!signalwireProjectId || !signalwireApiToken) {
      return reply.code(503).send({ error: 'SignalWire is not configured. Number search is disabled.' });
    }

    const swClient = RestClient(signalwireProjectId, signalwireApiToken, { signalwireSpaceUrl });
    const listOptions: any = { limit: 20 };
    if (areaCode) listOptions.areaCode = areaCode;
    const availableNumbers = await swClient.availablePhoneNumbers(countryCode).local.list(listOptions);

    return {
      success: true,
      availablePhoneNumbers: availableNumbers.map((n: any) => ({
        phoneNumber: n.phoneNumber,
        locality: n.locality,
        region: n.region,
        postalCode: n.postalCode,
        isoCountry: n.isoCountry,
        capabilities: n.capabilities,
      })),
    };
  });

  // POST /v1/admin/customers/:id/phone-numbers/purchase — Buy and assign number
  fastify.post('/v1/admin/customers/:id/phone-numbers/purchase', {
    preHandler: adminAuth
  }, async (request: any, reply) => {
    const { id } = request.params as any;
    const { phoneNumber, charge_setup_fee = true } = request.body as any || {};
    if (!phoneNumber) return reply.code(400).send({ error: 'phoneNumber is required' });
    if (!signalwireProjectId || !signalwireApiToken) {
      return reply.code(503).send({ error: 'SignalWire is not configured. Phone purchase is disabled.' });
    }

    const { rows: customerRows } = await fastify.db.query(
      `SELECT t.id, t.customer_name, u.username, u.password_hash
       FROM tenants t
       LEFT JOIN users u ON u.tenant_id = t.id AND u.role = $2
       WHERE t.id = $1 AND t.deleted_at IS NULL
       LIMIT 1`,
      [id, ROLES.TENANT_OWNER]
    );
    const customer = customerRows[0];
    if (!customer) return reply.code(404).send({ error: 'Customer not found' });

    const { rows: limitRows } = await fastify.db.query(
      `SELECT tl.max_phone_numbers,
              (SELECT COUNT(*) FROM phone_numbers WHERE tenant_id = $1 AND status = 'active') as current_count
       FROM tenant_limits tl
       WHERE tl.tenant_id = $1`,
      [id]
    );
    const limits = limitRows[0];
    if (limits && Number(limits.current_count || 0) >= Number(limits.max_phone_numbers || 1)) {
      return reply.code(400).send({ error: `Limit reached: customer can only have ${limits.max_phone_numbers} active phone numbers.` });
    }

    const walletService = new WalletService(fastify.db);
    if (charge_setup_fee) {
      const balances = await walletService.getBalances(id);
      if (Number(balances.calling_cents.available || 0) < PHONE_SETUP_FEE_CENTS) {
        return reply.code(402).send({ error: 'Customer has insufficient calling balance for number setup fee.' });
      }
    }

    const swClient = RestClient(signalwireProjectId, signalwireApiToken, { signalwireSpaceUrl });
    let incomingNumber: any = null;
    const db = fastify.db;
    const usesTransactionClient = typeof (db as any).connect === 'function';
    const client = await (db as any).connect?.() || db;
    let committed = false;

    try {
      incomingNumber = await swClient.incomingPhoneNumbers.create({ phoneNumber, ...inboundRouting() });

      if (usesTransactionClient) await client.query('BEGIN');

      if (charge_setup_fee) {
        await walletService.debit({
          tenantId: id,
          unit: 'calling_cents',
          amount: PHONE_SETUP_FEE_CENTS,
          referenceType: 'phone_number_purchase',
          referenceId: incomingNumber.sid,
          description: `Setup fee for phone number ${incomingNumber.phoneNumber}`,
          idempotencyKey: `phone-number:${incomingNumber.sid}:setup`,
        }, client);
      }

      const { rows: numberRows } = await client.query(
        `INSERT INTO phone_numbers (tenant_id, phone_number, provider, provider_sid, capabilities, monthly_cost)
         VALUES ($1, $2, 'signalwire', $3, $4, $5)
         RETURNING id, phone_number, provider_sid`,
        [id, incomingNumber.phoneNumber, incomingNumber.sid, JSON.stringify(incomingNumber.capabilities || {}), 150]
      );

      const agentId = await getOrCreateTenantAgent(
        client,
        id,
        customer.customer_name || customer.username || 'Customer',
        customer.username || `customer${String(id).slice(0, 8)}`,
        customer.password_hash || null
      );

      await client.query(
        `UPDATE agents
         SET signalwire_phone_number = $1,
             signalwire_phone_sid = $2,
             signalwire_phone_purchased_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND tenant_id = $4`,
        [incomingNumber.phoneNumber, incomingNumber.sid, agentId, id]
      );

      if (usesTransactionClient) {
        await client.query('COMMIT');
        committed = true;
      }
      await recordAuditLog(client, {
        tenantId: id,
        actorUserId: request.tenant.userId,
        actorRole: request.tenant.role,
        action: 'phone_number_purchased',
        resource: 'phone_number',
        targetId: numberRows[0].id,
        details: { phoneNumber: incomingNumber.phoneNumber, providerSid: incomingNumber.sid, assignedAgentId: agentId },
      }).catch((error) => fastify.log.warn({ error, tenantId: id }, 'Phone number audit log was not written'));
      return reply.code(201).send({ success: true, phoneNumber: numberRows[0], assignedAgentId: agentId });
    } catch (err: any) {
      if (usesTransactionClient && !committed) {
        try { await client.query('ROLLBACK'); } catch {}
      }
      if (!committed && incomingNumber?.sid) {
        try { await swClient.incomingPhoneNumbers(incomingNumber.sid).remove(); } catch {}
      }
      fastify.log.error(err, 'Failed to purchase customer phone number');
      return reply.code(err.message?.includes('Insufficient') ? 402 : 500).send({
        error: err.message || 'Failed to purchase phone number',
      });
    } finally {
      if (client.release) client.release();
    }
  });

  // PATCH /v1/admin/customers/:id — Update limits/status
  fastify.patch('/v1/admin/customers/:id', {
    preHandler: adminAuth
  }, async (request: any, reply) => {
    const { id } = request.params as any;
    const updates = request.body as any;

    // Update tenant fields
    if (updates.customer_name || updates.contact_phone || updates.plan) {
      const sets: string[] = [];
      const params: any[] = [];
      let pi = 1;

      if (updates.customer_name) { sets.push(`customer_name = $${pi}`); params.push(updates.customer_name); pi++; }
      if (updates.contact_phone) { sets.push(`contact_phone = $${pi}`); params.push(updates.contact_phone); pi++; }
      if (updates.plan) { sets.push(`plan = $${pi}`); params.push(updates.plan); pi++; }

      params.push(id);
      await fastify.db.query(
        `UPDATE tenants SET ${sets.join(', ')} WHERE id = $${pi}`,
        params
      );
    }

    // Update limits
    if (updates.limits) {
      const l = updates.limits;
      await fastify.db.query(
        `UPDATE tenant_limits SET
          max_phone_numbers = COALESCE($2, max_phone_numbers),
          max_seats = COALESCE($3, max_seats),
          max_concurrent_calls = COALESCE($4, max_concurrent_calls),
          max_daily_unique_destinations = COALESCE($5, max_daily_unique_destinations),
          max_daily_call_attempts = COALESCE($6, max_daily_call_attempts),
          max_call_seconds = COALESCE($7, max_call_seconds),
          monthly_spending_limit_cents = COALESCE($8, monthly_spending_limit_cents),
          updated_at = NOW()
         WHERE tenant_id = $1`,
        [
          id,
          l.max_phone_numbers, l.max_seats, l.max_concurrent_calls,
          l.max_daily_unique_destinations, l.max_daily_call_attempts,
          l.max_call_seconds, l.monthly_spending_limit_cents,
        ]
      );
    }

    await recordAuditLog(fastify.db, {
      tenantId: id,
      actorUserId: request.tenant.userId,
      actorRole: request.tenant.role,
      action: 'customer_updated',
      resource: 'tenant',
      targetId: id,
      details: updates,
    }).catch((error) => fastify.log.warn({ error, tenantId: id }, 'Customer update audit log was not written'));

    return { success: true, message: 'Customer updated' };
  });

  // POST /v1/admin/customers/:id/suspend
  fastify.post('/v1/admin/customers/:id/suspend', {
    preHandler: adminAuth
  }, async (request: any, reply) => {
    const { id } = request.params as any;
    const { reason } = request.body as any || {};

    await fastify.db.query(
      `UPDATE tenants SET status = 'suspended', suspended_at = NOW() WHERE id = $1`,
      [id]
    );

    // Revoke all sessions for this tenant's users
    try {
      await fastify.db.query(
        `UPDATE user_sessions SET revoked_at = NOW()
         WHERE tenant_id = $1 AND revoked_at IS NULL`,
        [id]
      );
    } catch { /* table may not exist */ }

    await recordAuditLog(fastify.db, {
      tenantId: id,
      actorUserId: request.tenant.userId,
      actorRole: request.tenant.role,
      action: 'customer_suspended',
      resource: 'tenant',
      targetId: id,
      details: { reason: reason || null },
    }).catch((error) => fastify.log.warn({ error, tenantId: id }, 'Customer suspension audit log was not written'));

    return { success: true, message: 'Customer suspended' };
  });

  // POST /v1/admin/customers/:id/reactivate
  fastify.post('/v1/admin/customers/:id/reactivate', {
    preHandler: adminAuth
  }, async (request: any) => {
    const { id } = request.params as any;

    await fastify.db.query(
      `UPDATE tenants SET status = 'active', suspended_at = NULL WHERE id = $1`,
      [id]
    );

    await recordAuditLog(fastify.db, {
      tenantId: id,
      actorUserId: request.tenant.userId,
      actorRole: request.tenant.role,
      action: 'customer_reactivated',
      resource: 'tenant',
      targetId: id,
    }).catch((error) => fastify.log.warn({ error, tenantId: id }, 'Customer reactivation audit log was not written'));

    return { success: true, message: 'Customer reactivated' };
  });

  // POST /v1/admin/customers/:id/reset-password
  fastify.post('/v1/admin/customers/:id/reset-password', {
    preHandler: adminAuth
  }, async (request: any, reply) => {
    const { id } = request.params as any;

    // Find tenant owner user
    const { rows } = await fastify.db.query(
      `SELECT u.id FROM users u WHERE u.tenant_id = $1 AND u.role = $2 LIMIT 1`,
      [id, ROLES.TENANT_OWNER]
    );

    if (!rows[0]) {
      return reply.code(404).send({ error: 'Customer user not found' });
    }

    const userId = rows[0].id;
    const tempPassword = generateTempPassword();
    const passwordHash = bcrypt.hashSync(tempPassword, 12);

    await fastify.db.query(
      `UPDATE users SET
        password_hash = $1,
        must_change_password = true,
        password_changed_at = NOW(),
        auth_version = COALESCE(auth_version, 1) + 1
       WHERE id = $2`,
      [passwordHash, userId]
    );

    // Revoke all existing sessions
    try {
      await fastify.db.query(
        `UPDATE user_sessions SET revoked_at = NOW()
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId]
      );
    } catch { /* table may not exist */ }

    await recordAuditLog(fastify.db, {
      tenantId: id,
      actorUserId: request.tenant.userId,
      actorRole: request.tenant.role,
      action: 'password_reset',
      resource: 'user',
      targetId: userId,
    }).catch((error) => fastify.log.warn({ error, tenantId: id }, 'Password reset audit log was not written'));

    return {
      success: true,
      credentials: {
        temporary_password: tempPassword,
        expires_in_hours: AUTH_CONFIG.TEMP_PASSWORD_EXPIRY_HOURS,
        must_change_password: true,
        warning: 'This password is shown ONCE. Share it securely with the customer.',
      },
    };
  });
}
