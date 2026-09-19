import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface User {
  id: string;
  username: string;
  email?: string;
  display_name: string;
  role: string;
  plan: string;
  must_change_password: boolean;
  call_recording_enabled?: boolean;
  can_call?: boolean;
  can_scrape?: boolean;
  current_caller_id?: string;
}

interface Tenant {
  id: string;
  name: string;
  status: string;
  plan?: string;
}

interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  token: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<{ must_change_password: boolean; isAdmin: boolean }>;
  loginWithGoogle: (token: string) => Promise<{ must_change_password: boolean; isAdmin: boolean }>;
  signup: (firstName: string, lastName: string, email: string, password: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    tenant: null,
    token: localStorage.getItem('token'),
    loading: true,
    isAuthenticated: false,
    isAdmin: false,
  });

  // Set axios default header
  useEffect(() => {
    if (state.token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${state.token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [state.token]);

  // Load profile on mount if token exists
  useEffect(() => {
    if (state.token) {
      refreshProfile().catch(() => {
        // Token is invalid, clear it
        localStorage.removeItem('token');
        localStorage.removeItem('enr_token');
        localStorage.removeItem('call_token');
        localStorage.removeItem('call_agent_id');
        setState(s => ({ ...s, token: null, user: null, tenant: null, loading: false, isAuthenticated: false, isAdmin: false }));
      });
    } else {
      setState(s => ({ ...s, loading: false }));
    }
  }, []);

  async function refreshProfile() {
    try {
      const res = await axios.get(`${API_URL}/v1/me`, {
        headers: { Authorization: `Bearer ${state.token || localStorage.getItem('token')}` }
      });
      const { user, tenant } = res.data;
      const normalizedUser = { ...user, plan: user.plan || tenant?.plan, call_recording_enabled: Boolean(res.data.limits?.call_recording_enabled), can_call: user.can_call !== false, can_scrape: user.can_scrape !== false };
      setState(s => ({
        ...s,
        user: normalizedUser,
        tenant,
        loading: false,
        isAuthenticated: true,
        isAdmin: user.role === 'platform_admin',
      }));
    } catch {
      throw new Error('Failed to load profile');
    }
  }

  async function login(username: string, password: string) {
    const res = await axios.post(`${API_URL}/v1/auth/login`, { 
      username: username.trim(), 
      password: password.trim() 
    });
    const { token, user, tenant } = res.data;

    localStorage.setItem('token', token);
    localStorage.setItem('enr_token', token);
    localStorage.setItem('call_token', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    setState({
      user,
      tenant,
      token,
      loading: false,
      isAuthenticated: true,
      isAdmin: user.role === 'platform_admin',
    });

    return { must_change_password: user.must_change_password, isAdmin: user.role === 'platform_admin' };
  }

  async function loginWithGoogle(credentialToken: string) {
    const res = await axios.post(`${API_URL}/v1/auth/google`, { 
      token: credentialToken 
    });
    const { token, user, tenant } = res.data;

    localStorage.setItem('token', token);
    localStorage.setItem('enr_token', token);
    localStorage.setItem('call_token', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    setState({
      user,
      tenant,
      token,
      loading: false,
      isAuthenticated: true,
      isAdmin: user.role === 'platform_admin',
    });

    return { must_change_password: user.must_change_password, isAdmin: user.role === 'platform_admin' };
  }

  async function signup(firstName: string, lastName: string, email: string, password: string) {
    const res = await axios.post(`${API_URL}/v1/auth/signup`, {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim(),
      password,
    });
    const { token, user, tenant } = res.data;

    localStorage.setItem('token', token);
    localStorage.setItem('enr_token', token);
    localStorage.setItem('call_token', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    setState({
      user,
      tenant,
      token,
      loading: false,
      isAuthenticated: true,
      isAdmin: false,
    });
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    const res = await axios.post(`${API_URL}/v1/auth/change-password`, {
      current_password: currentPassword,
      new_password: newPassword,
    });

    // Update token
    if (res.data.token) {
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('enr_token', res.data.token);
      localStorage.setItem('call_token', res.data.token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
      setState(s => ({
        ...s,
        token: res.data.token,
        user: s.user ? { ...s.user, must_change_password: false } : null,
      }));
    }
  }

  function logout() {
    // Fire and forget logout request
    axios.post(`${API_URL}/v1/auth/logout`).catch(() => {});
    localStorage.removeItem('token');
    localStorage.removeItem('enr_token');
    localStorage.removeItem('call_token');
    localStorage.removeItem('call_agent_id');
    delete axios.defaults.headers.common['Authorization'];
    setState({
      user: null,
      tenant: null,
      token: null,
      loading: false,
      isAuthenticated: false,
      isAdmin: false,
    });
  }

  return (
    <AuthContext.Provider value={{ ...state, login, loginWithGoogle, signup, changePassword, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
