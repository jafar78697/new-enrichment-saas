import { CALLS_API_BASE, CALL_TOKEN_KEY } from './callsApi';

export type DeepgramAgentMode = 'browser_preview' | 'inbound';

export interface DeepgramAgent {
  id: string;
  name: string;
  provider: 'deepgram_voice_agent';
  mode: DeepgramAgentMode;
  isActive: boolean;
  voice: string;
  language: 'en';
  prompt: string;
  greeting: string;
  assignedPhoneNumber: string | null;
  maxCallDurationSec: number;
  createdAt: string;
  updatedAt: string;
}

export interface DeepgramAgentDraft {
  name: string;
  mode: DeepgramAgentMode;
  isActive: boolean;
  voice: string;
  language: 'en';
  prompt: string;
  greeting: string;
  assignedPhoneNumber: string | null;
  maxCallDurationSec: number;
}

export interface DeepgramAgentStatus {
  enabled: boolean;
  deepgramConfigured: boolean;
  outboundEnabled: boolean;
  browserPreviewMaxSeconds: number;
  inboundMaxSeconds: number;
  maxActiveCalls: number;
  dailyMinuteLimit: number;
  dailyBudgetUsd: number;
}

export interface PreviewToken {
  token: string;
  expiresIn: number;
  maxSeconds: number;
  url: string;
  config: {
    agent: Record<string, unknown>;
    audio: {
      input: { encoding: 'linear16'; sampleRate: number };
      output: { encoding: 'linear16'; sampleRate: number };
    };
  };
}

export interface AgentSessionSummary {
  id: string;
  provider: string;
  signalwire_call_sid: string | null;
  call_state: string | null;
  first_answer_type: string | null;
  hangup_reason: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_sec: number | null;
  outcome: string | null;
  cost_estimate_usd: number | null;
  last_error: string | null;
  agent_name: string | null;
}

function headers() {
  const token = localStorage.getItem('enr_token') || localStorage.getItem(CALL_TOKEN_KEY);
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${CALLS_API_BASE}/voice/agents${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers || {}) },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(body || `Deepgram API request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const deepgramAgentsApi = {
  status: () => request<DeepgramAgentStatus>('/status'),
  list: () => request<{ agents: DeepgramAgent[] }>('/'),
  create: (draft: DeepgramAgentDraft) => request<{ agent: DeepgramAgent }>('/', {
    method: 'POST', body: JSON.stringify(draft),
  }),
  update: (id: string, draft: Partial<DeepgramAgentDraft>) => request<{ agent: DeepgramAgent }>(`/${id}`, {
    method: 'PATCH', body: JSON.stringify(draft),
  }),
  remove: (id: string) => request<void>(`/${id}`, { method: 'DELETE' }),
  previewToken: (id: string) => request<PreviewToken>(`/${id}/preview-token`, { method: 'POST' }),
  stopPreview: (id: string) => request<void>(`/${id}/preview-stop`, { method: 'POST' }),
  sessions: () => request<{ sessions: AgentSessionSummary[] }>('/history/sessions'),
};
