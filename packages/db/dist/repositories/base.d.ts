import { Pool, QueryResult, QueryResultRow } from 'pg';
export declare class BaseRepository {
    protected pool: Pool;
    constructor(pool: Pool);
    protected query<T extends QueryResultRow>(text: string, params?: any[]): Promise<QueryResult<T>>;
    protected queryOne<T extends QueryResultRow>(text: string, params?: any[]): Promise<T | null>;
}
export declare class TenantScopedRepository extends BaseRepository {
    protected tenantId: string;
    constructor(pool: Pool, tenantId: string);
    protected scopedQuery<T extends QueryResultRow>(text: string, params?: any[]): Promise<QueryResult<T>>;
}
//# sourceMappingURL=base.d.ts.map