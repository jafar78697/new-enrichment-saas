import { useEffect, useState } from 'react';
import { Headphones, Phone, RefreshCw } from 'lucide-react';
import { callsApi, type Call } from '../services/callsApi';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../components/Notifications';

const API_BASE = `${(import.meta.env.VITE_CALLS_URL as string | undefined) || ''}/api`;

function formatDuration(seconds?: number | null) {
  const value = Number(seconds || 0);
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

export default function CallHistory() {
  const { user } = useAuth();
  const { notify } = useNotifications();
  const [calls, setCalls] = useState<Call[]>([]);
  const [recordings, setRecordings] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);

  async function loadCalls() {
    setLoading(true);
    try {
      const response = await callsApi.listCalls();
      setCalls(response.calls || []);
    } catch (error: any) {
      notify(error?.message || 'Call history could not be loaded.', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadCalls(); }, []);

  useEffect(() => {
    calls.filter((call) => call.recording_url && !recordings[call.id]).forEach(async (call) => {
      try {
        const response = await fetch(`${API_BASE}/calls/${call.id}/recording/stream`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
        });
        if (!response.ok) return;
        const url = URL.createObjectURL(await response.blob());
        setRecordings((current) => ({ ...current, [call.id]: url }));
      } catch {
        // The recording can still be processing at telephony provider.
      }
    });
  }, [calls, recordings]);

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <header className="flex items-center justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary"><Phone size={17} /> Calling</div>
          <h1 className="text-3xl font-bold text-slate-900">Call History</h1>
          <p className="mt-2 text-textMuted">Review employee call activity, duration and available recordings.</p>
        </div>
        <button onClick={() => void loadCalls()} className="btn-secondary inline-flex items-center gap-2"><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> Refresh</button>
      </header>

      {!user?.call_recording_enabled && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 font-medium">
          Voice recording is not enabled. Ask the Platform Admin to enable it in Customer Account Settings.
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-surface/30">
        {loading && !calls.length ? <div className="p-12 text-center text-textMuted">Loading call history…</div> : !calls.length ? <div className="p-12 text-center text-textMuted">No calls recorded yet.</div> : (
          <div className="divide-y divide-border">
            {calls.map((call) => (
              <div key={call.id} className="grid gap-4 p-4 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto] lg:items-center">
                <div><div className="font-semibold text-slate-900">{call.contact_name || call.contact_phone_number || call.to_number || 'Unknown contact'}</div><div className="mt-1 text-xs text-textMuted">{call.started_at ? new Date(call.started_at).toLocaleString() : 'Pending'} · {call.direction || 'call'}</div></div>
                <div className="text-sm text-textMuted">Employee<br /><span className="text-slate-900">{call.agent_name || 'Unassigned'}</span></div>
                <div className="text-sm text-textMuted">Duration<br /><span className="font-mono text-slate-900">{formatDuration(call.duration_seconds)}</span></div>
                <div className="text-sm capitalize text-textMuted">Status<br /><span className="text-slate-900">{call.outcome || call.status || 'pending'}</span></div>
                {user?.call_recording_enabled && recordings[call.id] ? <audio controls preload="none" src={recordings[call.id]} className="h-9 w-56" aria-label={`Recording for ${call.contact_name || 'call'}`} /> : user?.call_recording_enabled ? <span className="inline-flex items-center gap-2 text-xs text-textMuted"><Headphones size={15} /> Recording processing/unavailable</span> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
