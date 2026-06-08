import { CALL_TOKEN_KEY } from './callsApi';

const API_BASE = (import.meta.env.VITE_CALLS_URL || '') + '/api/niches';

export interface Niche {
  id: number;
  name: string;
  description: string | null;
  assigned_agent_id: number | null;
  agent_name?: string;
  agent_email?: string;
  contact_count: number;
  status: 'active' | 'archived';
  created_at: string;
}

async function request(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem(CALL_TOKEN_KEY);
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const resp = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || data.message || 'API request failed');
  return data;
}

export const nichesApi = {
  list: (): Promise<{ niches: Niche[] }> => request('/'),
  
  my: (): Promise<{ niches: Niche[] }> => request('/my'),
  
  create: (data: { name: string; description?: string; assigned_agent_id?: number | null }): Promise<{ niche: Niche }> =>
    request('/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    
  update: (id: number, data: Partial<Niche>): Promise<{ niche: Niche }> =>
    request(`/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
    
  delete: (id: number): Promise<{ message: string }> =>
    request(`/${id}`, { method: 'DELETE' }),
    
  assign: (id: number, agentId: number | null): Promise<{ niche: Niche }> =>
    request(`/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ assigned_agent_id: agentId }),
    }),
};
