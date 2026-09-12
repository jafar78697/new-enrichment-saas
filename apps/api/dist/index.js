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
const crypto_1 = __importDefault(require("crypto"));
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
const ai_media_1 = __importDefault(require("./routes/ai-media"));
const social_1 = __importDefault(require("./routes/social"));
const phone_numbers_1 = __importDefault(require("./routes/phone-numbers"));
const admin_customers_1 = __importDefault(require("./routes/admin-customers"));
const wallets_1 = __importDefault(require("./routes/wallets"));
const manual_payments_1 = __importDefault(require("./routes/manual-payments"));
const google_maps_1 = __importDefault(require("./routes/google-maps"));
fastify.register(auth_2.default);
fastify.register(phone_numbers_1.default);
fastify.register(jobs_1.default);
fastify.register(api_keys_1.default);
fastify.register(billing_1.default);
fastify.register(affiliates_1.default);
fastify.register(password_reset_1.default);
fastify.register(public_enrich_1.default);
fastify.register(crm_1.default);
fastify.register(outreach_1.default);
fastify.register(ai_media_1.default);
fastify.register(social_1.default);
fastify.register(admin_customers_1.default);
fastify.register(wallets_1.default);
fastify.register(manual_payments_1.default);
fastify.register(google_maps_1.default);
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
function tokenHash(token) {
    return crypto_1.default.createHash('sha256').update(token).digest('hex');
}
function maySkipPasswordChange(url) {
    return url.includes('/v1/auth/change-password') || url.includes('/v1/auth/logout');
}
fastify.decorate('authenticate', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
        return reply.code(401).send({ error: 'Missing token' });
    }
    try {
        const token = authHeader.split(' ')[1];
        const tenantContext = tenantGuard.authorizeRequest(authHeader);
        const hash = tokenHash(token);
        const { rows } = await fastify.db.query(`SELECT u.id as user_id, u.username, u.email, u.display_name, u.role,
              u.must_change_password, u.auth_version,
              t.id as tenant_id, t.plan, t.status as tenant_status, t.name as tenant_name,
              w.id as workspace_id,
              s.id as session_id
       FROM users u
       JOIN tenants t ON u.tenant_id = t.id
       LEFT JOIN workspaces w ON w.tenant_id = t.id
       JOIN user_sessions s ON s.user_id = u.id
        AND s.tenant_id = t.id
        AND s.token_hash = $3
        AND s.revoked_at IS NULL
        AND s.expires_at > NOW()
       WHERE u.id = $1
         AND u.tenant_id = $2
         AND t.deleted_at IS NULL
       LIMIT 1`, [tenantContext.userId, tenantContext.tenantId, hash]);
        const row = rows[0];
        if (!row) {
            return reply.code(401).send({ error: 'Invalid or expired session' });
        }
        if (row.tenant_status !== 'active' && row.role !== 'platform_admin') {
            return reply.code(403).send({
                error: `Account is ${row.tenant_status}. Contact support.`,
                code: 'ACCOUNT_INACTIVE',
                status: row.tenant_status,
            });
        }
        if (row.must_change_password && !maySkipPasswordChange(request.url)) {
            return reply.code(403).send({
                error: 'You must change your password before accessing this resource.',
                code: 'PASSWORD_CHANGE_REQUIRED',
                redirect: '/change-password',
            });
        }
        request.tenant = {
            tenantId: row.tenant_id,
            userId: row.user_id,
            workspaceId: row.workspace_id,
            plan: row.plan,
            role: row.role || tenantContext.role,
            status: row.tenant_status,
            mustChangePassword: row.must_change_password || false,
            sessionId: row.session_id,
        };
        request.user = {
            id: row.user_id,
            username: row.username,
            email: row.email,
            display_name: row.display_name,
            role: row.role,
            tenant_id: row.tenant_id,
        };
    }
    catch (err) {
        // Fallback to the legacy calls-module token. Modern SaaS tokens must have
        // a live user_sessions row and should never land here.
        try {
            const token = authHeader.split(' ')[1];
            const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'dev-secret-change-me-change-me-change-me');
            const decodedPayload = decoded;
            if (decodedPayload.user_id || decodedPayload.id) {
                const userId = decodedPayload.user_id || decodedPayload.id;
                const { rows } = await fastify.db.query(`SELECT u.id as user_id, u.tenant_id, u.role, u.must_change_password,
                  t.plan, t.status, w.id as workspace_id
           FROM users u
           JOIN tenants t ON u.tenant_id = t.id
           LEFT JOIN workspaces w ON w.tenant_id = t.id
           WHERE u.id = $1
             AND t.deleted_at IS NULL
           LIMIT 1`, [userId]);
                if (rows[0]) {
                    if (rows[0].status !== 'active' && rows[0].role !== 'platform_admin') {
                        return reply.code(403).send({ error: 'Account is inactive', code: 'ACCOUNT_INACTIVE' });
                    }
                    if (rows[0].must_change_password && !maySkipPasswordChange(request.url)) {
                        return reply.code(403).send({ error: 'You must change your password before accessing this resource.', code: 'PASSWORD_CHANGE_REQUIRED' });
                    }
                    request.tenant = {
                        tenantId: rows[0].tenant_id,
                        userId: rows[0].user_id,
                        workspaceId: rows[0].workspace_id,
                        plan: rows[0].plan,
                        role: rows[0].role || 'agent',
                        status: rows[0].status || 'active',
                        mustChangePassword: rows[0].must_change_password || false,
                    };
                }
                else {
                    return reply.code(401).send({ error: 'User not found' });
                }
            }
            else {
                // Calls-module employee tokens use `sub`, not `user_id`. Resolve the
                // employee's tenant and assigned modules so /v1 enrichment routes can
                // apply the same Access System permissions as /api contacts/calls.
                if (decodedPayload.sub) {
                    const { rows } = await fastify.db.query(`SELECT a.id as user_id, a.tenant_id, a.role, a.status,
                    COALESCE(ARRAY_AGG(DISTINCT am.module) FILTER (WHERE am.module IS NOT NULL), '{}') AS assigned_modules,
                    t.plan, t.status AS tenant_status, w.id AS workspace_id
             FROM agents a
             LEFT JOIN agent_modules am ON am.agent_id = a.id
             LEFT JOIN tenants t ON t.id = a.tenant_id
             LEFT JOIN workspaces w ON w.tenant_id = a.tenant_id
             WHERE a.id = $1 AND t.deleted_at IS NULL
             GROUP BY a.id, a.tenant_id, a.role, a.status, t.plan, t.status, w.id
             LIMIT 1`, [decodedPayload.sub]);
                    if (!rows[0])
                        return reply.code(401).send({ error: 'User not found' });
                    if (rows[0].status !== 'active' || rows[0].tenant_status !== 'active') {
                        return reply.code(403).send({ error: 'Account is inactive', code: 'ACCOUNT_INACTIVE' });
                    }
                    request.tenant = {
                        tenantId: rows[0].tenant_id || process.env.VOICE_AGENT_TENANT_ID,
                        userId: rows[0].user_id,
                        workspaceId: rows[0].workspace_id,
                        plan: rows[0].plan || 'starter',
                        role: rows[0].role || 'employee',
                        status: rows[0].tenant_status || 'active',
                        assignedModules: rows[0].assigned_modules || [],
                    };
                    request.user = decodedPayload;
                }
                else {
                    return reply.code(401).send({ error: 'Invalid token payload' });
                }
            }
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
    // expressPlugin already registered by mountVoiceAgent() above
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
    // @ts-ignore — JS interop
    const { CALLS_ENABLED } = await import('./calls-module/config/env.js');
    if (CALLS_ENABLED) {
        try {
            // @ts-ignore — JS interop
            const { initializeSocket } = await import('./calls-module/services/socket.service.js');
            // @ts-ignore
            initializeSocket(fastify.io);
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
// ── Voice Agent module mount ─────────────────────────────────────────────
// Deepgram owns STT, turn taking, LLM orchestration, and TTS in one WebSocket.
// Keep the legacy pipelines out of this mount so enabling a test agent cannot
// also start old Google/OpenAI/ElevenLabs services or an outbound worker.
async function mountVoiceAgent() {
    try {
        // @ts-ignore — JS interop
        const { VOICE_AGENT_ENABLED } = await import('./voice-agent/config/env.js');
        if (!VOICE_AGENT_ENABLED) {
            fastify.log.info('voice-agent disabled (set VOICE_AGENT_ENABLED=true and server-side DEEPGRAM_API_KEY to enable)');
            return;
        }
        // @ts-ignore — JS interop
        const { createVoiceAgentApp } = await import('./voice-agent/mount.js');
        // @ts-ignore — express type
        fastify.use(createVoiceAgentApp());
        fastify.log.info('voice-agent Express routes mounted at /api/voice/*');
        // Attach Deepgram <-> SignalWire WebSocket Bridge
        try {
            const { attachDeepgramBridge } = await import('./voice-agent/orchestrator/deepgram-signalwire-bridge.js');
            attachDeepgramBridge(fastify.server);
            fastify.log.info('voice-agent Deepgram-SignalWire bridge attached at /api/voice/signalwire/deepgram-stream');
        }
        catch (bridgeErr) {
            fastify.log.warn({ err: bridgeErr }, 'voice-agent Deepgram bridge init failed');
        }
        // Browser previews use a short-lived server ticket. The permanent Deepgram
        // key stays on this server and is never returned to app.jentoai.pro.
        try {
            const { attachDeepgramBrowserPreviewBridge } = await import('./voice-agent/websocket/deepgram-browser-preview.js');
            attachDeepgramBrowserPreviewBridge(fastify.server);
            fastify.log.info('voice-agent secure Deepgram browser-preview bridge attached');
        }
        catch (previewErr) {
            fastify.log.warn({ err: previewErr }, 'voice-agent browser-preview bridge init failed');
        }
        // Attach Call Monitor Socket.IO gateway
        try {
            const { initCallMonitorSocket } = await import('./voice-agent/websocket/call-monitor.js');
            // @ts-ignore
            initCallMonitorSocket(fastify.io);
            fastify.log.info('voice-agent Call Monitor Socket.IO gateway attached at /call-monitor');
        }
        catch (monErr) {
            fastify.log.warn({ err: monErr }, 'voice-agent Call Monitor init failed');
        }
    }
    catch (err) {
        fastify.log.warn({ err }, 'voice-agent mount failed — voice features disabled');
    }
}
// Start Server
const imap_sync_service_js_1 = require("./calls-module/services/imap-sync.service.js");
const warmup_js_1 = require("./calls-module/warmup.js");
const start = async () => {
    try {
        if (process.env.ENABLE_AI_OUTBOUND_CALLER === 'true' && process.env.AI_OUTBOUND_ENABLED === 'true') {
            const { runOutboundCallerLoop } = await import('./workers/outbound-caller.js');
            runOutboundCallerLoop().catch(err => console.error('[startup] Outbound caller error:', err));
        }
        else {
            fastify.log.info('AI outbound caller disabled. ENABLE_AI_OUTBOUND_CALLER=true and AI_OUTBOUND_ENABLED=true are both required.');
        }
        // Register expressPlugin for Express middleware support required by both Voice and Calls modules
        await fastify.register(express_1.default);
        // Initialize global Socket.IO server
        const { Server } = await import('socket.io');
        const io = new Server(fastify.server, {
            cors: { origin: true, credentials: true },
            perMessageDeflate: false,
            httpCompression: false,
        });
        // @ts-ignore
        fastify.io = io;
        try {
            const { initBrowserTranscriptionSocket } = await import('./voice-agent/websocket/browser-transcription.js');
            initBrowserTranscriptionSocket(io);
            fastify.log.info('browser Google STT socket live');
        }
        catch (err) {
            fastify.log.warn({ err }, 'browser Google STT socket failed to initialize');
        }
        await mountVoiceAgent();
        await mountCallsModule();
        // Small additive migrations are safe on every deployment and keep live
        // customer records compatible with the calling SaaS UI.
        try {
            const { query: dbQuery } = await import('./calls-module/db/index.js');
            await dbQuery("ALTER TABLE contact_emails_history ADD COLUMN IF NOT EXISTS is_inbound BOOLEAN DEFAULT FALSE;");
            await dbQuery(`
        ALTER TABLE contacts
          ADD COLUMN IF NOT EXISTS meeting_time TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS next_call_at TIMESTAMPTZ;
        CREATE INDEX IF NOT EXISTS idx_contacts_tenant_next_call_at
          ON contacts (tenant_id, next_call_at)
          WHERE next_call_at IS NOT NULL;
      `);
            console.log('[startup] Contact follow-up columns ensured.');
        }
        catch (migErr) {
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
        }
        catch (metaMigErr) {
            console.warn('[startup] Meta migration warning (non-fatal):', metaMigErr.message);
        }
        // Start background IMAP syncing
        (0, imap_sync_service_js_1.startImapSync)();
        // Start Email Warmup Scheduler
        (0, warmup_js_1.startWarmupScheduler)();
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