import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { employeesApi, getCallUser } from '../services/employeesApi';

export default function DashboardPage() {
  const user = getCallUser();
  
  // Fetch real employee summary from API
  const { data: employeeSummary, isLoading: loadingSummary } = useQuery({
    queryKey: ['employee-summary', 24],
    queryFn: () => employeesApi.getSummary(24),
    enabled: user?.role === 'manager' // Only managers can see all stats
  });

  // Fetch real Twilio pool data
  const { data: poolData, isLoading: loadingPool } = useQuery({
    queryKey: ['twilio-pool'],
    queryFn: () => employeesApi.numbersPool(),
    enabled: user?.role === 'manager'
  });

  const employees = employeeSummary?.employees || [];
  const pool = poolData?.numbers || [];

  // Calculate real stats
  const totalEmployees = employees.length;
  const activeEmployees = employees.filter(e => e.status === 'active').length;
  const totalCalls = employees.reduce((sum, e) => sum + e.calls_in_period, 0);
  const totalAssignedNumbers = pool.filter(n => n.assigned).length;

  const isLoading = loadingSummary || loadingPool;

  if (isLoading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#7B8794' }}>Loading dashboard...</div>;
  }

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 28, fontWeight: 700, color: '#14202B', margin: '0 0 8px' }}>
          Dashboard
        </h1>
        <p style={{ color: '#52606D', fontSize: 15, margin: 0 }}>
          Overview of leads and employee performance
        </p>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20, marginBottom: 32 }}>
        <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 13, color: '#7B8794', marginBottom: 8 }}>Total Employees</div>
          <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 36, fontWeight: 700, color: '#0F766E' }}>
            {totalEmployees}
          </div>
        </div>
        
        <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 13, color: '#7B8794', marginBottom: 8 }}>Active Employees</div>
          <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 36, fontWeight: 700, color: '#10B981' }}>
            {activeEmployees}
          </div>
        </div>
        
        <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 13, color: '#7B8794', marginBottom: 8 }}>Total Calls (24h)</div>
          <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 36, fontWeight: 700, color: '#6D28D9' }}>
            {totalCalls}
          </div>
        </div>
        
        <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 13, color: '#7B8794', marginBottom: 8 }}>Twilio Numbers</div>
          <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 36, fontWeight: 700, color: '#F59E0B' }}>
            {totalAssignedNumbers} / {pool.length}
          </div>
          <div style={{ fontSize: 11, color: '#7B8794', marginTop: 4 }}>
            {pool.length - totalAssignedNumbers} unassigned
          </div>
        </div>
      </div>

      {/* Employee Performance */}
      <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 12, padding: 24 }}>
        <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 18, fontWeight: 700, color: '#14202B', margin: '0 0 20px' }}>
          Employee Performance
        </h2>
        
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #D8E1D7' }}>
                <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#7B8794', textTransform: 'uppercase' }}>Employee</th>
                <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#7B8794', textTransform: 'uppercase' }}>Contacted</th>
                <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#7B8794', textTransform: 'uppercase' }}>Calls</th>
                <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#7B8794', textTransform: 'uppercase' }}>Last Active</th>
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#7B8794' }}>
                    No employees found
                  </td>
                </tr>
              ) : (
                employees.map(emp => (
                  <tr key={emp.id} style={{ borderBottom: '1px solid #E5E7EB' }}>
                    <td style={{ padding: '16px' }}>
                      <div style={{ fontWeight: 600, color: '#14202B' }}>{emp.name}</div>
                      <div style={{ fontSize: 12, color: '#7B8794' }}>{emp.email}</div>
                      {emp.twilio_phone_number && (
                        <div style={{ fontSize: 11, color: '#0F766E', marginTop: 4 }}>📞 {emp.twilio_phone_number}</div>
                      )}
                    </td>
                    <td style={{ textAlign: 'center', padding: '16px', fontFamily: 'Space Grotesk, sans-serif', fontSize: 20, fontWeight: 700, color: '#0F766E' }}>
                      {emp.calls_in_period}
                    </td>
                    <td style={{ textAlign: 'center', padding: '16px', fontFamily: 'Space Grotesk, sans-serif', fontSize: 14, fontWeight: 600, color: '#6D28D9' }}>
                      {Math.floor(emp.talk_time_in_period / 3600)}h {Math.floor((emp.talk_time_in_period % 3600) / 60)}m
                    </td>
                    <td style={{ textAlign: 'center', padding: '16px', fontSize: 13, color: '#52606D' }}>
                      {emp.last_call_at ? new Date(emp.last_call_at).toLocaleString() : 'Never'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 24 }}>
        <Link to="/enrichment" style={{ background: '#0F766E', color: '#fff', padding: '16px 20px', borderRadius: 10, textDecoration: 'none', fontWeight: 600, textAlign: 'center' }}>
          🔍 Start Enrichment
        </Link>
        <Link to="/leads" style={{ background: '#fff', border: '2px solid #0F766E', color: '#0F766E', padding: '16px 20px', borderRadius: 10, textDecoration: 'none', fontWeight: 600, textAlign: 'center' }}>
          👥 View Leads
        </Link>
        <Link to="/employees" style={{ background: '#fff', border: '2px solid #6D28D9', color: '#6D28D9', padding: '16px 20px', borderRadius: 10, textDecoration: 'none', fontWeight: 600, textAlign: 'center' }}>
          👨‍💼 Employee Details
        </Link>
      </div>
    </div>
  );
}
