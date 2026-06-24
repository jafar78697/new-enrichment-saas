import { useEffect, useMemo, useState } from 'react';
import { Bot, Headphones, Mic, Phone, PhoneCall, RefreshCw, Search, UserPlus } from 'lucide-react';
import { leadsApi, type Lead, STAGE_COLORS, STAGE_LABELS, type Stage } from '../services/crmApi';
import { nichesApi, type Niche } from '../services/nichesApi';
import { callsApi, type Contact } from '../services/callsApi';
import LiveCallMonitor from '../components/LiveCallMonitor';
import BrowserAgentTester from '../components/BrowserAgentTester';

const AGENT_TABS = [
  { key: 'leads', label: 'Leads' },
  { key: 'assigned', label: 'Assigned Leads' },
  { key: 'calling', label: 'Calling' },
  { key: 'called', label: 'Called' },
  { key: 'no_answer', label: 'No Answer' },
  { key: 'followup', label: 'Follow-up' },
  { key: 'interested', label: 'Interested' },
  { key: 'proposal_sent', label: 'Proposal Sent' },
  { key: 'closed_won', label: 'Closed Won' },
  { key: 'closed_lost', label: 'Closed Lost' },
] as const;

type AgentTab = (typeof AGENT_TABS)[number]['key'];

function getMeetingTime(lead: Lead) {
  const meeting = lead.raw_data?.meeting;
  if (!meeting || typeof meeting !== 'object') return null;
  const value = (meeting as Record<string, unknown>).meeting_time;
  return typeof value === 'string' ? value : null;
}

function getCallSidFromMessage(text: string) {
  const match = text.match(/CA[a-f0-9]{32}/i);
  return match?.[0] || null;
}

function getLeadActiveCallSid(lead: Lead) {
  const value = lead.raw_data?.active_call_sid;
  return typeof value === 'string' && value.startsWith('CA') ? value : null;
}

export default function AgentPipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [niches, setNiches] = useState<Niche[]>([]);
  const [nicheContacts, setNicheContacts] = useState<Contact[]>([]);
  const [selectedNicheId, setSelectedNicheId] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<number[]>([]);
  const [activeTab, setActiveTab] = useState<AgentTab>('leads');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [activeCallsMap, setActiveCallsMap] = useState<Record<string, string>>({});
  const [listenCallSid, setListenCallSid] = useState<string | null>(null);
  const [isTestingBrowser, setIsTestingBrowser] = useState(false);
  const [callingLeadId, setCallingLeadId] = useState<string | null>(null);

  const loadPipeline = async () => {
    try {
      const [leadResult, activeResult] = await Promise.all([
        leadsApi.list({ limit: 500, assigned_to_ai: true }),
        leadsApi.activeCalls(),
      ]);
      setLeads(leadResult.leads || []);
      setActiveCallsMap(activeResult.activeCalls || {});
      setError('');
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load AI agent pipeline');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPipeline();
    nichesApi.list().then((res) => setNiches(res.niches || [])).catch(() => setNiches([]));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => void loadPipeline(), 10000);
    return () => window.clearInterval(timer);
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
      .catch((e: any) => setError(e?.message || 'Failed to load niche leads'))
      .finally(() => setContactsLoading(false));
  }, [selectedNicheId]);

  const assignedContactIds = useMemo(() => new Set(
    leads
      .map((lead) => Number(lead.raw_data?.source_contact_id))
      .filter((id) => Number.isInteger(id) && id > 0),
  ), [leads]);

  const availableContacts = useMemo(() => {
    const term = q.trim().toLowerCase();
    return nicheContacts.filter((contact) => {
      if (!contact.phone_number || assignedContactIds.has(contact.id)) return false;
      if (!term) return true;
      return [contact.name, contact.company, contact.email, contact.phone_number]
        .some((value) => value?.toLowerCase().includes(term));
    });
  }, [nicheContacts, assignedContactIds, q]);

  const visibleLeads = useMemo(() => {
    const term = q.trim().toLowerCase();
    return leads.filter((lead) => {
      if (lead.lead_stage !== activeTab) return false;
      if (selectedNicheId && String(lead.raw_data?.niche_id || '') !== selectedNicheId) return false;
      if (!term) return true;
      return [lead.company_name, lead.domain, lead.primary_email, lead.primary_phone]
        .some((value) => value?.toLowerCase().includes(term));
    });
  }, [leads, activeTab, selectedNicheId, q]);

  const tabCount = (tab: AgentTab) => {
    if (tab === 'leads') return availableContacts.length;
    return leads.filter((lead) => (
      lead.lead_stage === tab
      && (!selectedNicheId || String(lead.raw_data?.niche_id || '') === selectedNicheId)
    )).length;
  };

  const queueContacts = async (contactIds: number[]) => {
    if (!selectedNicheId || !contactIds.length) return;
    setQueueing(true);
    setMessage('');
    try {
      const result = await leadsApi.queueAi({
        niche_id: Number(selectedNicheId),
        contact_ids: contactIds,
        limit: contactIds.length,
      });
      setMessage(`${result.totalQueued} lead${result.totalQueued === 1 ? '' : 's'} assigned to AI`);
      setSelectedContactIds([]);
      await loadPipeline();
      const contacts = await callsApi.listContactsByNiche(Number(selectedNicheId));
      setNicheContacts(contacts.contacts || []);
      setActiveTab('assigned');
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to assign leads');
    } finally {
      setQueueing(false);
    }
  };

  const toggleContact = (id: number) => {
    setSelectedContactIds((current) => current.includes(id)
      ? current.filter((contactId) => contactId !== id)
      : [...current, id]);
  };

  const handleStartCall = async (leadId: string) => {
    setCallingLeadId(leadId);
    setMessage('');
    setError('');
    try {
      const result = await leadsApi.startCall(leadId);
      setMessage(`✅ Call started! SID: ${result.callSid}`);
      await loadPipeline();
      setActiveTab('calling');
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to start call');
    } finally {
      setCallingLeadId(null);
    }
  };

  const handleListenLead = async (lead: Lead, currentCallSid: string | null) => {
    setError('');
    if (currentCallSid) {
      setListenCallSid(currentCallSid);
      return;
    }

    try {
      const activeResult = await leadsApi.activeCalls();
      const freshMap = activeResult.activeCalls || {};
      setActiveCallsMap(freshMap);
      const freshCallSid = freshMap[lead.id] || Object.values(freshMap)[0];
      if (freshCallSid) {
        setListenCallSid(freshCallSid);
        return;
      }
      setError('Live call SID abhi load nahi hua. Refresh dabao ya 5 seconds baad Listen Live dobara click karo.');
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Live call info load nahi ho saki');
    }
  };

  const stats = useMemo(() => ({
    total: leads.length,
    calling: leads.filter((lead) => lead.lead_stage === 'calling').length,
    interested: leads.filter((lead) => lead.lead_stage === 'interested').length,
    won: leads.filter((lead) => lead.lead_stage === 'closed_won').length,
  }), [leads]);

  const latestStartedCallSid = useMemo(() => getCallSidFromMessage(message), [message]);
  const fallbackCallSid = latestStartedCallSid || Object.values(activeCallsMap)[0] || null;

  return (
    <div style={{ fontFamily: 'Manrope, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0, fontSize: 27, color: '#14202B' }}>
            <Bot size={27} color="#0F766E" /> AI Agent Pipeline
          </h1>
          <p style={{ margin: '5px 0 0', color: '#52606D', fontSize: 14 }}>Automated calling pipeline</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <select
            value={selectedNicheId}
            onChange={(event) => setSelectedNicheId(event.target.value)}
            aria-label="Select niche"
            style={{ width: 235, height: 40, padding: '0 11px', border: '1px solid #D8E1D7', borderRadius: 8, background: '#fff', color: '#14202B', fontSize: 13 }}
          >
            <option value="">All niches</option>
            {niches.map((niche) => (
              <option key={niche.id} value={niche.id}>{niche.name} ({niche.contact_count || 0})</option>
            ))}
          </select>
          <button onClick={() => setIsTestingBrowser(true)} style={actionButton('#2563EB')}>
            <Mic size={15} /> Test Agent
          </button>
          <button onClick={() => void loadPipeline()} title="Refresh" style={iconButton}>
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', gap: 14, marginBottom: 28 }}>
        <Stat label="Assigned Leads" value={stats.total} color="#14202B" background="#FFFFFF" />
        <Stat label="Active Calls" value={stats.calling} color="#1D4ED8" background="#EFF6FF" />
        <Stat label="Interested" value={stats.interested} color="#047857" background="#ECFDF5" />
        <Stat label="Closed Won" value={stats.won} color="#4D7C0F" background="#F7FEE7" />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <div style={{ position: 'relative', width: 300, maxWidth: '100%' }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: 12, color: '#94A3B8' }} />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search leads"
            style={{ width: '100%', height: 40, boxSizing: 'border-box', padding: '0 12px 0 34px', border: '1px solid #D8E1D7', borderRadius: 8, background: '#fff', fontSize: 13 }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 22, overflowX: 'auto', borderBottom: '1px solid #D8E1D7', marginBottom: 24 }}>
        {AGENT_TABS.map((tab) => {
          const selected = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{ flexShrink: 0, padding: '10px 0 11px', border: 0, borderBottom: selected ? '2px solid #0F766E' : '2px solid transparent', background: 'transparent', color: selected ? '#0F766E' : '#52606D', fontSize: 13, fontWeight: selected ? 700 : 600, cursor: 'pointer' }}
            >
              {tab.label} <span style={{ marginLeft: 4, color: selected ? '#0F766E' : '#94A3B8' }}>{tabCount(tab.key)}</span>
            </button>
          );
        })}
      </div>

      {listenCallSid && <LiveCallMonitor callSid={listenCallSid} onClose={() => setListenCallSid(null)} />}
      {isTestingBrowser && <BrowserAgentTester onClose={() => setIsTestingBrowser(false)} />}
      {error && <Alert text={error} danger />}
      {message && (
        <Alert
          text={message}
          action={latestStartedCallSid ? (
            <button onClick={() => setListenCallSid(latestStartedCallSid)} style={alertListenButton}>
              <Headphones size={15} /> Listen Live
            </button>
          ) : null}
        />
      )}

      {activeTab === 'leads' ? (
        <AvailableLeadList
          selectedNicheId={selectedNicheId}
          contacts={availableContacts}
          loading={contactsLoading}
          selectedIds={selectedContactIds}
          queueing={queueing}
          onToggle={toggleContact}
          onSelectAll={() => setSelectedContactIds(
            selectedContactIds.length === availableContacts.length ? [] : availableContacts.map((contact) => contact.id),
          )}
          onAssign={() => void queueContacts(selectedContactIds)}
          onAssignAll={() => void queueContacts(availableContacts.map((contact) => contact.id))}
        />
      ) : (
        <PipelineLeadList
          leads={visibleLeads}
          loading={loading}
          activeCallsMap={activeCallsMap}
          fallbackCallSid={fallbackCallSid}
          onListen={handleListenLead}
          callingLeadId={callingLeadId}
          onStartCall={handleStartCall}
        />
      )}
    </div>
  );
}

function AvailableLeadList({
  selectedNicheId,
  contacts,
  loading,
  selectedIds,
  queueing,
  onToggle,
  onSelectAll,
  onAssign,
  onAssignAll,
}: {
  selectedNicheId: string;
  contacts: Contact[];
  loading: boolean;
  selectedIds: number[];
  queueing: boolean;
  onToggle: (id: number) => void;
  onSelectAll: () => void;
  onAssign: () => void;
  onAssignAll: () => void;
}) {
  if (!selectedNicheId) return <Empty text="Select a niche to view leads" />;
  if (loading) return <Empty text="Loading leads..." />;
  if (!contacts.length) return <Empty text="No available leads in this niche" />;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={onSelectAll} style={secondaryButton}>
          {selectedIds.length === contacts.length ? 'Clear Selection' : 'Select All'}
        </button>
        <button disabled={!selectedIds.length || queueing} onClick={onAssign} style={actionButton(selectedIds.length && !queueing ? '#0F766E' : '#94A3B8')}>
          <UserPlus size={15} /> {queueing ? 'Assigning...' : `Assign Selected (${selectedIds.length})`}
        </button>
        <button disabled={queueing} onClick={onAssignAll} style={secondaryButton}>Assign All</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 900, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {contacts.map((contact) => (
            <label key={contact.id} style={leadRow(false)}>
            <input type="checkbox" checked={selectedIds.includes(contact.id)} onChange={() => onToggle(contact.id)} style={{ width: 18, height: 18, accentColor: '#0F766E', cursor: 'pointer' }} />
            <LeadIdentity name={contact.company || contact.name} niche={contact.niche_name} detail={contact.name} />
            <Score value={contact.score || 0} />
            <PhoneValue value={contact.phone_number} />
            <span style={mutedText}>{contact.email || 'No email'}</span>
            <span style={{ ...badge('#0F766E'), justifySelf: 'end' }}>Ready</span>
            </label>
          ))}
        </div>
      </div>
    </>
  );
}

function PipelineLeadList({
  leads,
  loading,
  activeCallsMap,
  fallbackCallSid,
  onListen,
  callingLeadId,
  onStartCall,
}: {
  leads: Lead[];
  loading: boolean;
  activeCallsMap: Record<string, string>;
  fallbackCallSid: string | null;
  onListen: (lead: Lead, callSid: string | null) => void;
  callingLeadId: string | null;
  onStartCall: (leadId: string) => void;
}) {
  if (loading) return <Empty text="Loading pipeline..." />;
  if (!leads.length) return <Empty text="No leads in this stage" />;

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 900, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {leads.map((lead) => {
          const liveCallSid = activeCallsMap[lead.id] || getLeadActiveCallSid(lead) || (lead.lead_stage === 'calling' ? fallbackCallSid : null);
          return (
          <div key={lead.id} style={leadRow(lead.lead_stage === 'calling')}>
          <LeadIdentity name={lead.company_name || lead.domain} niche={lead.raw_data?.niche_name || lead.industry_guess} detail={lead.primary_email || lead.domain} />
          <Score value={lead.ai_score || 0} />
          <PhoneValue value={lead.primary_phone || 'No phone'} />
          <span style={{ ...badge(STAGE_COLORS[lead.lead_stage]), justifySelf: 'start' }}>{STAGE_LABELS[lead.lead_stage]}</span>
          <span style={{ ...mutedText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {getMeetingTime(lead)
              ? `Meeting: ${new Date(getMeetingTime(lead) as string).toLocaleString()}`
              : lead.ai_summary || lead.lead_notes || 'No notes yet'}
          </span>
          {lead.lead_stage === 'calling' ? (
            <button onClick={() => onListen(lead, liveCallSid)} style={{ ...actionButton('#DC2626'), justifySelf: 'end', minWidth: 122 }}>
              <Headphones size={15} /> Listen Live
            </button>
          ) : lead.lead_stage === 'assigned' ? (
            <button
              disabled={callingLeadId === lead.id}
              onClick={() => onStartCall(lead.id)}
              style={{
                ...actionButton(callingLeadId === lead.id ? '#94A3B8' : '#0F766E'),
                justifySelf: 'end',
                minWidth: 120,
                animation: callingLeadId === lead.id ? 'none' : undefined,
              }}
            >
              <PhoneCall size={15} />
              {callingLeadId === lead.id ? 'Calling...' : 'Start Call'}
            </button>
          ) : (
            <span style={{ ...badge(STAGE_COLORS[lead.lead_stage]), justifySelf: 'end' }}>{STAGE_LABELS[lead.lead_stage]}</span>
          )}
          </div>
        );
        })}
      </div>
    </div>
  );
}

function LeadIdentity({ name, niche, detail }: { name: string; niche?: string | null; detail?: string | null }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <strong style={{ color: '#14202B', fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</strong>
        {niche && <span style={badge('#7E22CE')}>{niche}</span>}
      </div>
      <div style={{ ...mutedText, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail || 'No details'}</div>
    </div>
  );
}

function Score({ value }: { value: number }) {
  return <span style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', borderRadius: '50%', background: '#FEF3C7', color: '#B45309', fontSize: 13, fontWeight: 800 }}>{value}</span>;
}

function PhoneValue({ value }: { value: string }) {
  return <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#14202B', fontSize: 13, fontWeight: 600 }}><Phone size={14} color="#0F766E" /> {value}</span>;
}

function Stat({ label, value, color, background }: { label: string; value: number; color: string; background: string }) {
  return (
    <div style={{ minHeight: 82, padding: '15px 18px', border: '1px solid #D8E1D7', borderRadius: 8, background }}>
      <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 23, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function Alert({ text, danger = false, action = null }: { text: string; danger?: boolean; action?: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, border: `1px solid ${danger ? '#FCA5A5' : '#A7F3D0'}`, borderRadius: 8, background: danger ? '#FEF2F2' : '#ECFDF5', color: danger ? '#991B1B' : '#047857', fontSize: 13 }}>
      <span>{text}</span>
      {action}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ padding: 42, border: '1px solid #D8E1D7', borderRadius: 8, background: '#fff', textAlign: 'center', color: '#64748B', fontSize: 13 }}>{text}</div>;
}

const mutedText: React.CSSProperties = { color: '#64748B', fontSize: 12 };

const leadRow = (calling: boolean): React.CSSProperties => ({
  minHeight: 74,
  padding: '12px 18px',
  display: 'grid',
  gridTemplateColumns: 'minmax(220px, 1.6fr) 48px minmax(150px, 0.8fr) minmax(105px, 0.65fr) minmax(170px, 1fr) auto',
  gap: 16,
  alignItems: 'center',
  border: calling ? '1px solid #F59E0B' : '1px solid #D8E1D7',
  borderRadius: 8,
  background: calling ? '#FFFBEB' : '#fff',
  boxShadow: '0 2px 4px rgba(15, 23, 42, 0.04)',
});

const badge = (color: string): React.CSSProperties => ({
  width: 'fit-content',
  padding: '3px 8px',
  borderRadius: 999,
  background: `${color}18`,
  color,
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
});

const actionButton = (background: string): React.CSSProperties => ({
  minHeight: 38,
  padding: '0 14px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  border: 0,
  borderRadius: 8,
  background,
  color: '#fff',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
});

const alertListenButton: React.CSSProperties = {
  minHeight: 32,
  padding: '0 12px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  border: 0,
  borderRadius: 8,
  background: '#DC2626',
  color: '#fff',
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const secondaryButton: React.CSSProperties = {
  minHeight: 38,
  padding: '0 13px',
  border: '1px solid #CBD5E1',
  borderRadius: 8,
  background: '#fff',
  color: '#334155',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};

const iconButton: React.CSSProperties = {
  width: 40,
  height: 40,
  display: 'grid',
  placeItems: 'center',
  border: 0,
  borderRadius: 8,
  background: '#0F766E',
  color: '#fff',
  cursor: 'pointer',
};
