// Funnel API client
// Talks to the Flask mailer backend (https://mailer.jentoai.com)
// Base URL is controlled by the VITE_MAILER_URL env var so dev/prod can
// point at different hosts without code changes.

const MAILER_URL = (import.meta.env.VITE_MAILER_URL as string | undefined) || '';
export const FUNNEL_API_BASE = `${MAILER_URL}/api`;

type Json = Record<string, any>;

async function request<T = any>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${FUNNEL_API_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    credentials: 'omit',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Funnel API ${init?.method || 'GET'} ${path} failed: ${res.status} ${text}`,
    );
  }
  // Some endpoints may return 204
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export interface FunnelLeadsQuery {
  stage?: string;
  search?: string;
  campaign_id?: string | number;
  min_score?: number | string;
  max_score?: number | string;
  page?: number;
  limit?: number;
  sort?: string;
  [key: string]: string | number | undefined;
}

export const funnelApi = {
  leads: (params: FunnelLeadsQuery = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => [k, String(v)]),
    ).toString();
    return request(`/funnel/leads${qs ? `?${qs}` : ''}`);
  },

  lead: (id: string | number) => request(`/funnel/leads/${id}`),

  stats: () => request(`/funnel/stats`),

  campaigns: () => request(`/funnel/campaigns`),

  stage: (id: string | number, stage: string) =>
    request(`/funnel/leads/${id}/stage`, {
      method: 'POST',
      body: JSON.stringify({ stage }),
    }),

  callLog: (id: string | number, data: Json) =>
    request(`/funnel/leads/${id}/call-log`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  socialLog: (id: string | number, data: Json) =>
    request(`/funnel/leads/${id}/social-log`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  sendManualEmail: (
    id: string | number,
    data: { subject: string; body: string },
  ) =>
    request(`/funnel/leads/${id}/send-manual-email`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteSelected: (leadIds: Array<string | number>) =>
    request<{ ok: boolean; deleted: number }>(`/funnel/leads/delete-selected`, {
      method: 'POST',
      body: JSON.stringify({ lead_ids: leadIds }),
    }),

  deleteAll: () =>
    request<{ ok: boolean; deleted: number }>(`/funnel/leads/delete-all`, {
      method: 'POST',
      body: JSON.stringify({ confirm: 'DELETE ALL' }),
    }),
};

export default funnelApi;
