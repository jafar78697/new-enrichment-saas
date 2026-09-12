import { FastifyRequest, FastifyReply } from 'fastify';
import { ROLES, RoleName } from '../config/saas';

/**
 * Middleware factory that checks if the authenticated user has one of the required roles.
 * Usage: preHandler: [fastify.authenticate, requireRole('platform_admin')]
 */
export function requireRole(...allowedRoles: RoleName[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const tenant = (request as any).tenant;
    if (!tenant) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(tenant.role as RoleName)) {
      return reply.code(403).send({
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: tenant.role,
      });
    }

    // Check tenant status — suspended/expired tenants can only logout
    if (tenant.status && tenant.status !== 'active') {
      // Allow platform_admin to always access
      if (tenant.role !== ROLES.PLATFORM_ADMIN) {
        return reply.code(403).send({
          error: `Account is ${tenant.status}. Contact support.`,
          code: 'ACCOUNT_INACTIVE',
          status: tenant.status,
        });
      }
    }
  };
}

/**
 * Middleware that checks if the user must change their password.
 * If must_change_password is true, only allow /change-password and /logout.
 */
export function requirePasswordChanged() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const tenant = (request as any).tenant;
    if (!tenant) return;

    if (tenant.mustChangePassword) {
      const url = request.url;
      if (!url.includes('/change-password') && !url.includes('/logout')) {
        return reply.code(403).send({
          error: 'You must change your password before accessing this resource.',
          code: 'PASSWORD_CHANGE_REQUIRED',
          redirect: '/change-password',
        });
      }
    }
  };
}

/**
 * Restrict module-backed routes for call-center employees. Owners, admins and
 * managers keep workspace-wide access; employees must be explicitly assigned
 * the module from Access System.
 */
export function requireModule(...allowedModules: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Plugin-level hooks run before a route's preHandler. Authenticate here
    // as well so module checks never see an empty tenant context.
    if (!(request as any).tenant) {
      await (request.server as any).authenticate(request, reply);
    }
    const tenant = (request as any).tenant;
    if (!tenant) return reply.code(401).send({ error: 'Authentication required' });
    if (['owner', 'admin', 'manager', 'platform_admin', 'tenant_owner'].includes(String(tenant.role || '').toLowerCase())) return;

    const assigned = Array.isArray(tenant.assignedModules) ? tenant.assignedModules : [];
    if (!allowedModules.some((module) => assigned.includes(module))) {
      return reply.code(403).send({
        error: 'This employee does not have access to this module.',
        code: 'MODULE_ACCESS_REQUIRED',
        requiredModules: allowedModules,
      });
    }
  };
}
