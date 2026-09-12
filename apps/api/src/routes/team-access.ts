import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { requireRole } from '../middleware/require-role';
import { AUTH_CONFIG, ROLES } from '../config/saas';
import { recordAuditLog } from '../services/audit-log.service';

const LOGIN_ORIGIN = String(
  process.env.CALLING_APP_URL || process.env.FRONTEND_URL || 'https://voicecalling.space'
).replace(/\/$/, '');

function generatedPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
  const bytes = crypto.randomBytes(20);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function usernameBase(firstName: string, lastName: string): string {
  const normalized = `${firstName}.${lastName}`
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, '')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 24);
  return normalized || `employee${crypto.randomBytes(2).toString('hex')}`;
}

async function uniqueUsername(db: any, firstName: string, lastName: string): Promise<string> {
  const base = usernameBase(firstName, lastName);
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix ? `${base}${suffix}` : base;
    const { rows } = await db.query(
      `SELECT 1 FROM users WHERE lower(username) = lower($1)
       UNION ALL
       SELECT 1 FROM agents WHERE lower(username) = lower($1)
       LIMIT 1`,
      [candidate]
    );
    if (!rows.length) return candidate;
  }
  return `${base}${crypto.randomBytes(3).toString('hex')}`;
}

function credentials(username: string, password: string) {
  return {
    username,
    temporary_password: password,
    login_url: `${LOGIN_ORIGIN}/login?username=${encodeURIComponent(username)}`,
    must_change_password: true,
  };
}

export default async function teamAccessRoutes(fastify: FastifyInstance) {
  const customerAdmin = [fastify.authenticate as any, requireRole(ROLES.TENANT_OWNER) as any];

  fastify.get('/v1/team-access', { preHandler: customerAdmin }, async (request: any) => {
    const { tenantId } = request.tenant;
    const [{ rows: numberRows }, { rows: memberRows }] = await Promise.all([
      fastify.db.query(
        `SELECT pn.id, pn.phone_number, pn.provider_sid,
                a.id AS assigned_agent_id, a.username AS assigned_username
         FROM phone_numbers pn
         LEFT JOIN agents a ON a.tenant_id = pn.tenant_id
          AND a.signalwire_phone_sid = pn.provider_sid
         WHERE pn.tenant_id = $1 AND pn.status = 'active'
         ORDER BY pn.purchased_at ASC, pn.id ASC`,
        [tenantId]
      ),
      fastify.db.query(
        `SELECT u.id, u.display_name, u.username, u.email, u.account_status,
                u.created_at, a.id AS agent_id, a.signalwire_phone_number AS phone_number
         FROM users u
         LEFT JOIN agents a ON a.platform_user_id = u.id AND a.tenant_id = u.tenant_id
         WHERE u.tenant_id = $1 AND u.role = $2
         ORDER BY u.created_at DESC`,
        [tenantId, ROLES.AGENT]
      ),
    ]);

    const employeeLimit = numberRows.length;
    return {
      enabled: employeeLimit >= 2,
      capacity: {
        active_numbers: employeeLimit,
        employee_limit: employeeLimit,
        employees_used: memberRows.length,
        employees_available: Math.max(0, employeeLimit - memberRows.length),
      },
      phone_numbers: numberRows,
      employees: memberRows,
    };
  });

  fastify.post('/v1/team-access/employees', { preHandler: customerAdmin }, async (request: any, reply) => {
    const firstName = String(request.body?.first_name || '').trim();
    const lastName = String(request.body?.last_name || '').trim();
    const email = String(request.body?.email || '').trim().toLowerCase() || null;
    if (!firstName || !lastName) {
      return reply.code(400).send({ error: 'First name and last name are required.' });
    }
    if (firstName.length > 60 || lastName.length > 60) {
      return reply.code(400).send({ error: 'Employee name is too long.' });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.code(400).send({ error: 'Enter a valid email address.' });
    }

    const { tenantId, userId, role } = request.tenant;
    const client = await (fastify.db as any).connect();
    let createdUserId = '';
    let username = '';
    let temporaryPassword = '';
    let assignedNumber = '';
    try {
      await client.query('BEGIN');

      const { rows: numberRows } = await client.query(
        `SELECT id, phone_number, provider_sid
         FROM phone_numbers
         WHERE tenant_id = $1 AND status = 'active'
         ORDER BY purchased_at ASC, id ASC
         FOR UPDATE`,
        [tenantId]
      );
      if (numberRows.length < 2) {
        await client.query('ROLLBACK');
        return reply.code(403).send({
          error: 'Team Access requires at least 2 active phone numbers.',
          code: 'TEAM_ACCESS_REQUIRES_TWO_NUMBERS',
        });
      }

      const { rows: countRows } = await client.query(
        `SELECT COUNT(*)::int AS count FROM users WHERE tenant_id = $1 AND role = $2`,
        [tenantId, ROLES.AGENT]
      );
      if (Number(countRows[0]?.count || 0) >= numberRows.length) {
        await client.query('ROLLBACK');
        return reply.code(409).send({
          error: `All ${numberRows.length} employee access slots are already in use.`,
          code: 'EMPLOYEE_LIMIT_REACHED',
        });
      }

      const { rows: assignedEmployeeRows } = await client.query(
        `SELECT signalwire_phone_sid
         FROM agents
         WHERE tenant_id = $1 AND role = 'employee' AND signalwire_phone_sid IS NOT NULL`,
        [tenantId]
      );
      const assignedToEmployees = new Set(assignedEmployeeRows.map((row: any) => row.signalwire_phone_sid));
      const selectedNumber = numberRows.find((row: any) => !assignedToEmployees.has(row.provider_sid));
      if (!selectedNumber) throw new Error('No phone number is available for this employee.');

      username = await uniqueUsername(client, firstName, lastName);
      temporaryPassword = generatedPassword();
      const passwordHash = bcrypt.hashSync(temporaryPassword, 12);
      const displayName = `${firstName} ${lastName}`;
      const agentEmail = email || `${username}@team.jento.local`;

      const { rows: userRows } = await client.query(
        `INSERT INTO users (
           tenant_id, username, email, password_hash, role, must_change_password,
           display_name, password_changed_at, account_status
         )
         VALUES ($1, $2, $3, $4, $5, true, $6, NOW(), 'active')
         RETURNING id`,
        [tenantId, username, email, passwordHash, ROLES.AGENT, displayName]
      );
      createdUserId = userRows[0].id;

      // A newly purchased number may initially sit on the customer-admin agent.
      // Move it to the employee so every team seat has one dedicated caller ID.
      await client.query(
        `UPDATE agents
         SET signalwire_phone_number = NULL, signalwire_phone_sid = NULL,
             signalwire_phone_area_code = NULL, signalwire_phone_purchased_at = NULL,
             is_available = false, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $1 AND signalwire_phone_sid = $2`,
        [tenantId, selectedNumber.provider_sid]
      );

      const { rows: agentRows } = await client.query(
        `INSERT INTO agents (
           tenant_id, platform_user_id, name, username, email, signalwire_identity,
           signalwire_phone_number, signalwire_phone_sid, signalwire_phone_purchased_at,
           role, status, password_hash, is_available, invite_accepted_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP,
                 'employee', 'active', $9, true, CURRENT_TIMESTAMP)
         RETURNING id`,
        [
          tenantId,
          createdUserId,
          displayName,
          username,
          agentEmail,
          `emp_${String(createdUserId).replace(/-/g, '').slice(0, 24)}`,
          selectedNumber.phone_number,
          selectedNumber.provider_sid,
          passwordHash,
        ]
      );
      for (const moduleName of ['ai_calling', 'enrichment']) {
        await client.query(
          `INSERT INTO agent_modules (agent_id, module) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [agentRows[0].id, moduleName]
        );
      }
      assignedNumber = selectedNumber.phone_number;
      await client.query('COMMIT');
    } catch (error: any) {
      try { await client.query('ROLLBACK'); } catch {}
      fastify.log.error(error, 'Failed to create team employee');
      if (error?.code === '23505') {
        return reply.code(409).send({ error: 'That email or username is already in use.' });
      }
      return reply.code(500).send({ error: error?.message || 'Employee access could not be created.' });
    } finally {
      client.release();
    }

    await recordAuditLog(fastify.db, {
      tenantId,
      actorUserId: userId,
      actorRole: role,
      action: 'team_employee_created',
      resource: 'user',
      targetId: createdUserId,
      details: { username, phone_number: assignedNumber },
    }).catch((error) => fastify.log.warn({ error, tenantId }, 'Team employee audit log was not written'));

    return reply.code(201).send({
      employee: { id: createdUserId, username, display_name: `${firstName} ${lastName}`, email, phone_number: assignedNumber, account_status: 'active' },
      credentials: credentials(username, temporaryPassword),
    });
  });

  fastify.post('/v1/team-access/employees/:id/reset-password', { preHandler: customerAdmin }, async (request: any, reply) => {
    const { tenantId, userId, role } = request.tenant;
    const { id } = request.params as { id: string };
    const { rows } = await fastify.db.query(
      `SELECT id, username FROM users WHERE id = $1 AND tenant_id = $2 AND role = $3 LIMIT 1`,
      [id, tenantId, ROLES.AGENT]
    );
    const employee = rows[0];
    if (!employee) return reply.code(404).send({ error: 'Employee not found.' });

    const temporaryPassword = generatedPassword();
    const passwordHash = bcrypt.hashSync(temporaryPassword, 12);
    await fastify.db.query(
      `UPDATE users
       SET password_hash = $1, must_change_password = true, password_changed_at = NOW(),
           auth_version = COALESCE(auth_version, 1) + 1, account_status = 'active'
       WHERE id = $2 AND tenant_id = $3`,
      [passwordHash, id, tenantId]
    );
    await fastify.db.query(
      `UPDATE agents SET password_hash = $1, status = 'active', updated_at = CURRENT_TIMESTAMP
       WHERE platform_user_id = $2 AND tenant_id = $3`,
      [passwordHash, id, tenantId]
    );
    await fastify.db.query(
      `UPDATE user_sessions SET revoked_at = NOW()
       WHERE user_id = $1 AND tenant_id = $2 AND revoked_at IS NULL`,
      [id, tenantId]
    );
    await recordAuditLog(fastify.db, {
      tenantId, actorUserId: userId, actorRole: role,
      action: 'team_employee_password_reset', resource: 'user', targetId: id,
    }).catch(() => {});
    return { success: true, credentials: credentials(employee.username, temporaryPassword) };
  });

  fastify.patch('/v1/team-access/employees/:id/status', { preHandler: customerAdmin }, async (request: any, reply) => {
    const { tenantId, userId, role } = request.tenant;
    const { id } = request.params as { id: string };
    const status = String(request.body?.status || '');
    if (!['active', 'suspended'].includes(status)) {
      return reply.code(400).send({ error: 'Status must be active or suspended.' });
    }
    const result = await fastify.db.query(
      `UPDATE users SET account_status = $1
       WHERE id = $2 AND tenant_id = $3 AND role = $4`,
      [status, id, tenantId, ROLES.AGENT]
    );
    if (!result.rowCount) return reply.code(404).send({ error: 'Employee not found.' });
    await fastify.db.query(
      `UPDATE agents SET status = $1, is_available = ($1 = 'active'), updated_at = CURRENT_TIMESTAMP
       WHERE platform_user_id = $2 AND tenant_id = $3`,
      [status, id, tenantId]
    );
    if (status === 'suspended') {
      await fastify.db.query(
        `UPDATE user_sessions SET revoked_at = NOW()
         WHERE user_id = $1 AND tenant_id = $2 AND revoked_at IS NULL`,
        [id, tenantId]
      );
    }
    await recordAuditLog(fastify.db, {
      tenantId, actorUserId: userId, actorRole: role,
      action: `team_employee_${status}`, resource: 'user', targetId: id,
    }).catch(() => {});
    return { success: true, status };
  });

  fastify.delete('/v1/team-access/employees/:id', { preHandler: customerAdmin }, async (request: any, reply) => {
    const { tenantId, userId, role } = request.tenant;
    const { id } = request.params as { id: string };
    const client = await (fastify.db as any).connect();
    let deletedUsername = '';
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT username FROM users WHERE id = $1 AND tenant_id = $2 AND role = $3 FOR UPDATE`,
        [id, tenantId, ROLES.AGENT]
      );
      if (!rows[0]) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Employee not found.' });
      }
      deletedUsername = rows[0].username;
      await client.query(`DELETE FROM agents WHERE platform_user_id = $1 AND tenant_id = $2`, [id, tenantId]);
      await client.query(`DELETE FROM users WHERE id = $1 AND tenant_id = $2 AND role = $3`, [id, tenantId, ROLES.AGENT]);
      await client.query('COMMIT');
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      fastify.log.error(error, 'Failed to delete team employee');
      return reply.code(500).send({ error: 'Employee access could not be deleted.' });
    } finally {
      client.release();
    }
    await recordAuditLog(fastify.db, {
      tenantId, actorUserId: userId, actorRole: role,
      action: 'team_employee_deleted', resource: 'user', targetId: id,
      details: { username: deletedUsername },
    }).catch(() => {});
    return { success: true };
  });
}
