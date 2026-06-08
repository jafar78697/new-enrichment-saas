// Production-ready login page with real authentication
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { callAuthApi, storeCallSession } from '../services/employeesApi';

export default function CallLoginPage() {
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      console.log('Attempting login for:', identifier);
      
      // Call REAL authentication API
      const { token, user } = await callAuthApi.login(identifier, password);
      
      console.log('Login successful! User:', user.name, 'Role:', user.role);
      
      // Store real session
      storeCallSession(token, user);
      
      // Redirect based on role
      const next = user.role === 'manager' ? '/dashboard' : '/employees';
      console.log('Redirecting to:', next);
      
      navigate(next, { replace: true });
      
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err?.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg ring-1 ring-slate-200">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-600 text-white font-bold">
            J
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              JentoAI Call Center
            </div>
            <div className="text-lg font-semibold text-slate-900">Sign in</div>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Username or Email</span>
            <input
              type="text"
              autoFocus
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              placeholder="Username or you@company.com"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              placeholder="••••••••"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          Received an invite?{' '}
          <Link to="/accept-invite" className="font-medium text-violet-600 hover:text-violet-700">
            Accept here
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
