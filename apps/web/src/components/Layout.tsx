import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getCallUser, clearCallSession } from '../services/employeesApi';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/google-maps', label: 'Scraper', icon: '🗺️' },
  { to: '/enrichment', label: 'Enrichment', icon: '🔍' },
  { to: '/leads', label: 'Leads', icon: '👥' },
];

const CALL_CENTER_NAV = [];

const MANAGER_NAV = [];

export default function Layout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const callUser = getCallUser();
  const isManager = callUser?.role === 'manager';

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#F6F7F2', fontFamily: 'Manrope, sans-serif' }}>
      {/* Sidebar */}
      <aside style={{ width: 220, background: '#fff', borderRight: '1px solid #D8E1D7', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        {/* Logo */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #D8E1D7' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, background: '#0F766E', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>E</span>
            </div>
            <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 14, color: '#14202B' }}>Jento Unified Dashboard</span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {(isManager ? NAV : []).map(item => (
            <NavLink
              key={item.to}
              to={item.to}
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
              <span style={{ fontSize: 14 }}>{item.icon}</span>
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
        <header style={{ background: '#fff', borderBottom: '1px solid #D8E1D7', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: 12, color: '#7B8794', fontFamily: 'JetBrains Mono, monospace' }}>enrichment-sys</span>
        </header>

        {/* Content */}
        <main style={{ flex: 1, overflow: 'auto', padding: 28 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
