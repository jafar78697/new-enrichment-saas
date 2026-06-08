import { Pool } from 'pg';
import { TenantScopedRepository } from './base';
import { JobStatus } from '@enrichment-saas/contracts';
export declare class JobRepository extends TenantScopedRepository {
    constructor(pool: Pool, tenantId: string);
    create(data: {
        workspace_id?: string;
        created_by?: string;
        source_type: string;
        mode: string;
        total_items: number;
        idempotency_key?: string;
        webhook_url?: string;
    }): Promise<import("pg").QueryResultRow>;
    getById(id: string): Promise<import("pg").QueryResultRow>;
    updateStatus(id: string, status: JobStatus): Promise<import("pg").QueryResultRow>;
    incrementCounters(id: string, updates: {
        completed?: number;
        failed?: number;
        partial?: number;
        http?: number;
        browser?: number;
    }): Promise<import("pg").QueryResultRow>;
    addItem(data: {
        job_id: string;
        raw_input: string;
        normalized_domain: string;
        shard_index?: number;
    }): Promise<{
        id: string;
    }>;
    getJobItems(jobId: string): Promise<import("pg").QueryResult<import("pg").QueryResultRow>>;
}
//# sourceMappingURL=job.d.ts.map