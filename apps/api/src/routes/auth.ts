import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { AuthManager } from '@enrichment-saas/auth';

const PLAN_HTTP_LIMITS: Record<string, number> = { starter: 5000, growth: 25000, pro: 100000 };
const PLAN_BROWSER_CREDITS: Record<string, number> = { starter: 100, growth: 500, pro: 2000 };

export default async function authRoutes(fastify: FastifyInstance) {
  const authManager = new AuthManager(process.env.JWT_PRIVATE_KEY || '', process.env.JWT_PUBLIC_KEY || '');

  // POST /v1/auth/signup
  fastify.post('/v1/auth/signup', async (request, reply) => {
    return reply.code(403).send({ error: 'Signups are currently disabled. This is a private system.' });
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
