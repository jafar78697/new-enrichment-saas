"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantScopedRepository = exports.BaseRepository = void 0;
class BaseRepository {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async query(text, params = []) {
        return this.pool.query(text, params);
    }
    async queryOne(text, params = []) {
        const result = await this.query(text, params);
        return result.rows[0] || null;
    }
}
exports.BaseRepository = BaseRepository;
class TenantScopedRepository extends BaseRepository {
    tenantId;
    constructor(pool, tenantId) {
        super(pool);
        this.tenantId = tenantId;
    }
    // Wrappers that automatically inject tenant_id
    async scopedQuery(text, params = []) {
        // Basic implementation: assumes tenant_id is the first or specific param
        // In a real app, this might involve query rewriting or strict column checks
        return this.query(text, [...params, this.tenantId]);
    }
}
exports.TenantScopedRepository = TenantScopedRepository;
//# sourceMappingURL=base.js.map