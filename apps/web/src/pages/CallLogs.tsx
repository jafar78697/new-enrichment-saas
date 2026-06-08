import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { callsApi, CALLS_API_BASE, type Call, type CallFilters } from '../services/callsApi';
import { getCallUser, employeesApi } from '../services/employeesApi';

const OUTCOMES = [
  { key: '', label: 'All outcomes' },
  { key: 'connected', label: 'Connected' },
  { key: 'voicemail', label: 'Voicemail' },
  { key: 'no_answer', label: 'No answer' },
  { key: 'busy', label: 'Busy' },
];

const STATUSES = [
  { key: '', label: 'All statuses' },
  { key: 'completed', label: 'Completed' },
  { key: 'failed', label: 'Failed' },
  { key: 'busy', label: 'Busy' },
  { key: 'no-answer', label: 'No answer' },
  { key: 'in-progress', label: 'In progress' },
];

function formatDuration(seconds?: number | null): string {
  if (seconds == null) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function outcomeBadge(outcome?: string | null) {
  if (!outcome) return <span style={dash}>—</span>;
  const cfg: Record<string, { bg: string; fg: string; label: string }> = {
    connected: { bg: '#ECFDF5', fg: '#047857', label: 'Connected' },
    voicemail: { bg: '#FEF3C7', fg: '#92400E', label: 'Voicemail' },
    no_answer: { bg: '#FEE2E2', fg: '#B91C1C', label: 'No answer' },
    busy: { bg: '#F3F4F6', fg: '#52606D', label: 'Busy' },
  };
  const c = cfg[outcome] || { bg: '#F3F4F6', fg: '#52606D', label: outcome };
  return <span style={{ ...pill, background: c.bg, color: c.fg }}>{c.label}</span>;
}

function statusBadge(status?: string | null) {
  if (!status) return <span style={dash}>—</span>;
  const cfg: Record<string, { bg: string; fg: string }> = {
    completed: { bg: '#ECFDF5', fg: '#047857' },
    'in-progress': { bg: '#FEF3C7', fg: '#92400E' },
    ringing: { bg: '#FEF3C7', fg: '#92400E' },
    initiated: { bg: '#F3F4F6', fg: '#52606D' },
    failed: { bg: '#FEE2E2', fg: '#B91C1C' },
    busy: { bg: '#FEE2E2', fg: '#B91C1C' },
    'no-answer': { bg: '#FEE2E2', fg: '#B91C1C' },
    canceled: { bg: '#F3F4F6', fg: '#52606D' },
  };
  const c = cfg[status] || { bg: '#F3F4F6', fg: '#52606D' };
  return <span style={{ ...pill, background: c.bg, color: c.fg }}>{status}</span>;
}

export default function CallLogsPage() {
  const navigate = useNavigate();
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<CallFilters>({});
  const [agents, setAgents] = useState<{ id: number; name: string }[]>([]);

  const callUser = getCallUser();

  useEffect(() => {
    employeesApi.list().then(r => setAgents(r.employees)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!callUser) {
      navigate('/call-login?next=/calls');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    callsApi.listCalls(filters)
      .then((r) => { if (!cancelled) setCalls(r.calls || []); })
      .catch((e: any) => { if (!cancelled) setError(e?.message || 'Failed to load calls'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters, callUser, navigate]);

  const change = (k: keyof CallFilters, v: string) =>
    setFilters((f) => ({ ...f, [k]: v || undefined }));

  const refresh = () => setFilters((f) => ({ ...f }));

  const stats = useMemo(() => {
    const total = calls.length;
    const connected = calls.filter((c) => c.outcome === 'connected').length;
    const totalSecs = calls.reduce((a, c) => a + (c.duration_seconds || 0), 0);
    return { total, connected, totalSecs };
  }, [calls]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: '#14202B', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700 }}>Call Logs</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#52606D' }}>
            Every call placed through the workspace. Click a row to see details and the recording.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <Stat label="Calls" value={stats.total} />
          <Stat label="Connected" value={stats.connected} tone="emerald" />
          <Stat label="Talk time" value={formatDuration(stats.totalSecs)} />
        </div>
      </div>

      {/* Filters */}
      <div style={card}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          <label style={labelStyle}>
            <span style={labelHint}>From</span>
            <input type="date" value={filters.dateFrom || ''} onChange={(e) => change('dateFrom', e.target.value)} style={input} />
          </label>
          <label style={labelStyle}>
            <span style={labelHint}>To</span>
            <input type="date" value={filters.dateTo || ''} onChange={(e) => change('dateTo', e.target.value)} style={input} />
          </label>
          <label style={labelStyle}>
            <span style={labelHint}>Outcome</span>
            <select value={filters.outcome || ''} onChange={(e) => change('outcome', e.target.value)} style={input}>
              {OUTCOMES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </label>
          <label style={labelStyle}>
            <span style={labelHint}>Status</span>
            <select value={filters.status || ''} onChange={(e) => change('status', e.target.value)} style={input}>
              {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          {agents.length > 0 && (
            <label style={labelStyle}>
              <span style={labelHint}>Agent</span>
              <select 
                value={filters.agentId || ''} 
                onChange={(e) => setFilters((f) => ({ ...f, agentId: e.target.value ? Number(e.target.value) : undefined }))} 
                style={input}
              >
                <option value="">All Agents</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </label>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button onClick={refresh} style={btn}>↻ Refresh</button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: 10, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, color: '#B91C1C', fontSize: 13 }}>{error}</div>
      )}

      {/* Table */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#14202B', borderBottom: '1px solid #EEF2EA' }}>
          {loading ? 'Loading calls…' : `${calls.length} call${calls.length === 1 ? '' : 's'}`}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#FBFBF8', textAlign: 'left', color: '#52606D' }}>
                <th style={th}>Date</th>
                <th style={th}>Phone</th>
                <th style={th}>Contact</th>
                <th style={th}>Agent</th>
                <th style={th}>Status</th>
                <th style={th}>Outcome</th>
                <th style={th}>Duration</th>
                <th style={th}>Recording</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {!loading && calls.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 40, color: '#7B8794' }}>
                    No calls match these filters yet.
                  </td>
                </tr>
              )}
              {calls.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/calls/${c.id}`)}
                  style={{ borderTop: '1px solid #EEF2EA', cursor: 'pointer' }}
                >
                  <td style={td}>{formatDate(c.started_at)}</td>
                  <td style={{ ...td, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
                    {c.direction === 'inbound' ? c.from_number : c.to_number || c.from_number || '—'}
                  </td>
                  <td style={td}>
                    <div style={{ fontWeight: 600, color: '#14202B' }}>{c.contact_name || '—'}</div>
                    {c.contact_company && <div style={{ fontSize: 11, color: '#7B8794' }}>{c.contact_company}</div>}
                  </td>
                  <td style={td}>{c.agent_name || '—'}</td>
                  <td style={td}>{statusBadge(c.status)}</td>
                  <td style={td}>{outcomeBadge(c.outcome)}</td>
                  <td style={td}><strong>{formatDuration(c.duration_seconds)}</strong></td>
                  <td style={td} onClick={(e) => e.stopPropagation()}>
                    {c.recording_url ? (
                      <audio controls preload="none" style={{ height: 26, maxWidth: 200 }}>
                        <source src={`${CALLS_API_BASE}/calls/${c.id}/recording/stream`} type="audio/mpeg" />
                      </audio>
                    ) : (
                      <span style={{ color: '#CBD5E1', fontSize: 11 }}>
                        {c.recording_status === 'in-progress' ? 'Recording…' : '—'}
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <span style={{ fontSize: 11, color: '#0F766E', fontWeight: 600 }}>View →</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'emerald' }) {
  return (
    <div style={{ padding: '8px 14px', border: '1px solid #D8E1D7', borderRadius: 10, background: '#fff', minWidth: 90 }}>
      <div style={{ fontSize: 10, color: '#7B8794', letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: tone === 'emerald' ? '#047857' : '#14202B', fontFamily: 'Space Grotesk, sans-serif' }}>{value}</div>
    </div>
  );
}

// ─── Styles
const card: React.CSSProperties = { background: '#fff', border: '1px solid #D8E1D7', borderRadius: 10, padding: 16 };
const th: React.CSSProperties = { padding: '10px 14px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3 };
const td: React.CSSProperties = { padding: '12px 14px', color: '#14202B' };
const pill: React.CSSProperties = { padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 };
const dash: React.CSSProperties = { color: '#CBD5E1', fontSize: 12 };
const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#14202B' };
const labelHint: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#52606D' };
const input: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8, border: '1px solid #D8E1D7', fontSize: 13,
  background: '#fff', color: '#14202B', outline: 'none', fontFamily: 'Manrope, sans-serif',
};
const btn: React.CSSProperties = {
  padding: '9px 16px', borderRadius: 8, border: 'none',
  background: '#0F766E', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
