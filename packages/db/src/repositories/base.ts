import { Pool, QueryResult, QueryResultRow } from 'pg';

export class BaseRepository {
  constructor(protected pool: Pool) {}

  protected async query<T extends QueryResultRow>(
    text: string,
    params: any[] = []
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  protected async queryOne<T extends QueryResultRow>(
    text: string,
    params: any[] = []
  ): Promise<T | null> {
    const result = await this.query<T>(text, params);
    return result.rows[0] || null;
  }
}

export class TenantScopedRepository extends BaseRepository {
  constructor(pool: Pool, protected tenantId: string) {
    super(pool);
  }

  // Wrappers that automatically inject tenant_id
  protected async scopedQuery<T extends QueryResultRow>(
    text: string,
    params: any[] = []
  ): Promise<QueryResult<T>> {
    // Basic implementation: assumes tenant_id is the first or specific param
    // In a real app, this might involve query rewriting or strict column checks
    return this.query<T>(text, [...params, this.tenantId]);
  }
}
