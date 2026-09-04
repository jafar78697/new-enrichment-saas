import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
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
import CallSystem from './pages/CallSystem';
import RealEstateLanding from './pages/RealEstateLanding';
import RealEstateDemo from './pages/RealEstateDemo';
import LeadsPage from './pages/Leads';
import OutreachPage from './pages/Outreach';
import EmailOutreach from './pages/EmailOutreach';
import FacebookOutreach from './pages/FacebookOutreach';
import LinkedInOutreach from './pages/LinkedInOutreach';
import RedditOutreach from './pages/RedditOutreach';
import ReelGeneration from './pages/ReelGeneration';
import SocialPosts from './pages/SocialPosts';
import YouTubeDashboard from './pages/YouTubeDashboard';
import YouTubeCallback from './pages/YouTubeCallback';
import AccessSystemPage from './pages/AccessSystem';
import EmployeesPage from './pages/Employees';
import SignalWireNumbers from './pages/SignalWireNumbers';
import GoogleMapScraperPage from './pages/GoogleMapScraper';
import TeamsPage from './pages/Teams';
import LeaderboardPage from './pages/Leaderboard';
import AgentSettings from './pages/AgentSettings';
import DeepgramAgents from './pages/DeepgramAgents';

import PrivacyPage from './pages/Privacy';
import ImageAltTextGeneratorPage from './pages/ImageAltTextGenerator';

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
      <Toaster richColors position="top-right" />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/tools/image-alt-text-generator" element={<ImageAltTextGeneratorPage />} />
        <Route path="/tool/image-alt-text-generator" element={<ImageAltTextGeneratorPage />} />
        <Route path="/real-estate-ai" element={<RealEstateLanding />} />
        <Route path="/real-estate-demo" element={<RealEstateDemo />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/login" element={<Navigate to="/call-login" replace />} />
        <Route path="/signup" element={<Navigate to="/login" replace />} />
        <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="leads" element={<LeadsPage />} />
          <Route path="outreach" element={<OutreachPage />} />
          <Route path="outreach/email" element={<EmailOutreach />} />
          <Route path="outreach/facebook" element={<FacebookOutreach />} />
          <Route path="outreach/linkedin" element={<LinkedInOutreach />} />
          <Route path="outreach/reddit" element={<RedditOutreach />} />
          <Route path="outreach/reels" element={<ReelGeneration />} />
          <Route path="outreach/social-posts" element={<SocialPosts />} />
          <Route path="outreach/youtube-studio" element={<YouTubeDashboard />} />
          <Route path="call-system" element={<CallSystem />} />
          <Route path="access-system" element={<AccessSystemPage />} />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="teams" element={<TeamsPage />} />
          <Route path="leaderboard" element={<LeaderboardPage />} />
          <Route path="numbers" element={<SignalWireNumbers />} />
          <Route path="calls" element={<CallLogsPage />} />
          <Route path="calls/:id" element={<CallDetailPage />} />
          <Route path="google-maps" element={<GoogleMapScraperPage />} />
          <Route path="settings" element={<AgentSettings />} />
          <Route path="pipeline" element={<Navigate to="/ai-agent" replace />} />
          <Route path="ai-agent" element={<DeepgramAgents />} />
        </Route>
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/auth/youtube/callback" element={<PrivateRoute><YouTubeCallback /></PrivateRoute>} />
        <Route path="/call-login" element={<CallLoginPage />} />
        <Route path="/accept-invite" element={<AcceptInvitePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
