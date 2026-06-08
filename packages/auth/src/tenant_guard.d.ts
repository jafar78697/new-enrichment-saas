import { AuthManager } from './jwt';
export interface TenantContext {
    tenantId: string;
    userId: string;
    workspaceId?: string;
    role: string;
    plan: string;
}
export declare class TenantGuard {
    private auth;
    constructor(auth: AuthManager);
    authorizeRequest(authHeader?: string): TenantContext;
}
//# sourceMappingURL=tenant_guard.d.ts.map