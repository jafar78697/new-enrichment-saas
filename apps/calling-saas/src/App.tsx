import React from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { Phone, Users, Settings, Activity, Shield, LogOut, ShoppingCart, ClipboardPaste, CreditCard, Sparkles } from 'lucide-react';
import PhoneNumbers from './pages/PhoneNumbers';
import Enrichment from './pages/Enrichment';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ChangePassword from './pages/ChangePassword';
import Billing from './pages/Billing';
import DashboardHome from './pages/DashboardHome';
import Leads from './pages/Leads';
import PublicPricing from './pages/PublicPricing';
import AdminDashboard from './pages/admin/AdminDashboard';
import CustomerList from './pages/admin/CustomerList';
import CreateCustomer from './pages/admin/CreateCustomer';
import AdminPhoneNumbers from './pages/admin/AdminPhoneNumbers';
import FloatingDialerWrapper from './components/FloatingDialerWrapper';
import TeamAccess from './pages/TeamAccess';
import { NotificationProvider } from './components/Notifications';
import { AuthProvider, useAuth } from './context/AuthContext';

function Sidebar() {
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
    { path: '/dashboard', label: 'Dashboard', icon: <Activity size={20} /> },
    { path: '/enrichment', label: 'Lead Enrichment', icon: <Users size={20} /> },
    { path: '/leads', label: 'Lead List', icon: <ClipboardPaste size={20} /> },
    { path: '/numbers', label: 'Phone Numbers', icon: <Phone size={20} /> },
    { path: '/billing', label: user?.plan === 'demo' ? 'Upgrade Account' : 'Billing', icon: <CreditCard size={20} /> },
    ...(user?.role === 'tenant_owner' ? [{ path: '/settings', label: 'Settings', icon: <Settings size={20} /> }] : []),
  ];

  const adminItems = [
    { path: '/admin', label: 'Admin', icon: <Shield size={20} /> },
    { path: '/admin/numbers', label: 'Purchase Numbers', icon: <ShoppingCart size={20} /> },
    { path: '/admin/customers', label: 'Customers', icon: <Users size={20} /> },
  ];

  const isActive = (path: string) => {
    if (path === '/admin') return location.pathname === '/admin';
    return location.pathname === path;
  };

  const isAdminActive = (path: string) => {
    if (path === '/admin') return location.pathname === '/admin';
    return location.pathname.startsWith(path);
  };

  return (
    <div className="w-64 h-screen border-r border-border/50 bg-surface/30 backdrop-blur-xl flex flex-col p-4 fixed left-0 top-0">
      <div className="flex items-center gap-3 px-2 mb-8 mt-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-primary to-secondary flex items-center justify-center">
          <Activity size={18} className="text-white" />
        </div>
        <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
          JentoAI
        </span>
      </div>
      
      <nav className="flex-1 flex flex-col gap-1">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
              isActive(item.path)
                ? 'bg-primary/10 text-primary border border-primary/20 shadow-[inset_0_0_10px_rgba(99,102,241,0.1)]' 
                : 'text-textMuted hover:text-text hover:bg-surface/50'
            }`}
          >
            {item.icon}
            <span className="font-medium text-sm">{item.label}</span>
          </Link>
        ))}

        {/* Admin section */}
        {isAdmin && (
          <>
            <div className="mt-4 mb-2 px-3 text-xs font-semibold text-textMuted uppercase tracking-wider">Admin</div>
            {adminItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                  isAdminActive(item.path)
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'text-textMuted hover:text-text hover:bg-surface/50'
                }`}
              >
                {item.icon}
                <span className="font-medium text-sm">{item.label}</span>
              </Link>
            ))}
          </>
        )}
      </nav>

      {/* User info + Logout */}
      <div className="space-y-3">
        {user?.plan === 'demo' && (
          <Link
            to="/billing"
            className="block rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 hover:bg-amber-500/15 transition-colors"
          >
            <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
              <Sparkles size={16} /> Upgrade your account
            </div>
            <div className="text-xs text-textMuted mt-1.5 leading-5">Unlock monthly calling and more lead searches.</div>
          </Link>
        )}
        <div className="p-3 rounded-xl bg-gradient-to-br from-surface to-background border border-border/50">
          <div className="text-xs text-textMuted mb-1">Signed in as</div>
          <div className="text-sm font-medium text-text truncate">{user?.display_name || user?.username}</div>
          <div className="text-xs text-textMuted capitalize mb-2">{roleLabel}</div>
          
          {wallets?.maps_credits?.available > 0 && (
            <div className="mt-2 pt-2 border-t border-border/50 flex justify-between items-center text-xs">
              <span className="text-textMuted">Maps Credits</span>
              <span className="font-bold text-emerald-400">{wallets.maps_credits.available.toLocaleString()}</span>
            </div>
          )}
          
          {profile?.subscription?.end_date && (
            <div className="mt-2 pt-2 border-t border-border/50 flex justify-between items-center text-xs">
              <span className="text-textMuted">Subscription</span>
              <span className="font-bold text-amber-400">
                {Math.max(0, Math.ceil((new Date(profile.subscription.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} days left
              </span>
            </div>
          )}
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-textMuted hover:text-red-400 hover:bg-red-500/10 transition-all text-sm"
        >
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}

function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background text-text flex">
      <Sidebar />
      <main className="flex-1 ml-64 p-8 relative">
        <div className="absolute top-0 left-0 w-full h-96 bg-primary/5 blur-[120px] -z-10 pointer-events-none rounded-full"></div>
        {user?.plan === 'demo' && (
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <div>
              <div className="font-semibold text-amber-200">You are using the free demo</div>
              <div className="text-sm text-textMuted mt-0.5">Includes 3 calls and 2 Google Maps keyword searches.</div>
            </div>
            <Link to="/billing" className="btn-primary inline-flex items-center justify-center gap-2 shrink-0">
              <CreditCard size={17} /> Upgrade Your Account
            </Link>
          </div>
        )}
        {children}
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

function HomeRoute() {
  const { isAuthenticated, isAdmin, loading, user } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return <LandingPage />;
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

      {/* Protected customer routes */}
      <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout><DashboardHome /></DashboardLayout></ProtectedRoute>} />
      <Route path="/enrichment" element={<ProtectedRoute><DashboardLayout><Enrichment /></DashboardLayout></ProtectedRoute>} />
      <Route path="/leads" element={<ProtectedRoute><DashboardLayout><Leads /></DashboardLayout></ProtectedRoute>} />
      <Route path="/numbers" element={<ProtectedRoute><DashboardLayout><PhoneNumbers /></DashboardLayout></ProtectedRoute>} />
      <Route path="/billing" element={<ProtectedRoute><DashboardLayout><Billing /></DashboardLayout></ProtectedRoute>} />
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
