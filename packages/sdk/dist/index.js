"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnrichmentClient = void 0;
const axios_1 = __importDefault(require("axios"));
class EnrichmentClient {
    axios;
    constructor(config) {
        this.axios = axios_1.default.create({
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
    async enrich(domains, options) {
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
    async getJob(jobId) {
        const { data } = await this.axios.get(`/v1/jobs/${jobId}`);
        return data;
    }
    /**
     * Create an export for a job
     */
    async createExport(jobId, format = 'csv') {
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
exports.EnrichmentClient = EnrichmentClient;
//# sourceMappingURL=index.js.map