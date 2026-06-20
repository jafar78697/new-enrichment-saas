import { useState } from 'react';
import Dashboard from './pages/Dashboard';
import CallHistory from './pages/CallHistory';
import AgentConfig from './pages/AgentConfig';
import Analytics from './pages/Analytics';

type Tab = 'dashboard' | 'history' | 'agents' | 'knowledge' | 'workflows' | 'analytics' | 'billing';

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'history', label: 'Call Logs' },
    { key: 'agents', label: 'AI Agents' },
    { key: 'knowledge', label: 'Knowledge Base (RAG)' },
    { key: 'workflows', label: 'Workflows & Tools' },
    { key: 'analytics', label: 'Analytics' },
    { key: 'billing', label: 'Billing & Usage' },
  ];

  return (
    <div className="app">
      <div className="hero">
        <h1>Jento AI Voice Platform</h1>
        <p>Enterprise autonomous AI agents for outbound & inbound calling</p>
      </div>

      <div className="tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'history' && <CallHistory />}
        {tab === 'agents' && <AgentConfig />}
        {tab === 'analytics' && <Analytics />}
        {tab === 'knowledge' && (
          <div className="card">
            <h3>Knowledge Base (Coming Soon)</h3>
            <p className="text-muted">Upload PDFs and FAQs to train your agent dynamically via Retrieval-Augmented Generation (RAG).</p>
          </div>
        )}
        {tab === 'workflows' && (
          <div className="card">
            <h3>Workflows & Tools (Coming Soon)</h3>
            <p className="text-muted">Connect your agent to Google Calendar, HubSpot, or custom APIs to perform real-world actions during calls.</p>
          </div>
        )}
        {tab === 'billing' && (
          <div className="card">
            <h3>Billing & Usage (Coming Soon)</h3>
            <p className="text-muted">Track cost per call across Twilio, STT, LLM, and ElevenLabs.</p>
          </div>
        )}
      </div>
    </div>
  );
}
