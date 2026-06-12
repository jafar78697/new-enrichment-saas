import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { employeesApi, getCallUser } from '../services/employeesApi';
import { useAuth } from '../hooks/useAuth';

export default function DashboardPage() {
  const user = getCallUser();
  const isManager = user?.role === 'manager';
  const { token } = useAuth();
  
  // Fetch Inbox Replies
  const { data: inboxData } = useQuery({
    queryKey: ['unified-inbox'],
    queryFn: async () => {
      const res = await fetch('/v1/outreach/inbox', {
        headers: { Authorization: `Bearer ${token}` }
      });
      return res.json();
    }
  });

  // Fetch real employee summary from API (Managers Only)
  const { data: employeeSummary, isLoading: loadingSummary } = useQuery({
    queryKey: ['employee-summary', 24],
    queryFn: () => employeesApi.getSummary(24),
    enabled: isManager
  });

  // Fetch real Twilio pool data (Managers Only)
  const { data: poolData, isLoading: loadingPool } = useQuery({
    queryKey: ['twilio-pool'],
    queryFn: () => employeesApi.numbersPool(),
    enabled: isManager
  });

  // Fetch own stats (Employees Only)
  const { data: myStatsData, isLoading: loadingMyStats } = useQuery({
    queryKey: ['my-dashboard-stats', 24],
    queryFn: () => employeesApi.getMeDashboard(24),
    enabled: !isManager
  });

  const employees = employeeSummary?.employees || [];
  const pool = poolData?.numbers || [];
  const myStats = myStatsData?.stats;

  const isLoading = isManager ? (loadingSummary || loadingPool) : loadingMyStats;

  if (isLoading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#7B8794' }}>Loading dashboard...</div>;
  }

  if (!isManager) {
    return (
      <div style={{ maxWidth: 1200 }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 28, fontWeight: 700, color: '#14202B', margin: '0 0 8px' }}>
            My Dashboard
          </h1>
          <p style={{ color: '#52606D', fontSize: 15, margin: 0 }}>
            Overview of your performance in the last 24 hours
          </p>
        </div>

        {/* Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20, marginBottom: 32 }}>
          <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 13, color: '#7B8794', marginBottom: 8 }}>Total Calls (24h)</div>
            <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 36, fontWeight: 700, color: '#6D28D9' }}>
              {myStats?.calls_in_period || 0}
            </div>
          </div>
          
          <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 13, color: '#7B8794', marginBottom: 8 }}>Talk Time (24h)</div>
            <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 36, fontWeight: 700, color: '#0F766E' }}>
              {Math.floor((myStats?.talk_time_in_period || 0) / 3600)}h {Math.floor(((myStats?.talk_time_in_period || 0) % 3600) / 60)}m
            </div>
          </div>
          
          <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 13, color: '#7B8794', marginBottom: 8 }}>Assigned Number</div>
            <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 24, fontWeight: 700, color: '#14202B', marginTop: 8 }}>
              {user?.twilio_phone_number || 'None'}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 24 }}>
          <Link to="/leads" style={{ background: '#0F766E', color: '#fff', padding: '16px 20px', borderRadius: 10, textDecoration: 'none', fontWeight: 600, textAlign: 'center' }}>
            📞 Start Dialing Leads
          </Link>
        </div>
      </div>
    );
  }

  // Manager Dashboard
  const totalEmployees = employees.length;
  const activeEmployees = employees.filter(e => e.status === 'active').length;
  const totalCalls = employees.reduce((sum, e) => sum + e.calls_in_period, 0);
  const totalAssignedNumbers = pool.filter(n => n.assigned).length;

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

        {/* GCP Billing Card */}
        <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, color: '#7B8794', marginBottom: 8, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5H5a2 2 0 0 0 0 4h16"/></svg>
              GCP Billing (This Month)
            </div>
            <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 36, fontWeight: 700, color: '#2563EB' }}>
              $0.00
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#F59E0B', marginTop: 4, background: '#FEF3C7', padding: '4px 8px', borderRadius: '4px', display: 'inline-block' }}>
            Setup Required
          </div>
        </div>
      </div>

      {/* 🔴 Unified Inbox (Replies) - As requested, the most prominent section */}
      <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 12, padding: 24, marginBottom: 32, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 20, fontWeight: 700, color: '#14202B', margin: 0 }}>
            Unified Inbox (Recent Replies)
          </h2>
          <Link to="/outreach" style={{ fontSize: 13, color: '#0F766E', textDecoration: 'none', fontWeight: 600 }}>
            View Outreach Settings →
          </Link>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!inboxData?.inbox || inboxData.inbox.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#7B8794', background: '#F9FAFB', borderRadius: 8 }}>
              No recent replies. Your outreach campaigns are running!
            </div>
          ) : (
            inboxData.inbox.slice(0, 5).map((msg: any) => (
              <div key={msg.id} style={{ display: 'flex', gap: 16, padding: 16, border: '1px solid #E5E7EB', borderRadius: 8, background: '#F9FAFB', transition: 'all 0.2s' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#E0E7FF', color: '#4F46E5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                  {msg.from_email.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: '#111827' }}>{msg.company_name || msg.from_email}</span>
                    <span style={{ fontSize: 12, color: '#6B7280' }}>
                      {new Date(msg.received_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div style={{ fontWeight: 500, color: '#374151', fontSize: 14, marginBottom: 4 }}>{msg.subject}</div>
                  <div style={{ color: '#6B7280', fontSize: 13, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {msg.body_text?.substring(0, 150) || 'No text content'}
                  </div>
                </div>
              </div>
            ))
          )}
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
                      <div style={{ fontSize: 12, color: '#7B8794' }}>@{emp.username || emp.email.split('@')[0]}</div>
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
