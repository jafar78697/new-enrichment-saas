import { useEffect, useState } from 'react';
import { voiceApi, connectSocket } from '../lib/api';
import BrowserVoiceTest from '../components/BrowserVoiceTest';

interface Stats {
  callsToday: number;
  aiMinutes: number;
  avgDuration: number;
  appointmentsBooked: number;
  sentimentDistribution: { positive: number; neutral: number; negative: number };
  costPerCall: number;
  tokenUsage: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activeCalls, setActiveCalls] = useState(0);
  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    voiceApi.getAnalytics().then(setStats).catch(console.error);

    const socket = connectSocket();
    socket.on('voice.supervisor.alert', (alert: any) => {
      setAlerts((prev) => [alert, ...prev].slice(0, 10));
    });

    voiceApi.getHealth().then((h) => {
      if (h.enabled) setActiveCalls(0); // Would be real count from API
    }).catch(() => {});

    return () => {
      socket.off('voice.supervisor.alert');
    };
  }, []);

  const [callStatus, setCallStatus] = useState<string>('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [testMode, setTestMode] = useState<'browser' | 'phone'>('browser');

  const handleTestCall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber) return;
    setCallStatus('Calling...');
    try {
      await voiceApi.triggerCall(phoneNumber);
      setCallStatus('Success! Ringing your phone...');
      setTimeout(() => setCallStatus(''), 5000);
    } catch (err: any) {
      setCallStatus('Error: ' + err.message);
    }
  };

  if (!stats) return <div className="loading">Loading dashboard...</div>;

  return (
    <div>
      {/* Test AI Agent Widget */}
      <div className="card" style={{ marginBottom: 24, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', background: '#f1f5f9' }}>
          <button 
            onClick={() => setTestMode('browser')}
            style={{ flex: 1, padding: '16px', border: 'none', background: testMode === 'browser' ? 'white' : 'transparent', fontWeight: testMode === 'browser' ? 600 : 400, color: testMode === 'browser' ? 'var(--color-primary)' : 'var(--color-text)', borderBottom: testMode === 'browser' ? '2px solid var(--color-primary)' : '2px solid transparent', cursor: 'pointer' }}
          >
            Test via Browser (Free)
          </button>
          <button 
            onClick={() => setTestMode('phone')}
            style={{ flex: 1, padding: '16px', border: 'none', background: testMode === 'phone' ? 'white' : 'transparent', fontWeight: testMode === 'phone' ? 600 : 400, color: testMode === 'phone' ? 'var(--color-primary)' : 'var(--color-text)', borderBottom: testMode === 'phone' ? '2px solid var(--color-primary)' : '2px solid transparent', cursor: 'pointer' }}
          >
            Test via Phone Call
          </button>
        </div>
        
        <div style={{ padding: 24 }}>
          {testMode === 'browser' ? (
            <BrowserVoiceTest />
          ) : (
            <div>
              <h3 style={{ color: 'var(--color-primary)', marginTop: 0 }}>Call Phone Number</h3>
              <p style={{ fontSize: '0.9rem', marginBottom: 16 }}>Enter your phone number to receive an automated pitch from the AI Agent via Twilio.</p>
              <form onSubmit={handleTestCall} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <input 
                  type="tel" 
                  placeholder="+1234567890" 
                  value={phoneNumber} 
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--color-border)', flex: 1, maxWidth: 300 }}
                />
                <button type="submit" className="btn btn-primary">Call Me Now</button>
                {callStatus && <span style={{ fontSize: '0.85rem', fontWeight: 500, color: callStatus.startsWith('Error') ? 'red' : 'green' }}>{callStatus}</span>}
              </form>
            </div>
          )}
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <h3>Calls Today</h3>
          <div className="value primary">{stats.callsToday}</div>
        </div>
        <div className="card">
          <h3>AI Minutes</h3>
          <div className="value">{stats.aiMinutes} min</div>
        </div>
        <div className="card">
          <h3>Avg Duration</h3>
          <div className="value">{Math.round(stats.avgDuration)}s</div>
        </div>
        <div className="card">
          <h3>Appointments</h3>
          <div className="value success">{stats.appointmentsBooked}</div>
        </div>
        <div className="card">
          <h3>Cost Per Call</h3>
          <div className="value">${stats.costPerCall.toFixed(2)}</div>
        </div>
        <div className="card">
          <h3>Active Calls</h3>
          <div className="value primary">
            <span className="status-dot live" />
            {activeCalls}
          </div>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <h3>Sentiment Distribution</h3>
          <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
            <div>
              <span className="badge green">Positive</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.sentimentDistribution.positive}</div>
            </div>
            <div>
              <span className="badge yellow">Neutral</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.sentimentDistribution.neutral}</div>
            </div>
            <div>
              <span className="badge red">Negative</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.sentimentDistribution.negative}</div>
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Supervisor Alerts</h3>
          {alerts.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)' }}>No recent alerts</p>
          ) : (
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {alerts.map((a, i) => (
                <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                  <span className={`badge ${a.severity === 'high' ? 'red' : a.severity === 'medium' ? 'yellow' : 'blue'}`}>
                    {a.alertType}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginLeft: 8 }}>
                    {new Date(a.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
