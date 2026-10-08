import { useEffect, useState } from 'react';
import { Clock, Timer, AlertCircle } from 'lucide-react';
import api from '../../../services/api';

type StopTimer = {
  status: 'scheduled' | 'stopping' | 'completed' | 'cancelled';
  stop_at: string;
  duration_seconds: number;
  last_error: string | null;
};

export default function AllLanesTimer({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const [timer, setTimer] = useState<StopTimer | null>(null);
  const [hours, setHours] = useState('5');
  const [minutes, setMinutes] = useState('0');
  const [clockOffset, setClockOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState('');

  function applyResponse(data: { timer: StopTimer | null; serverNow: string }, midpoint: number) {
    setTimer(data.timer);
    setClockOffset(Date.parse(data.serverNow) - midpoint);
    setNow(Date.now());
  }

  useEffect(() => {
    let disposed = false;
    let fetching = false;
    async function load() {
      if (fetching) return;
      fetching = true;
      const started = Date.now();
      try {
        const response = await api.get('/multi-calling/stop-timer');
        if (!disposed) {
          applyResponse(response.data, (started + Date.now()) / 2);
          setLoaded(true);
          setConnectionError('');
        }
      } catch {
        if (!disposed) setConnectionError('Could not refresh the timer. Reconnecting to the server…');
      } finally { fetching = false; }
    }
    load();
    const refresh = setInterval(load, 5000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { disposed = true; clearInterval(refresh); clearInterval(tick); };
  }, []);

  async function saveTimer(event: React.FormEvent) {
    event.preventDefault();
    const h = Number(hours), m = Number(minutes);
    const durationSeconds = h * 3600 + m * 60;
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m > 59
      || durationSeconds < 60 || durationSeconds > 604800) {
      setError('Choose a duration between 1 minute and 7 days.'); return;
    }
    setBusy(true); setError('');
    const started = Date.now();
    try {
      const response = await api.put('/multi-calling/stop-timer', { durationSeconds });
      applyResponse(response.data, (started + Date.now()) / 2);
      setConnectionError('');
      await onRefresh();
    } catch (err: any) { setError(err.response?.data?.error || 'Could not save the timer. Please retry.'); }
    finally { setBusy(false); }
  }

  async function cancelTimer() {
    setBusy(true); setError('');
    const started = Date.now();
    try {
      const response = await api.delete('/multi-calling/stop-timer');
      applyResponse(response.data, (started + Date.now()) / 2);
      setConnectionError('');
      await onRefresh();
    } catch (err: any) { setError(err.response?.data?.error || 'Could not cancel the timer. Please retry.'); }
    finally { setBusy(false); }
  }

  const remaining = timer?.status === 'scheduled'
    ? Math.max(0, Math.ceil((Date.parse(timer.stop_at) - now - clockOffset) / 1000)) : 0;
  const countdown = [Math.floor(remaining / 3600), Math.floor((remaining % 3600) / 60), remaining % 60]
    .map(value => String(value).padStart(2, '0')).join(':');
  const stopping = timer?.status === 'stopping';
  const expired = timer?.status === 'scheduled' && remaining === 0;
  const title = stopping || expired ? 'Stopping all lanes…'
    : timer?.status === 'completed' ? 'All lanes stopped'
    : timer?.status === 'scheduled' ? 'All lanes stop in' : 'All-lanes auto-stop timer';

  return <section className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-3" aria-label="All-lanes stop timer">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Timer className="w-5 h-5 text-blue-600" />{title}</h3>
        {timer?.status === 'scheduled' && <div className="text-3xl font-mono font-bold text-blue-700 mt-2 tabular-nums" role="timer" aria-label="Time remaining">{countdown}</div>}
        {timer?.status === 'scheduled' && <p className="text-xs text-gray-600 mt-1">Stops at {new Date(timer.stop_at).toLocaleString()}</p>}
        <p className="text-sm text-gray-600 mt-1">Lane 1–4: active calls disconnect and new calls stop when time runs out.</p>
        <p className="text-xs text-gray-500 mt-1">Runs on the server, even if you close this browser. Setting a timer does not start paused lanes.</p>
        {timer?.status === 'completed' && <p className="text-sm text-green-700 mt-2">Set a new timer or clear this one before starting lanes again.</p>}
      </div>
      <form onSubmit={saveTimer} className="flex flex-wrap items-end gap-2">
        <label className="text-sm text-gray-700">Hours<input aria-label="Timer hours" type="number" min="0" max="168" step="1" required value={hours} onChange={event => setHours(event.target.value)} disabled={busy || stopping} className="block mt-1 w-24 rounded-lg border border-gray-300 bg-white px-3 py-2" /></label>
        <label className="text-sm text-gray-700">Minutes<input aria-label="Timer minutes" type="number" min="0" max="59" step="1" required value={minutes} onChange={event => setMinutes(event.target.value)} disabled={busy || stopping} className="block mt-1 w-24 rounded-lg border border-gray-300 bg-white px-3 py-2" /></label>
        <button type="submit" disabled={!loaded || busy || stopping} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 flex items-center gap-2"><Clock className="w-4 h-4" />{busy ? 'Saving…' : timer?.status === 'scheduled' ? 'Reset timer' : 'Set timer'}</button>
        {timer && timer.status !== 'cancelled' && <button type="button" onClick={cancelTimer} disabled={busy || stopping} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50">{timer.status === 'completed' ? 'Clear timer' : 'Cancel timer'}</button>}
      </form>
    </div>
    {stopping && timer?.last_error && <p role="status" className="text-sm text-amber-800">Lanes are paused. Disconnect / result saving is retrying: {timer.last_error}</p>}
    {(error || connectionError) && <p role="alert" className="text-sm text-red-700 flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error || connectionError}</p>}
  </section>;
}
