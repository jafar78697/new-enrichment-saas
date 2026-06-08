import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { callsApi, CALLS_API_BASE, type Call, type CallOutcome } from '../services/callsApi';
import { getCallUser } from '../services/employeesApi';

const OUTCOMES: { key: CallOutcome; label: string }[] = [
  { key: 'connected', label: 'Connected' },
  { key: 'voicemail', label: 'Voicemail' },
  { key: 'no_answer', label: 'No answer' },
  { key: 'busy', label: 'Busy' },
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
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function CallDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [call, setCall] = useState<Call | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState<CallOutcome | ''>('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const callUser = getCallUser();
  const callId = Number(id);

  useEffect(() => {
    if (!callUser) {
      navigate(`/call-login?next=/calls/${id}`);
      return;
    }
    if (!Number.isFinite(callId)) {
      setError('Invalid call id');
      setLoading(false);
      return;
    }
    let cancelled = false;
    callsApi.listCalls()
      .then(({ calls }) => {
        if (cancelled) return;
        const c = calls.find((x) => x.id === callId) || null;
        setCall(c);
        setNotes(c?.notes || '');
        setOutcome((c?.outcome as CallOutcome) || '');
        if (!c) setError('Call not found');
      })
      .catch((e: any) => { if (!cancelled) setError(e?.message || 'Failed to load call'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [callId, id, callUser, navigate]);

  const save = async () => {
    if (!call) return;
    setSaving(true);
    setStatus(null);
    try {
      const { call: updated } = await callsApi.updateCall(call.id, {
        outcome: (outcome || null) as CallOutcome | null,
        notes: notes || null,
      });
      setCall(updated);
      setStatus('✓ Saved');
    } catch (e: any) {
      setStatus(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ color: '#52606D', fontSize: 13 }}>Loading call…</div>;
  }

  if (error || !call) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ padding: 10, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, color: '#B91C1C', fontSize: 13 }}>
          {error || 'Call not found'}
        </div>
        <button onClick={() => navigate('/calls')} style={btnSecondary}>← Back to call logs</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <button onClick={() => navigate('/calls')} style={{ ...btnSecondary, alignSelf: 'flex-start' }}>← Call logs</button>

      <div>
        <h1 style={{ margin: 0, fontSize: 22, color: '#14202B', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700 }}>
          Call #{call.id}
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#52606D' }}>
          {formatDate(call.started_at)} · {call.direction || '—'} · {formatDuration(call.duration_seconds)}
        </p>
      </div>

      {/* Overview */}
      <div style={card}>
        <div style={cardTitle}>Overview</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <KV label="Contact"   value={call.contact_name || '—'} sub={call.contact_company || undefined} />
          <KV label="Phone"     value={call.to_number || call.from_number || '—'} mono />
          <KV label="Agent"     value={call.agent_name || '—'} />
          <KV label="Direction" value={call.direction || '—'} />
          <KV label="Status"    value={call.status || '—'} />
          <KV label="Outcome"   value={call.outcome || '—'} />
          <KV label="Started"   value={formatDate(call.started_at)} />
          <KV label="Ended"     value={formatDate(call.ended_at)} />
          <KV label="Duration"  value={formatDuration(call.duration_seconds)} />
          <KV label="Call SID"  value={call.call_sid || '—'} mono small />
        </div>
      </div>

      {/* Recording */}
      <div style={card}>
        <div style={cardTitle}>Recording</div>
        {call.recording_url ? (
          <audio controls preload="none" style={{ width: '100%', maxWidth: 520 }}>
            <source src={`${CALLS_API_BASE}/calls/${call.id}/recording/stream`} type="audio/mpeg" />
          </audio>
        ) : (
          <div style={{ fontSize: 13, color: '#7B8794' }}>
            {call.recording_status === 'in-progress' ? 'Recording in progress…' : 'No recording available for this call.'}
          </div>
        )}
      </div>

      {/* Transcript placeholder — wired in a later task */}
      <div style={card}>
        <div style={cardTitle}>AI transcript & summary</div>
        <div style={{ padding: 16, background: '#FBFBF8', borderRadius: 8, border: '1px dashed #D8E1D7', fontSize: 13, color: '#7B8794' }}>
          Coming soon. When AI transcription is enabled, this panel will show the full transcript, auto-summary, sentiment, and detected objections.
        </div>
      </div>

      {/* Notes + outcome */}
      <div style={card}>
        <div style={cardTitle}>Disposition</div>
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 12, alignItems: 'start' }}>
          <select value={outcome} onChange={(e) => setOutcome(e.target.value as CallOutcome | '')} style={input}>
            <option value="">No outcome</option>
            {OUTCOMES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes from the call…"
            rows={5}
            style={{ ...input, resize: 'vertical', minHeight: 100 }}
          />
        </div>
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: status?.startsWith('✓') ? '#166534' : '#B91C1C' }}>{status || ''}</span>
          <button onClick={save} disabled={saving} style={{ ...btn, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : 'Save disposition'}
          </button>
        </div>
      </div>
    </div>
  );
}

function KV({ label, value, sub, mono, small }: { label: string; value: string; sub?: string; mono?: boolean; small?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#7B8794', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>{label}</div>
      <div style={{
        fontSize: small ? 11 : 14,
        fontWeight: 600,
        color: '#14202B',
        fontFamily: mono ? 'JetBrains Mono, monospace' : 'Manrope, sans-serif',
        wordBreak: 'break-all',
      }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: '#7B8794', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── Styles
const card: React.CSSProperties = { background: '#fff', border: '1px solid #D8E1D7', borderRadius: 10, padding: 16 };
const cardTitle: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: '#14202B', marginBottom: 12 };
const input: React.CSSProperties = {
  padding: '9px 12px', borderRadius: 8, border: '1px solid #D8E1D7', fontSize: 13,
  background: '#fff', color: '#14202B', outline: 'none', fontFamily: 'Manrope, sans-serif',
};
const btn: React.CSSProperties = {
  padding: '9px 18px', borderRadius: 8, border: 'none',
  background: '#0F766E', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const btnSecondary: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 8, border: '1px solid #D8E1D7',
  background: '#fff', color: '#14202B', fontSize: 12, fontWeight: 600, cursor: 'pointer',
};
