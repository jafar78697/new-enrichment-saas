import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import LoginPage from './pages/Login';
import SignupPage from './pages/Signup';
import DashboardPage from './pages/Dashboard';
import NewJobPage from './pages/NewJob';
import JobsListPage from './pages/JobsList';
import JobDetailPage from './pages/JobDetail';
import ResultsExplorerPage from './pages/ResultsExplorer';
import BillingPage from './pages/Billing';
import ApiKeysPage from './pages/ApiKeys';
import IntegrationsPage from './pages/Integrations';
import TeamSettingsPage from './pages/TeamSettings';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="jobs/new" element={<NewJobPage />} />
          <Route path="jobs" element={<JobsListPage />} />
          <Route path="jobs/:id" element={<JobDetailPage />} />
          <Route path="results/:jobId" element={<ResultsExplorerPage />} />
          <Route path="billing" element={<BillingPage />} />
          <Route path="api-keys" element={<ApiKeysPage />} />
          <Route path="integrations" element={<IntegrationsPage />} />
          <Route path="settings/team" element={<TeamSettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
