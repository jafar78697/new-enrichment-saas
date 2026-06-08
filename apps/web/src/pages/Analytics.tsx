import { useEffect, useState } from 'react';
import {
  analyticsApi, AnalyticsOverview, STAGE_LABELS, Stage, PIPELINE_STAGES,
} from '../services/crmApi';

// Analytics overview: pipeline distribution, stage movement, top industries,
// enrichment-job health, and open-tasks counter.
export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = async (d = days) => {
    setLoading(true);
    try {
      const res = await analyticsApi.overview(d);
      setData(res);
      setErr('');
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Failed to load analytics');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalLeads = data?.leads_by_stage.reduce((s, r) => s + r.n, 0) || 0;
  const totalMovement = data?.stage_movement.reduce((s, r) => s + r.n, 0) || 0;
  const won = data?.leads_by_stage.find((r) => r.lead_stage === 'closed_won')?.n || 0;
  const conversionRate = totalLeads > 0 ? ((won / totalLeads) * 100).toFixed(1) : '0.0';

  return (
    <div style={{ fontFamily: 'Manrope, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#14202B', margin: 0 }}>Analytics</h1>
          <p style={{ fontSize: 13, color: '#52606D', margin: '4px 0 0' }}>Pipeline health and sales motion</p>
        </div>
        <div style={{ display: 'flex', gap: 4, background: '#F3F4F6', padding: 3, borderRadius: 8 }}>
          {[7, 30, 90, 365].map((d) => (
            <button
              key={d}
              onClick={() => { setDays(d); void load(d); }}
              style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6,
                border: 'none', cursor: 'pointer',
                background: days === d ? '#0F766E' : 'transparent',
                color: days === d ? '#fff' : '#52606D',
              }}
            >{d}d</button>
          ))}
        </div>
      </div>

      {err && <div style={{ padding: 10, marginBottom: 12, background: '#FEE2E2', color: '#991B1B', borderRadius: 8, fontSize: 12 }}>{err}</div>}
      {loading && <div style={{ padding: 20, color: '#7B8794' }}>Loading…</div>}

      {data && (
        <>
          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
            <Kpi label="Total Leads" value={totalLeads.toLocaleString()} />
            <Kpi label="Closed Won" value={won.toLocaleString()} accent="#047857" />
            <Kpi label={`Conversion (${days}d)`} value={`${conversionRate}%`} accent="#0F766E" />
            <Kpi label="Open Tasks" value={data.tasks_open.toLocaleString()} accent="#d97706" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
            <Panel title="Pipeline distribution">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {PIPELINE_STAGES.map((stage) => {
                  const n = data.leads_by_stage.find((r) => r.lead_stage === stage)?.n || 0;
                  const pct = totalLeads > 0 ? (n / totalLeads) * 100 : 0;
                  return (
                    <div key={stage}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: '#52606D' }}>{STAGE_LABELS[stage as Stage]}</span>
                        <span style={{ color: '#14202B', fontWeight: 600 }}>{n}</span>
                      </div>
                      <div style={{ height: 6, background: '#F0F1EC', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: '#0F766E' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <Panel title={`Stage moves (${days}d) — ${totalMovement}`}>
                {data.stage_movement.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#B0BEC5' }}>No movement.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {data.stage_movement.map((r) => (
                      <div key={r.to_stage} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: '#52606D' }}>→ {STAGE_LABELS[r.to_stage as Stage] || r.to_stage}</span>
                        <span style={{ color: '#14202B', fontWeight: 600 }}>{r.n}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="Top industries">
                {data.top_industries.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#B0BEC5' }}>No data.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {data.top_industries.map((r) => (
                      <div key={r.industry} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: '#52606D' }}>{r.industry}</span>
                        <span style={{ color: '#14202B', fontWeight: 600 }}>{r.n}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title={`Enrichment jobs (${days}d)`}>
                {data.enrichment_jobs.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#B0BEC5' }}>No jobs.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {data.enrichment_jobs.map((r) => (
                      <div key={r.status} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: '#52606D', textTransform: 'capitalize' }}>{r.status}</span>
                        <span style={{ color: '#14202B', fontWeight: 600 }}>{r.n}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 11, color: '#7B8794', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: accent || '#14202B', marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#52606D', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}
