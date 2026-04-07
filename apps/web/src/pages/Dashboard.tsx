import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { billingApi, jobsApi } from '../services/api';

const S = {
  card: { background: '#fff', border: '1px solid #D8E1D7', borderRadius: 12, padding: '20px 22px' } as React.CSSProperties,
  label: { fontSize: 11, fontWeight: 600, color: '#7B8794', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8 },
  metric: { fontFamily: 'JetBrains Mono, monospace', fontSize: 30, fontWeight: 700, color: '#14202B', lineHeight: 1 },
  sub: { fontSize: 12, color: '#52606D', marginTop: 6 },
};

const STATUS_PILL: Record<string, React.CSSProperties> = {
  queued:    { background: '#F3F4F6', color: '#6B7280' },
  running:   { background: '#DBEAFE', color: '#1D4ED8' },
  completed: { background: '#DCFCE7', color: '#15803D' },
  partial:   { background: '#FEF3C7', color: '#B45309' },
  failed:    { background: '#FEE2E2', color: '#DC2626' },
  cancelled: { background: '#F3F4F6', color: '#9CA3AF' },
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={S.card}>
      <p style={S.label}>{label}</p>
      <p style={S.metric}>{value}</p>
      {sub && <p style={S.sub}>{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const { data: usage } = useQuery({ queryKey: ['billing-usage'], queryFn: () => billingApi.getUsage().then(r => r.data), retry: false });
  const { data: jobsData } = useQuery({ queryKey: ['jobs'], queryFn: () => jobsApi.list({ limit: 5 }).then(r => r.data), retry: false });

  const httpUsed = usage?.http_enrichments_used ?? 0;
  const httpLimit = usage?.http_limit ?? 5000;
  const creditsLeft = usage?.browser_credits_remaining ?? 0;
  const activeJobs = jobsData?.jobs?.filter((j: any) => j.status === 'running').length ?? 0;

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Hero */}
      <div style={{ ...S.card, background: 'linear-gradient(135deg, #F6F7F2 0%, #fff 42%, #EAF6F3 100%)', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 20, fontWeight: 700, color: '#14202B', margin: '0 0 6px' }}>
            Your enrichment pipeline is ready
          </h1>
          <p style={{ color: '#52606D', fontSize: 14, margin: 0 }}>Monitor active jobs, usage, and result quality from one place.</p>
        </div>
        <Link to="/jobs/new" style={{ background: '#0F766E', color: '#fff', textDecoration: 'none', padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
          + New Enrichment Job
        </Link>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <StatCard label="Enriched This Month" value={httpUsed.toLocaleString()} />
        <StatCard label="Browser Credits Left" value={creditsLeft} />
        <StatCard label="Active Jobs" value={activeJobs} />
        <StatCard label="HTTP Rows Used" value={`${httpUsed.toLocaleString()} / ${httpLimit.toLocaleString()}`} sub={`${Math.round((httpUsed / httpLimit) * 100)}% used`} />
        <StatCard label="Success Rate" value="—" sub="Complete jobs only" />
        <StatCard label="Recent Exports" value="—" />
      </div>

      {/* Recent Jobs */}
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid #D8E1D7' }}>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 15, fontWeight: 600, color: '#14202B', margin: 0 }}>Recent Jobs</h2>
          <Link to="/jobs" style={{ fontSize: 13, color: '#0F766E', textDecoration: 'none' }}>View all →</Link>
        </div>

        {!jobsData?.jobs?.length ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <p style={{ color: '#7B8794', fontSize: 14, marginBottom: 6 }}>No enrichment jobs yet</p>
            <p style={{ color: '#7B8794', fontSize: 12, marginBottom: 16 }}>Start your first job with pasted domains, a CSV, or a Google Sheet.</p>
            <Link to="/jobs/new" style={{ background: '#0F766E', color: '#fff', textDecoration: 'none', padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
              Create New Job
            </Link>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Job ID', 'Mode', 'Status', 'Progress', 'Created'].map(h => (
                  <th key={h} style={{ textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#7B8794', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 0 10px', borderBottom: '1px solid #EEF2EA' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobsData.jobs.map((job: any) => {
                const pct = job.total_items ? Math.round((job.completed_items / job.total_items) * 100) : 0;
                return (
                  <tr key={job.id} style={{ borderBottom: '1px solid #F6F7F2' }}>
                    <td style={{ padding: '12px 0' }}>
                      <Link to={`/jobs/${job.id}`} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#0F766E', textDecoration: 'none' }}>
                        {job.id.slice(0, 12)}...
                      </Link>
                    </td>
                    <td style={{ padding: '12px 0', fontSize: 13, color: '#52606D', textTransform: 'capitalize' }}>{job.mode?.replace('_', ' ')}</td>
                    <td style={{ padding: '12px 0' }}>
                      <span style={{ ...STATUS_PILL[job.status], fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 20 }}>{job.status}</span>
                    </td>
                    <td style={{ padding: '12px 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 80, height: 5, background: '#EEF2EA', borderRadius: 3 }}>
                          <div style={{ width: `${pct}%`, height: 5, background: '#0F766E', borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 11, color: '#7B8794', fontFamily: 'JetBrains Mono, monospace' }}>{job.completed_items}/{job.total_items}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 0', fontSize: 12, color: '#7B8794' }}>{new Date(job.created_at).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
