"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = apiKeyRoutes;
const auth_1 = require("@enrichment-saas/auth");
async function apiKeyRoutes(fastify) {
    const keyManager = new auth_1.ApiKeyManager();
    fastify.get('/v1/api-keys', {
        preHandler: [fastify.authenticate]
    }, async (request) => {
        const { tenantId } = request.tenant;
        const { rows } = await fastify.db.query('SELECT id, name, key_prefix, last_used_at, created_at FROM api_keys WHERE tenant_id = $1 AND revoked_at IS NULL', [tenantId]);
        return { keys: rows };
    });
    fastify.post('/v1/api-keys', {
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const { tenantId } = request.tenant;
        const { name } = request.body;
        const { key, prefix, hash } = keyManager.generateKey();
        const { rows } = await fastify.db.query('INSERT INTO api_keys (tenant_id, name, key_prefix, key_hash) VALUES ($1, $2, $3, $4) RETURNING id', [tenantId, name, prefix, hash]);
        return reply.code(201).send({
            id: rows[0].id,
            name,
            key, // Only shown once
            prefix
        });
    });
    fastify.delete('/v1/api-keys/:id', {
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const { tenantId } = request.tenant;
        const { id } = request.params;
        await fastify.db.query('UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
        return reply.code(204).send();
    });
}
//# sourceMappingURL=api-keys.js.map