import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '';
const api = axios.create({ baseURL: `${BASE_URL}/v1` });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('enr_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Pipeline stages — keep in sync with apps/api/src/routes/crm.ts
export const PIPELINE_STAGES = [
  'new',
  'assigned', 'calling', 'called', 'no_answer', 'followup', 'interested',
  'demo_scheduled', 'proposal_sent', 'closed_won', 'closed_lost',
] as const;
export type Stage = (typeof PIPELINE_STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  new: 'New Leads',
  assigned: 'Assigned Leads',
  calling: 'Calling...',
  called: 'Called',
  no_answer: 'No Answer',
  followup: 'Follow-up',
  interested: 'Interested',
  demo_scheduled: 'Demo Scheduled',
  proposal_sent: 'Proposal Sent',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
};

export const STAGE_COLORS: Record<Stage, string> = {
  new: '#64748b',
  assigned: '#4f46e5',
  calling: '#d97706',
  called: '#6366f1',
  no_answer: '#ea580c',
  followup: '#ca8a04',
  interested: '#059669',
  demo_scheduled: '#10b981',
  proposal_sent: '#0f766e',
  closed_won: '#047857',
  closed_lost: '#b91c1c',
};

export interface Lead {
  id: string;
  domain: string;
  company_name: string | null;
  industry_guess: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  linkedin_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  twitter_url: string | null;
  youtube_url: string | null;
  tiktok_url: string | null;
  whatsapp_link: string | null;
  one_line_pitch: string | null;
  confidence_level: string | null;
  ecommerce_signal: boolean;
  saas_signal: boolean;
  lead_stage: Stage;
  lead_owner_id: string | null;
  assigned_to_ai: boolean;
  lead_priority: string | null;
  lead_notes: string | null;
  last_contacted_at: string | null;
  next_followup_at: string | null;
  ai_summary: string | null;
  ai_pain_points: string | null;
  ai_score: number | null;
  ai_updated_at: string | null;
  raw_data?: {
    source_contact_id?: string;
    niche_id?: number;
    niche_name?: string;
    [key: string]: unknown;
  } | null;
  created_at: string;
}

export interface Task {
  id: string;
  lead_id: string | null;
  assigned_to: string | null;
  title: string;
  description: string | null;
  task_type: string;
  due_at: string | null;
  completed_at: string | null;
  status: 'open' | 'done' | 'cancelled';
  priority: string;
  created_at: string;
}

export interface StageCount { stage: Stage; count: number; }

export interface CallingQueueLead {
  id: string;
  company_name: string | null;
  domain: string;
  primary_phone: string | null;
  lead_stage: Stage;
  last_contacted_at?: string | null;
  active_call_sid?: string | null;
}

export const leadsApi = {
  list: (params?: { stage?: Stage; owner?: string; q?: string; page?: number; limit?: number; assigned_to_ai?: boolean }) =>
    api.get<{ leads: Lead[]; total: number; page: number; limit: number }>('/leads', { params }).then((r) => r.data),
  pipeline: () => api.get<{ stages: StageCount[] }>('/leads/pipeline').then((r) => r.data),
  activeCalls: () => api.get<{ activeCalls: Record<string, string> }>('/leads/active-calls').then((r) => r.data),
  callingStatus: () => api.get<{
    isRunning: boolean;
    activeLeadId: string | null;
    activeCallSid: string | null;
    lastCall: CallingQueueLead | null;
    nextLead: CallingQueueLead | null;
    queueCount: number;
  }>('/leads/ai-calling/status').then((r) => r.data),
  startCalling: () => api.post<{ ok: boolean; isRunning: boolean }>('/leads/ai-calling/start').then((r) => r.data),
  stopCalling: () => api.post<{ ok: boolean; isRunning: boolean; stoppedCalls: number }>('/leads/ai-calling/stop').then((r) => r.data),
  queueAi: (body: { lead_ids?: string[]; contact_ids?: number[]; niche_id?: number; limit?: number }) =>
    api.post<{ ok: boolean; queuedExisting: number; createdFromContacts: number; totalQueued: number }>(
      '/leads/queue-ai',
      body,
    ).then((r) => r.data),
  startCall: (id: string) =>
    api.post<{ ok: boolean; callSid: string }>(`/leads/${id}/start-call`).then((r) => r.data),
  endCall: (id: string, callSid: string) =>
    api.post<{ ok: boolean }>(`/leads/${id}/end-call`, { callSid }).then((r) => r.data),
  get: (id: string) =>
    api
      .get<{ lead: Lead; history: any[]; tasks: Task[] }>(`/leads/${id}`)
      .then((r) => r.data),
  patch: (id: string, body: Partial<Lead>) =>
    api.patch<{ lead: Lead }>(`/leads/${id}`, body).then((r) => r.data),
};

export const tasksApi = {
  list: (params?: { status?: string; assigned_to?: string; lead_id?: string; due_before?: string }) =>
    api.get<{ tasks: Task[] }>('/tasks', { params }).then((r) => r.data),
  create: (body: Partial<Task>) =>
    api.post<{ task: Task }>('/tasks', body).then((r) => r.data),
  update: (id: string, body: Partial<Task>) =>
    api.patch<{ task: Task }>(`/tasks/${id}`, body).then((r) => r.data),
  remove: (id: string) => api.delete(`/tasks/${id}`).then((r) => r.data),
};

export interface AnalyticsOverview {
  range_days: number;
  leads_by_stage: { lead_stage: string; n: number }[];
  stage_movement: { to_stage: string; n: number }[];
  tasks_open: number;
  enrichment_jobs: { status: string; n: number }[];
  top_industries: { industry: string; n: number }[];
  costs: {
    twilio: number;
    openai: number;
    total: number;
  };
}

export const analyticsApi = {
  overview: (days = 30) =>
    api.get<AnalyticsOverview>(`/analytics/overview`, { params: { days } }).then((r) => r.data),
};

export const aiApi = {
  leadSummary: (lead_id: string) =>
    api.post<{ summary: string; pain_points: string; score: number | null }>(
      '/ai/lead-summary', { lead_id },
    ).then((r) => r.data),
  generateMessage: (lead_id: string, channel: 'email' | 'call' | 'linkedin') =>
    api.post<{ channel: string; text: string }>(
      '/ai/generate-message', { lead_id, channel },
    ).then((r) => r.data),
};

export const auditApi = {
  list: (limit = 100) =>
    api.get<{ entries: any[] }>('/audit', { params: { limit } }).then((r) => r.data),
};
