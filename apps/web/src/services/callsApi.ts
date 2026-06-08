// Calls API client
// Wraps the Node/Express call-system backend exposed at https://calls.jentoai.com
// Base URL is controlled by VITE_CALLS_URL.

const CALLS_URL =
  (import.meta.env.VITE_CALLS_URL as string | undefined) || '';
export const CALLS_API_BASE = `${CALLS_URL}/api`;

type Json = Record<string, any>;

export const CALL_TOKEN_KEY = 'call_token';
export const CALL_USER_KEY = 'call_user';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem(CALL_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T = any>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${CALLS_API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
      ...(init?.headers || {}),
    },
    credentials: 'omit',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Calls API ${init?.method || 'GET'} ${path} failed: ${res.status} ${text}`,
    );
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export interface Agent {
  id: number;
  name: string;
  email: string;
  twilio_identity: string;
  is_available: boolean;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: number;
  name: string;
  phone_number: string;
  company?: string | null;
  email?: string | null;
  notes?: string | null;
  source?: string | null;
  meeting_time?: string | null;
  campaign_id?: number | null;
  niche_id?: number | null;
  niche_name?: string | null;
  website?: string | null;
  linkedin?: string | null;
  reddit_url?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  score?: number | null;
  stage?: 'new_lead' | 'in_progress' | 'converted_lost' | 'email_sent' | 'fallback_linkedin' | 'needs_browser' | null;
  messages_count?: number | null;
  emails_sent?: number | null;
  emails_received?: number | null;
  email_opened?: number | null;
  last_call_status?: string | null;
  last_call_outcome?: string | null;
  last_called_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type CallOutcome = 'connected' | 'voicemail' | 'no_answer' | 'busy';

export interface Call {
  id: number;
  call_sid?: string | null;
  child_call_sid?: string | null;
  agent_id?: number | null;
  contact_id?: number | null;
  contact_name?: string | null;
  contact_phone_number?: string | null;
  contact_company?: string | null;
  agent_name?: string | null;
  direction?: string | null;
  status?: string | null;
  outcome?: CallOutcome | null;
  notes?: string | null;
  duration_seconds?: number | null;
  started_at?: string | null;
  ended_at?: string | null;
  recording_url?: string | null;
  recording_status?: string | null;
  recording_enabled?: boolean | null;
  [key: string]: any;
}

export interface CallFilters {
  dateFrom?: string;
  dateTo?: string;
  agentId?: number;
  outcome?: string;
  status?: string;
  contactId?: number;
  callSid?: string;
}

export const callsApi = {
  listAgents: () => request<{ agents: Agent[] }>(`/agents`),

  setAgentAvailability: (id: number, isAvailable: boolean) =>
    request<{ agent: Agent }>(`/agents/${id}/availability`, {
      method: 'PATCH',
      body: JSON.stringify({ isAvailable }),
    }),

  listContacts: () => request<{ contacts: Contact[] }>(`/contacts`),

  createContact: (payload: {
    name: string;
    phone_number: string;
    company?: string | null;
    email?: string | null;
    notes?: string | null;
  }) =>
    request<{ contact: Contact }>(`/contacts`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  importContactsCsv: async (file: File) => {
    const token = localStorage.getItem(CALL_TOKEN_KEY);
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${CALLS_API_BASE}/contacts/import-csv`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: fd,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`CSV import failed: ${res.status} ${text}`);
    }
    return res.json() as Promise<{ imported: number; contacts: Contact[] }>;
  },

  removeContact: (id: number) =>
    request<{ message: string }>(`/contacts/${id}`, {
      method: 'DELETE',
    }),

  updateContact: (
    id: number,
    payload: { notes?: string | null; meeting_time?: string | null; stage?: string | null },
  ) =>
    request<{ contact: Contact }>(`/contacts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  clearAllContacts: () =>
    request<{ deletedCount: number; message: string }>(`/contacts`, {
      method: 'DELETE',
    }),

  queueLinkedinTask: (id: number, task_type: 'scrape_profile' | 'send_connection' | 'send_message') =>
    request<{ task: any }>(`/contacts/${id}/linkedin-task`, {
      method: 'POST',
      body: JSON.stringify({ task_type }),
    }),

  startOutreach: (id: number, template: string) =>
    request<{ success: boolean; message: string; fallbackTask?: any }>(`/contacts/${id}/outreach`, {
      method: 'POST',
      body: JSON.stringify({ template }),
    }),

  getCampaigns: (channel?: string) =>
    request<{ campaigns: any[] }>(`/campaigns${channel ? `?channel=${channel}` : ''}`),
    
  createCampaign: (data: { name: string; base_template: string }) =>
    request<{ campaign: any }>('/campaigns', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    
  updateCampaignStatus: (id: number, status: 'active' | 'paused' | 'completed') =>
    request<{ campaign: any }>(`/campaigns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
    
  assignToCampaign: (id: number, contact_ids: number[]) =>
    request<{ success: boolean; count: number }>(`/campaigns/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ contact_ids }),
    }),

  getEmailAccounts: () =>
    request<{ accounts: any[] }>('/email-accounts'),
    
  createEmailAccount: (data: { email: string; app_password: string }) =>
    request<{ account: any }>('/email-accounts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getCall: (id: number) =>
    request<{ calls: Call[] }>(`/calls?callSid=${encodeURIComponent(String(id))}`).then((r) => {
      // Fallback: if callSid filter doesn't match numeric id, do client-side filter.
      const hit = r.calls.find((c) => c.id === id);
      return { call: hit || r.calls[0] || null };
    }),

  listCalls: (filters: CallFilters = {}) => {
    const qs = new URLSearchParams(
      Object.entries(filters)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => [k, String(v)]),
    ).toString();
    return request<{ calls: Call[] }>(`/calls${qs ? `?${qs}` : ''}`);
  },

  updateCall: (
    id: number,
    payload: { outcome?: CallOutcome | null; notes?: string | null },
  ) =>
    request<{ call: Call }>(`/calls/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  recording: (id: number, action: 'start' | 'stop') =>
    request<Json>(`/calls/${id}/recording`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),

  recordingStreamUrl: (id: number) =>
    `${CALLS_API_BASE}/calls/${id}/recording/stream`,

  getToken: (agentId: number) =>
    request<{ token: string; agent: Agent }>(`/twilio/token?agentId=${agentId}`),

  transferCall: (callSid: string, targetAgentId: number) =>
    request<{ success: boolean; message: string }>(`/calls/${callSid}/transfer`, {
      method: 'POST',
      body: JSON.stringify({ targetAgentId }),
    }),

  sendContactEmail: (id: number, payload: { subject: string; body: string }) =>
    request<{ success: boolean; contact: Contact }>(`/contacts/${id}/send-email`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  markContactReplied: (id: number) =>
    request<{ success: boolean; contact: Contact }>(`/contacts/${id}/reply-status`, {
      method: 'POST',
    }),

  queueRedditTask: (id: number, task_type: 'scrape_profile' | 'send_message') =>
    request<{ task: any }>(`/contacts/${id}/reddit-task`, {
      method: 'POST',
      body: JSON.stringify({ task_type }),
    }),

  getLinkedinTasks: () =>
    request<{ tasks: any[] }>('/linkedin/tasks'),

  getRedditTasks: () =>
    request<{ tasks: any[] }>('/reddit/tasks'),
};

export default callsApi;
