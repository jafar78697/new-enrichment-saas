import { EnrichmentMode } from '@enrichment-saas/contracts';
export interface ClientConfig {
    apiKey: string;
    baseUrl?: string;
    timeout?: number;
}
export declare class EnrichmentClient {
    private axios;
    constructor(config: ClientConfig);
    /**
     * Enrich a list of domains
     */
    enrich(domains: string[], options?: {
        mode?: EnrichmentMode;
        webhookUrl?: string;
    }): Promise<any>;
    /**
     * Get job status and results
     */
    getJob(jobId: string): Promise<any>;
    /**
     * Create an export for a job
     */
    createExport(jobId: string, format?: 'csv' | 'json'): Promise<any>;
    /**
     * List API keys (Admin only)
     */
    listApiKeys(): Promise<any>;
}
//# sourceMappingURL=index.d.ts.map