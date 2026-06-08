import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { getCallUser } from './services/employeesApi';
import Layout from './components/Layout';
import LandingPage from './pages/Landing';
import SignupPage from './pages/Signup';
import DashboardPage from './pages/Dashboard';
import CallLoginPage from './pages/CallLogin';
import AcceptInvitePage from './pages/AcceptInvite';
import CallLogsPage from './pages/CallLogs';
import CallDetailPage from './pages/CallDetail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
// New pages
import EnrichmentPage from './pages/Enrichment';
import LeadsPage from './pages/Leads';
import AccessManagementPage from './pages/AccessManagement';
import EmployeesPage from './pages/Employees';
import TwilioNumbersPage from './pages/TwilioNumbers';
import GoogleMapScraperPage from './pages/GoogleMapScraper';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  return token ? <>{children}</> : <Navigate to="/call-login" replace />;
}

function ManagerRoute({ children }: { children: React.ReactNode }) {
  const callUser = getCallUser();
  return callUser?.role === 'manager' ? <>{children}</> : <Navigate to="/contacts" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Navigate to="/call-login" replace />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="enrichment" element={<EnrichmentPage />} />
          <Route path="leads" element={<LeadsPage />} />
          <Route path="access" element={<AccessManagementPage />} />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="twilio-numbers" element={<TwilioNumbersPage />} />
          <Route path="calls" element={<CallLogsPage />} />
          <Route path="calls/:id" element={<CallDetailPage />} />
          <Route path="google-maps" element={<GoogleMapScraperPage />} />
        </Route>
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/call-login" element={<CallLoginPage />} />
        <Route path="/accept-invite" element={<AcceptInvitePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
