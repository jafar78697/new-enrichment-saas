import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await authApi.login(email, password);
      login(res.data.token);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F6F7F2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Manrope, sans-serif' }}>
      <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 16, padding: '40px 36px', width: '100%', maxWidth: 420, boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>
        
        {/* Logo */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 32, height: 32, background: '#0F766E', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>E</span>
            </div>
            <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 15, color: '#14202B' }}>Enrichment SaaS</span>
          </div>
          <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 24, fontWeight: 700, color: '#14202B', margin: '0 0 6px' }}>Sign in to your account</h1>
          <p style={{ color: '#52606D', fontSize: 14, margin: 0 }}>Track jobs, enrich domains, and export verified company data.</p>
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #DC2626', borderRadius: 8, padding: '10px 14px', marginBottom: 20, color: '#DC2626', fontSize: 13 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#14202B', marginBottom: 6 }}>Email address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="you@company.com"
              style={{ width: '100%', border: '1px solid #D8E1D7', borderRadius: 8, padding: '10px 12px', fontSize: 14, color: '#14202B', outline: 'none', boxSizing: 'border-box', background: '#fff' }}
              onFocus={e => e.target.style.borderColor = '#0F766E'}
              onBlur={e => e.target.style.borderColor = '#D8E1D7'}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#14202B', marginBottom: 6 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={{ width: '100%', border: '1px solid #D8E1D7', borderRadius: 8, padding: '10px 12px', fontSize: 14, color: '#14202B', outline: 'none', boxSizing: 'border-box', background: '#fff' }}
              onFocus={e => e.target.style.borderColor = '#0F766E'}
              onBlur={e => e.target.style.borderColor = '#D8E1D7'}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', background: loading ? '#6B9E9A' : '#0F766E', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', transition: 'background 0.15s' }}
            onMouseEnter={e => { if (!loading) (e.target as HTMLButtonElement).style.background = '#115E59'; }}
            onMouseLeave={e => { if (!loading) (e.target as HTMLButtonElement).style.background = '#0F766E'; }}
          >
            {loading ? 'Signing in...' : 'Sign in →'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 13, color: '#7B8794', marginTop: 20 }}>
          No account?{' '}
          <Link to="/signup" style={{ color: '#0F766E', textDecoration: 'none', fontWeight: 600 }}>
            Create one free
          </Link>
        </p>
      </div>
    </div>
  );
}
