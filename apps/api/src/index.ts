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
  // expressPlugin already registered by mountVoiceAgent() above
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

  // @ts-ignore — JS interop
  const { CALLS_ENABLED } = await import('./calls-module/config/env.js');
  if (CALLS_ENABLED) {
    try {
      // @ts-ignore — JS interop
      const { initializeSocket } = await import('./calls-module/services/socket.service.js');
      // @ts-ignore
      initializeSocket(fastify.io);
      fastify.log.info('calls-module socket.io live');
    } catch (err) {
      fastify.log.warn({ err }, 'socket.io init failed');
    }
  } else {
    fastify.log.info('calls-module mounted (Twilio disabled — set TWILIO_* env vars to enable)');
  }
}

// ── Voice Agent module mount ─────────────────────────────────────────────
// Mounts the AI Voice Agent Express app (Twilio Media Streams, STT, LLM, TTS)
// at /api/voice/* on the same host. The WebSocket server for media streams
// shares the Fastify HTTP server.
async function mountVoiceAgent() {
  try {
    // @ts-ignore — JS interop
    const { VOICE_AGENT_ENABLED } = await import('./voice-agent/config/env.js');

    if (!VOICE_AGENT_ENABLED) {
      fastify.log.info('voice-agent disabled (set GOOGLE_APPLICATION_CREDENTIALS, VERTEX_AI_PROJECT, ELEVENLABS_API_KEY, TWILIO_* env vars to enable)');
      return;
    }

    // @ts-ignore — JS interop
    const { createVoiceAgentApp } = await import('./voice-agent/mount.js');

    // @ts-ignore — express type
    fastify.use(createVoiceAgentApp());
    fastify.log.info('voice-agent Express routes mounted at /api/voice/*');

    // Attach Twilio Media Streams WebSocket server to the HTTP server
    try {
      const { attachMediaServer } = await import('./voice-agent/websocket/media-server.js');
      attachMediaServer(fastify.server);
      fastify.log.info('voice-agent Media Streams WebSocket server attached at /media');
    } catch (wsErr: any) {
      fastify.log.warn({ err: wsErr }, 'voice-agent WebSocket init failed');
    }

    // Attach Browser Voice Socket.IO gateway
    try {
      // @ts-ignore — JS interop
      const { initBrowserVoiceSocket } = await import('./voice-agent/websocket/browser-gateway.js');
      // @ts-ignore
      initBrowserVoiceSocket(fastify.io);
      fastify.log.info('voice-agent Browser Socket.IO gateway attached at /voice-browser');
    } catch (socErr: any) {
      fastify.log.warn({ err: socErr }, 'voice-agent Browser Socket.IO init failed');
    }

    // Attach Call Monitor Socket.IO gateway
    try {
      const { initCallMonitorSocket } = await import('./voice-agent/websocket/call-monitor.js');
      // @ts-ignore
      initCallMonitorSocket(fastify.io);
      fastify.log.info('voice-agent Call Monitor Socket.IO gateway attached at /call-monitor');
    } catch (monErr: any) {
      fastify.log.warn({ err: monErr }, 'voice-agent Call Monitor init failed');
    }

    // Initialize the orchestrator (wires STT → LLM → TTS pipeline)
    try {
      const { initOrchestrator } = await import('./voice-agent/orchestrator/call-pipeline.js');
      initOrchestrator();
      fastify.log.info('voice-agent orchestrator initialized');
    } catch (orchErr: any) {
      fastify.log.warn({ err: orchErr }, 'voice-agent orchestrator init failed');
    }

    // Start supervisor monitoring
    try {
      const { startSupervisor } = await import('./voice-agent/services/supervisor/sentiment-monitor.js');
      startSupervisor();
      fastify.log.info('voice-agent supervisor monitor started');
    } catch (supErr: any) {
      fastify.log.warn({ err: supErr }, 'voice-agent supervisor init failed');
    }
  } catch (err: any) {
    fastify.log.warn({ err }, 'voice-agent mount failed — voice features disabled');
  }
}

// Start Server
import { startImapSync } from './calls-module/services/imap-sync.service.js';
import { startWarmupScheduler } from './calls-module/warmup.js';

const start = async () => {
  try {
    if (process.env.DISABLE_OUTBOUND_WORKER !== 'true') {
      const { runOutboundCallerLoop } = await import('./workers/outbound-caller.js');
      runOutboundCallerLoop().catch(err => console.error('[startup] Outbound caller error:', err));
    }

    // Register expressPlugin for Express middleware support required by both Voice and Calls modules
    await fastify.register(expressPlugin);

    // Initialize global Socket.IO server
    const { Server } = await import('socket.io');
    const io = new Server(fastify.server, {
      cors: { origin: true, credentials: true },
    });
    // @ts-ignore
    fastify.io = io;

    await mountVoiceAgent();
    await mountCallsModule();
    
    // One-time migration: ensure is_inbound column exists (safe to run at startup)
    try {
      const { query: dbQuery } = await import('./calls-module/db/index.js');
      await dbQuery("ALTER TABLE contact_emails_history ADD COLUMN IF NOT EXISTS is_inbound BOOLEAN DEFAULT FALSE;");
      console.log('[startup] Migration: is_inbound column ensured.');
    } catch (migErr: any) {
      console.warn('[startup] Migration warning (non-fatal):', migErr.message);
    }

    // Meta tables migration (Facebook/Instagram outreach system)
    try {
      await fastify.db.query(`
        CREATE TABLE IF NOT EXISTS meta_profiles (
          id SERIAL PRIMARY KEY,
          tenant_id UUID NOT NULL,
          name VARCHAR(100) NOT NULL,
          platform VARCHAR(20) NOT NULL DEFAULT 'facebook',
          username VARCHAR(100),
          profile_url VARCHAR(500),
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMPTZ DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS meta_daily_actions (
          id SERIAL PRIMARY KEY,
          tenant_id UUID NOT NULL,
          profile_id INTEGER REFERENCES meta_profiles(id) ON DELETE CASCADE,
          date DATE DEFAULT CURRENT_DATE,
          action_type VARCHAR(50) NOT NULL,
          count INTEGER DEFAULT 1,
          UNIQUE(tenant_id, profile_id, date, action_type)
        );

        CREATE TABLE IF NOT EXISTS meta_pipeline (
          id SERIAL PRIMARY KEY,
          tenant_id UUID NOT NULL,
          profile_id INTEGER REFERENCES meta_profiles(id) ON DELETE CASCADE,
          contact_id INTEGER,
          name VARCHAR(200) NOT NULL,
          source_group VARCHAR(200),
          avatar_url VARCHAR(500),
          platform VARCHAR(20) DEFAULT 'facebook',
          stage VARCHAR(50) DEFAULT 'find_mine',
          engagement_level VARCHAR(20) DEFAULT 'New',
          last_message TEXT,
          stage_updated_at TIMESTAMPTZ DEFAULT now(),
          created_at TIMESTAMPTZ DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS meta_campaigns (
          id SERIAL PRIMARY KEY,
          tenant_id UUID NOT NULL,
          profile_id INTEGER REFERENCES meta_profiles(id) ON DELETE SET NULL,
          name VARCHAR(200) NOT NULL,
          platform VARCHAR(20) DEFAULT 'facebook',
          message_template TEXT NOT NULL,
          daily_limit INTEGER DEFAULT 10,
          target_groups TEXT[],
          status VARCHAR(20) DEFAULT 'active',
          sent_count INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS meta_task_queue (
          id SERIAL PRIMARY KEY,
          tenant_id UUID NOT NULL,
          profile_id INTEGER REFERENCES meta_profiles(id) ON DELETE CASCADE,
          pipeline_id INTEGER REFERENCES meta_pipeline(id) ON DELETE CASCADE,
          task_type VARCHAR(50) NOT NULL,
          target_url VARCHAR(500),
          message_body TEXT,
          status VARCHAR(20) DEFAULT 'pending',
          created_at TIMESTAMPTZ DEFAULT now(),
          processed_at TIMESTAMPTZ
        );
      `);
      console.log('[startup] Migration: meta tables ensured (FB/IG outreach).');
    } catch (metaMigErr: any) {
      console.warn('[startup] Meta migration warning (non-fatal):', metaMigErr.message);
    }
    
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
