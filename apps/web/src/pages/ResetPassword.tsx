import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import api from '../services/api';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const s = { width:'100%',border:'1px solid #D8E1D7',borderRadius:8,padding:'10px 12px',fontSize:14,color:'#14202B',outline:'none',boxSizing:'border-box' as const,background:'#fff' };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true); setError('');
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid or expired link');
    } finally {
      setLoading(false);
    }
  };

  if (!token) return (
    <div style={{minHeight:'100vh',background:'#F6F7F2',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center'}}>
        <p style={{color:'#DC2626'}}>Invalid reset link.</p>
        <Link to="/forgot-password" style={{color:'#0F766E'}}>Request a new one</Link>
      </div>
    </div>
  );

  if (done) return (
    <div style={{minHeight:'100vh',background:'#F6F7F2',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Manrope, sans-serif'}}>
      <div style={{background:'#fff',border:'1px solid #D8E1D7',borderRadius:16,padding:'40px 36px',width:'100%',maxWidth:420,textAlign:'center'}}>
        <div style={{fontSize:48,marginBottom:16}}>✅</div>
        <h2 style={{fontFamily:'Space Grotesk, sans-serif',fontSize:20,fontWeight:700,color:'#14202B'}}>Password updated!</h2>
        <p style={{color:'#52606D',fontSize:14}}>Redirecting to login...</p>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:'100vh',background:'#F6F7F2',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Manrope, sans-serif'}}>
      <div style={{background:'#fff',border:'1px solid #D8E1D7',borderRadius:16,padding:'40px 36px',width:'100%',maxWidth:420,boxShadow:'0 1px 8px rgba(0,0,0,0.06)'}}>
        <div style={{marginBottom:28}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
            <div style={{width:32,height:32,background:'#0F766E',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <span style={{color:'#fff',fontSize:16,fontWeight:700}}>E</span>
            </div>
            <span style={{fontFamily:'Space Grotesk, sans-serif',fontWeight:700,fontSize:15,color:'#14202B'}}>Enrichment Sys</span>
          </div>
          <h1 style={{fontFamily:'Space Grotesk, sans-serif',fontSize:24,fontWeight:700,color:'#14202B',margin:'0 0 6px'}}>Set new password</h1>
          <p style={{color:'#52606D',fontSize:14,margin:0}}>Choose a strong password for your account.</p>
        </div>

        {error && <div style={{background:'#FEF2F2',border:'1px solid #DC2626',borderRadius:8,padding:'10px 14px',marginBottom:20,color:'#DC2626',fontSize:13}}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={{marginBottom:16}}>
            <label style={{display:'block',fontSize:13,fontWeight:600,color:'#14202B',marginBottom:6}}>New password</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={6} placeholder="••••••••" style={s}
              onFocus={e=>e.target.style.borderColor='#0F766E'} onBlur={e=>e.target.style.borderColor='#D8E1D7'} />
          </div>
          <div style={{marginBottom:24}}>
            <label style={{display:'block',fontSize:13,fontWeight:600,color:'#14202B',marginBottom:6}}>Confirm password</label>
            <input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} required placeholder="••••••••" style={s}
              onFocus={e=>e.target.style.borderColor='#0F766E'} onBlur={e=>e.target.style.borderColor='#D8E1D7'} />
          </div>
          <button type="submit" disabled={loading} style={{width:'100%',background:'#0F766E',color:'#fff',border:'none',borderRadius:8,padding:'11px 0',fontSize:14,fontWeight:600,cursor:'pointer'}}>
            {loading ? 'Updating...' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
}
