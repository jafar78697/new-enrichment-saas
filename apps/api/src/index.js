"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const helmet_1 = __importDefault(require("@fastify/helmet"));
const cors_1 = __importDefault(require("@fastify/cors"));
const rate_limit_1 = __importDefault(require("@fastify/rate-limit"));
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
fastify.register(auth_2.default);
fastify.register(jobs_1.default);
fastify.register(api_keys_1.default);
fastify.register(billing_1.default);
fastify.register(affiliates_1.default);
fastify.register(password_reset_1.default);
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
fastify.decorate('authenticate', async (request, reply) => {
    try {
        const authHeader = request.headers.authorization;
        request.tenant = tenantGuard.authorizeRequest(authHeader);
    }
    catch (err) {
        reply.code(401).send({ error: err.message });
    }
});
// Health Check
fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
});
// Start Server
const start = async () => {
    try {
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