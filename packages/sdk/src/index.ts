import axios, { AxiosInstance } from 'axios';
import { EnrichmentMode } from '@enrichment-saas/contracts';

export interface ClientConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

export class EnrichmentClient {
  private axios: AxiosInstance;

  constructor(config: ClientConfig) {
    this.axios = axios.create({
      baseURL: config.baseUrl || 'https://api.enrichment-saas.com',
      timeout: config.timeout || 30000,
      headers: {
        'X-API-Key': config.apiKey,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Enrich a list of domains
   */
  async enrich(domains: string[], options?: { mode?: EnrichmentMode; webhookUrl?: string }) {
    const { data } = await this.axios.post('/v1/jobs/enrich', {
      domains,
      mode: options?.mode || 'FAST_HTTP',
      webhookUrl: options?.webhookUrl
    });
    return data;
  }

  /**
   * Get job status and results
   */
  async getJob(jobId: string) {
    const { data } = await this.axios.get(`/v1/jobs/${jobId}`);
    return data;
  }

  /**
   * Create an export for a job
   */
  async createExport(jobId: string, format: 'csv' | 'json' = 'csv') {
    const { data } = await this.axios.post(`/v1/jobs/${jobId}/export`, { format });
    return data;
  }

  /**
   * List API keys (Admin only)
   */
  async listApiKeys() {
    const { data } = await this.axios.get('/v1/auth/api-keys');
    return data;
  }
}
