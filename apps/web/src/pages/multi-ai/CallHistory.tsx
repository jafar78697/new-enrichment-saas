import { useEffect, useState } from 'react';
import api from '../../services/api';
import { Clock, FileText, Download, RefreshCw } from 'lucide-react';

const results = [
  ['all', 'All Calls'], ['interested', 'Interested'], ['not_interested', 'Not Interested'],
  ['voicemail', 'Voicemail'], ['ivr', 'IVR Menu'], ['no_answer', 'No Answer'],
  ['followup', 'Follow-up / Call Later'], ['do_not_call', 'Do Not Call'],
  ['technical_error', 'Technical Error'], ['needs_review', 'Needs Review'], ['in_progress', 'In Progress']
];
const formatDate = (value?: string) => value && Number.isFinite(new Date(value).getTime())
  ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
const resultName = (value: string) => results.find(([key]) => key === value)?.[1] || 'Needs Review';
const conversation = (raw: any): any[] => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') { try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
  return [];
};
const isAgent = (entry: any) => ['assistant', 'agent', 'ai'].includes(entry.role || entry.speaker);
const words = (entry: any) => entry.text || entry.content || '';

export function CallHistory({ lanes = [] }: { lanes?: any[] }) {
  const [history, setHistory] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [outcome, setOutcome] = useState('all');
  const [laneId, setLaneId] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [selectedSession, setSelectedSession] = useState<any | null>(null);
  const limit = 20;

  useEffect(() => {
    const controller = new AbortController();
    let fetching = false;
    const load = async (silent = false) => {
      if (fetching) return;
      fetching = true;
      if (!silent) setLoading(true);
      try {
        const res = await api.get('/multi-calling/history', { params: { limit, offset: (page - 1) * limit, outcome, ...(laneId ? { laneId } : {}) }, signal: controller.signal });
        if (controller.signal.aborted) return;
        setHistory(res.data.history || []); setTotal(res.data.total || 0); setCounts(res.data.counts || {}); setError('');
        setSelectedSession((previous: any) => previous ? (res.data.history.find((s: any) => s.session_id === previous.session_id) || previous) : null);
      } catch (err: any) {
        if (!controller.signal.aborted) setError(err.response?.data?.error || 'Could not load call history. Click Refresh to try again.');
      } finally { fetching = false; if (!controller.signal.aborted) setLoading(false); }
    };
    load();
    const timer = setInterval(() => load(true), 10000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [page, outcome, laneId, refresh]);

  useEffect(() => {
    if (!selectedSession) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelectedSession(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [selectedSession]);

  const totalPages = Math.ceil(total / limit);
  const downloadTranscript = (session: any) => {
    const lines = [session.company_name || session.domain || 'Prospect', `Call: ${session.signalwire_call_sid || session.session_id}`, `Date: ${formatDate(session.created_at)}`, `Result: ${resultName(session.display_outcome)}`, `Caller number: ${session.caller_number || '—'}`, '', ...conversation(session.transcript).map(t => `${isAgent(t) ? 'AI Agent' : 'Customer'}: ${words(t)}`)];
    const url = URL.createObjectURL(new Blob([lines.join('\n\n')], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `call-${session.session_id}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <section id="multi-call-history" className="w-full space-y-5 mt-8">
    <div className="flex flex-wrap justify-between items-center gap-3 border-t pt-8">
      <div><h2 className="text-xl font-bold text-gray-900">Call History & Results</h2><p className="text-sm text-gray-500 mt-1">Filter results and open the saved AI and customer conversation for each call.</p></div>
      <div className="flex gap-2"><select aria-label="Filter calls by lane" value={laneId} onChange={e => { setLaneId(e.target.value); setPage(1); setHistory([]); }} className="border rounded-lg px-3 py-2 text-sm"><option value="">All lanes</option>{lanes.filter(l => l.id).map(l => <option key={l.id} value={l.id}>Lane {l.slot_number} — {l.niche_name || l.name}</option>)}</select><button onClick={() => setRefresh(r => r + 1)} className="border rounded-lg px-3 py-2 text-sm flex items-center gap-2"><RefreshCw size={14} /> Refresh</button></div>
    </div>
    <div className="flex flex-wrap gap-2" aria-label="Call result filters">{results.map(([key, label]) => <button key={key} aria-pressed={outcome === key} onClick={() => { setOutcome(key); setPage(1); setHistory([]); }} className={`rounded-lg px-3 py-2 text-sm border ${outcome === key ? 'bg-teal-700 border-teal-700 text-white' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>{label} <span className="ml-1 font-semibold">{counts[key] || 0}</span></button>)}</div>
    {error && <p role="alert" className="text-red-700 bg-red-50 p-3 rounded">{error}</p>}
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      {loading && !history.length ? <p className="p-8 text-center text-gray-500">Loading history…</p> : !history.length ? <p className="p-8 text-center text-gray-500">No calls found for this filter.</p> : <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-gray-50 text-gray-700 border-b"><tr>{['Date', 'Lane / Caller Number', 'Prospect', 'AI Result', 'Duration', 'Conversation'].map(label => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-gray-100">{history.map(session => <tr key={session.session_id} className="hover:bg-gray-50">
        <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDate(session.created_at)}</td>
        <td className="px-4 py-3"><div>Lane {session.lane_slot || '—'}</div><div className="text-xs text-gray-500 font-mono">{session.caller_number || '—'}</div></td>
        <td className="px-4 py-3"><div className="font-medium text-gray-900">{session.company_name || session.domain || session.person_name || 'Unknown'}</div><div className="text-xs text-gray-500">{session.person_name} {session.primary_phone}</div></td>
        <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${['needs_review', 'technical_error'].includes(session.display_outcome) ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-700'}`}>{resultName(session.display_outcome)}</span><div className="text-xs text-gray-500 mt-2 max-w-[240px]">{session.summary || (session.ended_at ? 'No confirmed result recorded.' : 'Call is active.')}</div></td>
        <td className="px-4 py-3 whitespace-nowrap"><span className="flex items-center gap-1"><Clock size={12} /> {session.duration_sec || 0}s</span></td>
        <td className="px-4 py-3"><button onClick={() => setSelectedSession(session)} className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-2 text-xs font-medium flex items-center gap-1"><FileText size={14} /> Script / Transcript</button></td>
      </tr>)}</tbody></table></div>}
      {totalPages > 1 && <div className="px-4 py-3 border-t flex justify-between items-center"><span className="text-sm text-gray-600">{(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</span><div className="flex gap-2"><button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="border rounded px-3 py-1 disabled:opacity-50">Previous</button><button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="border rounded px-3 py-1 disabled:opacity-50">Next</button></div></div>}
    </div>
    {selectedSession && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div role="dialog" aria-modal="true" aria-labelledby="call-transcript-title" className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
      <div className="p-4 border-b flex justify-between items-center"><div><h3 id="call-transcript-title" className="text-lg font-bold">{selectedSession.company_name || selectedSession.domain || 'Call'} — Conversation</h3><p className="text-xs text-gray-500">Lane {selectedSession.lane_slot} · {formatDate(selectedSession.created_at)} · {selectedSession.primary_phone}</p></div><button aria-label="Close transcript" onClick={() => setSelectedSession(null)} className="text-2xl px-2">×</button></div>
      <div className="p-5 overflow-y-auto space-y-4"><div className="text-sm space-y-1"><p className="text-green-700 font-semibold">AI Result: {resultName(selectedSession.display_outcome)}</p><p>Caller number: {selectedSession.caller_number || '—'}</p><p>{selectedSession.summary}</p>{selectedSession.result_details?.followup_at && <p>Follow-up: {formatDate(selectedSession.result_details.followup_at)} ({selectedSession.result_details.followup_timezone || 'Timezone not recorded'})</p>}<p className="text-xs text-gray-500">Provider status: {selectedSession.call_state} · Call ID: {selectedSession.signalwire_call_sid || selectedSession.session_id}</p></div>
        <h4 className="font-semibold">Saved call transcript — AI Agent and Customer</h4>
        {conversation(selectedSession.transcript).length ? <div className="space-y-3">{conversation(selectedSession.transcript).map((t, i) => <div key={i} className={`flex flex-col ${isAgent(t) ? 'items-start' : 'items-end'}`}><span className="text-xs text-gray-500 mb-1">{isAgent(t) ? 'AI Agent' : 'Customer'}</span><div className={`px-3 py-2 rounded-lg max-w-[90%] whitespace-pre-wrap text-sm ${isAgent(t) ? 'bg-gray-100 text-gray-900' : 'bg-blue-600 text-white'}`}>{words(t)}</div></div>)}</div> : <p className="bg-gray-50 p-6 rounded text-gray-500">No speech transcript was captured for this call. A ringing or unanswered call may have no conversation.</p>}
      </div><div className="p-4 border-t flex justify-between"><button disabled={!conversation(selectedSession.transcript).length} onClick={() => downloadTranscript(selectedSession)} className="text-blue-700 flex items-center gap-2 disabled:opacity-40"><Download size={16} /> Download transcript</button><button onClick={() => setSelectedSession(null)} className="border rounded px-4 py-2">Close</button></div>
    </div></div>}
  </section>;
}
