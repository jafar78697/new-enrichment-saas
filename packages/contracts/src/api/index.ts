import { EnrichmentMode, JobStatus } from '../enums';

export interface CreateJobRequest {
  domains: string[];
  mode: EnrichmentMode;
  webhook_url?: string;
  options?: {
    dedupe?: boolean;
    only_missing_fields?: boolean;
  };
  idempotency_key?: string;
}

export interface CreateJobResponse {
  job_id: string;
  total_items: number;
  status: JobStatus;
}

export interface JobStatusResponse {
  id: string;
  status: JobStatus;
  total_items: number;
  completed_items: number;
  failed_items: number;
  partial_items: number;
  http_completed: number;
  browser_completed: number;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  estimated_completion?: string;
}

export interface JobResultsResponse {
  results: any[]; // Replace with EnrichmentResult if needed
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

export interface ApiKeyResponse {
  id: string;
  key_prefix: string;
  name: string;
  last_used_at?: string;
  created_at: string;
}
