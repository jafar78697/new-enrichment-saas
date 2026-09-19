import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  RefreshCw,
  User,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { GoogleLogin } from '@react-oauth/google';

function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const random = new Uint32Array(12);
  crypto.getRandomValues(random);
  const generated = Array.from(random, (value) => alphabet[value % alphabet.length]).join('');
  return `Aa7!${generated}`;
}

export default function Signup() {
  const { signup, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function useGeneratedPassword() {
    const generated = generatePassword();
    setPassword(generated);
    setConfirmPassword(generated);
    setShowPassword(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await signup(firstName, lastName, email, password);
      navigate('/dashboard', { replace: true });
    } catch (signupError: any) {
      setError(signupError?.response?.data?.error || signupError?.message || 'Account creation failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-lg">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-7">
          <ArrowLeft size={17} /> Back to Voice Calling
        </Link>

        <div className="auth-brand flex items-center gap-3 mb-7">
          <div className="w-11 h-11 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
            <Activity size={25} className="text-white" />
          </div>
          <div>
            <div className="auth-brand-copy font-bold text-2xl text-slate-900">Jento<small>Voice Calling</small></div>
            <div className="text-sm text-slate-500">Create your free demo · 3 calls and 2 Maps searches included</div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-7 shadow-2xl">
          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg mb-5 text-sm">
              <AlertCircle size={17} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-sm font-medium text-slate-500 mb-2">First name</span>
                <span className="relative block">
                  <User size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    className="w-full px-4 py-3 pl-10 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                    placeholder="First name"
                    autoComplete="given-name"
                    minLength={1}
                    maxLength={50}
                    required
                  />
                </span>
              </label>

              <label className="block">
                <span className="block text-sm font-medium text-slate-500 mb-2">Last name</span>
                <input
                  type="text"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  placeholder="Last name"
                  autoComplete="family-name"
                  minLength={1}
                  maxLength={50}
                  required
                />
              </label>
            </div>

            <label className="block">
              <span className="block text-sm font-medium text-slate-500 mb-2">Email address</span>
              <span className="relative block">
                <Mail size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full px-4 py-3 pl-10 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  placeholder="you@company.com"
                  autoComplete="email"
                  required
                />
              </span>
            </label>

            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <label htmlFor="signup-password" className="text-sm font-medium text-slate-500">Password</label>
                <button
                  type="button"
                  onClick={useGeneratedPassword}
                  className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-slate-900 transition-colors"
                >
                  <RefreshCw size={13} /> Generate secure password
                </button>
              </div>
              <div className="relative">
                <LockKeyhole size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="input-field pl-10 pr-11"
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <label className="block">
              <span className="block text-sm font-medium text-slate-500 mb-2">Confirm password</span>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                placeholder="Enter the password again"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>

            <button type="submit" disabled={loading} className="btn-primary w-full mt-2 flex items-center justify-center gap-2 py-3">
              {loading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <><UserPlus size={18} /> Create Demo Account</>
              )}
            </button>
          </form>

          <div className="mt-8 mb-6 flex items-center">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="px-4 text-sm text-slate-500 uppercase tracking-wider whitespace-nowrap">Or sign up with</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>
          
          <div className="flex justify-center -mt-2">
            <GoogleLogin
              onSuccess={async (credentialResponse) => {
                if (credentialResponse.credential) {
                  setLoading(true);
                  setError('');
                  try {
                    await loginWithGoogle(credentialResponse.credential);
                    navigate('/dashboard', { replace: true });
                  } catch (err: any) {
                    const msg = err?.response?.data?.error || err?.message || 'Google signup failed';
                    setError(msg);
                  } finally {
                    setLoading(false);
                  }
                }
              }}
              onError={() => setError('Google Signup Failed')}
              useOneTap
              theme="outline"
              shape="rectangular"
              text="signup_with"
            />
          </div>

          <p className="text-sm text-slate-500 text-center mt-6">
            Already have an account? <Link to="/login" className="text-blue-600 hover:text-slate-900">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
