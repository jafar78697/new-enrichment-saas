import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import employeesApi from '../services/employeesApi';
import callsApi from '../services/callsApi';
import teamsApi from '../services/teamsApi';

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatLongDuration(seconds: number | null | undefined): string {
  if (!seconds) return '0h 0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function EmployeesPage() {
  const [selectedEmployee, setSelectedEmployee] = useState<number | null>(null);
  const [teamFilter, setTeamFilter] = useState<string>('');

  const { data: employeesData, isLoading: isLoadingEmployees } = useQuery({
    queryKey: ['employees'],
    queryFn: () => employeesApi.list()
  });

  const { data: callsData, isLoading: isLoadingCalls } = useQuery({
    queryKey: ['employee-calls', selectedEmployee],
    queryFn: () => callsApi.listCalls({ agentId: selectedEmployee! }),
    enabled: !!selectedEmployee,
  });

  const { data: teamsData } = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsApi.list()
  });

  const employees = employeesData?.employees || [];
  const teams = teamsData?.teams || [];
  
  const filteredEmployees = teamFilter 
    ? employees.filter((e: any) => e.team_id === Number(teamFilter))
    : employees;

  const selected = employees.find(e => e.id === selectedEmployee);
  
  const recordings = callsData?.calls?.filter(c => c.recording_url) || [];

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 28, fontWeight: 700, color: '#14202B', margin: '0 0 8px' }}>
          👨‍💼 Employees
        </h1>
        <p style={{ color: '#52606D', fontSize: 15, margin: 0 }}>
          Employee performance, assigned niches, and call recordings
        </p>
      </div>

      <div style={{ marginBottom: 24, display: 'flex', gap: 16 }}>
        <select 
          value={teamFilter} 
          onChange={e => setTeamFilter(e.target.value)}
          style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #D8E1D7', fontSize: 14 }}
        >
          <option value="">All Teams</option>
          {teams.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {isLoadingEmployees && (
        <div style={{ padding: 40, textAlign: 'center', color: '#7B8794' }}>Loading employees...</div>
      )}

      {/* Employee Cards */}
      {!isLoadingEmployees && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20, marginBottom: 32 }}>
          {filteredEmployees.map(emp => (
            <div
              key={emp.id}
              onClick={() => setSelectedEmployee(selectedEmployee === emp.id ? null : emp.id)}
              style={{
                background: selectedEmployee === emp.id ? '#EEF2EA' : '#fff',
                border: selectedEmployee === emp.id ? '2px solid #0F766E' : '1px solid #D8E1D7',
                borderRadius: 12,
                padding: 24,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
                <div style={{
                  width: 50,
                  height: 50,
                  background: '#0F766E',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                  flexShrink: 0
                }}>
                  👤
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#14202B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.name}</div>
                  <div style={{ fontSize: 13, color: '#7B8794', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.email}</div>
                  <div style={{ fontSize: 12, color: '#0F766E', fontWeight: 600, marginBottom: 4 }}>
                    {emp.twilio_phone_number ? `📱 ${emp.twilio_phone_number}` : 'No Twilio Number'}
                  </div>
                  {(emp as any).team_name && (
                    <div style={{ fontSize: 11, background: '#F5F3FF', color: '#6D28D9', padding: '2px 8px', borderRadius: 4, display: 'inline-block', fontWeight: 600 }}>
                      👥 {(emp as any).team_name}
                    </div>
                  )}
                </div>
              </div>

              {/* Niches Badge */}
              {emp.assigned_niches && emp.assigned_niches.length > 0 && (
                <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {emp.assigned_niches.map(niche => (
                    <span key={niche.id} style={{
                      background: '#F3F4F6',
                      color: '#4B5563',
                      padding: '4px 10px',
                      borderRadius: 12,
                      fontSize: 11,
                      fontWeight: 600,
                    }}>
                      {niche.name}
                    </span>
                  ))}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* Today's Stats */}
                <div style={{ background: '#F0FDF4', padding: 12, borderRadius: 8, border: '1px solid #BBF7D0' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#166534' }}>{emp.today_leads || 0}</div>
                  <div style={{ fontSize: 12, color: '#15803D', fontWeight: 600 }}>Leads Today</div>
                </div>
                <div style={{ background: '#EFF6FF', padding: 12, borderRadius: 8, border: '1px solid #BFDBFE' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#1E40AF' }}>{emp.today_calls || 0}</div>
                  <div style={{ fontSize: 12, color: '#1D4ED8', fontWeight: 600 }}>Calls Today</div>
                </div>

                {/* Total Stats */}
                <div style={{ background: '#F6F7F2', padding: 12, borderRadius: 8 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#0F766E' }}>{emp.total_calls || 0}</div>
                  <div style={{ fontSize: 12, color: '#7B8794' }}>Total Calls</div>
                </div>
                <div style={{ background: '#F6F7F2', padding: 12, borderRadius: 8 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#6D28D9' }}>{formatLongDuration(emp.total_seconds)}</div>
                  <div style={{ fontSize: 12, color: '#7B8794' }}>Talk Time</div>
                </div>
              </div>

              {/* Call Recordings Prompt */}
              <div style={{ marginTop: 16, textAlign: 'center' }}>
                <button
                  style={{
                    background: 'transparent',
                    border: '1px solid #D8E1D7',
                    color: '#0F766E',
                    padding: '8px 16px',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    width: '100%',
                    transition: 'all 0.2s',
                  }}
                  onMouseOver={e => (e.currentTarget.style.background = '#F6F7F2')}
                  onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {selectedEmployee === emp.id ? 'Hide Call Recordings ▲' : 'View Twilio Call Recordings ▼'}
                </button>
              </div>
            </div>
          ))}
          {filteredEmployees.length === 0 && (
            <div style={{ gridColumn: '1 / -1', padding: 40, textAlign: 'center', color: '#7B8794', background: '#fff', borderRadius: 12, border: '1px solid #D8E1D7' }}>
              No employees found.
            </div>
          )}
        </div>
      )}

      {/* Selected Employee Details */}
      {selected && (
        <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 12, padding: 24 }}>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 20, fontWeight: 700, color: '#14202B', margin: '0 0 20px' }}>
            📞 Call Recordings - {selected.name}
          </h2>

          {isLoadingCalls ? (
             <div style={{ padding: 20, textAlign: 'center', color: '#7B8794' }}>Loading recordings...</div>
          ) : recordings.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#7B8794' }}>No recordings available for this employee.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #D8E1D7' }}>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#7B8794' }}>Date</th>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#7B8794' }}>Lead</th>
                    <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#7B8794' }}>Duration</th>
                    <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#7B8794' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recordings.map(rec => (
                    <tr key={rec.id} style={{ borderBottom: '1px solid #E5E7EB' }}>
                      <td style={{ padding: '16px', color: '#52606D' }}>
                        {rec.started_at ? new Date(rec.started_at).toLocaleString() : 'N/A'}
                      </td>
                      <td style={{ padding: '16px', fontWeight: 600, color: '#14202B' }}>{rec.contact_name || rec.contact_phone_number || 'Unknown'}</td>
                      <td style={{ padding: '16px', textAlign: 'center', fontFamily: 'Space Grotesk, monospace', color: '#0F766E' }}>
                        {formatDuration(rec.duration_seconds)}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'center' }}>
                        <a 
                          href={rec.recording_url!}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            background: '#0F766E',
                            color: '#fff',
                            textDecoration: 'none',
                            display: 'inline-block',
                            padding: '8px 20px',
                            borderRadius: 6,
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          ▶ Play
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
