const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || 'Request failed');
  }
  return res.json();
}

export const voiceApi = {
  getHealth: () => apiFetch('/api/voice-health'),
  getAgents: () => apiFetch('/api/voice/agents'),
  createAgent: (data: any) => apiFetch('/api/voice/agents', { method: 'POST', body: JSON.stringify(data) }),
  getPrompts: () => apiFetch('/api/voice/prompts'),
  getAnalytics: () => apiFetch('/api/voice/analytics/summary'),
  getKnowledgeBase: () => apiFetch('/api/voice/knowledge'),
  getCalls: (params?: any) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiFetch(`/api/calls${qs}`);
  },
  triggerCall: (to: string) => apiFetch('/api/voice/outbound/call', { method: 'POST', body: JSON.stringify({ to }) }),
};

// Socket.io connection for real-time updates
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function connectSocket(): Socket {
  if (socket?.connected) return socket;

  socket = io(API_URL, {
    path: '/socket.io',
    transports: ['websocket'],
  });

  socket.on('connect', () => {
    console.log('[voice-web] Socket connected');
  });

  socket.on('disconnect', () => {
    console.log('[voice-web] Socket disconnected');
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}
