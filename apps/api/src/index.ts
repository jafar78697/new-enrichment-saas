import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
// @ts-ignore — JS module shipped without types
import expressPlugin from '@fastify/express';
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
import affiliateRoutes from './routes/affiliates';
import passwordResetRoutes from './routes/password-reset';
import publicEnrichRoutes from './routes/public-enrich';
import crmRoutes from './routes/crm';
import outreachRoutes from './routes/outreach';
import aiMediaRoutes from './routes/ai-media';
import socialRoutes from './routes/social';

fastify.register(authRoutes);
fastify.register(jobRoutes);
fastify.register(apiKeyRoutes);
fastify.register(billingRoutes);
fastify.register(affiliateRoutes);
fastify.register(passwordResetRoutes);
fastify.register(publicEnrichRoutes);
fastify.register(crmRoutes);
fastify.register(outreachRoutes);
fastify.register(aiMediaRoutes);
fastify.register(socialRoutes);

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
import jwt from 'jsonwebtoken';

fastify.decorate('authenticate', async (request: any, reply: any) => {
  const authHeader = request.headers.authorization;
  if (!authHeader) {
    return reply.code(401).send({ error: 'Missing token' });
  }

  try {
    // Try the original enrichment token format first
    request.tenant = tenantGuard.authorizeRequest(authHeader);
  } catch (err: any) {
    // Fallback to the new calls-module token (call_token)
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change-me-change-me-change-me');
      
      // Mock a tenant object so Fastify enrichment routes don't crash.
      // We map the calls-module user to a default tenant.
      request.tenant = { 
        tenantId: 'c1f6f7a0-f75d-46a2-afc7-810bde42c467', 
        userId: '40c3d04e-2394-4471-b5c6-251a17063fdd', 
        workspaceId: null, 
        plan: 'pro',
        role: (decoded as any).role || 'owner'
      };
      request.user = decoded;
    } catch (fallbackErr: any) {
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
  await fastify.register(expressPlugin);
  // @ts-ignore — JS interop
  const { createCallsApp } = await import('./calls-module/mount.js');
  // @ts-ignore — db init lazy
  const { initializeDatabase } = await import('./calls-module/db/index.js');
  try {
    await initializeDatabase();
  } catch (err) {
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
    } catch (err) {
      fastify.log.warn({ err }, 'socket.io init failed');
    }
  } else {
    fastify.log.info('calls-module mounted (Twilio disabled — set TWILIO_* env vars to enable)');
  }
}

// Start Server
import { startImapSync } from './calls-module/services/imap-sync.service.js';
import { startWarmupScheduler } from './calls-module/warmup.js';

const start = async () => {
  try {
    await mountCallsModule();
    
    // Start background IMAP syncing
    startImapSync();

    // Start Email Warmup Scheduler
    startWarmupScheduler();

    const port = parseInt(process.env.PORT || '3000');
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`🚀 API Server running on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
