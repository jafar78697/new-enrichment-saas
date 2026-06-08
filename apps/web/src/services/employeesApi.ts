// Employees + Twilio numbers API client
// Reuses the base URL / JWT header logic of callsApi via a small shared request helper.
// Token is stored under CALL_TOKEN_KEY (see callsApi.ts).

import { CALLS_API_BASE, CALL_TOKEN_KEY, CALL_USER_KEY } from './callsApi';

async function request<T = any>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem(CALL_TOKEN_KEY);
  const res = await fetch(`${CALLS_API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
    credentials: 'omit',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = text;
    try {
      const parsed = JSON.parse(text);
      message = parsed.error || parsed.message || text;
    } catch {
      /* ignore */
    }
    throw new Error(message || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────
export type EmployeeStatus = 'pending' | 'active' | 'suspended';
export type UserRole = 'manager' | 'employee';

export interface Employee {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  status: EmployeeStatus;
  twilio_identity: string;
  twilio_phone_number: string | null;
  twilio_phone_sid: string | null;
  twilio_phone_area_code: string | null;
  twilio_phone_purchased_at: string | null;
  is_available: number | boolean;
  last_login_at: string | null;
  invite_accepted_at: string | null;
  created_at: string;
  total_calls: number;
  connected_calls: number;
  total_seconds: number;
  recordings_count: number;
  assigned_niches?: { id: number; name: string }[]; // NEW
}

export interface TwilioAvailableNumber {
  phoneNumber: string;
  friendlyName?: string;
  locality?: string | null;
  region?: string | null;
  postalCode?: string | null;
  isoCountry?: string;
  capabilities?: { voice?: boolean; SMS?: boolean; MMS?: boolean };
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  status: EmployeeStatus;
  twilio_identity?: string | null;
  twilio_phone_number?: string | null;
}

export interface CreateEmployeePayload {
  name: string;
  email: string;
  nicheIds?: number[]; // NEW
}

export interface AssignNumberPayload {
  phoneNumber?: string;
  twilioSid?: string;
  areaCode?: string;
}

export interface PoolNumber {
  sid: string;
  phoneNumber: string;
  friendlyName?: string;
  assigned: { agent_id: number; name: string; email: string } | null;
}

// ─── Endpoints ────────────────────────────────────────────────────────
export const employeesApi = {
  list: () => request<{ employees: Employee[] }>('/employees'),

  // Creates the employee with an auto-generated 16-char password.
  // The password is returned ONCE — admin must copy it before closing the modal.
  create: (payload: CreateEmployeePayload) =>
    request<{ employee: Employee; generatedPassword: string }>('/employees', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  resetPassword: (id: number) =>
    request<{ ok: boolean; generatedPassword: string }>(
      `/employees/${id}/reset-password`,
      { method: 'POST' },
    ),

  assignNumber: (id: number, payload: AssignNumberPayload) =>
    request<{ employee: Employee }>(`/employees/${id}/assign-number`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  releaseNumber: (id: number) =>
    request<{ ok: boolean; released: { phoneNumber: string; sid: string } }>(
      `/employees/${id}/release-number`,
      { method: 'POST' },
    ),

  setStatus: (id: number, status: 'active' | 'suspended') =>
    request<{ ok: boolean; status: string }>(`/employees/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  remove: (id: number) =>
    request<{
      ok: boolean;
      numberReturnedToPool: { phoneNumber: string; sid: string } | null;
    }>(`/employees/${id}`, { method: 'DELETE' }),

  searchNumbers: (params: { areaCode?: string; contains?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && String(v) !== '')
        .map(([k, v]) => [k, String(v)]),
    ).toString();
    return request<{ numbers: TwilioAvailableNumber[] }>(
      `/twilio/numbers/search${qs ? `?${qs}` : ''}`,
    );
  },

  numbersPool: () => request<{ numbers: PoolNumber[] }>('/twilio/numbers/pool'),

  // NEW: Get employee hourly activity
  getActivity: (id: number, hours: number = 24) =>
    request<{ activity: Array<{
      hour: string;
      total_calls: number;
      connected_calls: number;
      total_seconds: number;
      recordings: number;
    }> }>(`/employees/${id}/activity?hours=${hours}`),

  // NEW: Get all employees summary (for team dashboard)
  getSummary: (hours: number = 1) =>
    request<{ employees: Array<{
      id: number;
      name: string;
      email: string;
      status: string;
      twilio_phone_number: string | null;
      last_login_at: string | null;
      calls_in_period: number;
      talk_time_in_period: number;
      last_call_at: string | null;
      niche_count: number;
    }> }>(`/employees/summary?hours=${hours}`),

  // NEW: Google Maps Scraper
  scrapeGoogleMaps: (payload: { keyword: string; location: string }) =>
    request<{ success: boolean; leads: any[] }>('/v1/google-maps/scrape', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

// ─── Auth helpers ─────────────────────────────────────────────────────
export const callAuthApi = {
  login: (email: string, password: string) =>
    request<{ token: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  acceptInvite: (token: string, password: string) =>
    request<{ token: string; user: AuthUser }>('/auth/accept-invite', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),

  me: () => request<{ user: AuthUser }>('/auth/me'),
};

export function getCallUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(CALL_USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function storeCallSession(token: string, user: AuthUser) {
  localStorage.setItem(CALL_TOKEN_KEY, token);
  localStorage.setItem(CALL_USER_KEY, JSON.stringify(user));
  // The unified app shell still checks enr_token for protected routes.
  localStorage.setItem('enr_token', token);
  // Keep DialerPopup's legacy agent-id key in sync so each employee calls from their own number.
  localStorage.setItem('call_agent_id', String(user.id));
}

export function clearCallSession() {
  localStorage.removeItem(CALL_TOKEN_KEY);
  localStorage.removeItem(CALL_USER_KEY);
  localStorage.removeItem('enr_token');
  localStorage.removeItem('call_agent_id');
}

export default employeesApi;
