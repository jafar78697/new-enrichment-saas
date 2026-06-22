import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  leadsApi, Lead, PIPELINE_STAGES, STAGE_LABELS, STAGE_COLORS, Stage,
} from '../services/crmApi';

// Kanban-style pipeline. Columns = stages. Cards are drag-and-drop
// using native HTML5 drag events (no extra lib required).
export default function PipelinePage() {
  const nav = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await leadsApi.list({ limit: 500, q: q || undefined });
      setLeads(res.leads);
      setErr('');
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const moveStage = async (lead: Lead, toStage: Stage) => {
    if (lead.lead_stage === toStage) return;
    // optimistic update
    setLeads((cur) => cur.map((l) => (l.id === lead.id ? { ...l, lead_stage: toStage } : l)));
    try {
      await leadsApi.patch(lead.id, { lead_stage: toStage });
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Failed to update lead');
      void load();
    }
  };

  const assignToAi = async (e: React.MouseEvent, lead: Lead) => {
    e.stopPropagation();
    // optimistic update
    setLeads((cur) => cur.filter((l) => l.id !== lead.id));
    try {
      await leadsApi.patch(lead.id, { assigned_to_ai: true });
    } catch (err: any) {
      setErr(err?.response?.data?.error || 'Failed to assign to AI');
      void load();
    }
  };

  return (
    <div style={{ fontFamily: 'Manrope, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#14202B', margin: 0 }}>Pipeline</h1>
          <p style={{ fontSize: 13, color: '#52606D', margin: '4px 0 0' }}>
            Drag leads between stages · {leads.length} leads
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void load(); }}
            placeholder="Search domain / company / email"
            style={{ width: 300, padding: '8px 10px', border: '1px solid #D8E1D7', borderRadius: 8, fontSize: 13, background: '#fff' }}
          />
          <button
            onClick={() => void load()}
            style={{ padding: '8px 14px', background: '#0F766E', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Refresh
          </button>
        </div>
      </div>

      {err && (
        <div style={{ padding: 12, marginBottom: 12, background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: 8, fontSize: 13 }}>
          {err}
        </div>
      )}
      {loading && <div style={{ padding: 20, color: '#7B8794' }}>Loading pipeline…</div>}

      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 16 }}>
        {PIPELINE_STAGES.map((stage) => {
          const stageLeads = byStage[stage];
          return (
            <div
              key={stage}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                const lead = leads.find((l) => l.id === draggingId);
                setDraggingId(null);
                if (lead) void moveStage(lead, stage);
              }}
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
                    draggable
                    onDragStart={() => setDraggingId(lead.id)}
                    onDragEnd={() => setDraggingId(null)}
                    onClick={() => nav(`/pipeline/${lead.id}`)}
                    style={{
                      background: '#F8FAF7',
                      border: '1px solid #D8E1D7',
                      borderRadius: 8,
                      padding: '8px 10px',
                      cursor: 'grab',
                      opacity: draggingId === lead.id ? 0.5 : 1,
                      transition: 'opacity 0.1s',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#14202B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lead.company_name || lead.domain}
                    </div>
                    <div style={{ fontSize: 10, color: '#7B8794', fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                      {lead.domain}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {lead.primary_email && <Pill color="#059669">email</Pill>}
                        {lead.primary_phone && <Pill color="#0369a1">phone</Pill>}
                        {lead.linkedin_url && <Pill color="#0a66c2">in</Pill>}
                        {lead.ai_score != null && <Pill color="#7c3aed">AI {lead.ai_score}</Pill>}
                      </div>
                      {!lead.assigned_to_ai && (
                        <button 
                          onClick={(e) => assignToAi(e, lead)}
                          style={{ background: '#F59E0B', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
                        >
                          + AI
                        </button>
                      )}
                    </div>
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
