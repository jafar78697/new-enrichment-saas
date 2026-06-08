// Accept-invite page — reached via email link `/accept-invite?token=...`.
// Employee sets a password, receives a JWT, then is redirected to the CRM.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { callAuthApi, storeCallSession } from '../services/employeesApi';

export default function AcceptInvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [tokenError, setTokenError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token || token.length < 10) {
      setTokenError('This invite link is missing a token. Please use the link from your invite email.');
    }
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const { token: jwt, user } = await callAuthApi.acceptInvite(token, password);
      storeCallSession(jwt, user);
      setDone(true);
      // Managers manage the team; employees land directly in the calling workspace.
      const redirect = user.role === 'manager' ? '/settings/team' : '/contacts';
      window.setTimeout(() => navigate(redirect, { replace: true }), 1200);
    } catch (err: any) {
      setError(err?.message || 'Could not accept invite');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg ring-1 ring-slate-200">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-white font-bold">
            ✓
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              JentoAI Call Center
            </div>
            <div className="text-lg font-semibold text-slate-900">Set your password</div>
          </div>
        </div>

        {tokenError ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
            {tokenError}
          </div>
        ) : done ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
            Account activated — redirecting you to your dashboard…
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            )}
            <form onSubmit={submit} className="space-y-4">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">New password</span>
                <input
                  type="password"
                  autoFocus
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  placeholder="At least 6 characters"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Confirm password</span>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  placeholder="Retype password"
                />
              </label>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Activating…' : 'Activate account'}
              </button>
            </form>
          </>
        )}

        <p className="mt-6 text-center text-xs text-slate-500">
          Already set up?{' '}
          <Link to="/call-login" className="font-medium text-violet-600 hover:text-violet-700">
            Sign in instead
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
