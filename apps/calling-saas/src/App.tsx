import React from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { Phone, Users, Settings, Activity, Shield, LogOut, ShoppingCart, ClipboardPaste, CreditCard, PhoneCall, ChevronDown, X, Menu, ArrowRight } from 'lucide-react';
import './pages/frontend-preview.css';
import PhoneNumbers from './pages/PhoneNumbers';
import Enrichment from './pages/Enrichment';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ChangePassword from './pages/ChangePassword';
import Billing from './pages/Billing';
import DashboardHome from './pages/DashboardHome';
import Leads from './pages/Leads';
import PublicPricing from './pages/PublicPricing';
import DocsLayout from './pages/Docs/DocsLayout';
import Overview from './pages/Docs/Overview';
import GettingStarted from './pages/Docs/GettingStarted';
import Architecture from './pages/Docs/Architecture';
import AdminDashboard from './pages/admin/AdminDashboard';
import CustomerList from './pages/admin/CustomerList';
import CreateCustomer from './pages/admin/CreateCustomer';
import AdminPhoneNumbers from './pages/admin/AdminPhoneNumbers';
import Terms from './pages/Terms';
import PrivacyPolicy from './pages/PrivacyPolicy';
import RefundPolicy from './pages/RefundPolicy';
import FloatingDialerWrapper from './components/FloatingDialerWrapper';
import TeamAccess from './pages/TeamAccess';
import CallHistory from './pages/CallHistory';
import EmployeeWork from './pages/EmployeeWork';
import FrontendPreview from './pages/FrontendPreview';
import FrontendLandingPreview from './pages/FrontendLandingPreview';
import { NotificationProvider } from './components/Notifications';
import { AuthProvider, useAuth } from './context/AuthContext';

function Sidebar({ mobileOpen, setMobileOpen }: { mobileOpen: boolean, setMobileOpen: (v: boolean) => void }) {
  const location = useLocation();
  const { user, isAdmin, logout } = useAuth();
  const [profile, setProfile] = React.useState<any>(null);
  const [wallets, setWallets] = React.useState<any>(null);
  const roleLabel = user?.role === 'tenant_owner'
    ? 'Customer Admin'
    : user?.role === 'agent'
      ? 'Employee'
      : user?.role?.replace('_', ' ');

  React.useEffect(() => {
    async function loadData() {
      if (!user) return;
      try {
        const token = localStorage.getItem('token');
        const [profileRes, walletRes] = await Promise.all([
          fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/v1/me`, { headers: { Authorization: `Bearer ${token}` } }).then(res => res.json()),
          fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/v1/wallets`, { headers: { Authorization: `Bearer ${token}` } }).then(res => res.json())
        ]);
        setProfile(profileRes);
        setWallets(walletRes.balances);
      } catch (err) {}
    }
    loadData();
  }, [user]);

  
  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: <Activity size={18} /> },
    ...(user?.role !== 'agent' || user.can_scrape ? [{ path: '/enrichment', label: 'Lead Enrichment', icon: <Users size={18} /> }] : []),
    ...(user?.role !== 'agent' || user.can_call ? [{ path: '/leads', label: 'Lead List', icon: <ClipboardPaste size={18} /> }] : []),
    ...(user?.role !== 'agent' || user.can_call ? [{ path: '/numbers', label: 'Phone Numbers', icon: <Phone size={18} /> }] : []),
    ...(user?.role === 'tenant_owner' || user?.role === 'platform_admin' || (user?.role === 'agent' && user.can_call) ? [{ path: '/calls', label: 'Call History', icon: <Activity size={18} /> }] : []),
    ...(user?.role !== 'agent' ? [{ path: '/billing', label: user?.plan === 'demo' ? 'Upgrade Account' : 'Billing', icon: <CreditCard size={18} /> }] : []),
    ...(user?.role === 'tenant_owner' ? [{ path: '/settings', label: 'Settings', icon: <Settings size={18} /> }] : []),
  ];

  const adminItems = [
    { path: '/admin', label: 'Admin', icon: <Shield size={18} /> },
    { path: '/admin/numbers', label: 'Purchase Numbers', icon: <ShoppingCart size={18} /> },
    { path: '/admin/customers', label: 'Customers', icon: <Users size={18} /> },
  ];

  const isActive = (path: string) => {
    if (path === '/admin') return location.pathname === '/admin';
    return location.pathname === path;
  };

  const isAdminActive = (path: string) => {
    if (path === '/admin') return location.pathname === '/admin';
    return location.pathname.startsWith(path);
  };

  const initials = (user?.display_name || user?.username || 'U').substring(0, 2).toUpperCase();
  const orgName = profile?.tenant?.name || 'My Workspace';

  return (
    <aside className={`preview-sidebar ${mobileOpen ? 'is-open' : ''}`}>
      <div className="preview-brand">
        <div className="preview-logo"><PhoneCall size={18} /></div>
        <span>Jento<small>Voice Calling</small></span>
        <button className="preview-close" aria-label="Close menu" onClick={() => setMobileOpen(false)}><X size={18} /></button>
      </div>
      
      <div className="preview-workspace">
        <div className="workspace-mark">{initials}</div>
        <div>
          <strong>{orgName}</strong>
          <small>{roleLabel}</small>
        </div>
        <ChevronDown size={15} />
      </div>

      <nav className="preview-nav" aria-label="Preview navigation">
        <small className="nav-label">Workspace</small>
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            onClick={() => setMobileOpen(false)}
            className={isActive(item.path) ? 'active' : ''}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.path === '/leads' && wallets?.maps_credits?.available > 0 && <b>{wallets.maps_credits.available}</b>}
          </Link>
        ))}

        {isAdmin && (
          <>
            <small className="nav-label nav-spacer">Admin</small>
            {adminItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={isAdminActive(item.path) ? 'active' : ''}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ))}
          </>
        )}
      </nav>

      {user?.plan === 'demo' && (
        <div className="preview-upgrade">
          <span className="plan-label">Your workspace plan</span>
          <strong>Demo Active</strong>
          <p>Unlock monthly calling and more lead searches.</p>
          <Link to="/billing" onClick={() => setMobileOpen(false)}>Upgrade Account <ArrowRight size={15} /></Link>
        </div>
      )}

      <div className="preview-profile">
        <div className="avatar">{initials}</div>
        <div>
          <strong>{user?.display_name || user?.username}</strong>
          <small>
            {profile?.subscription?.end_date
              ? `${Math.max(0, Math.ceil((new Date(profile.subscription.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} days left`
              : roleLabel}
          </small>
        </div>
        <button onClick={logout} className="ml-auto text-slate-400 hover:text-red-500 transition-colors">
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}

function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const location = useLocation();
  const path = location.pathname.split('/')[1] || 'dashboard';
  const pageName = path.charAt(0).toUpperCase() + path.slice(1);
  const { user } = useAuth();
  const initials = (user?.display_name || user?.username || 'U').substring(0, 2).toUpperCase();

  return (
    <div className="preview-app">
      {mobileOpen && <button className="preview-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <main className="preview-main">
        <header className="preview-topbar">
          <button className="preview-menu" aria-label="Open menu" onClick={() => setMobileOpen(true)}><Menu size={21} /></button>
          <div className="crumb">Workspace <span>/</span> <strong>{pageName}</strong></div>
          <div className="top-actions">
            <div className="top-avatar">{initials}</div>
          </div>
        </header>
        <div className="preview-content">
          {children}
        </div>
      </main>
      <FloatingDialerWrapper />
    </div>
  );
}

function routePath(location: ReturnType<typeof useLocation>) {
  return `${location.pathname}${location.search}${location.hash}`;
}

function loginPathFor(location: ReturnType<typeof useLocation>) {
  return `/login?redirect=${encodeURIComponent(routePath(location))}`;
}

function changePasswordPathFor(location: ReturnType<typeof useLocation>) {
  return `/change-password?redirect=${encodeURIComponent(routePath(location))}`;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={loginPathFor(location)} replace state={{ from: location }} />;
  }

  // Force password change
  if (user?.must_change_password) {
    return <Navigate to={changePasswordPathFor(location)} replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function CustomerAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user?.role !== 'tenant_owner') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function EmployeePermissionRoute({ children, permission }: { children: React.ReactNode; permission: 'can_call' | 'can_scrape' }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user?.role === 'agent' && user[permission] === false) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function CustomerOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user?.role === 'agent') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function RecordingAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user?.role !== 'tenant_owner' && user?.role !== 'platform_admin') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function CallingAccessRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user?.role === 'agent' && user.can_call === false) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function HomeRoute() {
  const { isAuthenticated, isAdmin, loading, user } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return <FrontendLandingPreview />;
  if (user?.must_change_password) return <Navigate to="/change-password" replace />;
  return <Navigate to={isAdmin ? '/admin' : '/dashboard'} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<HomeRoute />} />
      <Route path="/pricing" element={<PublicPricing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/change-password" element={<ChangePassword />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
      <Route path="/refund-policy" element={<RefundPolicy />} />
      {/* Reference-only previews; the real app is routed below. */}
      <Route path="/frontend-preview" element={<FrontendPreview />} />
      <Route path="/frontend-preview/home" element={<FrontendLandingPreview />} />
      {/* Docs routes */}
      <Route path="/docs" element={<DocsLayout />}>
        <Route index element={<Overview />} />
        <Route path="getting-started" element={<GettingStarted />} />
        <Route path="architecture" element={<Architecture />} />
      </Route>

      {/* Protected customer routes */}
      <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout><DashboardHome /></DashboardLayout></ProtectedRoute>} />
      <Route path="/enrichment" element={<ProtectedRoute><EmployeePermissionRoute permission="can_scrape"><DashboardLayout><Enrichment /></DashboardLayout></EmployeePermissionRoute></ProtectedRoute>} />
      <Route path="/leads" element={<ProtectedRoute><EmployeePermissionRoute permission="can_call"><DashboardLayout><Leads /></DashboardLayout></EmployeePermissionRoute></ProtectedRoute>} />
      <Route path="/numbers" element={<ProtectedRoute><EmployeePermissionRoute permission="can_call"><DashboardLayout><PhoneNumbers /></DashboardLayout></EmployeePermissionRoute></ProtectedRoute>} />
      <Route path="/calls" element={<ProtectedRoute><CallingAccessRoute><DashboardLayout><CallHistory /></DashboardLayout></CallingAccessRoute></ProtectedRoute>} />
      <Route path="/employee-work/:agentId" element={<ProtectedRoute><RecordingAdminRoute><DashboardLayout><EmployeeWork /></DashboardLayout></RecordingAdminRoute></ProtectedRoute>} />
      <Route path="/billing" element={<ProtectedRoute><CustomerOnlyRoute><DashboardLayout><Billing /></DashboardLayout></CustomerOnlyRoute></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><CustomerAdminRoute><DashboardLayout><TeamAccess /></DashboardLayout></CustomerAdminRoute></ProtectedRoute>} />

      {/* Admin routes */}
      <Route path="/admin" element={<ProtectedRoute><AdminRoute><DashboardLayout><AdminDashboard /></DashboardLayout></AdminRoute></ProtectedRoute>} />
      <Route path="/admin/numbers" element={<ProtectedRoute><AdminRoute><DashboardLayout><AdminPhoneNumbers /></DashboardLayout></AdminRoute></ProtectedRoute>} />
      <Route path="/admin/customers" element={<ProtectedRoute><AdminRoute><DashboardLayout><CustomerList /></DashboardLayout></AdminRoute></ProtectedRoute>} />
      <Route path="/admin/customers/new" element={<ProtectedRoute><AdminRoute><DashboardLayout><CreateCustomer /></DashboardLayout></AdminRoute></ProtectedRoute>} />
    </Routes>
  );
}

const GOOGLE_CLIENT_ID = '495992053568-2nrvesc7h5o9k0v926vr4udo77jlddd0.apps.googleusercontent.com';

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <BrowserRouter>
        <AuthProvider>
          <NotificationProvider>
            <AppRoutes />
          </NotificationProvider>
        </AuthProvider>
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}

export default App;
