import { useEffect, useState } from 'react';
import { employeesApi } from '../services/employeesApi';
import { useNavigate } from 'react-router-dom';

export default function TeamWorkPage() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<any[]>([]);
  const [hours, setHours] = useState(1);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const refresh = async () => {
    try {
      const resp = await employeesApi.getSummary(hours);
      setEmployees(resp.employees);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [hours]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(refresh, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [autoRefresh, hours]);

  const totalActive = employees.filter(e => e.status === 'active').length;
  const totalCalls = employees.reduce((sum, e) => sum + e.calls_in_period, 0);
  const totalTalkTime = employees.reduce((sum, e) => sum + e.talk_time_in_period, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#14202B' }}>
            Team Work Dashboard
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#52606D' }}>
            Real-time team activity monitoring
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: '#52606D' }}>
            <input 
              type="checkbox" 
              checked={autoRefresh} 
              onChange={e => setAutoRefresh(e.target.checked)}
              style={{ marginRight: 4 }}
            />
            Auto-refresh
          </label>
          {[1, 6, 24].map(h => (
            <button
              key={h}
              onClick={() => setHours(h)}
              style={{
                padding: '6px 12px', fontSize: 12, borderRadius: 6, border: 'none',
                background: hours === h ? '#0F766E' : '#F3F4F6',
                color: hours === h ? '#fff' : '#52606D',
                cursor: 'pointer', fontWeight: 600
              }}
            >
              Last {h}H
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 11, color: '#7B8794', fontWeight: 600 }}>Active Members</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#166534' }}>{totalActive}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 11, color: '#7B8794', fontWeight: 600 }}>Total Calls</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#1E40AF' }}>{totalCalls}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 11, color: '#7B8794', fontWeight: 600 }}>Talk Time</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#7C3AED' }}>{Math.floor(totalTalkTime / 60)}m</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 11, color: '#7B8794', fontWeight: 600 }}>Avg per Person</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#B45309' }}>
            {totalActive > 0 ? (totalCalls / totalActive).toFixed(1) : 0}
          </div>
        </div>
      </div>

      {/* Employee Cards */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#7B8794' }}>Loading team data...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {employees.map(emp => (
            <div key={emp.id} style={{
              background: '#fff', border: '1px solid #D8E1D7', borderRadius: 10, padding: 16,
              opacity: emp.status === 'suspended' ? 0.5 : 1
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#14202B' }}>{emp.name}</h3>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#7B8794' }}>{emp.email}</p>
                </div>
                <span style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 12, fontWeight: 700,
                  background: emp.status === 'active' ? '#F0FDF4' : '#FEF2F2',
                  color: emp.status === 'active' ? '#166534' : '#B91C1C'
                }}>
                  {emp.status}
                </span>
              </div>

              {emp.twilio_phone_number && (
                <div style={{ fontSize: 11, color: '#52606D', marginBottom: 12, fontFamily: 'monospace' }}>
                  {emp.twilio_phone_number}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                <div style={{ padding: 8, background: '#F0FDF4', borderRadius: 6 }}>
                  <div style={{ fontSize: 10, color: '#166534' }}>Calls</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#166534' }}>{emp.calls_in_period}</div>
                </div>
                <div style={{ padding: 8, background: '#EFF6FF', borderRadius: 6 }}>
                  <div style={{ fontSize: 10, color: '#1E40AF' }}>Talk Time</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#1E40AF' }}>
                    {Math.floor(emp.talk_time_in_period / 60)}m
                  </div>
                </div>
              </div>

              {emp.last_call_at && (
                <div style={{ fontSize: 11, color: '#7B8794', marginBottom: 8 }}>
                  Last call: {new Date(emp.last_call_at).toLocaleString()}
                </div>
              )}

              {emp.last_login_at && (
                <div style={{ fontSize: 11, color: '#7B8794', marginBottom: 12 }}>
                  Last login: {new Date(emp.last_login_at).toLocaleDateString()}
                </div>
              )}

              <div style={{ display: 'flex', gap: 6 }}>
                <button 
                  onClick={() => navigate(`/calls?agentId=${emp.id}`)}
                  style={{ flex: 1, padding: '6px 12px', fontSize: 11, borderRadius: 6, border: 'none', background: '#0F766E', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                >
                  View Calls
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
