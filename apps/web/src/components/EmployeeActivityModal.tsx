import { useEffect, useState } from 'react';
import { employeesApi, type Employee } from '../services/employeesApi';

interface Props {
  employee: Employee;
  onClose: () => void;
}

export default function EmployeeActivityModal({ employee, onClose }: Props) {
  const [hours, setHours] = useState(24);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    employeesApi.getActivity(employee.id, hours)
      .then(r => setActivity(r.activity))
      .finally(() => setLoading(false));
  }, [employee.id, hours]);

  const totalCalls = activity.reduce((sum, a) => sum + a.total_calls, 0);
  const totalSeconds = activity.reduce((sum, a) => sum + a.total_seconds, 0);
  const totalRecordings = activity.reduce((sum, a) => sum + a.recordings, 0);

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalContent} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 16px', fontSize: 18, color: '#14202B' }}>
          Activity: {employee.name}
        </h2>
        
        {/* Time filter */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {[1, 6, 24, 168].map(h => (
            <button
              key={h}
              onClick={() => setHours(h)}
              style={{
                padding: '4px 12px', fontSize: 11, borderRadius: 6, border: 'none',
                background: hours === h ? '#0F766E' : '#F3F4F6',
                color: hours === h ? '#fff' : '#52606D',
                cursor: 'pointer', fontWeight: 600
              }}
            >
              {h === 1 ? '1H' : h === 6 ? '6H' : h === 24 ? '24H' : '7D'}
            </button>
          ))}
        </div>

        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
          <div style={{ padding: 12, background: '#F0FDF4', borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: '#166534' }}>Total Calls</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#166534' }}>{totalCalls}</div>
          </div>
          <div style={{ padding: 12, background: '#EFF6FF', borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: '#1E40AF' }}>Talk Time</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1E40AF' }}>{Math.floor(totalSeconds / 60)}m</div>
          </div>
          <div style={{ padding: 12, background: '#FEF3C7', borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: '#92400E' }}>Recordings</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#92400E' }}>{totalRecordings}</div>
          </div>
        </div>

        {/* Hourly breakdown table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#7B8794' }}>Loading...</div>
        ) : (
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#FBFBF8' }}>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #EEF2EA' }}>Hour</th>
                <th style={{ textAlign: 'right', padding: 8, borderBottom: '1px solid #EEF2EA' }}>Calls</th>
                <th style={{ textAlign: 'right', padding: 8, borderBottom: '1px solid #EEF2EA' }}>Duration</th>
                <th style={{ textAlign: 'right', padding: 8, borderBottom: '1px solid #EEF2EA' }}>Recordings</th>
              </tr>
            </thead>
            <tbody>
              {activity.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: 20, color: '#7B8794' }}>No activity in this period</td></tr>
              ) : (
                activity.map((row) => (
                  <tr key={row.hour}>
                    <td style={{ padding: 8, borderBottom: '1px solid #EEF2EA' }}>
                      {new Date(row.hour).toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right', padding: 8, borderBottom: '1px solid #EEF2EA' }}>
                      {row.total_calls}
                    </td>
                    <td style={{ textAlign: 'right', padding: 8, borderBottom: '1px solid #EEF2EA' }}>
                      {Math.floor(row.total_seconds / 60)}m {row.total_seconds % 60}s
                    </td>
                    <td style={{ textAlign: 'right', padding: 8, borderBottom: '1px solid #EEF2EA' }}>
                      {row.recordings}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        <button onClick={onClose} style={{ marginTop: 16, padding: '8px 16px', borderRadius: 6, border: 'none', background: '#0F766E', color: '#fff', cursor: 'pointer' }}>
          Close
        </button>
      </div>
    </div>
  );
}

// Modal styles
const modalOverlay: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
};
const modalContent: React.CSSProperties = {
  background: '#fff', borderRadius: 12, padding: 24, maxWidth: 700, width: '90%',
  maxHeight: '80vh', overflow: 'auto'
};
