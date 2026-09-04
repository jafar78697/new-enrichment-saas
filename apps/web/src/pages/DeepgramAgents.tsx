import { useEffect, useMemo, useState } from 'react';
import { Bot, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import DeepgramBrowserPreview from '../components/DeepgramBrowserPreview';
import {
  deepgramAgentsApi,
  type DeepgramAgent,
  type DeepgramAgentDraft,
  type DeepgramAgentStatus,
  type AgentSessionSummary,
} from '../services/deepgramAgentsApi';

const DEFAULT_PROMPT = `You are the inbound phone assistant for Jento AI.
Welcome the caller, understand why they called, and answer only from information available in this conversation.
Keep spoken replies short and natural.
Never claim to have placed an outbound call. Never promise a callback, booking, transfer, payment, or email unless the system has a real tool for it.
Never ask for passwords, card details, API keys, or other sensitive information.
If the caller asks for a human, say that you can take a short message for the team.
If the caller asks to end the call, say a short goodbye and end the call.`;

const newDraft = (): DeepgramAgentDraft => ({
  name: 'Jento Inbound Test Agent',
  mode: 'inbound',
  isActive: true,
  voice: 'aura-2-thalia-en',
  language: 'en',
  greeting: 'Hello, thanks for calling Jento AI. How can I help you today?',
  prompt: DEFAULT_PROMPT,
  assignedPhoneNumber: null,
  maxCallDurationSec: 180,
});

function draftFromAgent(agent: DeepgramAgent): DeepgramAgentDraft {
  return {
    name: agent.name,
    mode: agent.mode,
    isActive: agent.isActive,
    voice: agent.voice,
    language: agent.language,
    greeting: agent.greeting,
    prompt: agent.prompt,
    assignedPhoneNumber: agent.assignedPhoneNumber,
    maxCallDurationSec: agent.maxCallDurationSec,
  };
}

function formatTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : '-';
}

export default function DeepgramAgents() {
  const [agents, setAgents] = useState<DeepgramAgent[]>([]);
  const [sessions, setSessions] = useState<AgentSessionSummary[]>([]);
  const [status, setStatus] = useState<DeepgramAgentStatus | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DeepgramAgentDraft>(newDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedId) || null,
    [agents, selectedId],
  );

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextStatus, agentsResult, sessionsResult] = await Promise.all([
        deepgramAgentsApi.status(),
        deepgramAgentsApi.list(),
        deepgramAgentsApi.sessions(),
      ]);
      setStatus(nextStatus);
      setAgents(agentsResult.agents);
      setSessions(sessionsResult.sessions);
      const current = agentsResult.agents.find((agent) => agent.id === selectedId) || agentsResult.agents[0] || null;
      if (current) {
        setSelectedId(current.id);
        setDraft(draftFromAgent(current));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'AI agents load nahi ho sake.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const selectAgent = (agent: DeepgramAgent) => {
    setSelectedId(agent.id);
    setDraft(draftFromAgent(agent));
    setError(null);
  };

  const createNew = () => {
    setSelectedId(null);
    setDraft(newDraft());
    setError(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = selectedId
        ? await deepgramAgentsApi.update(selectedId, draft)
        : await deepgramAgentsApi.create(draft);
      setSelectedId(result.agent.id);
      setDraft(draftFromAgent(result.agent));
      await refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Agent save nahi ho saka.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selectedId || !selectedAgent || !window.confirm(`Delete ${selectedAgent.name}?`)) return;
    try {
      await deepgramAgentsApi.remove(selectedId);
      setSelectedId(null);
      setDraft(newDraft());
      await refresh();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Agent delete nahi ho saka.');
    }
  };

  const set = <K extends keyof DeepgramAgentDraft>(key: K, value: DeepgramAgentDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="max-w-[1500px] mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Deepgram AI Agents</h1>
          <p className="mt-1 text-sm text-slate-500">Inbound test agent aur browser preview</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-2 px-3 h-9 rounded-md text-sm font-medium ${status?.deepgramConfigured ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
            <span className={`w-2 h-2 rounded-full ${status?.deepgramConfigured ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            {status?.deepgramConfigured ? 'Deepgram ready' : 'Deepgram not ready'}
          </span>
          <button onClick={createNew} className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-800">
            <Plus size={16} /> New agent
          </button>
        </div>
      </div>

      {error && <div className="border border-rose-200 bg-rose-50 text-rose-700 rounded-md px-4 py-3 text-sm">{error}</div>}
      {status && !status.outboundEnabled && <div className="border border-sky-200 bg-sky-50 text-sky-800 rounded-md px-4 py-3 text-sm">AI outbound calling server policy se band hai.</div>}

      {loading ? (
        <div className="min-h-[360px] flex items-center justify-center text-slate-500"><Loader2 className="animate-spin mr-2" size={18} /> Loading agents</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[270px_minmax(0,1fr)_360px] gap-5 items-start">
          <aside className="border border-slate-200 bg-white rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 text-xs uppercase text-slate-500 font-semibold">Agents</div>
            <div className="p-2 space-y-1">
              {agents.length === 0 ? (
                <div className="p-4 text-sm text-slate-500">Abhi koi agent nahi bana.</div>
              ) : agents.map((agent) => (
                <button key={agent.id} onClick={() => selectAgent(agent)} className={`w-full text-left px-3 py-3 rounded-md border transition-colors ${agent.id === selectedId ? 'border-sky-300 bg-sky-50' : 'border-transparent hover:bg-slate-50'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-800 truncate">{agent.name}</span>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${agent.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  </div>
                  <div className="mt-1 text-xs text-slate-500 truncate">{agent.mode === 'inbound' ? agent.assignedPhoneNumber || 'Number required' : 'Browser preview'}</div>
                </button>
              ))}
            </div>
          </aside>

          <section className="border border-slate-200 bg-white rounded-lg">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-slate-900 font-semibold"><Bot size={18} /> {selectedId ? 'Edit agent' : 'New agent'}</div>
              {selectedId && <button onClick={() => void remove()} title="Delete agent" className="h-9 w-9 inline-flex items-center justify-center text-rose-600 border border-rose-200 rounded-md hover:bg-rose-50"><Trash2 size={16} /></button>}
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block text-sm text-slate-700">Name
                <input value={draft.name} onChange={(event) => set('name', event.target.value)} className="mt-1 w-full h-10 px-3 border border-slate-300 rounded-md text-sm" />
              </label>
              <label className="block text-sm text-slate-700">Mode
                <select value={draft.mode} onChange={(event) => set('mode', event.target.value as DeepgramAgentDraft['mode'])} className="mt-1 w-full h-10 px-3 border border-slate-300 rounded-md text-sm bg-white">
                  <option value="inbound">SignalWire inbound test</option>
                  <option value="browser_preview">Browser preview</option>
                </select>
              </label>
              {draft.mode === 'inbound' && <label className="block text-sm text-slate-700">SignalWire inbound number
                <input value={draft.assignedPhoneNumber || ''} onChange={(event) => set('assignedPhoneNumber', event.target.value || null)} placeholder="+12032047415" className="mt-1 w-full h-10 px-3 border border-slate-300 rounded-md text-sm" />
              </label>}
              <label className="block text-sm text-slate-700">Voice
                <select value={draft.voice} onChange={(event) => set('voice', event.target.value)} className="mt-1 w-full h-10 px-3 border border-slate-300 rounded-md text-sm bg-white">
                  <option value="aura-2-thalia-en">Aura Thalia</option>
                  <option value="aura-2-asteria-en">Aura Asteria</option>
                </select>
              </label>
              <label className="block text-sm text-slate-700">Maximum call seconds
                <input type="number" min="60" max="600" value={draft.maxCallDurationSec} onChange={(event) => set('maxCallDurationSec', Number(event.target.value))} className="mt-1 w-full h-10 px-3 border border-slate-300 rounded-md text-sm" />
              </label>
              <label className="inline-flex items-center gap-2 h-10 mt-6 text-sm text-slate-700"><input type="checkbox" checked={draft.isActive} onChange={(event) => set('isActive', event.target.checked)} /> Active</label>
              <label className="block text-sm text-slate-700 md:col-span-2">Greeting
                <input value={draft.greeting} onChange={(event) => set('greeting', event.target.value)} className="mt-1 w-full h-10 px-3 border border-slate-300 rounded-md text-sm" />
              </label>
              <label className="block text-sm text-slate-700 md:col-span-2">Agent prompt
                <textarea value={draft.prompt} onChange={(event) => set('prompt', event.target.value)} rows={12} className="mt-1 w-full p-3 border border-slate-300 rounded-md text-sm leading-6 resize-y" />
              </label>
            </div>
            <div className="px-5 py-4 border-t border-slate-100 flex justify-end">
              <button onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-sky-700 text-white text-sm font-medium disabled:opacity-60 hover:bg-sky-800">
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Save agent
              </button>
            </div>
          </section>

          {selectedAgent ? <DeepgramBrowserPreview key={selectedAgent.id} agent={selectedAgent} /> : (
            <section className="border border-dashed border-slate-300 bg-slate-50 rounded-lg min-h-[520px] p-5 text-sm text-slate-500">Agent save karne ke baad browser preview yahan ayega.</section>
          )}
        </div>
      )}

      <section className="border border-slate-200 bg-white rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Inbound Sessions</h2>
          <span className="text-xs text-slate-500">Latest {sessions.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr><th className="px-5 py-3 font-medium">Agent</th><th className="px-5 py-3 font-medium">Started</th><th className="px-5 py-3 font-medium">State</th><th className="px-5 py-3 font-medium">Duration</th><th className="px-5 py-3 font-medium">Outcome</th><th className="px-5 py-3 font-medium">Error</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessions.length === 0 ? <tr><td colSpan={6} className="px-5 py-8 text-slate-500">Abhi inbound session nahi hai.</td></tr> : sessions.map((session) => (
                <tr key={session.id} className="text-slate-700"><td className="px-5 py-3 font-medium">{session.agent_name || '-'}</td><td className="px-5 py-3 whitespace-nowrap">{formatTime(session.started_at)}</td><td className="px-5 py-3">{session.call_state || '-'}</td><td className="px-5 py-3">{session.duration_sec ?? 0}s</td><td className="px-5 py-3">{session.outcome || session.hangup_reason || '-'}</td><td className="px-5 py-3 max-w-[280px] truncate text-rose-700">{session.last_error || '-'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
