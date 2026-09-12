"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PIPELINE_STAGES = void 0;
exports.default = crmRoutes;
const compatibility_api_1 = require("@signalwire/compatibility-api");
const us_phone_js_1 = require("../utils/us-phone.js");
const outbound_lock_js_1 = require("../utils/outbound-lock.js");
const require_role_1 = require("../middleware/require-role");
// Canonical pipeline stages. Frontend renders columns in this exact order.
exports.PIPELINE_STAGES = [
    'new',
    'assigned',
    'calling',
    'called',
    'no_answer',
    'followup',
    'interested',
    'demo_scheduled',
    'proposal_sent',
    'closed_won',
    'closed_lost',
];
const CALLING_TIMEZONES = new Set([
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Toronto',
    'America/Vancouver',
]);
function numberInRange(value, fallback, min, max) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}
function serverCallingCaps() {
    return {
        callsPerMinute: numberInRange(process.env.AI_MAX_CALLS_PER_MINUTE, 3, 1, 10),
        maxCallsPerDay: numberInRange(process.env.AI_MAX_OUTBOUND_CALLS_PER_DAY, 5, 1, 500),
        maxMinutesPerDay: numberInRange(process.env.AI_MAX_MINUTES_PER_DAY, 10, 1, 1440),
        maxCostUsdPerDay: numberInRange(process.env.AI_MAX_COST_USD_PER_DAY, 1, 0.1, 500),
    };
}
function normalizedCallingControl(row = {}) {
    const caps = serverCallingCaps();
    const timezone = CALLING_TIMEZONES.has(row.calling_timezone)
        ? row.calling_timezone
        : 'America/New_York';
    const startHour = Math.round(numberInRange(row.calling_window_start_hour, 9, 0, 23));
    const endHour = Math.round(numberInRange(row.calling_window_end_hour, 17, 1, 24));
    return {
        isRunning: row.is_running === true,
        callsPerMinute: Math.round(numberInRange(row.calls_per_minute, 1, 1, caps.callsPerMinute)),
        maxCallsPerDay: Math.round(numberInRange(row.max_calls_per_day, caps.maxCallsPerDay, 1, caps.maxCallsPerDay)),
        maxMinutesPerDay: Math.round(numberInRange(row.max_minutes_per_day, caps.maxMinutesPerDay, 1, caps.maxMinutesPerDay)),
        maxCostUsdPerDay: numberInRange(row.max_cost_usd_per_day, caps.maxCostUsdPerDay, 0.1, caps.maxCostUsdPerDay),
        callingTimezone: timezone,
        callingWindowStartHour: startHour,
        callingWindowEndHour: Math.max(startHour + 1, endHour),
    };
}
function hourInTimezone(timezone) {
    return Number(new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        hourCycle: 'h23',
    }).format(new Date()));
}
function isWithinCallingWindow(control) {
    const timezone = CALLING_TIMEZONES.has(control?.calling_timezone)
        ? control.calling_timezone
        : 'America/New_York';
    const hour = hourInTimezone(timezone);
    return hour >= Number(control?.calling_window_start_hour ?? 9)
        && hour < Number(control?.calling_window_end_hour ?? 17);
}
async function hasActiveCallingSubscription(fastify, tenantId) {
    const { rows } = await fastify.db.query(`SELECT 1
     FROM customer_subscriptions
     WHERE tenant_id = $1
       AND status = 'active'
       AND start_date <= NOW()
       AND (end_date IS NULL OR end_date > NOW())
     LIMIT 1`, [tenantId]);
    return Boolean(rows[0]);
}
async function writeAudit(fastify, tenantId, actorId, action, entityType, entityId, metadata = null) {
    try {
        await fastify.db.query(`INSERT INTO audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`, [tenantId, actorId, action, entityType, entityId, metadata ? JSON.stringify(metadata) : null]);
    }
    catch (err) {
        fastify.log.warn({ err, action }, 'audit log failed');
    }
}
function getSignalWireClient() {
    const projectId = process.env.SIGNALWIRE_PROJECT_ID;
    const apiToken = process.env.SIGNALWIRE_API_TOKEN;
    const spaceUrl = process.env.SIGNALWIRE_SPACE_URL;
    if (!projectId || !apiToken || !spaceUrl)
        return null;
    return (0, compatibility_api_1.RestClient)(projectId, apiToken, { signalwireSpaceUrl: spaceUrl });
}
async function terminateSignalWireCall(callSid) {
    const client = getSignalWireClient();
    if (!client) {
        throw new Error('SignalWire is not configured');
    }
    await client.calls(callSid).update({ status: 'completed' });
}
async function crmRoutes(fastify) {
    fastify.addHook('preHandler', (0, require_role_1.requireModule)('enrichment', 'ai_calling'));
    // Ensure assigned_to_ai exists (runs once on boot)
    try {
        await fastify.db.query(`
      ALTER TABLE enrichment_results
        ADD COLUMN IF NOT EXISTS assigned_to_ai BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS raw_data JSONB DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS ai_voice_consent BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS ai_voice_consent_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS ai_voice_consent_source TEXT,
        ADD COLUMN IF NOT EXISTS do_not_call BOOLEAN NOT NULL DEFAULT false
    `);
        await fastify.db.query(`
      ALTER TABLE IF EXISTS contacts
        ADD COLUMN IF NOT EXISTS ai_voice_consent BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS ai_voice_consent_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS ai_voice_consent_source TEXT,
        ADD COLUMN IF NOT EXISTS do_not_call BOOLEAN NOT NULL DEFAULT false
    `);
        await fastify.db.query(`
      CREATE TABLE IF NOT EXISTS ai_calling_controls (
        tenant_id UUID PRIMARY KEY,
        is_running BOOLEAN NOT NULL DEFAULT false,
        calls_per_minute INT NOT NULL DEFAULT 1,
        max_calls_per_day INT NOT NULL DEFAULT 5,
        max_minutes_per_day INT NOT NULL DEFAULT 10,
        max_cost_usd_per_day NUMERIC NOT NULL DEFAULT 1,
        calling_timezone TEXT NOT NULL DEFAULT 'America/New_York',
        calling_window_start_hour INT NOT NULL DEFAULT 9,
        calling_window_end_hour INT NOT NULL DEFAULT 17,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
        await fastify.db.query(`
      ALTER TABLE ai_calling_controls
        ADD COLUMN IF NOT EXISTS calls_per_minute INT NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS max_calls_per_day INT NOT NULL DEFAULT 5,
        ADD COLUMN IF NOT EXISTS max_minutes_per_day INT NOT NULL DEFAULT 10,
        ADD COLUMN IF NOT EXISTS max_cost_usd_per_day NUMERIC NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS calling_timezone TEXT NOT NULL DEFAULT 'America/New_York',
        ADD COLUMN IF NOT EXISTS calling_window_start_hour INT NOT NULL DEFAULT 9,
        ADD COLUMN IF NOT EXISTS calling_window_end_hour INT NOT NULL DEFAULT 17
    `);
        await fastify.db.query(`UPDATE enrichment_results SET lead_stage = 'assigned' WHERE assigned_to_ai = true AND lead_stage IN ('new', 'enriched');`);
    }
    catch (err) {
        console.error('Failed to alter enrichment_results for assigned_to_ai:', err);
    }
    // ================================================================
    // LEADS  (enrichment_results surfaced as pipeline leads)
    // ================================================================
    // GET /v1/leads?stage=&owner=&q=&page=&limit=
    fastify.get('/v1/leads', { preHandler: [fastify.authenticate] }, async (request) => {
        const { tenantId } = request.tenant;
        const q = request.query;
        const page = Math.max(1, parseInt(q.page || '1'));
        const limit = Math.min(10000, parseInt(q.limit || '100'));
        const offset = (page - 1) * limit;
        const where = ['tenant_id = $1'];
        const params = [tenantId];
        if (q.stage) {
            params.push(q.stage);
            where.push(`lead_stage = $${params.length}`);
        }
        if (q.owner) {
            params.push(q.owner);
            where.push(`lead_owner_id = $${params.length}`);
        }
        if (q.assigned_to_ai) {
            params.push(q.assigned_to_ai === 'true' || q.assigned_to_ai === true);
            where.push(`assigned_to_ai = $${params.length}`);
        }
        if (q.q) {
            params.push(`%${q.q}%`);
            where.push(`(domain ILIKE $${params.length} OR company_name ILIKE $${params.length} OR primary_email ILIKE $${params.length})`);
        }
        const sql = `
      SELECT id, domain, company_name, industry_guess, primary_email, primary_phone,
             linkedin_url, facebook_url, instagram_url, twitter_url, youtube_url, tiktok_url,
             whatsapp_link, one_line_pitch, confidence_level, ecommerce_signal, saas_signal,
             lead_stage, lead_owner_id, lead_priority, lead_notes,
             last_contacted_at, next_followup_at,
             ai_summary, ai_pain_points, ai_score, ai_updated_at,
             assigned_to_ai, ai_agent_provider, assigned_ai_agent_id, raw_data,
             ai_voice_consent, ai_voice_consent_at, ai_voice_consent_source, do_not_call,
             created_at
      FROM enrichment_results
      WHERE ${where.join(' AND ')}
      ${q.assigned_to_ai
            ? `ORDER BY ai_updated_at DESC NULLS LAST, created_at DESC`
            : `ORDER BY created_at DESC`}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
        const { rows } = await fastify.db.query(sql, [...params, limit, offset]);
        const { rows: countRows } = await fastify.db.query(`SELECT COUNT(*) FROM enrichment_results WHERE ${where.join(' AND ')}`, params);
        return { leads: rows, total: parseInt(countRows[0].count), page, limit };
    });
    fastify.post('/v1/leads/contacts/:contactId/voice-consent', { preHandler: [fastify.authenticate] }, async (request, reply) => {
        const { tenantId, userId, role } = request.tenant;
        if (!['owner', 'admin', 'manager'].includes(String(role || '').toLowerCase())) {
            return reply.code(403).send({ error: 'Only a manager can verify AI voice consent' });
        }
        const contactId = Number(request.params.contactId);
        const consented = request.body?.consented === true;
        const source = typeof request.body?.source === 'string' ? request.body.source.trim().slice(0, 500) : '';
        if (!Number.isInteger(contactId) || contactId < 1) {
            return reply.code(400).send({ error: 'Invalid contact' });
        }
        if (consented && source.length < 3) {
            return reply.code(400).send({ error: 'Add where and when this lead gave AI voice-call consent' });
        }
        const { rows: contactRows } = await fastify.db.query(`SELECT id, phone_number, COALESCE(unsubscribed, false) AS unsubscribed, do_not_call
       FROM contacts WHERE id = $1`, [contactId]);
        const contact = contactRows[0];
        if (!contact)
            return reply.code(404).send({ error: 'Contact not found' });
        if (consented && !(0, us_phone_js_1.normalizeNorthAmericanPhone)(contact.phone_number)) {
            return reply.code(400).send({ error: 'Only valid USA or Canada phone numbers can be approved' });
        }
        if (consented && (contact.unsubscribed || contact.do_not_call)) {
            return reply.code(409).send({ error: 'This lead is unsubscribed or on the do-not-call list' });
        }
        const { rows } = await fastify.db.query(`UPDATE contacts
       SET ai_voice_consent = $1,
           ai_voice_consent_at = CASE WHEN $1 THEN NOW() ELSE NULL END,
           ai_voice_consent_source = CASE WHEN $1 THEN $2 ELSE NULL END,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`, [consented, source || null, contactId]);
        await fastify.db.query(`UPDATE enrichment_results
       SET ai_voice_consent = $1,
           ai_voice_consent_at = CASE WHEN $1 THEN NOW() ELSE NULL END,
           ai_voice_consent_source = CASE WHEN $1 THEN $2 ELSE NULL END
       WHERE tenant_id = $3 AND raw_data->>'source_contact_id' = $4`, [consented, source || null, tenantId, String(contactId)]);
        await writeAudit(fastify, tenantId, userId, consented ? 'lead.ai_voice_consent_verified' : 'lead.ai_voice_consent_revoked', 'contact', String(contactId), { source: source || null });
        return { contact: rows[0] };
    });
    // POST /v1/leads/queue-ai
    // Assignment can hold pending consent. The dialer separately requires verified consent.
    fastify.post('/v1/leads/queue-ai', { preHandler: [fastify.authenticate] }, async (request, reply) => {
        const { tenantId, userId } = request.tenant;
        const body = request.body || {};
        const leadIds = Array.isArray(body.lead_ids) ? body.lead_ids.filter(Boolean) : [];
        const contactIds = Array.isArray(body.contact_ids)
            ? body.contact_ids.map(Number).filter((id) => Number.isInteger(id) && id > 0)
            : [];
        const nicheId = body.niche_id ? Number(body.niche_id) : null;
        const agentId = typeof body.agent_id === 'string' ? body.agent_id.trim() : '';
        const limit = Math.max(1, Math.min(500, Number(body.limit || 100)));
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(agentId)) {
            return reply.code(400).send({ error: 'Select a valid outbound AI agent' });
        }
        const { rows: agentRows } = await fastify.db.query(`SELECT id, name
       FROM ai_agent_configs
       WHERE id = $1 AND tenant_id = $2 AND is_active = true AND mode = 'outbound'
       LIMIT 1`, [agentId, tenantId]);
        if (!agentRows[0]) {
            return reply.code(400).send({ error: 'Selected outbound AI agent is missing or inactive' });
        }
        if (!leadIds.length && !nicheId && !contactIds.length) {
            return reply.code(400).send({ error: 'Provide lead_ids, contact_ids, or niche_id' });
        }
        let queuedExisting = 0;
        let createdFromContacts = 0;
        let invalidRegionCount = 0;
        let consentRequiredCount = 0;
        let blockedCount = 0;
        const assignedRows = [];
        if (leadIds.length) {
            const { rows: candidateLeads } = await fastify.db.query(`SELECT id, primary_phone, ai_voice_consent, do_not_call
         FROM enrichment_results
         WHERE tenant_id = $1 AND id = ANY($2::uuid[])`, [tenantId, leadIds]);
            const assignableLeadIds = candidateLeads
                .filter((lead) => {
                if (lead.do_not_call) {
                    blockedCount += 1;
                    return false;
                }
                if (!(0, us_phone_js_1.normalizeNorthAmericanPhone)(lead.primary_phone)) {
                    invalidRegionCount += 1;
                    return false;
                }
                return true;
            })
                .map((lead) => lead.id);
            if (assignableLeadIds.length) {
                const { rowCount, rows } = await fastify.db.query(`UPDATE enrichment_results er
           SET assigned_to_ai = true,
               ai_agent_provider = 'deepgram_voice_agent',
               assigned_ai_agent_id = $3,
               ai_updated_at = NOW(),
               lead_stage = CASE
                 WHEN lead_stage IN ('calling', 'interested', 'demo_scheduled', 'proposal_sent', 'closed_won', 'closed_lost')
                   THEN lead_stage
                 ELSE 'assigned'
               END
           WHERE tenant_id = $1
             AND id = ANY($2::uuid[])
             AND do_not_call = false
           RETURNING er.id, er.ai_voice_consent`, [tenantId, assignableLeadIds, agentId]);
                assignedRows.push(...rows);
                queuedExisting += rowCount || 0;
            }
        }
        if (nicheId) {
            const candidateParams = [nicheId];
            const candidateIdFilter = contactIds.length
                ? `AND c.id = ANY($${candidateParams.push(contactIds)}::int[])`
                : '';
            const candidateLimitParam = candidateParams.push(limit);
            const { rows: candidateContacts } = await fastify.db.query(`SELECT c.id, c.phone_number, c.ai_voice_consent, c.do_not_call, c.unsubscribed
         FROM contacts c
         WHERE c.niche_id = $1
           ${candidateIdFilter}
         ORDER BY c.updated_at DESC, c.created_at DESC
         LIMIT $${candidateLimitParam}`, candidateParams);
            const assignableContactIds = candidateContacts
                .filter((contact) => {
                if (contact.do_not_call || contact.unsubscribed) {
                    blockedCount += 1;
                    return false;
                }
                if (!(0, us_phone_js_1.normalizeNorthAmericanPhone)(contact.phone_number)) {
                    invalidRegionCount += 1;
                    return false;
                }
                return true;
            })
                .map((contact) => contact.id);
            if (assignableContactIds.length) {
                const { rows: jobRows } = await fastify.db.query(`INSERT INTO enrichment_jobs (tenant_id, mode, status, source_type, total_items)
         VALUES ($1, 'ai_voice_queue', 'completed', 'crm_niche', 0)
         RETURNING id`, [tenantId]);
                const jobId = jobRows[0].id;
                const existingParams = [tenantId, nicheId, agentId, assignableContactIds];
                const { rowCount: updatedExisting, rows: updatedRows } = await fastify.db.query(`UPDATE enrichment_results er
         SET assigned_to_ai = true,
             ai_agent_provider = 'deepgram_voice_agent',
             assigned_ai_agent_id = $3,
             ai_updated_at = NOW(),
             ai_voice_consent = c.ai_voice_consent,
             ai_voice_consent_at = c.ai_voice_consent_at,
             ai_voice_consent_source = c.ai_voice_consent_source,
             do_not_call = c.do_not_call,
             lead_stage = CASE
               WHEN er.lead_stage IN ('calling', 'interested', 'demo_scheduled', 'proposal_sent', 'closed_won', 'closed_lost')
                 THEN er.lead_stage
               ELSE 'assigned'
             END
         FROM contacts c
         WHERE er.tenant_id = $1
           AND er.raw_data->>'source_contact_id' = c.id::text
           AND c.niche_id = $2
           AND c.phone_number IS NOT NULL
           AND c.phone_number <> ''
           AND c.id = ANY($4::int[])
           AND er.do_not_call = false
           AND c.do_not_call = false
           AND COALESCE(c.unsubscribed, false) = false
         RETURNING er.id, er.ai_voice_consent`, existingParams);
                queuedExisting += updatedExisting || 0;
                assignedRows.push(...updatedRows);
                const insertParams = [jobId, tenantId, nicheId, agentId, assignableContactIds];
                const limitParam = insertParams.push(limit);
                const { rows: insertedRows } = await fastify.db.query(`WITH selected_contacts AS MATERIALIZED (
           SELECT
             c.*,
             n.name AS niche_name,
             COALESCE(
               NULLIF(regexp_replace(COALESCE(c.website, ''), '^https?://(www\\.)?([^/]+).*$', '\\2'), ''),
               'contact-' || c.id || '.local'
             ) AS normalized_domain
           FROM contacts c
           JOIN niches n ON n.id = c.niche_id
           WHERE c.niche_id = $3
             AND c.phone_number IS NOT NULL
             AND c.phone_number <> ''
             AND c.id = ANY($5::int[])
             AND c.do_not_call = false
             AND COALESCE(c.unsubscribed, false) = false
             AND NOT EXISTS (
               SELECT 1 FROM enrichment_results er
               WHERE er.tenant_id = $2
                 AND er.raw_data->>'source_contact_id' = c.id::text
             )
           ORDER BY c.updated_at DESC, c.created_at DESC
           LIMIT $${limitParam}
         ), inserted_items AS (
           INSERT INTO enrichment_job_items (
             job_id, tenant_id, raw_input, normalized_domain, status, finished_at
           )
           SELECT
             $1,
             $2,
             'crm-contact:' || c.id,
             c.normalized_domain,
             'completed',
             NOW()
           FROM selected_contacts c
           RETURNING id, raw_input
         )
         INSERT INTO enrichment_results (
           job_item_id, tenant_id, domain, primary_email, primary_phone, company_name,
           industry_guess, one_line_pitch, confidence_level, raw_data,
           lead_stage, assigned_to_ai, ai_updated_at, lead_priority, ai_agent_provider, assigned_ai_agent_id,
           ai_voice_consent, ai_voice_consent_at, ai_voice_consent_source, do_not_call
         )
         SELECT
           item.id,
           $2,
           c.normalized_domain,
           c.email,
           c.phone_number,
           COALESCE(NULLIF(c.company, ''), c.name),
           c.niche_name,
           'CRM niche lead queued for AI voice outreach: ' || c.niche_name,
           'crm',
           jsonb_build_object(
             'source', 'contacts',
             'source_contact_id', c.id::text,
             'niche_id', c.niche_id,
             'niche_name', c.niche_name,
             'website', c.website,
             'notes', c.notes
           ),
           'assigned',
           true,
           NOW(),
           CASE WHEN COALESCE(c.score, 0) >= 70 THEN 'high' ELSE 'medium' END,
           'deepgram_voice_agent',
           $4,
           c.ai_voice_consent,
           c.ai_voice_consent_at,
           c.ai_voice_consent_source,
           c.do_not_call
         FROM selected_contacts c
         JOIN inserted_items item ON item.raw_input = 'crm-contact:' || c.id
         RETURNING id, ai_voice_consent`, insertParams);
                createdFromContacts = insertedRows.length;
                assignedRows.push(...insertedRows);
                await fastify.db.query(`UPDATE enrichment_jobs
         SET total_items = $1, completed_items = $1, status = 'completed', finished_at = NOW()
         WHERE id = $2`, [createdFromContacts, jobId]);
            }
        }
        const uniqueAssignments = Array.from(new Map(assignedRows.map((row) => [row.id, row])).values());
        consentRequiredCount = uniqueAssignments.filter((row) => !row.ai_voice_consent).length;
        await writeAudit(fastify, tenantId, userId, 'lead.ai_queued', 'lead', 'bulk', {
            leadIds,
            contactIds,
            nicheId,
            agentId,
            agentName: agentRows[0].name,
            queuedExisting,
            createdFromContacts,
            invalidRegionCount,
            consentRequiredCount,
            blockedCount,
        });
        return {
            ok: true,
            queuedExisting,
            createdFromContacts,
            totalQueued: uniqueAssignments.length,
            pendingConsentCount: consentRequiredCount,
            consentVerifiedCount: uniqueAssignments.length - consentRequiredCount,
            invalidRegionCount,
            consentRequiredCount,
            blockedCount,
        };
    });
    fastify.patch('/v1/leads/ai-calling/settings', { preHandler: [fastify.authenticate] }, async (request, reply) => {
        const { tenantId, userId, role } = request.tenant;
        if (!['owner', 'admin', 'manager'].includes(String(role || '').toLowerCase())) {
            return reply.code(403).send({ error: 'Only a manager can change calling safety settings' });
        }
        const body = request.body || {};
        const caps = serverCallingCaps();
        const { rows: currentRows } = await fastify.db.query('SELECT * FROM ai_calling_controls WHERE tenant_id = $1', [tenantId]);
        const current = normalizedCallingControl(currentRows[0] || {});
        const timezone = CALLING_TIMEZONES.has(body.callingTimezone)
            ? body.callingTimezone
            : current.callingTimezone;
        const startHour = Math.round(numberInRange(body.callingWindowStartHour, current.callingWindowStartHour, 0, 23));
        const endHour = Math.round(numberInRange(body.callingWindowEndHour, current.callingWindowEndHour, 1, 24));
        if (startHour >= endHour) {
            return reply.code(400).send({ error: 'Calling end hour must be later than start hour' });
        }
        const settings = {
            callsPerMinute: Math.round(numberInRange(body.callsPerMinute, 1, 1, caps.callsPerMinute)),
            maxCallsPerDay: Math.round(numberInRange(body.maxCallsPerDay, caps.maxCallsPerDay, 1, caps.maxCallsPerDay)),
            maxMinutesPerDay: Math.round(numberInRange(body.maxMinutesPerDay, current.maxMinutesPerDay, 1, caps.maxMinutesPerDay)),
            maxCostUsdPerDay: numberInRange(body.maxCostUsdPerDay, current.maxCostUsdPerDay, 0.1, caps.maxCostUsdPerDay),
            callingTimezone: timezone,
            callingWindowStartHour: startHour,
            callingWindowEndHour: endHour,
        };
        const { rows } = await fastify.db.query(`INSERT INTO ai_calling_controls (
         tenant_id, calls_per_minute, max_calls_per_day, max_minutes_per_day,
         max_cost_usd_per_day, calling_timezone, calling_window_start_hour,
         calling_window_end_hour, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET
         calls_per_minute = EXCLUDED.calls_per_minute,
         max_calls_per_day = EXCLUDED.max_calls_per_day,
         max_minutes_per_day = EXCLUDED.max_minutes_per_day,
         max_cost_usd_per_day = EXCLUDED.max_cost_usd_per_day,
         calling_timezone = EXCLUDED.calling_timezone,
         calling_window_start_hour = EXCLUDED.calling_window_start_hour,
         calling_window_end_hour = EXCLUDED.calling_window_end_hour,
         updated_at = NOW()
       RETURNING *`, [
            tenantId,
            settings.callsPerMinute,
            settings.maxCallsPerDay,
            settings.maxMinutesPerDay,
            settings.maxCostUsdPerDay,
            settings.callingTimezone,
            settings.callingWindowStartHour,
            settings.callingWindowEndHour,
        ]);
        await writeAudit(fastify, tenantId, userId, 'ai_calling.settings_updated', 'tenant', tenantId, settings);
        return { settings: normalizedCallingControl(rows[0]), serverCaps: caps };
    });
    fastify.get('/v1/leads/ai-calling/status', { preHandler: [fastify.authenticate] }, async (request) => {
        const { tenantId } = request.tenant;
        const { rows: controlRows } = await fastify.db.query('SELECT * FROM ai_calling_controls WHERE tenant_id = $1', [tenantId]);
        const rawControl = controlRows[0] || {};
        const settings = normalizedCallingControl(rawControl);
        const { rows: usageRows } = await fastify.db.query(`SELECT
         (SELECT COUNT(*)::int
          FROM enrichment_results
          WHERE tenant_id = $1 AND assigned_to_ai = true
            AND (last_contacted_at AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date) AS attempts,
         COALESCE((SELECT SUM(duration_sec)
                   FROM ai_call_sessions
                   WHERE tenant_id = $1
                     AND (started_at AT TIME ZONE 'UTC' AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date), 0)::int AS seconds,
         COALESCE((SELECT SUM(cost_estimate_usd)
                   FROM ai_call_sessions
                   WHERE tenant_id = $1
                     AND (started_at AT TIME ZONE 'UTC' AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date), 0)::numeric
         + COALESCE((SELECT SUM(estimated_cost_usd) FROM ai_usage_ledger
                     WHERE tenant_id = $1 AND created_at >= date_trunc('day', NOW())), 0)::numeric AS cost`, [tenantId, settings.callingTimezone]);
        const { rows: callRows } = await fastify.db.query(`SELECT id, raw_data->>'active_call_sid' AS active_call_sid
       FROM enrichment_results
       WHERE tenant_id = $1 AND assigned_to_ai = true AND lead_stage = 'calling'
         AND do_not_call = false
       ORDER BY last_contacted_at DESC NULLS LAST LIMIT 1`, [tenantId]);
        const { rows: lastRows } = await fastify.db.query(`SELECT
         id,
         company_name,
         domain,
         primary_phone,
         lead_stage,
         last_contacted_at,
         raw_data->>'active_call_sid' AS active_call_sid,
         raw_data
       FROM enrichment_results
       WHERE tenant_id = $1
         AND assigned_to_ai = true
         AND last_contacted_at IS NOT NULL
       ORDER BY last_contacted_at DESC
       LIMIT 1`, [tenantId]);
        const { rows: nextRows } = await fastify.db.query(`SELECT
         id,
         company_name,
         domain,
         primary_phone,
         lead_stage
       FROM enrichment_results
       WHERE tenant_id = $1
         AND assigned_to_ai = true
         AND lead_stage IN ('assigned', 'followup')
         AND do_not_call = false
         AND primary_phone IS NOT NULL
         AND primary_phone <> ''
         AND (next_followup_at IS NULL OR next_followup_at <= NOW())
       ORDER BY
         CASE WHEN lead_stage = 'followup' THEN 0 ELSE 1 END,
         COALESCE(next_followup_at, created_at) ASC
       LIMIT 1`, [tenantId]);
        const { rows: queueRows } = await fastify.db.query(`SELECT COUNT(*)::int AS count
       FROM enrichment_results
       WHERE tenant_id = $1
         AND assigned_to_ai = true
         AND lead_stage IN ('assigned', 'followup')
         AND do_not_call = false
         AND primary_phone IS NOT NULL
         AND primary_phone <> ''`, [tenantId]);
        const { rows: stageRows } = await fastify.db.query(`SELECT lead_stage, COUNT(*)::int AS count,
              COUNT(*) FILTER (WHERE do_not_call = false
                AND lead_stage IN ('assigned', 'followup'))::int AS callable_assigned
       FROM enrichment_results
       WHERE tenant_id = $1 AND assigned_to_ai = true
       GROUP BY lead_stage`, [tenantId]);
        const { rows: recentRows } = await fastify.db.query(`SELECT
         id,
         company_name,
         domain,
         primary_phone,
         primary_email,
         lead_stage,
         lead_notes,
         ai_summary,
         last_contacted_at,
         raw_data
       FROM enrichment_results
       WHERE tenant_id = $1
         AND assigned_to_ai = true
         AND last_contacted_at IS NOT NULL
       ORDER BY last_contacted_at DESC
       LIMIT 12`, [tenantId]);
        const activeLeadId = callRows[0]?.id || null;
        const activeCallSid = callRows[0]?.active_call_sid || null;
        const lastCall = lastRows[0] || null;
        const nextLead = nextRows[0] || null;
        const stageCounts = Object.fromEntries(stageRows.map((row) => [row.lead_stage, row.count]));
        const usage = usageRows[0] || {};
        return {
            isRunning: settings.isRunning,
            activeLeadId,
            activeCallSid,
            lastCall,
            nextLead,
            queueCount: queueRows[0]?.count || 0,
            pendingConsentCount: 0,
            stageCounts,
            recentActivity: recentRows,
            settings: {
                callsPerMinute: settings.callsPerMinute,
                maxCallsPerDay: settings.maxCallsPerDay,
                maxMinutesPerDay: settings.maxMinutesPerDay,
                maxCostUsdPerDay: settings.maxCostUsdPerDay,
                callingTimezone: settings.callingTimezone,
                callingWindowStartHour: settings.callingWindowStartHour,
                callingWindowEndHour: settings.callingWindowEndHour,
            },
            serverCaps: serverCallingCaps(),
            usageToday: {
                attempts: Number(usage.attempts || 0),
                seconds: Number(usage.seconds || 0),
                costUsd: Number(usage.cost || 0),
            },
            withinCallingWindow: isWithinCallingWindow(rawControl),
        };
    });
    fastify.post('/v1/leads/ai-calling/start', { preHandler: [fastify.authenticate] }, async (request, reply) => {
        if (process.env.AI_OUTBOUND_ENABLED !== 'true') {
            return reply.code(403).send({ ok: false, isRunning: false, message: 'AI outbound calling is disabled by the server safety policy.' });
        }
        const { tenantId, userId } = request.tenant;
        if (!await hasActiveCallingSubscription(fastify, tenantId)) {
            return reply.code(402).send({ error: 'Your calling subscription is inactive or has expired. Contact your administrator to renew 30-day calling access.' });
        }
        await fastify.db.query(`INSERT INTO ai_calling_controls (tenant_id, is_running, updated_at)
       VALUES ($1, false, NOW())
       ON CONFLICT (tenant_id) DO NOTHING`, [tenantId]);
        const { rows: controlRows } = await fastify.db.query('SELECT * FROM ai_calling_controls WHERE tenant_id = $1', [tenantId]);
        const rawControl = controlRows[0] || {};
        const settings = normalizedCallingControl(rawControl);
        if (!isWithinCallingWindow(rawControl)) {
            return reply.code(409).send({
                error: `Calling window is ${settings.callingWindowStartHour}:00-${settings.callingWindowEndHour}:00 in ${settings.callingTimezone}`,
            });
        }
        const { rows: usageRows } = await fastify.db.query(`SELECT
         (SELECT COUNT(*)::int
          FROM enrichment_results
          WHERE tenant_id = $1 AND assigned_to_ai = true
            AND (last_contacted_at AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date) AS attempts,
         COALESCE((SELECT SUM(duration_sec)
                   FROM ai_call_sessions
                   WHERE tenant_id = $1
                     AND (started_at AT TIME ZONE 'UTC' AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date), 0)::int AS seconds,
         COALESCE((SELECT SUM(cost_estimate_usd)
                   FROM ai_call_sessions
                   WHERE tenant_id = $1
                     AND (started_at AT TIME ZONE 'UTC' AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date), 0)::numeric
         + COALESCE((SELECT SUM(estimated_cost_usd) FROM ai_usage_ledger
                     WHERE tenant_id = $1 AND created_at >= date_trunc('day', NOW())), 0)::numeric AS cost`, [tenantId, settings.callingTimezone]);
        const usage = usageRows[0] || {};
        if (Number(usage.attempts || 0) >= settings.maxCallsPerDay) {
            return reply.code(429).send({ error: `Daily outbound limit of ${settings.maxCallsPerDay} calls is already reached` });
        }
        if (Number(usage.seconds || 0) >= settings.maxMinutesPerDay * 60) {
            return reply.code(429).send({ error: `Daily talk-time limit of ${settings.maxMinutesPerDay} minutes is already reached` });
        }
        if (Number(usage.cost || 0) >= settings.maxCostUsdPerDay) {
            return reply.code(429).send({ error: `Daily AI calling budget of $${settings.maxCostUsdPerDay.toFixed(2)} is already reached` });
        }
        const { rows: readyRows } = await fastify.db.query(`SELECT COUNT(*)::int AS count
       FROM enrichment_results er
       JOIN ai_agent_configs ac
         ON ac.id = er.assigned_ai_agent_id AND ac.tenant_id = er.tenant_id
       WHERE er.tenant_id = $1
         AND er.assigned_to_ai = true
         AND er.lead_stage IN ('assigned', 'followup')
         AND er.do_not_call = false
         AND er.primary_phone IS NOT NULL AND er.primary_phone <> ''
         AND ac.is_active = true AND ac.mode = 'outbound'`, [tenantId]);
        if ((readyRows[0]?.count || 0) < 1) {
            return reply.code(400).send({ error: 'No queued lead has an active outbound agent' });
        }
        await fastify.db.query(`INSERT INTO ai_calling_controls (tenant_id, is_running, updated_at)
       VALUES ($1, true, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET is_running = true, updated_at = NOW()`, [tenantId]);
        await writeAudit(fastify, tenantId, userId, 'ai_calling.started', 'tenant', tenantId, {
            queueCount: readyRows[0].count,
            settings,
        });
        return { ok: true, isRunning: true, settings };
    });
    fastify.post('/v1/leads/ai-calling/stop', { preHandler: [fastify.authenticate] }, async (request) => {
        const { tenantId, userId } = request.tenant;
        await fastify.db.query(`INSERT INTO ai_calling_controls (tenant_id, is_running, updated_at)
       VALUES ($1, false, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET is_running = false, updated_at = NOW()`, [tenantId]);
        const { rows: activeRows } = await fastify.db.query(`SELECT id, raw_data->>'active_call_sid' AS active_call_sid
       FROM enrichment_results
       WHERE tenant_id = $1 AND assigned_to_ai = true AND lead_stage = 'calling'`, [tenantId]);
        await Promise.all(activeRows
            .filter((row) => row.active_call_sid)
            .map((row) => terminateSignalWireCall(row.active_call_sid).catch((err) => {
            fastify.log.warn({ callSid: row.active_call_sid, err }, 'Could not terminate SignalWire AI campaign call');
        })));
        await fastify.db.query(`UPDATE enrichment_results
       SET lead_stage = 'assigned',
           raw_data = COALESCE(raw_data, '{}'::jsonb) - 'active_call_sid',
           lead_notes = CONCAT_WS(E'\n', NULLIF(lead_notes, ''), '[AI Call] Calling queue stopped by operator; any live call was terminated.')
       WHERE tenant_id = $1
         AND assigned_to_ai = true
         AND lead_stage = 'calling'`, [tenantId]);
        await writeAudit(fastify, tenantId, userId, 'ai_calling.stopped', 'tenant', tenantId, { stoppedCalls: activeRows.length });
        return { ok: true, isRunning: false, stoppedCalls: activeRows.length };
    });
    // POST /v1/leads/ai-calling/skip-active → Supervisor skips one live call and keeps the dialer running
    fastify.post('/v1/leads/ai-calling/skip-active', { preHandler: [fastify.authenticate] }, async (request, reply) => {
        const { tenantId, userId } = request.tenant;
        const { callSid, reason = 'operator_skip' } = request.body;
        if (!callSid)
            return reply.code(400).send({ error: 'callSid is required' });
        const { rows } = await fastify.db.query(`SELECT id, company_name, domain, raw_data->>'active_call_sid' AS active_call_sid
       FROM enrichment_results
       WHERE tenant_id = $1
         AND assigned_to_ai = true
         AND (
           raw_data->>'active_call_sid' = $2
           OR (lead_stage = 'calling' AND COALESCE(raw_data->>'active_call_sid', '') = '')
         )
       ORDER BY last_contacted_at DESC NULLS LAST
       LIMIT 1`, [tenantId, callSid]);
        const lead = rows[0];
        if (!lead)
            return reply.code(404).send({ error: 'Active AI call lead not found' });
        try {
            await terminateSignalWireCall(callSid);
        }
        catch (err) {
            fastify.log.warn({ callSid, leadId: lead.id, error: err.message }, 'Supervisor skip could not terminate SignalWire call');
        }
        await fastify.db.query(`UPDATE enrichment_results
       SET lead_stage = 'no_answer',
           raw_data = (COALESCE(raw_data, '{}'::jsonb) - 'active_call_sid')
             || jsonb_build_object(
                  'supervisor_skip_reason', $1::text,
                  'supervisor_skip_at', NOW()::text
                ),
           lead_notes = CONCAT_WS(E'\n', NULLIF(lead_notes, ''), $2::text)
       WHERE id = $3`, [
            reason,
            `[AI Call] Supervisor marked live call as ${reason}; call ended and dialer can move to next lead.`,
            lead.id,
        ]);
        await writeAudit(fastify, tenantId, userId, 'ai_calling.skip_active', 'lead', lead.id, { callSid, reason });
        return { ok: true, leadId: lead.id, callSid, reason };
    });
    // POST /v1/leads/:id/start-call → Manually trigger an outbound AI call to a specific lead
    fastify.post('/v1/leads/:id/start-call', { preHandler: [fastify.authenticate] }, async (request, reply) => {
        if (process.env.AI_OUTBOUND_ENABLED !== 'true') {
            return reply.code(403).send({ error: 'AI outbound calling is disabled by the server safety policy.' });
        }
        const { tenantId, userId } = request.tenant;
        if (!await hasActiveCallingSubscription(fastify, tenantId)) {
            return reply.code(402).send({ error: 'Your calling subscription is inactive or has expired. Contact your administrator to renew 30-day calling access.' });
        }
        const leadId = request.params.id;
        // Fetch the lead
        const releaseLock = await (0, outbound_lock_js_1.acquireOutboundLock)(fastify.db, tenantId);
        if (!releaseLock)
            return reply.code(409).send({ error: 'Another call is being started. Please wait.' });
        try {
            const { rows } = await fastify.db.query(`SELECT er.id, er.tenant_id, er.primary_phone, er.company_name, er.domain,
              er.lead_stage, er.assigned_to_ai, er.ai_voice_consent, er.do_not_call, er.last_contacted_at,
              ac.id AS agent_config_id
       FROM enrichment_results er
       LEFT JOIN ai_agent_configs ac
         ON ac.id = er.assigned_ai_agent_id
        AND ac.tenant_id = er.tenant_id
        AND ac.is_active = true
        AND ac.mode = 'outbound'
       WHERE er.id = $1 AND er.tenant_id = $2`, [leadId, tenantId]);
            const lead = rows[0];
            if (!lead)
                return reply.code(404).send({ error: 'Lead not found' });
            if (!lead.primary_phone)
                return reply.code(400).send({ error: 'Lead has no phone number' });
            if (!lead.assigned_to_ai)
                return reply.code(400).send({ error: 'Lead is not assigned to AI' });
            if (lead.do_not_call)
                return reply.code(409).send({ error: 'Lead is on the do-not-call list' });
            if (!lead.agent_config_id)
                return reply.code(400).send({ error: 'Lead has no active outbound AI agent' });
            if (lead.lead_stage === 'calling')
                return reply.code(409).send({ error: 'Call already in progress for this lead' });
            if (lead.last_contacted_at && Date.now() - new Date(lead.last_contacted_at).getTime() < 86400000) {
                return reply.code(429).send({ error: 'This lead was already attempted in the last 24 hours.' });
            }
            const { rows: controlRows } = await fastify.db.query('SELECT * FROM ai_calling_controls WHERE tenant_id = $1', [tenantId]);
            const rawControl = controlRows[0] || {};
            const settings = normalizedCallingControl(rawControl);
            if (!isWithinCallingWindow(rawControl)) {
                return reply.code(409).send({ error: `Calling is outside the ${settings.callingTimezone} campaign window` });
            }
            const { rows: usageRows } = await fastify.db.query(`SELECT
         (SELECT COUNT(*)::int FROM enrichment_results
          WHERE tenant_id = $1 AND assigned_to_ai = true
            AND (last_contacted_at AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date) AS attempts,
         (SELECT COUNT(*)::int FROM enrichment_results
          WHERE tenant_id = $1 AND assigned_to_ai = true
            AND last_contacted_at >= NOW() - INTERVAL '1 minute') AS attempts_last_minute,
         (SELECT COUNT(*)::int FROM enrichment_results
          WHERE tenant_id = $1 AND assigned_to_ai = true AND lead_stage = 'calling') AS active_calls,
         COALESCE((SELECT SUM(duration_sec) FROM ai_call_sessions
                   WHERE tenant_id = $1
                     AND (started_at AT TIME ZONE 'UTC' AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date), 0)::int AS seconds,
         COALESCE((SELECT SUM(cost_estimate_usd) FROM ai_call_sessions
                   WHERE tenant_id = $1
                     AND (started_at AT TIME ZONE 'UTC' AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date), 0)::numeric
         + COALESCE((SELECT SUM(estimated_cost_usd) FROM ai_usage_ledger
                     WHERE tenant_id = $1 AND created_at >= date_trunc('day', NOW())), 0)::numeric AS cost`, [tenantId, settings.callingTimezone]);
            const usage = usageRows[0] || {};
            if (Number(usage.attempts_last_minute || 0) >= settings.callsPerMinute) {
                return reply.code(429).send({ error: `Calls-per-minute limit of ${settings.callsPerMinute} is reached` });
            }
            if (Number(usage.active_calls || 0) >= numberInRange(process.env.AI_MAX_ACTIVE_CALLS, 1, 1, 5)) {
                return reply.code(429).send({ error: 'An AI call is already active' });
            }
            const nextMaxCost = (numberInRange(process.env.AI_MAX_SECONDS_PER_CALL, 120, 60, 600) / 60)
                * numberInRange(process.env.AI_ESTIMATED_COST_USD_PER_MINUTE, 0.1, 0.01, 10);
            if (Number(usage.attempts || 0) >= settings.maxCallsPerDay
                || Number(usage.seconds || 0) >= settings.maxMinutesPerDay * 60
                || Number(usage.cost || 0) + nextMaxCost > settings.maxCostUsdPerDay) {
                return reply.code(429).send({ error: 'A daily AI calling safety limit is reached' });
            }
            const signalWireClient = getSignalWireClient();
            const fromPhone = (0, us_phone_js_1.normalizeNorthAmericanPhone)(process.env.SIGNALWIRE_PHONE_NUMBER);
            const publicBaseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
            if (!signalWireClient || !fromPhone) {
                return reply.code(503).send({ error: 'SignalWire is not configured on this server' });
            }
            // Mark lead as calling
            await fastify.db.query(`UPDATE enrichment_results SET lead_stage = 'calling', last_contacted_at = NOW() WHERE id = $1`, [leadId]);
            let callSid = null;
            try {
                const webhookUrl = `${publicBaseUrl}/api/voice/twiml/outbound?contactId=${leadId}&tenantId=${tenantId}`;
                const normalizedPhone = (0, us_phone_js_1.normalizeNorthAmericanPhone)(lead.primary_phone);
                if (!normalizedPhone) {
                    await fastify.db.query(`UPDATE enrichment_results
           SET lead_stage = 'no_answer',
               lead_notes = CONCAT_WS(E'\n', NULLIF(lead_notes, ''), '[AI Call] Manual call skipped because phone number is not a valid USA or Canada number.')
           WHERE id = $1`, [leadId]);
                    return reply.code(400).send({ error: 'Only valid USA or Canada numbers can be called' });
                }
                const call = await signalWireClient.calls.create({
                    url: webhookUrl,
                    to: normalizedPhone,
                    from: fromPhone,
                    method: 'POST',
                    statusCallback: `${publicBaseUrl}/api/voice/webhooks/call-status?contactId=${leadId}`,
                    statusCallbackMethod: 'POST',
                    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
                    timeout: 30,
                    machineDetection: 'Enable',
                    machineDetectionTimeout: 10,
                    machineDetectionSpeechThreshold: 2400,
                    machineDetectionSpeechEndThreshold: 1200,
                    machineDetectionSilenceTimeout: 5000,
                    record: false,
                });
                callSid = call.sid;
                // Update lead raw_data with active_call_sid
                await fastify.db.query(`UPDATE enrichment_results 
         SET raw_data = COALESCE(raw_data, '{}'::jsonb)
             || jsonb_build_object(
                  'active_call_sid', $1::text,
                  'call_started_at', NOW()::text,
                  'call_status', 'initiated',
                  'call_duration_seconds', 0
                )
         WHERE id = $2`, [callSid, leadId]);
                fastify.log.info({ leadId, callSid }, 'Manual outbound call created');
            }
            catch (err) {
                // Failed attempts require an operator decision; never auto-redial them.
                await fastify.db.query(`UPDATE enrichment_results
         SET lead_stage = 'no_answer',
             raw_data = COALESCE(raw_data, '{}'::jsonb)
               || jsonb_strip_nulls(jsonb_build_object(
                    'call_status', 'failed_to_create',
                    'call_error_code', $1::text,
                    'call_error_message', $2::text,
                    'call_started_at', NOW()::text,
                    'call_ended_at', NOW()::text,
                    'call_duration_seconds', 0
                  )),
             lead_notes = CONCAT_WS(E'\n', NULLIF(lead_notes, ''), $3::text)
         WHERE id = $4 AND lead_stage = 'calling'`, [
                    err?.code ? String(err.code) : null,
                    err.message || 'SignalWire call create failed',
                    `[AI Call] Manual SignalWire call failed${err?.code ? ` (${err.code})` : ''}: ${err.message || 'call create failed'}`,
                    leadId,
                ]);
                return reply.code(502).send({ error: `SignalWire call failed: ${err.message}` });
            }
            await writeAudit(fastify, tenantId, userId, 'lead.call_started', 'lead', leadId, { callSid });
            return { ok: true, callSid };
        }
        finally {
            await releaseLock();
        }
    });
    // POST /v1/leads/:id/end-call → Manually terminate an active AI call
    fastify.post('/v1/leads/:id/end-call', { preHandler: [fastify.authenticate] }, async (request, reply) => {
        const { tenantId } = request.tenant;
        const leadId = request.params.id;
        const { callSid } = request.body;
        // Fetch the lead to verify ownership
        const { rows } = await fastify.db.query(`SELECT id, lead_stage, raw_data->>'active_call_sid' AS db_call_sid
       FROM enrichment_results WHERE id = $1 AND tenant_id = $2`, [leadId, tenantId]);
        const lead = rows[0];
        if (!lead)
            return reply.code(404).send({ error: 'Lead not found' });
        const activeCallSid = callSid || lead.db_call_sid;
        if (!activeCallSid) {
            // Revert stage just in case
            await fastify.db.query(`UPDATE enrichment_results SET lead_stage = 'assigned' WHERE id = $1`, [leadId]);
            return { ok: true, message: 'No active call SID found, stage reset to assigned' };
        }
        try {
            await terminateSignalWireCall(activeCallSid);
            fastify.log.info({ leadId, activeCallSid }, 'Manual outbound call terminated via API');
        }
        catch (err) {
            fastify.log.warn({ leadId, activeCallSid, error: err.message }, 'Failed to terminate call in SignalWire');
        }
        if (!activeCallSid) {
            await fastify.db.query(`UPDATE enrichment_results 
         SET lead_stage = 'assigned',
             raw_data = COALESCE(raw_data, '{}'::jsonb) - 'active_call_sid'
         WHERE id = $1`, [leadId]);
            return { ok: true, message: 'No active SignalWire SID found; lead moved back to assigned' };
        }
        await fastify.db.query(`UPDATE enrichment_results
       SET lead_notes = CONCAT_WS(E'\n', NULLIF(lead_notes, ''), '[AI Call] Manual stop requested; waiting for final SignalWire status.')
       WHERE id = $1`, [leadId]);
        return { ok: true, message: 'Call stop requested; final stage will update from SignalWire callback.' };
    });
    // GET /v1/leads/active-calls -> Returns mapping of contactId -> callSid for live monitoring
    fastify.get('/v1/leads/active-calls', { preHandler: [fastify.authenticate] }, async (request) => {
        const { tenantId } = request.tenant;
        try {
            // @ts-ignore
            const { getPipelineStats } = await import('../voice-agent/orchestrator/call-pipeline.js');
            const stats = getPipelineStats();
            const activeCalls = {};
            stats.pipelines.forEach((p) => {
                if (p.contactId && p.callSid) {
                    activeCalls[p.contactId] = p.callSid;
                }
            });
            // Also query the DB for leads in 'calling' stage for this tenant to get their active_call_sid
            const { rows } = await fastify.db.query(`SELECT id, raw_data->>'active_call_sid' AS active_call_sid
         FROM enrichment_results
         WHERE tenant_id = $1 AND lead_stage = 'calling'`, [tenantId]);
            rows.forEach((row) => {
                if (row.active_call_sid) {
                    activeCalls[row.id] = row.active_call_sid;
                }
            });
            return { activeCalls };
        }
        catch (err) {
            return { activeCalls: {} };
        }
    });
    // GET /v1/leads/pipeline  → groups counts by stage for Kanban
    fastify.get('/v1/leads/pipeline', { preHandler: [fastify.authenticate] }, async (request) => {
        const { tenantId } = request.tenant;
        const { rows } = await fastify.db.query(`SELECT lead_stage, COUNT(*)::int AS n
       FROM enrichment_results WHERE tenant_id = $1
       GROUP BY lead_stage`, [tenantId]);
        const map = {};
        for (const r of rows)
            map[r.lead_stage] = r.n;
        return {
            stages: exports.PIPELINE_STAGES.map((s) => ({ stage: s, count: map[s] || 0 })),
        };
    });
    // GET /v1/leads/:id
    fastify.get('/v1/leads/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
        const { tenantId } = request.tenant;
        const { rows } = await fastify.db.query(`SELECT * FROM enrichment_results WHERE id = $1 AND tenant_id = $2`, [request.params.id, tenantId]);
        if (!rows[0])
            return reply.code(404).send({ error: 'Lead not found' });
        const { rows: hist } = await fastify.db.query(`SELECT * FROM lead_stage_history WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 50`, [request.params.id]);
        const { rows: taskRows } = await fastify.db.query(`SELECT * FROM tasks WHERE lead_id = $1 ORDER BY due_at NULLS LAST, created_at DESC`, [request.params.id]);
        return { lead: rows[0], history: hist, tasks: taskRows };
    });
    // PATCH /v1/leads/:id  → update stage / owner / notes / priority / next_followup_at
    fastify.patch('/v1/leads/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
        const { tenantId, userId } = request.tenant;
        const body = (request.body || {});
        const updates = [];
        const params = [];
        const { rows: current } = await fastify.db.query(`SELECT lead_stage, lead_owner_id, assigned_to_ai FROM enrichment_results WHERE id = $1 AND tenant_id = $2`, [request.params.id, tenantId]);
        if (!current[0])
            return reply.code(404).send({ error: 'Lead not found' });
        if (typeof body.lead_stage === 'string' && exports.PIPELINE_STAGES.includes(body.lead_stage)) {
            params.push(body.lead_stage);
            updates.push(`lead_stage = $${params.length}`);
        }
        if (body.lead_owner_id === null || typeof body.lead_owner_id === 'string') {
            params.push(body.lead_owner_id);
            updates.push(`lead_owner_id = $${params.length}`);
        }
        if (typeof body.lead_priority === 'string') {
            params.push(body.lead_priority);
            updates.push(`lead_priority = $${params.length}`);
        }
        if (typeof body.lead_notes === 'string') {
            params.push(body.lead_notes);
            updates.push(`lead_notes = $${params.length}`);
        }
        if (body.next_followup_at === null || typeof body.next_followup_at === 'string') {
            params.push(body.next_followup_at);
            updates.push(`next_followup_at = $${params.length}`);
        }
        if (typeof body.assigned_to_ai === 'boolean') {
            params.push(body.assigned_to_ai);
            updates.push(`assigned_to_ai = $${params.length}`);
        }
        if (typeof body.ai_agent_provider === 'string') {
            params.push(body.ai_agent_provider === 'openai_realtime' ? 'deepgram_voice_agent' : body.ai_agent_provider);
            updates.push(`ai_agent_provider = $${params.length}`);
        }
        if (typeof body.assigned_ai_agent_id === 'string' || body.assigned_ai_agent_id === null) {
            params.push(body.assigned_ai_agent_id);
            updates.push(`assigned_ai_agent_id = $${params.length}`);
        }
        if (!updates.length)
            return reply.code(400).send({ error: 'No valid fields to update' });
        params.push(request.params.id);
        params.push(tenantId);
        const { rows } = await fastify.db.query(`UPDATE enrichment_results SET ${updates.join(', ')}
       WHERE id = $${params.length - 1} AND tenant_id = $${params.length}
       RETURNING *`, params);
        // Stage-change side effect: history + audit
        if (body.lead_stage && body.lead_stage !== current[0].lead_stage) {
            await fastify.db.query(`INSERT INTO lead_stage_history (tenant_id, lead_id, from_stage, to_stage, changed_by)
         VALUES ($1, $2, $3, $4, $5)`, [tenantId, request.params.id, current[0].lead_stage, body.lead_stage, userId]);
            await writeAudit(fastify, tenantId, userId, 'lead.stage_changed', 'lead', request.params.id, {
                from: current[0].lead_stage, to: body.lead_stage,
            });
        }
        if (body.lead_owner_id !== undefined && body.lead_owner_id !== current[0].lead_owner_id) {
            await writeAudit(fastify, tenantId, userId, 'lead.owner_changed', 'lead', request.params.id, {
                from: current[0].lead_owner_id, to: body.lead_owner_id,
            });
        }
        return { lead: rows[0] };
    });
    // ================================================================
    // TASKS / FOLLOW-UP QUEUE
    // ================================================================
    // GET /v1/tasks?status=open&assigned_to=&due_before=
    fastify.get('/v1/tasks', { preHandler: [fastify.authenticate] }, async (request) => {
        const { tenantId } = request.tenant;
        const q = request.query;
        const where = ['tenant_id = $1'];
        const params = [tenantId];
        if (q.status) {
            params.push(q.status);
            where.push(`status = $${params.length}`);
        }
        if (q.assigned_to) {
            params.push(q.assigned_to);
            where.push(`assigned_to = $${params.length}`);
        }
        if (q.lead_id) {
            params.push(q.lead_id);
            where.push(`lead_id = $${params.length}`);
        }
        if (q.due_before) {
            params.push(q.due_before);
            where.push(`due_at <= $${params.length}`);
        }
        const { rows } = await fastify.db.query(`SELECT * FROM tasks WHERE ${where.join(' AND ')}
       ORDER BY due_at NULLS LAST, created_at DESC LIMIT 500`, params);
        return { tasks: rows };
    });
    // POST /v1/tasks
    fastify.post('/v1/tasks', { preHandler: [fastify.authenticate] }, async (request, reply) => {
        const { tenantId, userId } = request.tenant;
        const b = (request.body || {});
        if (!b.title)
            return reply.code(422).send({ error: 'title required' });
        const { rows } = await fastify.db.query(`INSERT INTO tasks (tenant_id, lead_id, assigned_to, created_by, title, description, task_type, due_at, priority)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [
            tenantId, b.lead_id || null, b.assigned_to || userId, userId,
            b.title, b.description || null, b.task_type || 'followup',
            b.due_at || null, b.priority || 'medium',
        ]);
        await writeAudit(fastify, tenantId, userId, 'task.created', 'task', rows[0].id, { title: b.title });
        return reply.code(201).send({ task: rows[0] });
    });
    // PATCH /v1/tasks/:id
    fastify.patch('/v1/tasks/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
        const { tenantId, userId } = request.tenant;
        const b = (request.body || {});
        const updates = [];
        const params = [];
        for (const k of ['title', 'description', 'task_type', 'due_at', 'priority', 'assigned_to', 'status']) {
            if (k in b) {
                params.push(b[k]);
                updates.push(`${k} = $${params.length}`);
            }
        }
        if (b.status === 'done') {
            updates.push(`completed_at = now()`);
        }
        if (!updates.length)
            return reply.code(400).send({ error: 'No fields to update' });
        params.push(request.params.id);
        params.push(tenantId);
        const { rows } = await fastify.db.query(`UPDATE tasks SET ${updates.join(', ')} WHERE id = $${params.length - 1} AND tenant_id = $${params.length}
       RETURNING *`, params);
        if (!rows[0])
            return reply.code(404).send({ error: 'Task not found' });
        if (b.status === 'done') {
            await writeAudit(fastify, tenantId, userId, 'task.completed', 'task', request.params.id);
        }
        return { task: rows[0] };
    });
    // DELETE /v1/tasks/:id
    fastify.delete('/v1/tasks/:id', { preHandler: [fastify.authenticate] }, async (request) => {
        const { tenantId } = request.tenant;
        await fastify.db.query(`DELETE FROM tasks WHERE id = $1 AND tenant_id = $2`, [request.params.id, tenantId]);
        return { success: true };
    });
    // ================================================================
    // ANALYTICS
    // ================================================================
    // GET /v1/analytics/overview
    fastify.get('/v1/analytics/overview', { preHandler: [fastify.authenticate] }, async (request) => {
        const { tenantId } = request.tenant;
        const q = (request.query || {});
        const days = Math.min(365, Math.max(1, parseInt(q.days || '30')));
        const [leadsByStage, stageMovement, tasksOpen, enrichJobs, topIndustries, costsData] = await Promise.all([
            fastify.db.query(`SELECT lead_stage, COUNT(*)::int AS n FROM enrichment_results
         WHERE tenant_id = $1 GROUP BY lead_stage`, [tenantId]),
            fastify.db.query(`SELECT to_stage, COUNT(*)::int AS n FROM lead_stage_history
         WHERE tenant_id = $1 AND created_at > now() - ($2 || ' days')::interval
         GROUP BY to_stage`, [tenantId, String(days)]),
            fastify.db.query(`SELECT COUNT(*)::int AS n FROM tasks
         WHERE tenant_id = $1 AND status = 'open'`, [tenantId]),
            fastify.db.query(`SELECT status, COUNT(*)::int AS n FROM enrichment_jobs
         WHERE tenant_id = $1 AND created_at > now() - ($2 || ' days')::interval
         GROUP BY status`, [tenantId, String(days)]),
            fastify.db.query(`SELECT industry_guess AS industry, COUNT(*)::int AS n FROM enrichment_results
         WHERE tenant_id = $1 AND industry_guess IS NOT NULL
         GROUP BY industry_guess ORDER BY n DESC LIMIT 10`, [tenantId]),
            fastify.db.query(`SELECT 
           COALESCE(SUM((cost_breakdown->'twilio'->>'total')::numeric), 0) AS twilio_cost,
           COALESCE(SUM((cost_breakdown->'openAI'->>'cost')::numeric), 0) AS openai_cost
         FROM voice_call_sessions vcs
         JOIN calls c ON c.call_sid = vcs.call_sid
         WHERE c.tenant_id = $1 AND vcs.created_at > now() - ($2 || ' days')::interval`, [tenantId, String(days)]),
        ]);
        return {
            range_days: days,
            leads_by_stage: leadsByStage.rows,
            stage_movement: stageMovement.rows,
            tasks_open: tasksOpen.rows[0]?.n || 0,
            enrichment_jobs: enrichJobs.rows,
            top_industries: topIndustries.rows,
            costs: {
                twilio: parseFloat(costsData?.rows[0]?.twilio_cost || 0),
                openai: parseFloat(costsData?.rows[0]?.openai_cost || 0),
                total: parseFloat(costsData?.rows[0]?.twilio_cost || 0) + parseFloat(costsData?.rows[0]?.openai_cost || 0),
            }
        };
    });
    // ================================================================
    // AUDIT LOG (read-only)
    // ================================================================
    fastify.get('/v1/audit', { preHandler: [fastify.authenticate] }, async (request) => {
        const { tenantId, role } = request.tenant;
        if (role !== 'owner' && role !== 'admin' && role !== 'manager') {
            return { entries: [] };
        }
        const q = (request.query || {});
        const limit = Math.min(200, parseInt(q.limit || '100'));
        const { rows } = await fastify.db.query(`SELECT a.*, u.email AS actor_email
       FROM audit_log a LEFT JOIN users u ON u.id = a.actor_user_id
       WHERE a.tenant_id = $1 ORDER BY a.created_at DESC LIMIT $2`, [tenantId, limit]);
        return { entries: rows };
    });
    // ================================================================
    // AI LAYER  (OpenAI-backed; falls back to deterministic stub when no key)
    // ================================================================
    const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
    const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    async function callOpenAI(system, user) {
        if (!OPENAI_KEY)
            return '';
        try {
            const resp = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${OPENAI_KEY}`,
                },
                body: JSON.stringify({
                    model: OPENAI_MODEL,
                    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
                    temperature: 0.4,
                    max_tokens: 600,
                }),
            });
            if (!resp.ok)
                return '';
            const data = (await resp.json());
            return data.choices?.[0]?.message?.content?.trim() || '';
        }
        catch {
            return '';
        }
    }
    // POST /v1/ai/lead-summary  { lead_id }
    fastify.post('/v1/ai/lead-summary', { preHandler: [fastify.authenticate] }, async (request, reply) => {
        const { tenantId, userId } = request.tenant;
        const { lead_id } = (request.body || {});
        if (!lead_id)
            return reply.code(422).send({ error: 'lead_id required' });
        const { rows } = await fastify.db.query(`SELECT * FROM enrichment_results WHERE id = $1 AND tenant_id = $2`, [lead_id, tenantId]);
        const lead = rows[0];
        if (!lead)
            return reply.code(404).send({ error: 'Lead not found' });
        const context = [
            `Company: ${lead.company_name || lead.domain}`,
            `Domain: ${lead.domain}`,
            `Industry: ${lead.industry_guess || 'unknown'}`,
            `Pitch: ${lead.one_line_pitch || ''}`,
            `Ecommerce: ${lead.ecommerce_signal}`,
            `SaaS: ${lead.saas_signal}`,
            `CMS: ${lead.cms_guess || ''}`,
            `Email: ${lead.primary_email || 'none'} / Phone: ${lead.primary_phone || 'none'}`,
        ].join('\n');
        const system = 'You are a senior SDR. Write concise sales intelligence on a prospect.';
        const user = `Analyze this prospect and output EXACTLY this format in plain text:\n\nSUMMARY:\n<2-3 sentence company summary>\n\nPAIN_POINTS:\n- <pain 1>\n- <pain 2>\n- <pain 3>\n\nSCORE: <0-100 integer>\n\nProspect data:\n${context}`;
        let ai = await callOpenAI(system, user);
        if (!ai) {
            // Fallback stub when no OPENAI_KEY — deterministic placeholder.
            ai = `SUMMARY:\n${lead.company_name || lead.domain} operates in ${lead.industry_guess || 'an unclassified'} industry.\n\nPAIN_POINTS:\n- Configure OPENAI_API_KEY to enable real AI analysis.\n\nSCORE: 50`;
        }
        const sumMatch = ai.match(/SUMMARY:\s*([\s\S]*?)(?=\n\s*PAIN_POINTS:|$)/i);
        const painMatch = ai.match(/PAIN_POINTS:\s*([\s\S]*?)(?=\n\s*SCORE:|$)/i);
        const scoreMatch = ai.match(/SCORE:\s*(\d+)/i);
        const summary = sumMatch?.[1]?.trim() || ai;
        const pains = painMatch?.[1]?.trim() || '';
        const score = scoreMatch ? Math.min(100, Math.max(0, parseInt(scoreMatch[1]))) : null;
        await fastify.db.query(`UPDATE enrichment_results
       SET ai_summary = $1, ai_pain_points = $2, ai_score = $3, ai_updated_at = now()
       WHERE id = $4 AND tenant_id = $5`, [summary, pains, score, lead_id, tenantId]);
        await writeAudit(fastify, tenantId, userId, 'ai.summary_generated', 'lead', lead_id, { score });
        return { summary, pain_points: pains, score };
    });
    // POST /v1/ai/generate-message  { lead_id, channel: 'email' | 'call' | 'linkedin' }
    // Returns generated text; does NOT send anything (collect-only, per spec).
    fastify.post('/v1/ai/generate-message', { preHandler: [fastify.authenticate] }, async (request, reply) => {
        const { tenantId } = request.tenant;
        const b = (request.body || {});
        if (!b.lead_id)
            return reply.code(422).send({ error: 'lead_id required' });
        const channel = b.channel || 'email';
        const { rows } = await fastify.db.query(`SELECT * FROM enrichment_results WHERE id = $1 AND tenant_id = $2`, [b.lead_id, tenantId]);
        const lead = rows[0];
        if (!lead)
            return reply.code(404).send({ error: 'Lead not found' });
        const system = `You are a world-class SDR writing a short outbound ${channel} message.`;
        const user = `Write a concise, personalized ${channel} message for:\nCompany: ${lead.company_name || lead.domain}\nIndustry: ${lead.industry_guess || 'unknown'}\nPitch: ${lead.one_line_pitch || ''}\n\nKeep it under 120 words and include one specific observation about their business.`;
        let text = await callOpenAI(system, user);
        if (!text)
            text = `[AI disabled — set OPENAI_API_KEY.]\nHi ${lead.company_name || 'there'}, I noticed you operate in the ${lead.industry_guess || 'same'} space and wanted to share how we help similar companies automate outbound.`;
        return { channel, text };
    });
}
//# sourceMappingURL=crm.js.map