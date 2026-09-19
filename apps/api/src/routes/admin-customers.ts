import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { RestClient } from '@signalwire/compatibility-api';
import { requireRole } from '../middleware/require-role';
import { ROLES, AUTH_CONFIG, CALLING_DEFAULTS } from '../config/saas';
import { WalletService } from '../services/wallet.service';
import { recordAuditLog } from '../services/audit-log.service';
import { normalizeUSPhone } from '../utils/us-phone.js';

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

function limitInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Limit must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function normalizeBulkCustomer(raw: any, index: number) {
  const customerName = String(raw?.customer_name || raw?.name || '').trim();
  if (!customerName) throw new Error(`Row ${index + 1}: customer_name is required.`);
  if (customerName.length > 120) throw new Error(`Row ${index + 1}: customer_name is too long.`);

  const requestedUsername = raw?.username === undefined || raw?.username === null
    ? ''
    : String(raw.username).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (raw?.username && requestedUsername.length < 3) {
    throw new Error(`Row ${index + 1}: username must contain at least 3 letters or numbers.`);
  }

  const email = raw?.email ? String(raw.email).trim().toLowerCase() : null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`Row ${index + 1}: email is invalid.`);
  }

  const limits = raw?.limits || raw;
  const maxSeats = limitInteger(limits?.max_seats, CALLING_DEFAULTS.MAX_SEATS, 1, 1000);
  const maxPhoneNumbers = limitInteger(limits?.max_phone_numbers, maxSeats, 1, 1000);
  if (maxPhoneNumbers < maxSeats) {
    throw new Error(`Row ${index + 1}: max_phone_numbers must be at least max_seats so every employee can receive a dedicated number.`);
  }
  const contactPhone = raw?.contact_phone ? normalizeUSPhone(String(raw.contact_phone)) : null;
  if (raw?.contact_phone && !contactPhone) {
    throw new Error(`Row ${index + 1}: contact_phone is invalid. Must be a valid US/CA number.`);
  }

  return {
    customer_name: customerName,
    contact_phone: contactPhone,
    username: requestedUsername,
    email,
    limits: {
      max_phone_numbers: maxPhoneNumbers,
      max_seats: maxSeats,
      max_concurrent_calls: limitInteger(limits?.max_concurrent_calls, CALLING_DEFAULTS.MAX_CONCURRENT_CALLS, 1, 100),
      max_daily_unique_destinations: limitInteger(limits?.max_daily_unique_destinations, CALLING_DEFAULTS.MAX_DAILY_UNIQUE_DESTINATIONS, 1, 100000),
      max_daily_call_attempts: limitInteger(limits?.max_daily_call_attempts, CALLING_DEFAULTS.MAX_DAILY_CALL_ATTEMPTS, 1, 1000000),
      max_call_seconds: limitInteger(limits?.max_call_seconds, CALLING_DEFAULTS.MAX_CALL_SECONDS, 60, 86400),
    },
  };
}

async function provisionBulkCustomer(client: any, item: ReturnType<typeof normalizeBulkCustomer>) {
  const username = item.username || await generateUsername(client, item.customer_name);
  if (username.length < 3) throw new Error('Generated username is too short.');

  const { rows: existingUsers } = await client.query(
    `SELECT 1 FROM users WHERE lower(username) = lower($1)
     UNION ALL
     SELECT 1 FROM agents WHERE lower(username) = lower($1)
     LIMIT 1`,
    [username]
  );
  if (existingUsers.length > 0) throw new Error(`Username "${username}" is already taken.`);

  const temporaryPassword = generateTempPassword();
  const passwordHash = bcrypt.hashSync(temporaryPassword, 12);
  const limits = item.limits;

  const { rows: tenantRows } = await client.query(
    `INSERT INTO tenants (name, slug, plan, status, customer_name, contact_phone, onboarded_at)
     VALUES ($1, $2, 'starter', 'active', $3, $4, NOW())
     RETURNING id`,
    [item.customer_name, username, item.customer_name, item.contact_phone]
  );
  const tenantId = tenantRows[0].id;

  const { rows: userRows } = await client.query(
    `INSERT INTO users (tenant_id, username, email, password_hash, role, must_change_password, display_name, contact_phone)
     VALUES ($1, $2, $3, $4, $5, true, $6, $7)
     RETURNING id`,
    [tenantId, username, item.email, passwordHash, ROLES.TENANT_OWNER, item.customer_name, item.contact_phone]
  );
  const userId = userRows[0].id;

  await client.query(`INSERT INTO workspaces (tenant_id, name) VALUES ($1, $2)`, [tenantId, `${item.customer_name}'s Workspace`]);
  await client.query(
    `INSERT INTO tenant_limits (
       tenant_id, max_phone_numbers, max_seats, max_concurrent_calls,
       max_daily_unique_destinations, max_daily_call_attempts,
       allowed_destination_countries, max_call_seconds, monthly_spending_limit_cents
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0)`,
    [tenantId, limits.max_phone_numbers, limits.max_seats, limits.max_concurrent_calls,
      limits.max_daily_unique_destinations, limits.max_daily_call_attempts,
      CALLING_DEFAULTS.ALLOWED_DESTINATION_COUNTRIES, limits.max_call_seconds]
  );

  const signalwireIdentity = await uniqueSignalwireIdentity(client, username);
  const agentEmail = `${username}@tenant.local`;
  const { rows: agentRows } = await client.query(
    `INSERT INTO agents (
       tenant_id, name, username, email, signalwire_identity, role, status,
       password_hash, is_available, invite_accepted_at
     ) VALUES ($1, $2, $3, $4, $5, 'manager', 'active', $6, false, CURRENT_TIMESTAMP)
     RETURNING id, signalwire_identity`,
    [tenantId, item.customer_name, username, agentEmail, signalwireIdentity, passwordHash]
  );

  await client.query(
    `INSERT INTO customer_subscriptions (
       tenant_id, plan_name, pkr_price, start_date, end_date, status, snapshot
     ) VALUES ($1, 'Starter 30-Day Access', 0, NOW(), NOW() + INTERVAL '30 days', 'active', $2::jsonb)`,
    [tenantId, JSON.stringify({ source: 'admin_bulk_customer_created', duration_days: 30 })]
  );

  return {
    customer: {
      tenant_id: tenantId,
      user_id: userId,
      customer_name: item.customer_name,
      username,
      email: item.email,
      contact_phone: item.contact_phone,
      agent_id: agentRows[0]?.id || null,
      signalwire_identity: agentRows[0]?.signalwire_identity || null,
      limits,
    },
    credentials: {
      username,
      temporary_password: temporaryPassword,
      must_change_password: true,
      login_url: `${String(process.env.CALLING_APP_URL || process.env.FRONTEND_URL || 'https://voicecalling.space').replace(/\/$/, '')}/login?username=${encodeURIComponent(username)}`,
    },
  };
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

  // POST /v1/admin/customers/bulk — Provision a complete customer batch.
  // The batch is all-or-nothing at the database level. SignalWire number
  // purchases intentionally remain a separate step because provider actions
  // cannot be rolled back by a SQL transaction.
  fastify.post('/v1/admin/customers/bulk', {
    preHandler: adminAuth,
  }, async (request: any, reply) => {
    const rawItems = request.body?.customers || request.body?.items;
    const idempotencyKey = String(request.headers['idempotency-key'] || '').trim();
    if (!idempotencyKey || idempotencyKey.length > 120) {
      return reply.code(400).send({ error: 'A unique Idempotency-Key header is required for bulk provisioning.' });
    }
    if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 50) {
      return reply.code(400).send({ error: 'Send between 1 and 50 customers in the customers array.' });
    }

    let items: ReturnType<typeof normalizeBulkCustomer>[];
    try {
      items = rawItems.map((item: any, index: number) => normalizeBulkCustomer(item, index));
    } catch (error: any) {
      return reply.code(400).send({ error: error.message || 'Bulk customer data is invalid.' });
    }

    const requestHash = crypto.createHash('sha256').update(JSON.stringify(items)).digest('hex');
    const client = await (fastify.db as any).connect();
    try {
      await client.query('BEGIN');

      const { rows: insertedRows } = await client.query(
        `INSERT INTO admin_bulk_provisioning_batches (actor_user_id, idempotency_key, request_hash, status)
         VALUES ($1, $2, $3, 'in_progress')
         ON CONFLICT (actor_user_id, idempotency_key) DO NOTHING
         RETURNING id`,
        [request.tenant.userId, idempotencyKey, requestHash]
      );

      if (insertedRows.length === 0) {
        const { rows: existingRows } = await client.query(
          `SELECT request_hash, status, result
           FROM admin_bulk_provisioning_batches
           WHERE actor_user_id = $1 AND idempotency_key = $2
           FOR UPDATE`,
          [request.tenant.userId, idempotencyKey]
        );
        const existing = existingRows[0];
        if (!existing || existing.request_hash !== requestHash) {
          await client.query('ROLLBACK');
          return reply.code(409).send({ error: 'This Idempotency-Key was already used with different customer data.' });
        }
        await client.query('ROLLBACK');
        if (existing.status === 'completed') {
          return reply.code(409).send({
            error: 'This bulk batch was already completed. Credentials were returned only in the original response.',
            code: 'BULK_ALREADY_PROCESSED',
            result: existing.result,
          });
        }
        return reply.code(409).send({ error: 'This bulk batch is already being processed.', code: 'BULK_IN_PROGRESS' });
      }

      const results: any[] = [];
      for (let index = 0; index < items.length; index += 1) {
        try {
          results.push({ row: index + 1, ...(await provisionBulkCustomer(client, items[index])) });
        } catch (error: any) {
          throw new Error(`Row ${index + 1} failed: ${error.message || 'customer could not be created'}`);
        }
      }

      const safeResult = {
        count: results.length,
        customers: results.map(({ row, customer }: any) => ({ row, customer })),
      };
      await client.query(
        `UPDATE admin_bulk_provisioning_batches
         SET status = 'completed', result = $1::jsonb, completed_at = NOW()
         WHERE actor_user_id = $2 AND idempotency_key = $3`,
        [JSON.stringify(safeResult), request.tenant.userId, idempotencyKey]
      );
      await client.query('COMMIT');

      await recordAuditLog(fastify.db, {
        tenantId: request.tenant.tenantId,
        actorUserId: request.tenant.userId,
        actorRole: request.tenant.role,
        action: 'customers_bulk_provisioned',
        resource: 'tenant_batch',
        targetId: idempotencyKey,
        details: { count: results.length, tenant_ids: results.map((entry) => entry.customer.tenant_id) },
      }).catch((error) => fastify.log.warn({ error }, 'Bulk provisioning audit log was not written'));

      return reply.code(201).send({ success: true, idempotency_key: idempotencyKey, ...safeResult, credentials: results.map(({ row, credentials }: any) => ({ row, ...credentials })) });
    } catch (error: any) {
      try { await client.query('ROLLBACK'); } catch {}
      fastify.log.error(error, 'Failed to provision customer batch');
      if (error?.code === '23505') {
        return reply.code(409).send({ error: 'A customer username or identifier already exists. No customers in this batch were created.' });
      }
      return reply.code(400).send({ error: error.message || 'Bulk customer provisioning failed. No customers in this batch were created.' });
    } finally {
      client.release();
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

    // Get enrichment usage
    let enrichmentUsage = { total_keywords: 0, total_leads: 0 };
    try {
      const { rows } = await fastify.db.query(
        `SELECT
           (SELECT COALESCE(SUM(cardinality(keywords)), 0)::int FROM metered_maps_jobs WHERE tenant_id = $1 AND status IN ('queued', 'running', 'completed')) as total_keywords,
           (SELECT COUNT(*)::int FROM enrichment_results WHERE tenant_id = $1) as total_leads`,
        [id]
      );
      enrichmentUsage = rows[0] || enrichmentUsage;
    } catch { /* table may not exist */ }

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

    let walletActivity: any[] = [];
    try {
      const { rows } = await fastify.db.query(
        `SELECT wl.operation_type, wl.amount, wl.balance_after, wl.description,
                wl.created_at, w.unit
         FROM wallet_ledger wl
         JOIN wallets w ON w.id = wl.wallet_id
         WHERE wl.tenant_id = $1 AND wl.operation_type IN ('credit', 'debit')
         ORDER BY wl.created_at DESC LIMIT 10`,
        [id]
      );
      walletActivity = rows;
    } catch { /* wallet ledger may not exist on older installs */ }

    return {
      tenant: tenantRows[0],
      limits: limitRows[0] || null,
      phone_numbers_count: phoneCount,
      subscription,
      call_usage: callUsage,
      enrichment_usage: enrichmentUsage,
      audit_logs: auditLogs,
      balances,
      wallet_activity: walletActivity,
    };
  });

  // POST /v1/admin/customers/:id/subscription/extend — add a custom calling period.
  fastify.post('/v1/admin/customers/:id/subscription/extend', {
    preHandler: adminAuth
  }, async (request: any, reply) => {
    const { id } = request.params as any;
    const durationDays = Number(request.body?.duration_days ?? 30);

    if (durationDays <= 0) {
      return reply.code(400).send({ error: 'Duration days must be a positive number.' });
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
      let endDate;
      
      if (request.body?.set_days !== undefined) {
        const setDays = Number(request.body.set_days);
        endDate = new Date(Date.now() + setDays * 24 * 60 * 60 * 1000);
      } else {
        endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
      }
      
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

  // PUT /v1/admin/customers/:id/limits — Update customer limits (seats, etc.)
  fastify.put('/v1/admin/customers/:id/limits', {
    preHandler: adminAuth
  }, async (request: any, reply) => {
    const { id } = request.params as any;
    const { max_seats, max_phone_numbers, call_recording_enabled, employee_access_enabled } = request.body as any;

    try {
      const updates = [];
      const values = [];
      let paramIdx = 1;

      if (max_seats !== undefined) {
        updates.push(`max_seats = $${paramIdx++}`);
        values.push(Number(max_seats));
      }
      if (max_phone_numbers !== undefined) {
        updates.push(`max_phone_numbers = $${paramIdx++}`);
        values.push(Number(max_phone_numbers));
      }
      if (call_recording_enabled !== undefined) {
        updates.push(`call_recording_enabled = $${paramIdx++}`);
        values.push(Boolean(call_recording_enabled));
      }
      if (employee_access_enabled !== undefined) {
        updates.push(`employee_access_enabled = $${paramIdx++}`);
        values.push(Boolean(employee_access_enabled));
      }

      if (updates.length === 0) return { success: true };

      values.push(id);
      await fastify.db.query(
        `UPDATE tenant_limits SET ${updates.join(', ')} WHERE tenant_id = $${paramIdx}`,
        values
      );

      await recordAuditLog(fastify.db, {
        tenantId: id,
        actorUserId: request.tenant.userId,
        actorRole: request.tenant.role,
        action: 'limits_updated',
        resource: 'tenant',
        targetId: id,
        details: { max_seats, max_phone_numbers, call_recording_enabled, employee_access_enabled },
      }).catch(() => {});

      return { success: true };
    } catch (err) {
      fastify.log.error(err, 'Failed to update limits');
      return reply.code(500).send({ error: 'Failed to update customer limits' });
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

  // POST /v1/admin/customers/:id/phone-numbers/:numberId/reassign
  fastify.post('/v1/admin/customers/:id/phone-numbers/:numberId/reassign', {
    preHandler: adminAuth
  }, async (request: any, reply) => {
    const { id, numberId } = request.params as any;
    const source = String(request.body?.source || 'purchased');
    const adminTenantId = request.tenant?.tenantId;
    
    if (!adminTenantId) return reply.code(401).send({ error: 'Unauthorized' });

    try {
      const client = await (fastify.db as any).connect?.() || fastify.db;
      const usesTransactionClient = typeof (fastify.db as any).connect === 'function';

      try {
        if (usesTransactionClient) await client.query('BEGIN');

        // Check if the number belongs to the admin pool or demo pool.
        const { rows: numberRows } = source === 'demo'
          ? await client.query(
            `SELECT id, phone_number, provider, provider_sid FROM demo_number_pool
             WHERE id = $1 AND (status = 'available' OR (status = 'assigned' AND expires_at < NOW())) FOR UPDATE`,
            [numberId],
          )
          : await client.query(
          `SELECT * FROM phone_numbers WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
          [numberId, adminTenantId]
          );

        if (numberRows.length === 0) {
          throw new Error('Number not found or not available in the unassigned pool.');
        }

        // Check target customer limits
        const { rows: limitRows } = await client.query(
          `SELECT tl.max_phone_numbers, tl.max_seats,
                  (SELECT COUNT(*) FROM phone_numbers WHERE tenant_id = $1 AND status = 'active') as current_count
           FROM tenant_limits tl WHERE tl.tenant_id = $1`,
          [id]
        );

        const limits = limitRows[0];
        const effectivePhoneLimit = limits
          ? Math.max(Number(limits.max_phone_numbers || 0), Number(limits.max_seats || 0), 1)
          : 1;
        if (limits && Number(limits.current_count || 0) >= effectivePhoneLimit) {
          throw new Error(`Limit reached: customer can only have ${effectivePhoneLimit} active phone numbers.`);
        }

        const number = numberRows[0];
        if (source === 'demo') {
          // Older demo-pool rows may not have the SignalWire SID populated.
          // Resolve it from SignalWire before inserting into phone_numbers,
          // where provider_sid is required and unique.
          let providerSid = number.provider_sid;
          if (!providerSid && signalwireProjectId && signalwireApiToken) {
            const swClient = RestClient(signalwireProjectId, signalwireApiToken, { signalwireSpaceUrl });
            const ownedNumbers = await swClient.incomingPhoneNumbers.list({ limit: 100 });
            const match = ownedNumbers.find((item: any) => item.phoneNumber === number.phone_number);
            providerSid = match?.sid || null;
            if (providerSid) {
              await client.query(
                `UPDATE demo_number_pool SET provider_sid = $1, updated_at = NOW() WHERE id = $2`,
                [providerSid, numberId],
              );
            }
          }
          if (!providerSid) {
            throw new Error('This demo number is not available in SignalWire. Please sync the number pool first.');
          }
          await client.query(
            `UPDATE demo_number_pool SET status = 'assigned', assigned_tenant_id = $1,
             assigned_at = NOW(), expires_at = NULL, updated_at = NOW() WHERE id = $2`,
            [id, numberId],
          );
          await client.query(
            `INSERT INTO phone_numbers (tenant_id, phone_number, provider, provider_sid, capabilities, monthly_cost, status)
             VALUES ($1, $2, $3, $4, $5::jsonb, 0, 'active')
             ON CONFLICT (phone_number) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, status = 'active'`,
            [id, number.phone_number, number.provider || 'signalwire', providerSid, JSON.stringify({ voice: true })],
          );
        } else {
          await client.query(`UPDATE phone_numbers SET tenant_id = $1 WHERE id = $2`, [id, numberId]);
        }

        if (usesTransactionClient) await client.query('COMMIT');
        return { success: true, message: 'Number reassigned successfully.' };
      } catch (err) {
        if (usesTransactionClient) await client.query('ROLLBACK');
        throw err;
      } finally {
        if (client.release) client.release();
      }
    } catch (err: any) {
      fastify.log.error(err, 'Failed to reassign phone number');
      return reply.code(400).send({ error: err.message || 'Failed to reassign phone number' });
    }
  });

  // GET /v1/admin/unassigned-phone-numbers — List admin-owned and unused demo-pool numbers.
  fastify.get('/v1/admin/unassigned-phone-numbers', {
    preHandler: adminAuth
  }, async (request: any, reply) => {
    const adminTenantId = request.tenant?.tenantId;
    if (!adminTenantId) return reply.code(401).send({ error: 'Unauthorized' });

    const { rows } = await fastify.db.query(
      `SELECT pn.id::text AS id, pn.phone_number, pn.provider, pn.provider_sid, pn.capabilities,
              pn.status, pn.monthly_cost, pn.purchased_at, pn.released_at,
              'purchased' AS source
       FROM phone_numbers pn
       WHERE pn.tenant_id = $1 AND pn.status = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM demo_number_pool duplicate_demo
           WHERE duplicate_demo.phone_number = pn.phone_number
         )
       UNION ALL
       SELECT dp.id::text AS id, dp.phone_number, dp.provider, dp.provider_sid,
              jsonb_build_object('voice', true) AS capabilities,
              'available' AS status, 0 AS monthly_cost, dp.created_at AS purchased_at,
              NULL AS released_at, 'demo' AS source
       FROM demo_number_pool dp
       WHERE dp.status = 'available' OR (dp.status = 'assigned' AND dp.expires_at < NOW())
       ORDER BY purchased_at DESC NULLS LAST, id DESC`,
      [adminTenantId]
    );
    return { success: true, phoneNumbers: rows.map((row: any) => ({ ...row, source: row.source || 'purchased' })) };
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
    if (areaCode) {
      const q = String(areaCode).trim();
      if (q.length === 5 && /^\d+$/.test(q)) {
        listOptions.inPostalCode = q;
      } else if (q.length === 3 && /^\d+$/.test(q)) {
        listOptions.areaCode = q;
      } else if (q.length === 2 && /^[A-Za-z]+$/.test(q)) {
        listOptions.inRegion = q.toUpperCase();
      } else {
        listOptions.inLocality = q;
      }
    }
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
    const { phoneNumber: rawPhoneNumber, charge_setup_fee = true } = request.body as any || {};
    const phoneNumber = normalizeNorthAmericanPhone(rawPhoneNumber);
    if (!phoneNumber) return reply.code(400).send({ error: 'A valid US/CA phone number is required' });
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

      // An admin upgrade must also remove the customer from demo mode so the
      // customer dashboard reflects the paid/active account immediately.
      if (updates.plan && updates.plan !== 'demo') {
        const subscriptionUpdate = await fastify.db.query(
          `UPDATE customer_subscriptions
           SET plan_name = $1,
               start_date = COALESCE(start_date, NOW()),
               end_date = CASE
                 WHEN end_date IS NULL OR end_date <= NOW() THEN NOW() + INTERVAL '30 days'
                 ELSE end_date
               END,
               status = 'active',
               pkr_price = COALESCE(NULLIF(pkr_price, 0), 0)
           WHERE tenant_id = $2 AND status = 'active'
             AND (end_date IS NULL OR end_date > NOW())`,
          ['Starter Calling Plan', id]
        );
        if (subscriptionUpdate.rowCount === 0) {
          await fastify.db.query(
            `INSERT INTO customer_subscriptions
               (tenant_id, plan_name, pkr_price, start_date, end_date, status, snapshot)
             VALUES ($1, 'Starter Calling Plan', 0, NOW(), NOW() + INTERVAL '30 days', 'active', $2::jsonb)`,
            [id, JSON.stringify({ source: 'admin_upgrade_repair', duration_days: 30 })]
          );
        }

        // Demo accounts are provisioned with a 3-attempt cap. Upgrade must
        // replace that demo value while preserving any higher custom limit.
        await fastify.db.query(
          `UPDATE tenant_limits
           SET max_daily_call_attempts = 0,
               max_daily_unique_destinations = 0,
               max_concurrent_calls = 0,
               updated_at = NOW()
           WHERE tenant_id = $1`,
          [id]
        );
      }
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

  // Delete customer
  fastify.delete('/v1/admin/customers/:id', {
    preHandler: adminAuth
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const client = await (fastify.db as any).connect();
      try {
        await client.query('BEGIN');
        
        // Mark tenant as deleted and suspended
        await client.query(
          `UPDATE tenants SET deleted_at = NOW(), status = 'suspended' WHERE id = $1`,
          [id]
        );

        // Return demo-pool numbers to the demo pool; retain regular purchases in the admin pool.
        const reqAny = request as any;
        const adminTenantId = reqAny.tenant?.tenantId;
        if (adminTenantId) {
          await client.query(
            `UPDATE phone_numbers SET tenant_id = $1
             WHERE tenant_id = $2 AND NOT EXISTS (
               SELECT 1 FROM demo_number_pool dp WHERE dp.phone_number = phone_numbers.phone_number
             )`,
            [adminTenantId, id]
          );
        }
        await client.query(
          `UPDATE demo_number_pool dp SET status = 'available', assigned_tenant_id = NULL,
           assigned_at = NULL, expires_at = NULL, updated_at = NOW()
           WHERE dp.assigned_tenant_id = $1`,
          [id],
        );
        await client.query(
          `DELETE FROM phone_numbers pn WHERE pn.tenant_id = $1
           AND EXISTS (SELECT 1 FROM demo_number_pool dp WHERE dp.phone_number = pn.phone_number)`,
          [id],
        );
        
        // Block all agents (child users) of this tenant from logging in and release their numbers
        await client.query(
          `UPDATE agents SET status = 'suspended', signalwire_phone_number = NULL, signalwire_phone_sid = NULL, signalwire_phone_area_code = NULL, is_available = false WHERE tenant_id = $1`,
          [id],
        );

        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      await recordAuditLog(fastify.db, {
        tenantId: id,
        action: 'customer.deleted',
        resource: 'tenant',
        actorUserId: (request as any).user?.id || 'system',
        details: { customer_id: id }
      }).catch((error) => fastify.log.warn({ error, tenantId: id }, 'Customer deletion audit log was not written'));

      return { success: true, message: 'Customer deleted successfully' };
    } catch (err) {
      fastify.log.error(err, 'Failed to delete customer');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

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
