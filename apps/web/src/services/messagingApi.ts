// Messaging API client
// Wraps the Flask mailer's /api/inbox endpoints.
import { FUNNEL_API_BASE } from './funnelApi';

// Reuse the same base because both funnel and inbox live under the mailer.
const MESSAGING_API_BASE = FUNNEL_API_BASE;

type Json = Record<string, any>;

async function request<T = any>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${MESSAGING_API_BASE}${path}`, {
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
      `Messaging API ${init?.method || 'GET'} ${path} failed: ${res.status} ${text}`,
    );
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export type MessageType = 'all' | 'reply' | 'bounce';

export interface InboxMessage {
  id: string;
  uid?: string;
  account_email?: string;
  from_email?: string;
  from_name?: string;
  subject?: string;
  body?: string;
  body_html?: string;
  snippet?: string;
  received_at?: string;
  is_read?: number | boolean;
  is_important?: number | boolean;
  message_kind?: string;
  in_reply_to?: string;
  msg_id?: string;
  campaign_id?: string | number;
  campaign_name?: string;
  lead_id?: string | number;
  lead_name?: string;
  salon_name?: string;
  [key: string]: any;
}

export interface InboxListResponse {
  messages: InboxMessage[];
  total: number;
  page: number;
  per_page: number;
}

export const messagingApi = {
  list: (params: { type?: MessageType; page?: number; per_page?: number } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && (v as any) !== '')
        .map(([k, v]) => [k, String(v)]),
    ).toString();
    return request<InboxListResponse>(`/inbox${qs ? `?${qs}` : ''}`);
  },

  important: (params: { page?: number; per_page?: number } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => [k, String(v)]),
    ).toString();
    return request<InboxListResponse>(`/inbox/important${qs ? `?${qs}` : ''}`);
  },

  get: (id: string) => request<InboxMessage>(`/inbox/${encodeURIComponent(id)}`),

  reply: (id: string, body: string) =>
    request<Json>(`/inbox/${encodeURIComponent(id)}/reply`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),

  markRead: (id: string) =>
    request<Json>(`/inbox/${encodeURIComponent(id)}/mark-read`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  markImportant: (id: string, important = 1) =>
    request<Json>(`/inbox/${encodeURIComponent(id)}/mark-important`, {
      method: 'POST',
      body: JSON.stringify({ important }),
    }),

  sync: () =>
    request<Json>(`/inbox/sync`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
};

export default messagingApi;
