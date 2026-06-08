"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const helmet_1 = __importDefault(require("@fastify/helmet"));
const cors_1 = __importDefault(require("@fastify/cors"));
const rate_limit_1 = __importDefault(require("@fastify/rate-limit"));
// @ts-ignore — JS module shipped without types
const express_1 = __importDefault(require("@fastify/express"));
const dotenv_1 = __importDefault(require("dotenv"));
const auth_1 = require("@enrichment-saas/auth");
dotenv_1.default.config();
const fastify = (0, fastify_1.default)({
    logger: true
});
// Load Keys from environment
const PRIVATE_KEY = process.env.JWT_PRIVATE_KEY || '';
const PUBLIC_KEY = process.env.JWT_PUBLIC_KEY || '';
// Auth Setup
const authManager = new auth_1.AuthManager(PRIVATE_KEY, PUBLIC_KEY);
const tenantGuard = new auth_1.TenantGuard(authManager);
// Database Pool
const db_1 = __importDefault(require("./plugins/db"));
fastify.register(db_1.default);
// Register Routes
const auth_2 = __importDefault(require("./routes/auth"));
const jobs_1 = __importDefault(require("./routes/jobs"));
const api_keys_1 = __importDefault(require("./routes/api-keys"));
const billing_1 = __importDefault(require("./routes/billing"));
const affiliates_1 = __importDefault(require("./routes/affiliates"));
const password_reset_1 = __importDefault(require("./routes/password-reset"));
const public_enrich_1 = __importDefault(require("./routes/public-enrich"));
const crm_1 = __importDefault(require("./routes/crm"));
const outreach_1 = __importDefault(require("./routes/outreach"));
fastify.register(auth_2.default);
fastify.register(jobs_1.default);
fastify.register(api_keys_1.default);
fastify.register(billing_1.default);
fastify.register(affiliates_1.default);
fastify.register(password_reset_1.default);
fastify.register(public_enrich_1.default);
fastify.register(crm_1.default);
fastify.register(outreach_1.default);
// Register Plugins
fastify.register(helmet_1.default);
fastify.register(cors_1.default, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
});
fastify.register(rate_limit_1.default, {
    max: 100,
    timeWindow: '1 minute'
});
// Middleware for Auth
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
fastify.decorate('authenticate', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
        return reply.code(401).send({ error: 'Missing token' });
    }
    try {
        // Try the original enrichment token format first
        request.tenant = tenantGuard.authorizeRequest(authHeader);
    }
    catch (err) {
        // Fallback to the new calls-module token (call_token)
        try {
            const token = authHeader.split(' ')[1];
            const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'dev-secret-change-me-change-me-change-me');
            // Mock a tenant object so Fastify enrichment routes don't crash.
            // We map the calls-module user to a default tenant.
            request.tenant = {
                tenantId: 'c1f6f7a0-f75d-46a2-afc7-810bde42c467',
                userId: '40c3d04e-2394-4471-b5c6-251a17063fdd',
                workspaceId: null,
                plan: 'pro',
                role: decoded.role || 'owner'
            };
            request.user = decoded;
        }
        catch (fallbackErr) {
            reply.code(401).send({ error: 'Invalid token: ' + fallbackErr.message });
        }
    }
});
// Health Check
fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
});
// ── Calls module mount ─────────────────────────────────────────────────
// Mounts the unified Express-based calls-backend (auth, employees, twilio,
// contacts, calls, agents) at /api/* on the same host that serves /v1/* for
// enrichment. Lets app.jentoai.pro use ONE backend host for everything.
async function mountCallsModule() {
    await fastify.register(express_1.default);
    // @ts-ignore — JS interop
    const { createCallsApp } = await import('./calls-module/mount.js');
    // @ts-ignore — db init lazy
    const { initializeDatabase } = await import('./calls-module/db/index.js');
    try {
        await initializeDatabase();
    }
    catch (err) {
        fastify.log.warn({ err }, 'calls-module DB init failed — calls features disabled');
        return;
    }
    // @ts-ignore — express type
    fastify.use(createCallsApp());
    // socket.io is wired only when Twilio is configured; otherwise the live
    // dialer events stay dormant but the rest of /api keeps working.
    // @ts-ignore — JS interop
    const { CALLS_ENABLED } = await import('./calls-module/config/env.js');
    if (CALLS_ENABLED) {
        try {
            // @ts-ignore — JS interop
            const { Server } = await import('socket.io');
            // @ts-ignore — JS interop
            const { initializeSocket } = await import('./calls-module/services/socket.service.js');
            const io = new Server(fastify.server, {
                cors: { origin: true, credentials: true },
                path: '/socket.io',
            });
            initializeSocket(io);
            fastify.log.info('calls-module socket.io live');
        }
        catch (err) {
            fastify.log.warn({ err }, 'socket.io init failed');
        }
    }
    else {
        fastify.log.info('calls-module mounted (Twilio disabled — set TWILIO_* env vars to enable)');
    }
}
// Start Server
const start = async () => {
    try {
        await mountCallsModule();
        const port = parseInt(process.env.PORT || '3000');
        await fastify.listen({ port, host: '0.0.0.0' });
        console.log(`🚀 API Server running on port ${port}`);
    }
    catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};
start();
//# sourceMappingURL=index.js.map