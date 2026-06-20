import { useEffect, useState } from 'react';
import { voiceApi } from '../lib/api';

interface AnalyticsData {
  callsToday: number;
  aiMinutes: number;
  avgDuration: number;
  appointmentsBooked: number;
  sentimentDistribution: { positive: number; neutral: number; negative: number };
  costPerCall: number;
  tokenUsage: number;
  revenue: number;
}

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    voiceApi.getAnalytics().then(setData).catch(console.error);
  }, []);

  if (!data) return <div className="loading">Loading analytics...</div>;

  return (
    <div>
      <div className="grid">
        <div className="card">
          <h3>Total Revenue</h3>
          <div className="value success">${data.revenue.toFixed(2)}</div>
        </div>
        <div className="card">
          <h3>Token Usage</h3>
          <div className="value primary">{data.tokenUsage.toLocaleString()}</div>
        </div>
        <div className="card">
          <h3>Cost Efficiency</h3>
          <div className="value">${data.costPerCall.toFixed(2)}/call</div>
        </div>
        <div className="card">
          <h3>Appointment Rate</h3>
          <div className="value success">
            {data.callsToday > 0
              ? ((data.appointmentsBooked / data.callsToday) * 100).toFixed(1)
              : 0}%
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Sentiment Breakdown</h3>
        <div style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 8 }}>
            <span style={{ display: 'inline-block', width: 80 }}>Positive</span>
            <div style={{ display: 'inline-block', width: 'calc(100% - 100px)', height: 20, background: 'var(--color-border)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ width: `${data.sentimentDistribution.positive / (data.callsToday || 1) * 100}%`, height: '100%', background: 'var(--color-success)', borderRadius: 10 }} />
            </div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <span style={{ display: 'inline-block', width: 80 }}>Neutral</span>
            <div style={{ display: 'inline-block', width: 'calc(100% - 100px)', height: 20, background: 'var(--color-border)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ width: `${data.sentimentDistribution.neutral / (data.callsToday || 1) * 100}%`, height: '100%', background: 'var(--color-warning)', borderRadius: 10 }} />
            </div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <span style={{ display: 'inline-block', width: 80 }}>Negative</span>
            <div style={{ display: 'inline-block', width: 'calc(100% - 100px)', height: 20, background: 'var(--color-border)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ width: `${data.sentimentDistribution.negative / (data.callsToday || 1) * 100}%`, height: '100%', background: 'var(--color-danger)', borderRadius: 10 }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
