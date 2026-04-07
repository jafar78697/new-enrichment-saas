import { AuthManager, UserTokenPayload } from './jwt';

export interface TenantContext {
  tenantId: string;
  userId: string;
  workspaceId?: string;
  role: string;
  plan: string;
}

export class TenantGuard {
  constructor(private auth: AuthManager) {}

  authorizeRequest(authHeader?: string): TenantContext {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Unauthorized: Missing bearer token');
    }

    const token = authHeader.split(' ')[1];
    const payload = this.auth.verifyUserToken(token);

    return {
      tenantId: payload.tenant_id,
      userId: payload.user_id,
      workspaceId: payload.workspace_id,
      role: payload.role,
      plan: payload.plan
    };
  }
}
