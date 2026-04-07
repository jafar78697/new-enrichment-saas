import { useState } from 'react';

export function useAuth() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('enr_token'));

  const login = (t: string) => { localStorage.setItem('enr_token', t); setToken(t); };
  const logout = () => { localStorage.removeItem('enr_token'); setToken(null); };

  return { token, login, logout };
}
