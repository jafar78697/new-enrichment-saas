import { useState } from 'react';
import { CALL_TOKEN_KEY, CALL_USER_KEY } from '../services/callsApi';

export function useAuth() {
  const [token, setToken] = useState<string | null>(() => (
    localStorage.getItem('enr_token') || localStorage.getItem(CALL_TOKEN_KEY)
  ));

  const login = (t: string) => {
    localStorage.setItem('enr_token', t);
    setToken(t);
  };
  const logout = () => {
    localStorage.removeItem('enr_token');
    localStorage.removeItem(CALL_TOKEN_KEY);
    localStorage.removeItem(CALL_USER_KEY);
    localStorage.removeItem('call_agent_id');
    setToken(null);
  };

  return { token, login, logout };
}
