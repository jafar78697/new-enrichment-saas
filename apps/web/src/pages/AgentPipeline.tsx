import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  leadsApi, Lead, PIPELINE_STAGES, STAGE_LABELS, STAGE_COLORS, Stage,
} from '../services/crmApi';
import { nichesApi, type Niche } from '../services/nichesApi';
import LiveCallMonitor from '../components/LiveCallMonitor';
import BrowserAgentTester from '../components/BrowserAgentTester';

export default function AgentPipelinePage() {
  const nav = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [activeCallsMap, setActiveCallsMap] = useState<Record<string, string>>({});
  const [listenCallSid, setListenCallSid] = useState<string | null>(null);
  const [isTestingBrowser, setIsTestingBrowser] = useState(false);
  const [niches, setNiches] = useState<Niche[]>([]);
  const [selectedNicheId, setSelectedNicheId] = useState('');
  const [queueStatus, setQueueStatus] = useState('');
  const [queueing, setQueueing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await leadsApi.list({ limit: 500, q: q || undefined, assigned_to_ai: true });
      setLeads(res.leads);
      const activeRes = await leadsApi.activeCalls();
      setActiveCallsMap(activeRes.activeCalls);
      setErr('');
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || 'Failed to load AI agent leads');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    nichesApi.list()
      .then((res) => setNiches(res.niches || []))
      .catch(() => setNiches([]));
  }, []);

  // Auto-refresh every 10 seconds to show live updates from the AI agent
  useEffect(() => {
    const interval = setInterval(() => { void load(); }, 10000);
    return () => clearInterval(interval);
  }, [q]);

  const byStage = useMemo(() => {
    const map: Record<Stage, Lead[]> = Object.fromEntries(
      PIPELINE_STAGES.map((s) => [s, []]),
    ) as Record<Stage, Lead[]>;
    for (const l of leads) {
      const key = (PIPELINE_STAGES.includes(l.lead_stage) ? l.lead_stage : 'new') as Stage;
      map[key].push(l);
    }
    return map;
  }, [leads]);

  const queueSelectedNiche = async () => {
    if (!selectedNicheId) return;
    setQueueing(true);
    setQueueStatus('');
    try {
      const res = await leadsApi.queueAi({ niche_id: Number(selectedNicheId), limit: 100 });
      setQueueStatus(`Queued ${res.totalQueued} lead${res.totalQueued === 1 ? '' : 's'} for AI calling`);
      await load();
    } catch (e: any) {
      setQueueStatus(e?.response?.data?.error || e?.message || 'Failed to queue niche');
    } finally {
      setQueueing(false);
    }
  };

  return (
    <div style={{ fontFamily: 'Manrope, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#14202B', margin: 0 }}>🤖 AI Agent Pipeline</h1>
          <p style={{ fontSize: 13, color: '#52606D', margin: '4px 0 0' }}>
            Live view of leads being processed by the AI Agent · {leads.length} leads total
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            value={selectedNicheId}
            onChange={(e) => setSelectedNicheId(e.target.value)}
            style={{ width: 220, padding: '8px 10px', border: '1px solid #D8E1D7', borderRadius: 8, fontSize: 13, background: '#fff' }}
          >
            <option value="">Select niche...</option>
            {niches.map((niche) => (
              <option key={niche.id} value={niche.id}>
                {niche.name} ({niche.contact_count || 0})
              </option>
            ))}
          </select>
          <button
            onClick={queueSelectedNiche}
            disabled={!selectedNicheId || queueing}
            style={{
              padding: '8px 14px',
              background: !selectedNicheId || queueing ? '#94A3B8' : '#0F766E',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: !selectedNicheId || queueing ? 'not-allowed' : 'pointer',
            }}
          >
            {queueing ? 'Queueing...' : 'Queue Niche'}
          </button>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void load(); }}
            placeholder="Search domain / company / email"
            style={{ width: 300, padding: '8px 10px', border: '1px solid #D8E1D7', borderRadius: 8, fontSize: 13, background: '#fff' }}
          />
          <button
            onClick={() => setIsTestingBrowser(true)}
            style={{ padding: '8px 14px', background: '#3B82F6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            🎙️ Test in Browser
          </button>
          <button
            onClick={() => void load()}
            style={{ padding: '8px 14px', background: '#0F766E', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Refresh
          </button>
        </div>
      </div>

      {listenCallSid && (
        <LiveCallMonitor callSid={listenCallSid} onClose={() => setListenCallSid(null)} />
      )}

      {isTestingBrowser && (
        <BrowserAgentTester onClose={() => setIsTestingBrowser(false)} />
      )}

      {err && (
        <div style={{ padding: 12, marginBottom: 12, background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: 8, fontSize: 13 }}>
          {err}
        </div>
      )}
      {queueStatus && (
        <div style={{ padding: 10, marginBottom: 12, background: queueStatus.startsWith('Failed') ? '#FEE2E2' : '#ECFDF5', border: `1px solid ${queueStatus.startsWith('Failed') ? '#FCA5A5' : '#A7F3D0'}`, color: queueStatus.startsWith('Failed') ? '#991B1B' : '#047857', borderRadius: 8, fontSize: 13 }}>
          {queueStatus}
        </div>
      )}
      {loading && <div style={{ padding: 20, color: '#7B8794' }}>Loading AI pipeline…</div>}

      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 16 }}>
        {PIPELINE_STAGES.map((stage) => {
          const stageLeads = byStage[stage];
          return (
            <div
              key={stage}
              style={{
                minWidth: 260,
                maxWidth: 260,
                background: '#fff',
                border: '1px solid #D8E1D7',
                borderRadius: 10,
                padding: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', background: STAGE_COLORS[stage],
                  }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#14202B', letterSpacing: 0.3 }}>
                    {STAGE_LABELS[stage].toUpperCase()}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: '#7B8794', fontWeight: 600 }}>{stageLeads.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}>
                {stageLeads.length === 0 && (
                  <div style={{ fontSize: 11, color: '#B0BEC5', textAlign: 'center', padding: 8 }}>Empty</div>
                )}
                {stageLeads.map((lead) => (
                  <div
                    key={lead.id}
                    onClick={() => nav(`/pipeline/${lead.id}`)}
                    style={{
                      background: stage === 'calling' ? '#FEF3C7' : '#F8FAF7',
                      border: stage === 'calling' ? '1px solid #F59E0B' : '1px solid #D8E1D7',
                      borderRadius: 8,
                      padding: '8px 10px',
                      cursor: 'pointer',
                      transition: 'all 0.3s',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#14202B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lead.company_name || lead.domain}
                    </div>
                    <div style={{ fontSize: 10, color: '#7B8794', fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                      {lead.domain}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      {lead.primary_phone && <Pill color="#0369a1">{lead.primary_phone}</Pill>}
                      {stage === 'calling' && <Pill color="#D97706">Calling...</Pill>}
                    </div>
                    {stage === 'calling' && activeCallsMap[lead.id] && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setListenCallSid(activeCallsMap[lead.id]); }}
                        style={{
                          marginTop: 8, width: '100%', padding: '6px', background: '#EF4444', 
                          color: 'white', border: 'none', borderRadius: 6, fontSize: 11, 
                          fontWeight: 'bold', cursor: 'pointer', display: 'flex', 
                          alignItems: 'center', justifyContent: 'center', gap: 4
                        }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'white' }} />
                        Listen Live
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{
      fontSize: 9,
      fontWeight: 700,
      padding: '2px 6px',
      borderRadius: 999,
      background: color + '22',
      color,
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    }}>{children}</span>
  );
}
