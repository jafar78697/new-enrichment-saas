"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantGuard = void 0;
class TenantGuard {
    auth;
    constructor(auth) {
        this.auth = auth;
    }
    authorizeRequest(authHeader) {
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
exports.TenantGuard = TenantGuard;
//# sourceMappingURL=tenant_guard.js.map