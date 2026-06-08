import { CALLS_API_BASE, CALL_TOKEN_KEY } from './callsApi';

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

export interface Team {
  id: number;
  name: string;
  description: string | null;
  leader_id: number | null;
  leader_name?: string | null;
  created_at: string;
}

export const teamsApi = {
  list: () => request<{ teams: Team[] }>('/teams'),
  create: (payload: { name: string; description?: string; leader_id?: number | null }) =>
    request<Team>('/teams', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: number, payload: { name: string; description?: string; leader_id?: number | null }) =>
    request<Team>(`/teams/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  remove: (id: number) => request<{ ok: boolean }>(`/teams/${id}`, { method: 'DELETE' }),
};

export default teamsApi;
