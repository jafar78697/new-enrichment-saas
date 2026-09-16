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
    <div className="min-h-screen bg-background text-text flex items-center justify-center relative overflow-hidden">
      <div className="relative z-10 w-full max-w-md px-6">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/30 border border-white/10">
            <PhoneCall size={26} className="text-white drop-shadow-sm" />
          </div>
          <span className="font-bold text-3xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-50 to-gray-400">
            Jento Calling
          </span>
        </div>

        {/* Login Card */}
        <div className="bg-surface/40 backdrop-blur-xl border border-border/50 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-2xl font-bold mb-2 text-center">Welcome Back</h2>
          <p className="text-textMuted text-sm text-center mb-8">Sign in to your account</p>

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl mb-6 text-sm">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-textMuted mb-2">Username or email</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter your username or email"
                required
                className="w-full px-4 py-3 rounded-xl bg-background/60 border border-border/50 text-text placeholder-textMuted/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-textMuted mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                className="w-full px-4 py-3 rounded-xl bg-background/60 border border-border/50 text-text placeholder-textMuted/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-primary text-white font-semibold text-base hover:bg-primary/90 transition-all duration-300 shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_30px_rgba(99,102,241,0.5)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn size={18} />
                  <span>Sign In</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-8 mb-6 flex items-center">
            <div className="flex-grow border-t border-border/50"></div>
            <span className="px-4 text-sm text-textMuted uppercase tracking-wider whitespace-nowrap">Or continue with</span>
            <div className="flex-grow border-t border-border/50"></div>
          </div>
          
          <div className="flex justify-center -mt-2">
            <GoogleLogin
              onSuccess={async (credentialResponse) => {
                if (credentialResponse.credential) {
                  setLoading(true);
                  setError('');
                  try {
                    const result = await loginWithGoogle(credentialResponse.credential);
                    if (result.must_change_password) {
                      const nextPath = redirectPath || (result.isAdmin ? '/admin' : '/dashboard');
                      navigate(`/change-password?redirect=${encodeURIComponent(nextPath)}`, { replace: true, state: { from } });
                    } else {
                      navigate(redirectPath || (result.isAdmin ? '/admin' : '/dashboard'), { replace: true });
                    }
                  } catch (err: any) {
                    const msg = err?.response?.data?.error || err?.message || 'Google login failed';
                    setError(msg);
                  } finally {
                    setLoading(false);
                  }
                }
              }}
              onError={() => setError('Google Login Failed')}
              useOneTap
              theme="filled_black"
              shape="rectangular"
              text="continue_with"
            />
          </div>

          <p className="text-textMuted text-sm text-center mt-6">
            New to JentoAI? <Link to="/signup" className="text-primary hover:text-white">Create a free demo account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
