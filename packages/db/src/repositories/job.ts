import { Pool } from 'pg';
import { TenantScopedRepository } from './base';
import { JobStatus } from '@enrichment-saas/contracts';

export class JobRepository extends TenantScopedRepository {
  constructor(pool: Pool, tenantId: string) {
    super(pool, tenantId);
  }

  async create(data: {
    workspace_id?: string;
    created_by?: string;
    source_type: string;
    mode: string;
    total_items: number;
    idempotency_key?: string;
    webhook_url?: string;
  }) {
    const query = `
      INSERT INTO enrichment_jobs 
      (tenant_id, workspace_id, created_by, source_type, mode, total_items, idempotency_key, webhook_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    return this.queryOne(query, [
      this.tenantId,
      data.workspace_id,
      data.created_by,
      data.source_type,
      data.mode,
      data.total_items,
      data.idempotency_key,
      data.webhook_url
    ]);
  }

  async getById(id: string) {
    const query = `SELECT * FROM enrichment_jobs WHERE id = $1 AND tenant_id = $2`;
    return this.queryOne(query, [id, this.tenantId]);
  }

  async updateStatus(id: string, status: JobStatus) {
    const query = `
      UPDATE enrichment_jobs 
      SET status = $1, 
          started_at = CASE WHEN $1 = 'running' AND started_at IS NULL THEN now() ELSE started_at END,
          finished_at = CASE WHEN $1 IN ('completed', 'failed', 'partial', 'cancelled') THEN now() ELSE finished_at END
      WHERE id = $2 AND tenant_id = $3
      RETURNING *
    `;
    return this.queryOne(query, [status, id, this.tenantId]);
  }

  async incrementCounters(id: string, updates: {
    completed?: number;
    failed?: number;
    partial?: number;
    http?: number;
    browser?: number;
  }) {
    const query = `
      UPDATE enrichment_jobs 
      SET completed_items = completed_items + $1,
          failed_items = failed_items + $2,
          partial_items = partial_items + $3,
          http_completed = http_completed + $4,
          browser_completed = browser_completed + $5
      WHERE id = $6 AND tenant_id = $7
      RETURNING *
    `;
    return this.queryOne(query, [
      updates.completed || 0,
      updates.failed || 0,
      updates.partial || 0,
      updates.http || 0,
      updates.browser || 0,
      id,
      this.tenantId
    ]);
  }

  // --- Job Items ---

  async addItem(data: {
    job_id: string;
    raw_input: string;
    normalized_domain: string;
    shard_index?: number;
  }) {
    const query = `
      INSERT INTO enrichment_job_items 
      (job_id, tenant_id, raw_input, normalized_domain, shard_index)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;
    return this.queryOne<{ id: string }>(query, [
      data.job_id,
      this.tenantId,
      data.raw_input,
      data.normalized_domain,
      data.shard_index
    ]);
  }

  async getJobItems(jobId: string) {
    const query = `SELECT * FROM enrichment_job_items WHERE job_id = $1 AND tenant_id = $2`;
    return this.query(query, [jobId, this.tenantId]);
  }
}
