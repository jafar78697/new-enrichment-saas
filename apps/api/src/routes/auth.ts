import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { AuthManager } from '@enrichment-saas/auth';

const PLAN_HTTP_LIMITS: Record<string, number> = { starter: 5000, growth: 25000, pro: 100000 };
const PLAN_BROWSER_CREDITS: Record<string, number> = { starter: 100, growth: 500, pro: 2000 };

export default async function authRoutes(fastify: FastifyInstance) {
  const authManager = new AuthManager(process.env.JWT_PRIVATE_KEY || '', process.env.JWT_PUBLIC_KEY || '');

  // POST /v1/auth/signup
  fastify.post('/v1/auth/signup', async (request, reply) => {
    const { name, email, password, workspace_name } = request.body as any;
    if (!email || !password || !name) return reply.code(422).send({ error: 'name, email, password required' });

    const existing = await fastify.db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows[0]) return reply.code(409).send({ error: 'Email already registered' });

    const password_hash = bcrypt.hashSync(password, 12);
    const slug = (name as string).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now();

    const { rows: tenantRows } = await fastify.db.query(
      `INSERT INTO tenants (name, slug, plan) VALUES ($1, $2, 'starter') RETURNING id`,
      [name, slug]
    );
    const tenantId = tenantRows[0].id;

    const { rows: userRows } = await fastify.db.query(
      `INSERT INTO users (tenant_id, email, password_hash, role) VALUES ($1, $2, $3, 'owner') RETURNING id`,
      [tenantId, email, password_hash]
    );
    const userId = userRows[0].id;

    const { rows: wsRows } = await fastify.db.query(
      `INSERT INTO workspaces (tenant_id, name) VALUES ($1, $2) RETURNING id`,
      [tenantId, workspace_name || `${name}'s Workspace`]
    );
    const workspaceId = wsRows[0].id;

    // Initialize usage counters
    const today = new Date();
    const billingStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    await fastify.db.query(
      `INSERT INTO usage_counters (tenant_id, billing_period_start, http_enrichments_used, browser_credits_used, browser_credits_remaining, http_limit)
       VALUES ($1, $2, 0, 0, $3, $4)`,
      [tenantId, billingStart, PLAN_BROWSER_CREDITS['starter'], PLAN_HTTP_LIMITS['starter']]
    );

    const token = authManager.signUserToken({ user_id: userId, tenant_id: tenantId, workspace_id: workspaceId, role: 'owner', plan: 'starter' });
    return reply.code(201).send({ token, user: { id: userId, email, role: 'owner' } });
  });

  // POST /v1/auth/login
  fastify.post('/v1/auth/login', async (request, reply) => {
    const { email, password } = request.body as any;
    const { rows } = await fastify.db.query(
      `SELECT u.*, t.plan, w.id as workspace_id
       FROM users u
       JOIN tenants t ON u.tenant_id = t.id
       LEFT JOIN workspaces w ON w.tenant_id = t.id
       WHERE u.email = $1 LIMIT 1`,
      [email]
    );
    const user = rows[0];
    if (!user || !bcrypt.compareSync(password, user.password_hash))
      return reply.code(401).send({ error: 'Invalid email or password' });

    const token = authManager.signUserToken({ user_id: user.id, tenant_id: user.tenant_id, workspace_id: user.workspace_id, role: user.role, plan: user.plan });
    return { token, user: { id: user.id, email: user.email, role: user.role, plan: user.plan } };
  });

  // POST /v1/auth/refresh
  fastify.post('/v1/auth/refresh', async (request, reply) => {
    const { refresh_token } = request.body as any;
    if (!refresh_token) return reply.code(400).send({ error: 'refresh_token required' });
    try {
      const payload = authManager.verifyUserToken(refresh_token);
      const token = authManager.signUserToken(payload);
      return { token };
    } catch {
      return reply.code(401).send({ error: 'Invalid refresh token' });
    }
  });

  // DELETE /v1/account (GDPR)
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
