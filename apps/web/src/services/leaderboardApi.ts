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

export interface LeaderboardEntry {
  id: number;
  name: string;
  twilio_phone_number: string | null;
  team_name: string | null;
  total_calls: number;
  connected_calls: number;
  total_seconds: number;
  leads_generated: number;
}

export const leaderboardApi = {
  getRankings: (period: 'today' | 'week' | 'month' = 'today') =>
    request<{ leaderboard: LeaderboardEntry[] }>(`/leaderboard?period=${period}`),
};

export default leaderboardApi;
