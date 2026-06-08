"use strict";
/**
 * Public Enrichment API — jento-mailer aur baaki local apps ke liye
 * Auth: X-API-Key header (simple secret, no JWT needed)
 *
 * POST /v1/public/enrich
 * Body: { domain: string, wait?: boolean }
 *
 * wait=true  → synchronous, result wait karo (max 60s)
 * wait=false → async, job_id return karo
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = publicEnrichRoutes;
const contracts_1 = require("@enrichment-saas/contracts");
const PUBLIC_API_KEY = process.env.PUBLIC_ENRICH_API_KEY || 'change-me-public-key';
function normalizeDomain(d) {
    try {
        let s = d.trim().toLowerCase();
        s = s.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('?')[0];
        return s;
    }
    catch {
        return '';
    }
}
async function pollResult(db, jobId, timeoutMs = 55000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const { rows } = await db.query(`SELECT r.* FROM enrichment_results r
       JOIN enrichment_job_items ji ON ji.id = r.job_item_id
       WHERE ji.job_id = $1
       LIMIT 1`, [jobId]);
        if (rows[0])
            return rows[0];
        // Check if job failed/cancelled
        const { rows: jobRows } = await db.query(`SELECT status FROM enrichment_jobs WHERE id = $1`, [jobId]);
        if (jobRows[0]?.status === 'failed' || jobRows[0]?.status === 'cancelled')
            return null;
        await new Promise(r => setTimeout(r, 2000));
    }
    return null;
}
async function publicEnrichRoutes(fastify) {
    // POST /v1/public/enrich — single domain enrichment
    fastify.post('/v1/public/enrich', async (request, reply) => {
        // Simple API key check
        const apiKey = request.headers['x-api-key'];
        if (apiKey !== PUBLIC_API_KEY) {
            return reply.code(401).send({ error: 'Invalid API key' });
        }
        const { domain, wait = true } = request.body || {};
        if (!domain)
            return reply.code(422).send({ error: 'domain is required' });
        const normalized = normalizeDomain(domain);
        if (!normalized)
            return reply.code(422).send({ error: 'Invalid domain' });
        // Internal system tenant — ya pehle se existing tenant use karo
        const { rows: tenantRows } = await fastify.db.query(`SELECT id FROM tenants WHERE slug = 'internal' LIMIT 1`);
        let tenantId;
        if (tenantRows[0]) {
            tenantId = tenantRows[0].id;
        }
        else {
            // Create internal tenant if not exists
            const { rows: newTenant } = await fastify.db.query(`INSERT INTO tenants (name, slug, plan) VALUES ('Internal', 'internal', 'pro')
         ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
         RETURNING id`);
            tenantId = newTenant[0].id;
        }
        // Create job
        const { rows: jobRows } = await fastify.db.query(`INSERT INTO enrichment_jobs (tenant_id, source_type, mode, status, total_items)
       VALUES ($1, 'api', 'smart_hybrid', 'queued', 1)
       RETURNING id`, [tenantId]);
        const jobId = jobRows[0].id;
        // Create job item
        const { rows: itemRows } = await fastify.db.query(`INSERT INTO enrichment_job_items (job_id, tenant_id, raw_input, normalized_domain, shard_index)
       VALUES ($1, $2, $3, $4, 0)
       RETURNING id`, [jobId, tenantId, domain, normalized]);
        const itemId = itemRows[0].id;
        // Send to HTTP queue
        const { producer } = await import('@enrichment-saas/queue');
        await producer.sendToHttpQueue({
            job_item_id: itemId,
            job_id: jobId,
            tenant_id: tenantId,
            domain: normalized,
            mode: contracts_1.EnrichmentMode.SMART_HYBRID,
            attempt: 1,
            enqueued_at: new Date().toISOString()
        });
        if (!wait) {
            return reply.code(202).send({ job_id: jobId, status: 'queued' });
        }
        // Wait for result (synchronous mode)
        const result = await pollResult(fastify.db, jobId);
        if (!result) {
            return reply.code(202).send({
                job_id: jobId,
                status: 'processing',
                message: 'Enrichment in progress, poll /v1/public/result/:job_id'
            });
        }
        return reply.send(formatResult(result));
    });
    // GET /v1/public/result/:job_id — result poll karo
    fastify.get('/v1/public/result/:job_id', async (request, reply) => {
        const apiKey = request.headers['x-api-key'];
        if (apiKey !== PUBLIC_API_KEY) {
            return reply.code(401).send({ error: 'Invalid API key' });
        }
        const { rows } = await fastify.db.query(`SELECT r.* FROM enrichment_results r
       JOIN enrichment_job_items ji ON ji.id = r.job_item_id
       WHERE ji.job_id = $1 LIMIT 1`, [request.params.job_id]);
        if (!rows[0]) {
            const { rows: jobRows } = await fastify.db.query(`SELECT status FROM enrichment_jobs WHERE id = $1`, [request.params.job_id]);
            return reply.send({ status: jobRows[0]?.status || 'not_found', result: null });
        }
        return reply.send({ status: 'completed', result: formatResult(rows[0]) });
    });
}
function formatResult(row) {
    return {
        domain: row.domain,
        contact_email: row.primary_email,
        additional_emails: row.additional_emails || [],
        phone: row.primary_phone,
        additional_phones: row.additional_phones || [],
        company_name: row.company_name,
        description: row.meta_description || row.one_line_pitch,
        one_line_pitch: row.one_line_pitch,
        industry: row.industry_guess,
        services: row.services_list || [],
        linkedin: row.linkedin_url,
        facebook: row.facebook_url,
        instagram: row.instagram_url,
        twitter: row.twitter_url,
        whatsapp: row.whatsapp_link,
        cms: row.cms_guess,
        ecommerce: row.ecommerce_signal,
        confidence: row.confidence_level,
        enrichment_lane: row.enrichment_lane,
    };
}
//# sourceMappingURL=public-enrich.js.map