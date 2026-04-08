import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import dotenv from 'dotenv';
import { AuthManager, TenantGuard } from '@enrichment-saas/auth';
import { createPool } from '@enrichment-saas/db';

dotenv.config();

const fastify = Fastify({
  logger: true
});

// Load Keys from environment
const PRIVATE_KEY = process.env.JWT_PRIVATE_KEY || '';
const PUBLIC_KEY = process.env.JWT_PUBLIC_KEY || '';

// Auth Setup
const authManager = new AuthManager(PRIVATE_KEY, PUBLIC_KEY);
const tenantGuard = new TenantGuard(authManager);

// Database Pool
import dbPlugin from './plugins/db';
fastify.register(dbPlugin);

// Register Routes
import authRoutes from './routes/auth';
import jobRoutes from './routes/jobs';
import apiKeyRoutes from './routes/api-keys';
import billingRoutes from './routes/billing';

fastify.register(authRoutes);
fastify.register(jobRoutes);
fastify.register(apiKeyRoutes);
fastify.register(billingRoutes);

// Register Plugins
fastify.register(helmet);
fastify.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
});
fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute'
});

// Middleware for Auth
fastify.decorate('authenticate', async (request: any, reply: any) => {
  try {
    const authHeader = request.headers.authorization;
    request.tenant = tenantGuard.authorizeRequest(authHeader);
  } catch (err: any) {
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
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
