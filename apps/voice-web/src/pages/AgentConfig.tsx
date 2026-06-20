import { useEffect, useState } from 'react';
import { voiceApi } from '../lib/api';

interface VoiceAgent {
  id: number;
  name: string;
  agent_type: string;
  industry: string;
  tone: string;
  is_active: boolean;
  created_at: string;
}

export default function AgentConfig() {
  const [agents, setAgents] = useState<VoiceAgent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    voiceApi.getAgents()
      .then((data) => setAgents(data.agents || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading AI agents...</div>;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: '1.2rem' }}>AI Voice Agents</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          Configure AI agents for different purposes — sales, receptionist, support
        </p>
      </div>

      <div className="grid">
        {agents.length === 0 ? (
          <div className="card">
            <p style={{ color: 'var(--color-text-muted)' }}>
              No AI agents configured yet. Create your first agent to start handling calls.
            </p>
          </div>
        ) : (
          agents.map((agent) => (
            <div className="card" key={agent.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, textTransform: 'none', fontSize: '1.1rem' }}>{agent.name}</h3>
                <span className={`badge ${agent.is_active ? 'green' : 'yellow'}`}>
                  {agent.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div style={{ marginTop: 12, fontSize: '0.85rem' }}>
                <p><strong>Type:</strong> {agent.agent_type}</p>
                <p><strong>Industry:</strong> {agent.industry || 'General'}</p>
                <p><strong>Tone:</strong> {agent.tone}</p>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', marginTop: 8 }}>
                  Created: {new Date(agent.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))
        )}
        <div className="card" style={{ borderStyle: 'dashed', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <p style={{ color: 'var(--color-text-muted)' }}>+ Create New Agent</p>
        </div>
      </div>
    </div>
  );
}
