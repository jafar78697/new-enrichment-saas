import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const INTEGRATIONS = [
  { id: 'meta', icon: '💬', title: 'Meta (Facebook & Instagram)', desc: 'Connect to receive DMs and manage conversations directly in Jento.', for: 'Marketing & Sales' },
  { id: 'webhooks', icon: '🔔', title: 'Webhooks', desc: 'Get notified when jobs complete or items are enriched.', for: 'Automation users' },
  { id: 'n8n', icon: '⚡', title: 'n8n', desc: 'Use HTTP Request node to create jobs and poll results.', for: 'No-code automation' },
  { id: 'sheets', icon: '📊', title: 'Google Sheets', desc: 'Send selected rows to enrichment and write results back.', for: 'Sales teams' },
  { id: 'sdk', icon: '📦', title: 'Node.js SDK', desc: 'createJob(), waitForCompletion(), fetchResults() and more.', for: 'Developers' },
  { id: 'api', icon: '🔌', title: 'REST API', desc: 'Full OpenAPI documentation for all endpoints.', for: 'Developers' },
];

export default function IntegrationsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [statusMsg, setStatusMsg] = useState<{type: 'success'|'error', text: string} | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const metaStatus = params.get('meta');
    if (metaStatus === 'success') {
      setStatusMsg({ type: 'success', text: 'Successfully connected Meta account!' });
    } else if (metaStatus === 'error') {
      setStatusMsg({ type: 'error', text: 'Failed to connect Meta account. Please try again.' });
    }
    
    // Clean up URL after grabbing the status
    if (metaStatus) {
      navigate(location.pathname, { replace: true });
    }
  }, [location, navigate]);

  const handleSetup = (id: string) => {
    if (id === 'meta') {
      const t = localStorage.getItem('enr_token') || localStorage.getItem('call_token');
      window.location.href = `${import.meta.env.VITE_API_URL}/api/meta/auth?token=${t}`;
    } else {
      toast.error(`Setup for ${id} coming soon!`);
    }
  };

  return (
    <div className="space-y-5 max-w-2xl relative">
      {statusMsg && (
        <div className={`p-4 rounded-lg border ${statusMsg.type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'} mb-6`}>
          {statusMsg.text}
        </div>
      )}

      <h1 className="font-heading text-2xl font-bold text-text-primary">Integrations</h1>
      <div className="grid grid-cols-1 gap-3">
        {INTEGRATIONS.map(item => (
          <div key={item.id} className="bg-surface border border-border-soft rounded-xl p-5 flex items-center justify-between hover:border-brand-primary transition-colors">
            <div className="flex items-center gap-4">
              <span className="text-2xl">{item.icon}</span>
              <div>
                <p className="font-heading font-semibold text-text-primary">{item.title}</p>
                <p className="text-sm text-text-secondary">{item.desc}</p>
                <p className="text-xs text-text-muted mt-0.5">For: {item.for}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-1.5 text-xs border border-border-soft rounded-lg text-text-secondary hover:border-brand-primary">Docs</button>
              <button 
                onClick={() => handleSetup(item.id)}
                className="px-3 py-1.5 text-xs bg-brand-primary text-white rounded-lg hover:bg-brand-hover"
              >
                {item.id === 'meta' ? 'Connect' : 'Setup'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
