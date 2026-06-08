import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const s = { width:'100%',border:'1px solid #D8E1D7',borderRadius:8,padding:'10px 12px',fontSize:14,color:'#14202B',outline:'none',boxSizing:'border-box' as const,background:'#fff' };

  if (sent) return (
    <div style={{minHeight:'100vh',background:'#F6F7F2',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Manrope, sans-serif'}}>
      <div style={{background:'#fff',border:'1px solid #D8E1D7',borderRadius:16,padding:'40px 36px',width:'100%',maxWidth:420,textAlign:'center'}}>
        <div style={{fontSize:48,marginBottom:16}}>📧</div>
        <h2 style={{fontFamily:'Space Grotesk, sans-serif',fontSize:20,fontWeight:700,color:'#14202B',marginBottom:8}}>Check your email</h2>
        <p style={{color:'#52606D',fontSize:14,marginBottom:24}}>If <strong>{email}</strong> is registered, you'll receive a reset link shortly.</p>
        <Link to="/login" style={{color:'#0F766E',fontSize:14,fontWeight:600}}>← Back to login</Link>
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
          <h1 style={{fontFamily:'Space Grotesk, sans-serif',fontSize:24,fontWeight:700,color:'#14202B',margin:'0 0 6px'}}>Forgot your password?</h1>
          <p style={{color:'#52606D',fontSize:14,margin:0}}>Enter your email and we'll send you a reset link.</p>
        </div>

        {error && <div style={{background:'#FEF2F2',border:'1px solid #DC2626',borderRadius:8,padding:'10px 14px',marginBottom:20,color:'#DC2626',fontSize:13}}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={{marginBottom:20}}>
            <label style={{display:'block',fontSize:13,fontWeight:600,color:'#14202B',marginBottom:6}}>Email address</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="you@company.com" style={s}
              onFocus={e=>e.target.style.borderColor='#0F766E'} onBlur={e=>e.target.style.borderColor='#D8E1D7'} />
          </div>
          <button type="submit" disabled={loading} style={{width:'100%',background:'#0F766E',color:'#fff',border:'none',borderRadius:8,padding:'11px 0',fontSize:14,fontWeight:600,cursor:'pointer'}}>
            {loading ? 'Sending...' : 'Send reset link'}
          </button>
        </form>

        <p style={{textAlign:'center',fontSize:13,color:'#7B8794',marginTop:20}}>
          <Link to="/login" style={{color:'#0F766E',textDecoration:'none',fontWeight:600}}>← Back to login</Link>
        </p>
      </div>
    </div>
  );
}
