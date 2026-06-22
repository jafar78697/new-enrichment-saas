import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getCallUser, clearCallSession, callAuthApi } from '../services/employeesApi';
import { Bell, AlertTriangle } from 'lucide-react';
import { callsApi } from '../services/callsApi';
import DialerPopup from './DialerPopup';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg> },
  { to: '/google-maps', label: 'Scraper', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> },
  { to: '/pipeline', label: 'Enrichment Pipeline', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg> },
  { to: '/leads', label: 'Leads', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
  { to: '/outreach', label: 'Outreach', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> },
  { to: '/outreach/reels', label: 'Reel Generation', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg> },

  { to: '/employees', label: 'Employee Reports', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> },
  { to: '/teams', label: 'Teams', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
  { to: '/ai-agent', label: 'AI Agents', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/><path d="M12 6a4 4 0 1 0 4 4 4 4 0 0 0-4-4zm0 6a2 2 0 1 1 2-2 2 2 0 0 1-2 2z"/></svg> },
  { to: '/call-system', label: 'Call Center', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg> },
  { to: '/leaderboard', label: 'Leaderboard', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10"/><path d="M17 4v8a5 5 0 0 1-10 0V4"/><path d="M4 9h3"/><path d="M17 9h3"/></svg> },
  { to: '/access-system', label: 'Access System', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> },
  { to: '/settings', label: 'Settings', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg> },
];

const CALLER_NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg> },
  { to: '/call-system', label: 'Call Center', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg> },
  { to: '/leaderboard', label: 'Leaderboard', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10"/><path d="M17 4v8a5 5 0 0 1-10 0V4"/><path d="M4 9h3"/><path d="M17 9h3"/></svg> },
];

const MARKETER_NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg> },
  { to: '/leads', label: 'All Leads', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
  { to: '/outreach', label: 'Social Outreach', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> },

  { to: '/call-system', label: 'Call Center', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg> },
  { to: '/leaderboard', label: 'Leaderboard', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10"/><path d="M17 4v8a5 5 0 0 1-10 0V4"/><path d="M4 9h3"/><path d="M17 9h3"/></svg> },
];

const CALL_CENTER_NAV: any[] = [];
const MANAGER_NAV: any[] = [];

export default function Layout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [callUser, setCallUser] = useState(() => getCallUser());
  const isManager = callUser?.role === 'manager';
  // Filter navigation items based on user role and assigned modules
  let currentNav = NAV;
  if (callUser) {
    if (callUser.role === 'manager') {
      currentNav = NAV;
    } else {
      const assigned = callUser.assigned_modules || [];
      currentNav = NAV.filter(item => {
        // Manager-only pages
        if (['/employees', '/teams', '/access-system'].includes(item.to)) {
          return false;
        }
        
        // Scraping module
        if (item.to === '/google-maps') {
          return assigned.includes('scraping');
        }
        
        // Reels module
        if (item.to === '/outreach/reels') {
          return assigned.includes('reels');
        }
        
        // Outreach hub (if they have at least one outreach module)
        if (item.to === '/outreach') {
          return assigned.some(m => ['email', 'facebook', 'linkedin', 'reddit', 'youtube'].includes(m));
        }
        
        // Default allowed pages
        return true;
      });
    }
  }

  const [alerts, setAlerts] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [quickDial, setQuickDial] = useState(false);

  useEffect(() => {
    fetchAlerts();
    const intv = setInterval(fetchAlerts, 60000);

    // Refresh user profile info on mount to keep permissions in sync
    const refreshUser = async () => {
      try {
        const data = await callAuthApi.me();
        if (data && data.user) {
          localStorage.setItem('call_user', JSON.stringify(data.user));
          setCallUser(data.user);
        }
      } catch (err) {
        console.error('Failed to refresh user profile:', err);
      }
    };
    refreshUser();

    return () => clearInterval(intv);
  }, []);

  const fetchAlerts = async () => {
    try {
      const data = await callsApi.customRequest('/email-accounts/system-alerts');
      if (data && data.alerts) setAlerts(data.alerts);
    } catch (e) {
      console.error('Failed to fetch alerts', e);
    }
  };

  const resolveAlert = async (id: number) => {
    try {
      await callsApi.customRequest(`/email-accounts/system-alerts/${id}/resolve`, 'PUT');
      setAlerts(prev => prev.filter(a => a.id !== id));
    } catch (e) {
      console.error('Failed to resolve alert', e);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#F6F7F2', fontFamily: 'Manrope, sans-serif' }}>
      {/* Sidebar */}
      <aside style={{ width: 220, background: '#fff', borderRight: '1px solid #D8E1D7', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        {/* Logo */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #D8E1D7' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/favicon.svg" alt="Jento AI" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover' }} />
            <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 14, color: '#14202B' }}>Jento Unified Dashboard</span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {currentNav.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/outreach' || item.to === '/dashboard' || item.to === '/leads'}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', borderRadius: 8,
                fontSize: 13, fontWeight: 500, textDecoration: 'none',
                color: isActive ? '#0F766E' : '#52606D',
                background: isActive ? '#EEF2EA' : 'transparent',
                borderLeft: isActive ? '2px solid #0F766E' : '2px solid transparent',
                transition: 'all 0.1s',
              })}
            >
              <span style={{ fontSize: 14, display: 'flex', alignItems: 'center' }}>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
          {callUser && (
            <>
              {/* Call center label hidden since CALL_CENTER_NAV is empty but keeping the block for structure if needed later, or we can just render the items directly if there were any */}
              {[...CALL_CENTER_NAV, ...(isManager ? MANAGER_NAV : [])].length > 0 && (
                <>
                  <div style={{ margin: '12px 12px 4px', fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#7B8794', textTransform: 'uppercase' }}>
                    Call Center
                  </div>
                  {[...CALL_CENTER_NAV, ...(isManager ? MANAGER_NAV : [])].map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderRadius: 8,
                    fontSize: 13, fontWeight: 500, textDecoration: 'none',
                    color: isActive ? '#6D28D9' : '#52606D',
                    background: isActive ? '#F5F3FF' : 'transparent',
                    borderLeft: isActive ? '2px solid #6D28D9' : '2px solid transparent',
                    transition: 'all 0.1s',
                  })}
                >
                  <span style={{ fontSize: 14 }}>{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
                </>
              )}
            </>
          )}
        </nav>

        {/* Sign out */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #D8E1D7' }}>
          {callUser && (
            <div style={{ fontSize: 11, color: '#52606D', marginBottom: 8 }}>
              Call-center: <b>{callUser.email}</b>
              {callUser.twilio_phone_number && (
                <div style={{ marginTop: 4, color: '#0F766E' }}>
                  Phone: <b style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{callUser.twilio_phone_number}</b>
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => { logout(); clearCallSession(); navigate('/login'); }}
            style={{ background: 'none', border: 'none', fontSize: 13, color: '#7B8794', cursor: 'pointer', padding: 0 }}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top bar */}
        <header style={{ background: '#fff', borderBottom: '1px solid #D8E1D7', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '20px' }}>
          <div style={{ position: 'relative' }}>
            <button 
              onClick={() => setShowDropdown(!showDropdown)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center' }}
            >
              <Bell style={{ width: 20, height: 20, color: '#52606D' }} />
              {alerts.length > 0 && (
                <span style={{ position: 'absolute', top: -5, right: -5, background: '#EF4444', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                  {alerts.length}
                </span>
              )}
            </button>
            {showDropdown && (
              <div style={{ position: 'absolute', top: '100%', right: 0, width: 320, background: '#fff', border: '1px solid #D8E1D7', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, marginTop: 10, maxHeight: 400, overflowY: 'auto' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #D8E1D7', fontWeight: 600, fontSize: 14 }}>System Alerts</div>
                {alerts.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#7B8794', fontSize: 13 }}>No active alerts</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {alerts.map(a => (
                      <div key={a.id} style={{ padding: '12px 16px', borderBottom: '1px solid #F3F4F6', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <AlertTriangle style={{ color: '#EF4444', width: 16, height: 16, marginTop: 2, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: '#1F2937', marginBottom: 4 }}>{a.message}</div>
                          <button onClick={() => resolveAlert(a.id)} style={{ background: 'none', border: 'none', padding: 0, color: '#2563EB', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>Mark as resolved</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <span style={{ fontSize: 12, color: '#7B8794', fontFamily: 'JetBrains Mono, monospace' }}>enrichment-sys</span>
        </header>

        {/* Content */}
        <main style={{ flex: 1, overflow: 'auto', padding: 28 }}>
          <Outlet />
        </main>
      </div>

      {/* Floating Quick Dial Button */}
      {callUser && (
        <>
          <button
            onClick={() => setQuickDial(true)}
            title="Quick Dial"
            style={{
              position: 'fixed',
              bottom: 28,
              right: 28,
              width: 60,
              height: 60,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #0F766E, #115E59)',
              color: '#fff',
              border: 'none',
              fontSize: 28,
              cursor: 'pointer',
              boxShadow: '0 8px 32px rgba(15, 118, 110, 0.4)',
              zIndex: 60,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'transform 0.2s, box-shadow 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.1)';
              e.currentTarget.style.boxShadow = '0 12px 40px rgba(15, 118, 110, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 8px 32px rgba(15, 118, 110, 0.4)';
            }}
          >
            📞
          </button>
          <DialerPopup
            phone=""
            onClose={() => setQuickDial(false)}
            autoStart={false}
            isOpen={quickDial}
          />
        </>
      )}
    </div>
  );
}
