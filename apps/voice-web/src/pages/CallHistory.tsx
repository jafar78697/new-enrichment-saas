import { useEffect, useState } from 'react';
import { voiceApi } from '../lib/api';

interface Call {
  id: number;
  call_sid: string;
  direction: string;
  status: string;
  duration_seconds: number;
  outcome: string;
  sentiment_score?: number;
  to_number: string;
  started_at: string;
}

export default function CallHistory() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    voiceApi.getCalls({ limit: '50' })
      .then((data) => setCalls(data.calls || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading call history...</div>;

  return (
    <div className="card" style={{ padding: 0 }}>
      <table className="table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Direction</th>
            <th>Number</th>
            <th>Duration</th>
            <th>Status</th>
            <th>Outcome</th>
            <th>Sentiment</th>
          </tr>
        </thead>
        <tbody>
          {calls.length === 0 ? (
            <tr>
              <td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
                No calls recorded yet
              </td>
            </tr>
          ) : (
            calls.map((call) => (
              <ExpandableCallRow key={call.id} call={call} />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function ExpandableCallRow({ call }: { call: any }) {
  const [expanded, setExpanded] = useState(false);
  const metadata = call.metadata ? (typeof call.metadata === 'string' ? JSON.parse(call.metadata) : call.metadata) : {};
  const clientDetails = metadata.client_details || {};
  const transcript = call.transcript ? (typeof call.transcript === 'string' ? JSON.parse(call.transcript) : call.transcript) : [];

  return (
    <>
      <tr onClick={() => setExpanded(!expanded)} style={{ cursor: 'pointer', background: expanded ? '#f8fafc' : 'white' }}>
        <td>{new Date(call.started_at).toLocaleString()}</td>
        <td>
          <span className={`badge ${call.direction === 'inbound' ? 'blue' : 'green'}`}>
            {call.direction}
          </span>
        </td>
        <td>{call.to_number}</td>
        <td>{call.duration_seconds}s</td>
        <td>
          <span className={`badge ${call.status === 'completed' ? 'green' : 'yellow'}`}>
            {call.status}
          </span>
        </td>
        <td>{call.outcome || '—'}</td>
        <td>
          {call.sentiment_score != null ? (
            <span className={`badge ${call.sentiment_score > 0.3 ? 'green' : call.sentiment_score < -0.3 ? 'red' : 'yellow'}`}>
              {(call.sentiment_score * 100).toFixed(0)}%
            </span>
          ) : '—'}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} style={{ padding: '24px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              <div>
                <h4 style={{ marginTop: 0, marginBottom: '12px', color: '#334155' }}>AI Summary</h4>
                <div style={{ padding: '12px', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', lineHeight: '1.5' }}>
                  {call.summary || <span style={{ color: '#94a3b8' }}>No summary available yet.</span>}
                </div>

                <h4 style={{ marginTop: '24px', marginBottom: '12px', color: '#334155' }}>Extracted Client Details</h4>
                <div style={{ padding: '12px', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px' }}>
                  {Object.keys(clientDetails).length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: '20px' }}>
                      {Object.entries(clientDetails).map(([key, value]) => (
                        <li key={key} style={{ marginBottom: '8px' }}>
                          <strong style={{ textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}:</strong> {String(value)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span style={{ color: '#94a3b8' }}>No specific details extracted from this call.</span>
                  )}
                </div>
              </div>
              
              <div>
                <h4 style={{ marginTop: 0, marginBottom: '12px', color: '#334155' }}>Call Transcript</h4>
                <div style={{ padding: '12px', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', maxHeight: '400px', overflowY: 'auto' }}>
                  {transcript.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {transcript.map((msg: any, i: number) => (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                          <span style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>{msg.role === 'user' ? 'Client' : 'AI Agent'}</span>
                          <div style={{ background: msg.role === 'user' ? '#eff6ff' : '#f1f5f9', padding: '10px 14px', borderRadius: '12px', maxWidth: '85%' }}>
                            {msg.text}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span style={{ color: '#94a3b8' }}>No transcript available yet.</span>
                  )}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
