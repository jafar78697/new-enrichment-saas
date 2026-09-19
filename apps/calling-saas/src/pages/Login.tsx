import React, { useState } from 'react';
import { Link, useLocation, useNavigate, type Location } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn, AlertCircle, PhoneCall } from 'lucide-react';
import { GoogleLogin } from '@react-oauth/google';

type RouteState = {
  from?: Location;
};

function routePath(location?: Location) {
  if (!location) return '';
  return `${location.pathname}${location.search}${location.hash}`;
}

function safeRedirect(path: string) {
  if (!path.startsWith('/') || path.startsWith('//')) return '';
  return path;
}

export default function Login() {
  const location = useLocation();
  const [username, setUsername] = useState(() => new URLSearchParams(location.search).get('username') || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const from = (location.state as RouteState | null)?.from;
  const redirectPath = safeRedirect(new URLSearchParams(location.search).get('redirect') || routePath(from));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(username, password);
      if (result.must_change_password) {
        const nextPath = redirectPath || (result.isAdmin ? '/admin' : '/dashboard');
        navigate(`/change-password?redirect=${encodeURIComponent(nextPath)}`, { replace: true, state: { from } });
      } else {
        navigate(redirectPath || (result.isAdmin ? '/admin' : '/dashboard'), { replace: true });
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Login failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center relative overflow-hidden font-sans">
      <div className="relative z-10 w-full max-w-md px-6">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
            <PhoneCall size={20} className="text-white drop-shadow-sm" />
          </div>
          <span className="auth-brand-copy font-bold text-3xl tracking-tight text-slate-900">
            Jento
            <small>Voice Calling</small>
          </span>
        </div>

        {/* Login Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-xl">
          <h2 className="text-2xl font-extrabold mb-2 text-center tracking-tight">Welcome Back</h2>
          <p className="text-slate-500 text-sm text-center mb-8">Sign in to your account</p>

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl mb-6 text-sm">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-2">Username or email</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter your username or email"
                required
                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-600/20"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn size={18} />
                  Sign In
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-100">
            <div className="text-center mb-6">
              <span className="text-sm font-medium text-slate-500">Sign in with provider</span>
            </div>

            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={async (credentialResponse) => {
                  try {
                    setLoading(true);
                    const result = await loginWithGoogle(credentialResponse.credential!);
                    if (result.must_change_password) {
                      navigate(`/change-password?redirect=${encodeURIComponent(redirectPath || (result.isAdmin ? '/admin' : '/dashboard'))}`, { replace: true });
                    } else {
                      navigate(redirectPath || (result.isAdmin ? '/admin' : '/dashboard'), { replace: true });
                    }
                  } catch (err: any) {
                    setError(err?.response?.data?.error || 'Google login failed');
                  } finally {
                    setLoading(false);
                  }
                }}
                onError={() => {
                  setError('Google login failed');
                }}
                theme="outline"
                size="large"
                shape="rectangular"
                width="300"
              />
            </div>
          </div>
        </div>

        {/* Footer Links */}
        <div className="mt-8 text-center text-sm text-slate-500 flex items-center justify-center gap-4">
          <Link to="/signup" className="hover:text-blue-600 transition-colors font-medium">Create an account</Link>
          <span className="w-1 h-1 rounded-full bg-slate-300" />
          <Link to="/" className="hover:text-blue-600 transition-colors font-medium">Back to Home</Link>
        </div>
      </div>
    </div>
  );
}
