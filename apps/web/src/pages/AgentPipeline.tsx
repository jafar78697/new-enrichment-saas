import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  leadsApi, Lead, PIPELINE_STAGES, STAGE_LABELS, STAGE_COLORS, Stage,
} from '../services/crmApi';
import { nichesApi, type Niche } from '../services/nichesApi';
import { callsApi, type Contact } from '../services/callsApi';
import { Headphones, Mic, RefreshCw, UserPlus, Users } from 'lucide-react';
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
  const [nicheContacts, setNicheContacts] = useState<Contact[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<number[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);

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

  useEffect(() => {
    setSelectedContactIds([]);
    if (!selectedNicheId) {
      setNicheContacts([]);
      return;
    }
    setContactsLoading(true);
    callsApi.listContactsByNiche(Number(selectedNicheId))
      .then((res) => setNicheContacts(res.contacts || []))
      .catch((e: any) => setErr(e?.message || 'Failed to load niche leads'))
      .finally(() => setContactsLoading(false));
  }, [selectedNicheId]);

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

  const assignedContactIds = useMemo(() => new Set(
    leads
      .map((lead) => Number(lead.raw_data?.source_contact_id))
      .filter((id) => Number.isInteger(id) && id > 0),
  ), [leads]);

  const availableContacts = useMemo(
    () => nicheContacts.filter((contact) => contact.phone_number && !assignedContactIds.has(contact.id)),
    [nicheContacts, assignedContactIds],
  );

  const assignedNicheLeads = useMemo(
    () => leads.filter((lead) => String(lead.raw_data?.niche_id || '') === selectedNicheId),
    [leads, selectedNicheId],
  );

  const queueContacts = async (contactIds: number[]) => {
    if (!selectedNicheId || !contactIds.length) return;
    setQueueing(true);
    setQueueStatus('');
    try {
      const res = await leadsApi.queueAi({
        niche_id: Number(selectedNicheId),
        contact_ids: contactIds,
        limit: contactIds.length,
      });
      setQueueStatus(`Queued ${res.totalQueued} lead${res.totalQueued === 1 ? '' : 's'} for AI calling`);
      setSelectedContactIds([]);
      await load();
    } catch (e: any) {
      setQueueStatus(e?.response?.data?.error || e?.message || 'Failed to queue niche');
    } finally {
      setQueueing(false);
    }
  };

  const toggleContact = (id: number) => {
    setSelectedContactIds((current) => current.includes(id)
      ? current.filter((contactId) => contactId !== id)
      : [...current, id]);
  };

  return (
    <div style={{ fontFamily: 'Manrope, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#14202B', margin: 0 }}>AI Agent Pipeline</h1>
          <p style={{ fontSize: 13, color: '#52606D', margin: '4px 0 0' }}>
            {leads.length} assigned leads
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={selectedNicheId}
            onChange={(e) => setSelectedNicheId(e.target.value)}
            aria-label="Select niche"
            style={{ width: 230, padding: '8px 10px', border: '1px solid #D8E1D7', borderRadius: 8, fontSize: 13, background: '#fff' }}
          >
            <option value="">Choose a niche</option>
            {niches.map((niche) => (
              <option key={niche.id} value={niche.id}>
                {niche.name} ({niche.contact_count || 0})
              </option>
            ))}
          </select>
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
            <Mic size={15} /> Test in Browser
          </button>
          <button
            onClick={() => void load()}
            title="Refresh"
            style={{ width: 36, height: 36, display: 'grid', placeItems: 'center', background: '#0F766E', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            <RefreshCw size={16} />
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

      <section style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={17} color="#0F766E" />
            <h2 style={{ margin: 0, fontSize: 16, color: '#14202B' }}>Available Leads</h2>
            <span style={{ fontSize: 12, color: '#64748B' }}>{selectedNicheId ? availableContacts.length : 0}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => setSelectedContactIds(
                selectedContactIds.length === availableContacts.length
                  ? []
                  : availableContacts.map((contact) => contact.id),
              )}
              disabled={!availableContacts.length}
              style={{ padding: '7px 11px', border: '1px solid #CBD5E1', background: '#fff', color: '#334155', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: availableContacts.length ? 'pointer' : 'not-allowed' }}
            >
              {selectedContactIds.length === availableContacts.length && availableContacts.length ? 'Clear selection' : 'Select all'}
            </button>
            <button
              onClick={() => void queueContacts(selectedContactIds)}
              disabled={!selectedContactIds.length || queueing}
              style={{ padding: '7px 12px', border: 'none', background: selectedContactIds.length && !queueing ? '#0F766E' : '#94A3B8', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: selectedContactIds.length && !queueing ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <UserPlus size={14} /> {queueing ? 'Assigning...' : `Assign Selected (${selectedContactIds.length})`}
            </button>
            <button
              onClick={() => void queueContacts(availableContacts.map((contact) => contact.id))}
              disabled={!availableContacts.length || queueing}
              style={{ padding: '7px 12px', border: '1px solid #0F766E', background: '#fff', color: '#0F766E', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: availableContacts.length && !queueing ? 'pointer' : 'not-allowed' }}
            >
              Assign All
            </button>
          </div>
        </div>

        <div style={{ border: '1px solid #D8E1D7', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
          {!selectedNicheId ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#64748B', fontSize: 13 }}>Choose a niche</div>
          ) : contactsLoading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#64748B', fontSize: 13 }}>Loading leads...</div>
          ) : availableContacts.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#64748B', fontSize: 13 }}>No available leads</div>
          ) : (
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {availableContacts.map((contact) => (
                <label key={contact.id} style={{ minHeight: 52, padding: '9px 12px', display: 'grid', gridTemplateColumns: '24px minmax(160px, 1.4fr) minmax(130px, 1fr) minmax(120px, 0.8fr)', gap: 10, alignItems: 'center', borderBottom: '1px solid #EEF2F0', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedContactIds.includes(contact.id)}
                    onChange={() => toggleContact(contact.id)}
                    style={{ width: 16, height: 16, accentColor: '#0F766E' }}
                  />
                  <span style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block', fontSize: 13, color: '#14202B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.company || contact.name}</strong>
                    <span style={{ display: 'block', fontSize: 11, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.name}</span>
                  </span>
                  <span style={{ fontSize: 12, color: '#334155' }}>{contact.phone_number}</span>
                  <span style={{ fontSize: 11, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.email || 'No email'}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <UserPlus size={17} color="#6366F1" />
          <h2 style={{ margin: 0, fontSize: 16, color: '#14202B' }}>Assigned Leads</h2>
          <span style={{ fontSize: 12, color: '#64748B' }}>{selectedNicheId ? assignedNicheLeads.length : leads.length}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
          {(selectedNicheId ? assignedNicheLeads : leads).length === 0 ? (
            <div style={{ gridColumn: '1 / -1', padding: 22, border: '1px solid #D8E1D7', borderRadius: 8, background: '#fff', textAlign: 'center', color: '#64748B', fontSize: 13 }}>No assigned leads</div>
          ) : (selectedNicheId ? assignedNicheLeads : leads).map((lead) => (
            <div key={lead.id} style={{ padding: 11, border: lead.lead_stage === 'calling' ? '1px solid #F59E0B' : '1px solid #D8E1D7', borderRadius: 8, background: lead.lead_stage === 'calling' ? '#FFFBEB' : '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong style={{ fontSize: 13, color: '#14202B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.company_name || lead.domain}</strong>
                <Pill color={STAGE_COLORS[lead.lead_stage] || '#64748B'}>{STAGE_LABELS[lead.lead_stage] || lead.lead_stage}</Pill>
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: '#475569' }}>{lead.primary_phone || 'No phone'}</div>
              {lead.lead_stage === 'calling' && activeCallsMap[lead.id] && (
                <button
                  onClick={() => setListenCallSid(activeCallsMap[lead.id])}
                  style={{ marginTop: 9, width: '100%', padding: '7px 9px', border: 'none', borderRadius: 7, background: '#DC2626', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <Headphones size={14} /> Listen Live
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {loading && <div style={{ padding: 20, color: '#7B8794' }}>Loading AI pipeline…</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Headphones size={17} color="#D97706" />
        <h2 style={{ margin: 0, fontSize: 16, color: '#14202B' }}>Call Progress</h2>
      </div>
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
