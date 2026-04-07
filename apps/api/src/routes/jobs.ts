import { FastifyInstance } from 'fastify';
import { EnrichmentMode, JobStatus } from '@enrichment-saas/contracts';
import { JobRepository } from '@enrichment-saas/db';
import { producer } from '@enrichment-saas/queue';

const MAX_DOMAINS = 10_000;
const SHARD_SIZE = 500;

const PLAN_HTTP_LIMITS: Record<string, number> = {
  starter: 5000,
  growth: 25000,
  pro: 100000
};

function normalizeDomain(d: string): string {
  try {
    let s = d.trim().toLowerCase();
    s = s.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('?')[0];
    return s;
  } catch { return ''; }
}

function dedupeAndNormalize(domains: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const d of domains) {
    const n = normalizeDomain(d);
    if (n && !seen.has(n)) { seen.add(n); result.push(n); }
  }
  return result;
}

async function checkHttpQuota(db: any, tenantId: string, plan: string, count: number): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT http_enrichments_used, http_limit FROM usage_counters
     WHERE tenant_id = $1 AND billing_period_start = date_trunc('month', now())::date`,
    [tenantId]
  );
  if (!rows[0]) return true;
  const limit = rows[0].http_limit || PLAN_HTTP_LIMITS[plan] || 5000;
  return (rows[0].http_enrichments_used + count) <= limit;
}

export default async function jobRoutes(fastify: FastifyInstance) {

  // POST /v1/jobs/enrich
  fastify.post('/v1/jobs/enrich', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any, reply) => {
    const body = request.body as any;
    const { tenantId, userId, workspaceId, plan } = request.tenant;

    if (!body.domains?.length)
      return reply.code(422).send({ error: 'INVALID_INPUT', message: 'domains array is required' });
    if (body.domains.length > MAX_DOMAINS)
      return reply.code(422).send({ error: 'JOB_TOO_LARGE', message: `Max ${MAX_DOMAINS} domains per job` });

    const uniqueDomains = dedupeAndNormalize(body.domains);
    const withinQuota = await checkHttpQuota(fastify.db, tenantId, plan, uniqueDomains.length);
    if (!withinQuota)
      return reply.code(402).send({ error: 'QUOTA_EXCEEDED', message: 'Monthly HTTP enrichment limit reached. Please upgrade your plan.' });

    const db = new JobRepository(fastify.db, tenantId);
    const job = await db.create({
      workspace_id: workspaceId, created_by: userId, source_type: 'api',
      mode: body.mode || EnrichmentMode.SMART_HYBRID,
      total_items: uniqueDomains.length,
      idempotency_key: body.idempotency_key,
      webhook_url: body.webhook_url
    });
    if (!job) return reply.code(400).send({ error: 'DUPLICATE_JOB', message: 'Duplicate idempotency key' });

    const isPriority = plan === 'pro';
    for (let i = 0; i < uniqueDomains.length; i++) {
      const domain = uniqueDomains[i];
      const item = await db.addItem({ job_id: job.id, raw_input: domain, normalized_domain: domain, shard_index: Math.floor(i / SHARD_SIZE) });
      if (!item) continue;
      const payload = { job_item_id: item.id, job_id: job.id, tenant_id: tenantId, domain, mode: body.mode, attempt: 1, enqueued_at: new Date().toISOString() };
      if (body.mode === EnrichmentMode.PREMIUM_JS) {
        await producer.sendToBrowserQueue(payload, isPriority);
      } else {
        await producer.sendToHttpQueue(payload, isPriority);
      }
    }

    await fastify.db.query(
      `UPDATE usage_counters SET http_enrichments_used = http_enrichments_used + $1
       WHERE tenant_id = $2 AND billing_period_start = date_trunc('month', now())::date`,
      [uniqueDomains.length, tenantId]
    );

    return reply.code(201).send({ job_id: job.id, total_items: uniqueDomains.length, status: JobStatus.QUEUED });
  });

  // POST /v1/jobs/enrich-csv
  fastify.post('/v1/jobs/enrich-csv', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any, reply) => {
    const { tenantId, userId, workspaceId, plan } = request.tenant;
    const data = await request.file();
    if (!data) return reply.code(400).send({ error: 'No file uploaded' });

    const buf = await data.toBuffer();
    const text = buf.toString('utf-8');
    const lines = text.split('\n').filter(Boolean);
    const header = lines[0].toLowerCase().split(',');
    const websiteIdx = header.findIndex((h: string) => h.includes('website') || h.includes('domain') || h.includes('url'));
    if (websiteIdx === -1) return reply.code(422).send({ error: 'No website/domain column found in CSV' });

    const rawDomains = lines.slice(1).map((l: string) => l.split(',')[websiteIdx]?.trim()).filter(Boolean);
    const uniqueDomains = dedupeAndNormalize(rawDomains);

    if (uniqueDomains.length > MAX_DOMAINS)
      return reply.code(422).send({ error: 'JOB_TOO_LARGE', message: `Max ${MAX_DOMAINS} domains per job` });

    const withinQuota = await checkHttpQuota(fastify.db, tenantId, plan, uniqueDomains.length);
    if (!withinQuota) return reply.code(402).send({ error: 'QUOTA_EXCEEDED', message: 'Monthly HTTP enrichment limit reached.' });

    const db = new JobRepository(fastify.db, tenantId);
    const job = await db.create({ workspace_id: workspaceId, created_by: userId, source_type: 'csv', mode: EnrichmentMode.SMART_HYBRID, total_items: uniqueDomains.length });
    if (!job) return reply.code(500).send({ error: 'Failed to create job' });

    const isPriority = plan === 'pro';
    for (let i = 0; i < uniqueDomains.length; i++) {
      const domain = uniqueDomains[i];
      const item = await db.addItem({ job_id: job.id, raw_input: domain, normalized_domain: domain, shard_index: Math.floor(i / SHARD_SIZE) });
      if (!item) continue;
      await producer.sendToHttpQueue({ job_item_id: item.id, job_id: job.id, tenant_id: tenantId, domain, mode: EnrichmentMode.SMART_HYBRID, attempt: 1, enqueued_at: new Date().toISOString() }, isPriority);
    }

    return reply.code(201).send({ job_id: job.id, total_items: uniqueDomains.length, status: JobStatus.QUEUED });
  });

  // GET /v1/jobs
  fastify.get('/v1/jobs', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any) => {
    const { tenantId } = request.tenant;
    const q = request.query as any;
    const page = Math.max(1, parseInt(q.page || '1'));
    const limit = Math.min(50, parseInt(q.limit || '20'));
    const offset = (page - 1) * limit;
    const { rows } = await fastify.db.query(
      `SELECT * FROM enrichment_jobs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset]
    );
    const { rows: countRows } = await fastify.db.query(`SELECT COUNT(*) FROM enrichment_jobs WHERE tenant_id = $1`, [tenantId]);
    return { jobs: rows, total: parseInt(countRows[0].count), page, limit };
  });

  // GET /v1/jobs/:id
  fastify.get('/v1/jobs/:id', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any, reply) => {
    const { tenantId } = request.tenant;
    const { rows } = await fastify.db.query(
      `SELECT * FROM enrichment_jobs WHERE id = $1 AND tenant_id = $2`,
      [request.params.id, tenantId]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'NOT_FOUND' });
    return rows[0];
  });

  // GET /v1/jobs/:id/results
  fastify.get('/v1/jobs/:id/results', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any) => {
    const { tenantId } = request.tenant;
    const q = request.query as any;
    const page = Math.max(1, parseInt(q.page || '1'));
    const limit = Math.min(100, parseInt(q.limit || '50'));
    const offset = (page - 1) * limit;

    const conditions: string[] = ['r.tenant_id = $1', 'ji.job_id = $2'];
    const params: any[] = [tenantId, request.params.id];

    if (q.has_email === 'true') conditions.push('r.primary_email IS NOT NULL');
    if (q.has_phone === 'true') conditions.push('r.primary_phone IS NOT NULL');
    if (q.has_linkedin === 'true') conditions.push('r.linkedin_url IS NOT NULL');
    if (q.confidence === 'high') conditions.push("r.confidence_level = 'high_confidence'");
    if (q.lane === 'browser') conditions.push("r.enrichment_lane = 'browser'");
    if (q.failed === 'true') conditions.push("ji.status = 'failed'");

    const where = conditions.join(' AND ');
    const { rows } = await fastify.db.query(
      `SELECT r.* FROM enrichment_results r
       JOIN enrichment_job_items ji ON ji.id = r.job_item_id
       WHERE ${where} ORDER BY r.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    const { rows: countRows } = await fastify.db.query(
      `SELECT COUNT(*) FROM enrichment_results r JOIN enrichment_job_items ji ON ji.id = r.job_item_id WHERE ${where}`,
      params
    );
    return { results: rows, total: parseInt(countRows[0].count), page, limit };
  });

  // POST /v1/jobs/:id/cancel
  fastify.post('/v1/jobs/:id/cancel', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any) => {
    const { tenantId } = request.tenant;
    await fastify.db.query(
      `UPDATE enrichment_jobs SET status = 'cancelled', finished_at = now() WHERE id = $1 AND tenant_id = $2`,
      [request.params.id, tenantId]
    );
    await fastify.db.query(
      `UPDATE enrichment_job_items SET status = 'failed' WHERE job_id = $1 AND status = 'queued'`,
      [request.params.id]
    );
    return { success: true };
  });

  // POST /v1/jobs/:id/retry-failed
  fastify.post('/v1/jobs/:id/retry-failed', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any) => {
    const { tenantId, plan } = request.tenant;
    const { rows: failedItems } = await fastify.db.query(
      `SELECT ji.* FROM enrichment_job_items ji
       JOIN enrichment_jobs j ON j.id = ji.job_id
       WHERE ji.job_id = $1 AND j.tenant_id = $2 AND ji.status = 'failed'`,
      [request.params.id, tenantId]
    );
    if (!failedItems.length) return { retried: 0 };

    const isPriority = plan === 'pro';
    for (const item of failedItems) {
      await fastify.db.query(`UPDATE enrichment_job_items SET status = 'queued', http_attempts = 0 WHERE id = $1`, [item.id]);
      await producer.sendToHttpQueue({ job_item_id: item.id, job_id: item.job_id, tenant_id: tenantId, domain: item.normalized_domain, mode: EnrichmentMode.SMART_HYBRID, attempt: 1, enqueued_at: new Date().toISOString() }, isPriority);
    }
    return { retried: failedItems.length };
  });

  // POST /v1/jobs/:id/export
  fastify.post('/v1/jobs/:id/export', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any, reply) => {
    const { tenantId } = request.tenant;
    const { format = 'csv' } = (request.body as any) || {};
    const { rows } = await fastify.db.query(
      `INSERT INTO exports (tenant_id, job_id, format, status) VALUES ($1, $2, $3, 'pending') RETURNING id`,
      [tenantId, request.params.id, format]
    );
    await producer.sendToExportQueue({ export_id: rows[0].id, job_id: request.params.id, tenant_id: tenantId, format });
    return reply.code(202).send({ export_id: rows[0].id, status: 'pending' });
  });

  // POST /v1/enrich/domain
  fastify.post('/v1/enrich/domain', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any, reply) => {
    const { domain, mode = EnrichmentMode.SMART_HYBRID } = (request.body as any) || {};
    const { tenantId, userId, workspaceId, plan } = request.tenant;
    if (!domain) return reply.code(422).send({ error: 'domain is required' });

    const normalized = normalizeDomain(domain);
    const db = new JobRepository(fastify.db, tenantId);
    const job = await db.create({ workspace_id: workspaceId, created_by: userId, source_type: 'api', mode, total_items: 1 });
    if (!job) return reply.code(500).send({ error: 'Failed to create job' });

    const item = await db.addItem({ job_id: job.id, raw_input: domain, normalized_domain: normalized, shard_index: 0 });
    if (!item) return reply.code(500).send({ error: 'Failed to create job item' });

    const isPriority = plan === 'pro';
    if (mode === EnrichmentMode.PREMIUM_JS) {
      await producer.sendToBrowserQueue({ job_item_id: item.id, job_id: job.id, tenant_id: tenantId, domain: normalized, mode, attempt: 1, enqueued_at: new Date().toISOString() }, isPriority);
    } else {
      await producer.sendToHttpQueue({ job_item_id: item.id, job_id: job.id, tenant_id: tenantId, domain: normalized, mode, attempt: 1, enqueued_at: new Date().toISOString() }, isPriority);
    }

    return reply.code(201).send({ job_id: job.id, status: JobStatus.QUEUED });
  });
}
