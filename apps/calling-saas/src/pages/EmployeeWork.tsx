import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Headphones, Phone, RefreshCw } from 'lucide-react';
import { callsApi, CALLS_API_BASE, type Call } from '../services/callsApi';
import { useNotifications } from '../components/Notifications';

type Period = 'today' | 'tomorrow' | 'weekly' | 'monthly' | 'custom';

function dateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDuration(seconds?: number | null) {
  const value = Number(seconds || 0);
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

export default function EmployeeWork() {
  const { agentId } = useParams<{ agentId: string }>();
  const { notify } = useNotifications();
  const [period, setPeriod] = useState<Period>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [calls, setCalls] = useState<Call[]>([]);
  const [recordings, setRecordings] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => {
    if (period === 'custom' && customFrom && customTo) {
      return { dateFrom: customFrom, dateTo: customTo };
    }
    const start = new Date();
    const end = new Date();
    if (period === 'tomorrow') {
      start.setDate(start.getDate() + 1);
      end.setTime(start.getTime());
    } else if (period === 'weekly') {
      start.setDate(start.getDate() - 6);
    } else if (period === 'monthly') {
      start.setDate(start.getDate() - 29);
    }
    return { dateFrom: dateOnly(start), dateTo: dateOnly(end) };
  }, [period, customFrom, customTo]);

  async function loadCalls() {
    if (!agentId) return;
    if (period === 'custom' && (!customFrom || !customTo)) {
      setCalls([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await callsApi.listCalls({ agentId: Number(agentId), ...range });
      setCalls(response.calls || []);
    } catch (error: any) {
      notify(error?.message || 'Employee work could not be loaded.', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadCalls(); }, [agentId, period, customFrom, customTo, range.dateFrom, range.dateTo]);

  useEffect(() => {
    calls.filter((call) => call.recording_url && !recordings[call.id]).forEach(async (call) => {
      try {
        const response = await fetch(`${CALLS_API_BASE}/calls/${call.id}/recording/stream`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
        });
        if (!response.ok) return;
        const url = URL.createObjectURL(await response.blob());
        setRecordings((current) => ({ ...current, [call.id]: url }));
      } catch {
        // Recording may still be processing at SignalWire.
      }
    });
  }, [calls, recordings]);

  const totalSeconds = calls.reduce((total, call) => total + Number(call.duration_seconds || 0), 0);

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link to="/settings" className="mb-3 inline-flex items-center gap-2 text-sm text-primary hover:underline"><ArrowLeft size={16} /> Team Access</Link>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary"><Phone size={17} /> Employee Work</div>
          <h1 className="text-3xl font-bold text-white">Employee Call Work</h1>
          <p className="mt-2 text-textMuted">Review calls, minutes, dates and available voice recordings.</p>
        </div>
        <button onClick={() => void loadCalls()} className="btn-secondary inline-flex items-center gap-2"><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> Refresh</button>
      </header>

      <div className="glass-card flex flex-col gap-4 border border-border/60 p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="text-sm text-textMuted">Filter
          <select value={period} onChange={(event) => setPeriod(event.target.value as Period)} className="input-field mt-2 min-w-[180px] py-2 text-sm">
            <option value="today">Today Calls</option>
            <option value="tomorrow">Tomorrow Calls</option>
            <option value="weekly">Weekly Calls</option>
            <option value="monthly">Monthly Calls</option>
            <option value="custom">Custom Date Range</option>
          </select>
        </label>
        <label className="text-sm text-textMuted">From date
          <input type="date" value={customFrom} onChange={(event) => { setCustomFrom(event.target.value); setPeriod('custom'); }} className="input-field mt-2 py-2 text-sm" />
        </label>
        <label className="text-sm text-textMuted">To date
          <input type="date" value={customTo} min={customFrom || undefined} onChange={(event) => { setCustomTo(event.target.value); setPeriod('custom'); }} className="input-field mt-2 py-2 text-sm" />
        </label>
        {period === 'custom' && (!customFrom || !customTo) && <span className="pb-2 text-xs text-amber-300">From aur To date select karein.</span>}
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface/50 p-4"><div className="text-sm text-textMuted">Calls</div><div className="mt-1 text-2xl font-bold text-white">{calls.length}</div></div>
        <div className="rounded-lg border border-border bg-surface/50 p-4"><div className="text-sm text-textMuted">Total minutes</div><div className="mt-1 text-2xl font-bold text-white">{Math.floor(totalSeconds / 60)}:{String(totalSeconds % 60).padStart(2, '0')}</div></div>
        <div className="rounded-lg border border-border bg-surface/50 p-4"><div className="text-sm text-textMuted">Recordings</div><div className="mt-1 text-2xl font-bold text-emerald-400">{calls.filter((call) => call.recording_url).length}</div></div>
      </section>

      <div className="overflow-hidden rounded-lg border border-border bg-surface/30">
        {loading && !calls.length ? <div className="p-12 text-center text-textMuted">Loading employee work…</div> : !calls.length ? <div className="p-12 text-center text-textMuted">No calls found for this period.</div> : (
          <div className="divide-y divide-border">
            {calls.map((call) => (
              <div key={call.id} className="grid gap-4 p-4 lg:grid-cols-[1.5fr_1fr_1fr_auto] lg:items-center">
                <div><div className="font-semibold text-white">{call.contact_name || call.contact_phone_number || call.to_number || 'Unknown contact'}</div><div className="mt-1 text-xs text-textMuted">{call.started_at ? new Date(call.started_at).toLocaleString() : 'Pending'} · {call.direction || 'call'}</div></div>
                <div className="text-sm text-textMuted">Duration<br /><span className="font-mono text-white">{formatDuration(call.duration_seconds)}</span></div>
                <div className="text-sm capitalize text-textMuted">Status<br /><span className="text-white">{call.outcome || call.status || 'pending'}</span></div>
                {recordings[call.id] ? <audio controls preload="none" src={recordings[call.id]} className="h-9 w-56" aria-label="Call recording" /> : call.recording_url ? <span className="inline-flex items-center gap-2 text-xs text-textMuted"><Headphones size={15} /> Recording processing</span> : <span className="text-xs text-textMuted">No recording</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
