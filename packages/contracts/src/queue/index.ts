import { EnrichmentMode } from '../enums';

export interface HttpJobPayload {
  job_item_id: string;
  job_id: string;
  tenant_id: string;
  domain: string;
  mode: EnrichmentMode.FAST_HTTP | EnrichmentMode.SMART_HYBRID;
  attempt: number;
  enqueued_at: string;
}

export interface BrowserJobPayload {
  job_item_id: string;
  job_id: string;
  tenant_id: string;
  domain: string;
  mode: EnrichmentMode.PREMIUM_JS | EnrichmentMode.SMART_HYBRID;
  attempt: number;
  enqueued_at: string;
}

export interface WebhookJobPayload {
  delivery_id: string;
  endpoint_id: string;
  tenant_id: string;
  event: string;
  payload: any;
  attempt: number;
}

export interface ExportJobPayload {
  export_id: string;
  job_id: string;
  tenant_id: string;
  format: 'csv' | 'json';
}
