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
              <tr key={call.id}>
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
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
