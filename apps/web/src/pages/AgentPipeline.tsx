import { useEffect, useMemo, useState } from 'react';
import { Bot, Mic, Phone, PhoneCall, RefreshCw, Search, Square, UserPlus, Volume2 } from 'lucide-react';
import { leadsApi, type CallingQueueLead, type CallingStatusResponse, type Lead, STAGE_COLORS, STAGE_LABELS, type Stage } from '../services/crmApi';
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

function getRecordingUrl(lead: { id: string; raw_data?: Record<string, any> | null } | null) {
  const url = lead?.raw_data?.recording_url;
  const status = lead?.raw_data?.recording_status;
  return typeof url === 'string' && url && status === 'completed' ? `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/voice/recordings/${lead.id}/stream` : null;
}

function getRecordingStatus(lead: { raw_data?: Record<string, any> | null } | null) {
  const value = lead?.raw_data?.recording_status;
  return typeof value === 'string' && value ? value : null;
}

function formatDateTime(value?: string | null) {
  if (!value) return 'No time';
  return new Date(value).toLocaleString();
}

function formatCallClock(value?: string | null) {
  if (!value) return 'No call time';
  return new Date(value).toLocaleString();
}

function readNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function getCallStartedAt(lead: Pick<CallingQueueLead, 'last_contacted_at' | 'raw_data'> | Pick<Lead, 'last_contacted_at' | 'raw_data'> | null) {
  const rawStartedAt = lead?.raw_data?.call_started_at;
  return typeof rawStartedAt === 'string' && rawStartedAt ? rawStartedAt : lead?.last_contacted_at || null;
}

function getCallStatusText(lead: Pick<CallingQueueLead, 'lead_stage' | 'raw_data'> | Pick<Lead, 'lead_stage' | 'raw_data'> | null) {
  const status = lead?.raw_data?.call_status;
  if (typeof status === 'string' && status) return status;
  return lead ? STAGE_LABELS[lead.lead_stage] : 'No status';
}

function getCallDurationSeconds(lead: Pick<CallingQueueLead, 'last_contacted_at' | 'raw_data'> | Pick<Lead, 'last_contacted_at' | 'raw_data'> | null, live = false) {
  const stored = readNumber(lead?.raw_data?.call_duration_seconds);
  if (stored !== null && stored > 0) return Math.max(0, Math.round(stored));
  const startedAt = getCallStartedAt(lead);
  if (live && startedAt) {
    return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  }
  return stored ?? 0;
}

function formatDurationSeconds(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return '0s';
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

function formatCallTiming(lead: Pick<CallingQueueLead, 'last_contacted_at' | 'raw_data'> | Pick<Lead, 'last_contacted_at' | 'raw_data'> | null, live = false) {
  const startedAt = getCallStartedAt(lead);
  const duration = getCallDurationSeconds(lead, live);
  return `Call time: ${formatCallClock(startedAt)} | Duration: ${formatDurationSeconds(duration)}`;
}

function getLeadResultText(lead: Pick<CallingQueueLead, 'lead_stage' | 'lead_notes' | 'ai_summary'> | null) {
  if (!lead) return 'No result yet';
  if (lead.ai_summary) return lead.ai_summary;
  if (lead.lead_notes) return lead.lead_notes.split('\n').filter(Boolean).slice(-1)[0] || STAGE_LABELS[lead.lead_stage];
  return STAGE_LABELS[lead.lead_stage];
}

export default function AgentPipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [niches, setNiches] = useState<Niche[]>([]);
  const [nicheContacts, setNicheContacts] = useState<Contact[]>([]);
  const [selectedNicheId, setSelectedNicheId] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<number[]>([]);
  const [activeTab, setActiveTab] = useState<AgentTab>('leads');
  const [q, setQ] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;
  const [loading, setLoading] = useState(true);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [listenCallSid, setListenCallSid] = useState<string | null>(null);
  const [listeningEnabled, setListeningEnabled] = useState(false);
  const [isTestingBrowser, setIsTestingBrowser] = useState(false);
  const [automationRunning, setAutomationRunning] = useState(false);
  const [controlBusy, setControlBusy] = useState(false);
  const [activeCallSid, setActiveCallSid] = useState<string | null>(null);
  const [callingStatus, setCallingStatus] = useState<CallingStatusResponse | null>(null);

  const loadPipeline = async () => {
    try {
      const [leadResult, activeResult, callingStatus] = await Promise.all([
        leadsApi.list({ limit: 5000, assigned_to_ai: true }),
        leadsApi.activeCalls(),
        leadsApi.callingStatus(),
      ]);
      setLeads(leadResult.leads || []);
      setCallingStatus(callingStatus);
      setAutomationRunning(callingStatus.isRunning);
      setActiveCallSid(callingStatus.activeCallSid || Object.values(activeResult.activeCalls || {})[0] || null);
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
    const timer = window.setInterval(() => void loadPipeline(), 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!listeningEnabled) return;
    setListenCallSid(activeCallSid || null);
  }, [activeCallSid, listeningEnabled]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, q, selectedNicheId]);

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

  const paginatedAvailableContacts = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return availableContacts.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [availableContacts, currentPage]);

  const paginatedVisibleLeads = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return visibleLeads.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [visibleLeads, currentPage]);

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

  const toggleCalling = async () => {
    setControlBusy(true);
    setMessage('');
    setError('');
    try {
      if (automationRunning) {
        const result = await leadsApi.stopCalling();
        setAutomationRunning(false);
        setListeningEnabled(false);
        setListenCallSid(null);
        setActiveCallSid(null);
        setMessage(`Calling stopped${result.stoppedCalls ? `; ${result.stoppedCalls} live call ended` : ''}`);
      } else {
        await leadsApi.startCalling();
        setAutomationRunning(true);
        setMessage('Automatic calling started for assigned leads');
      }
      await loadPipeline();
      setActiveTab('calling');
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Calling control update nahi ho saka');
    } finally {
      setControlBusy(false);
    }
  };

  const toggleLiveListen = async () => {
    if (listeningEnabled) {
      setListeningEnabled(false);
      setListenCallSid(null);
      return;
    }
    setError('');
    if (activeCallSid) {
      setListeningEnabled(true);
      setListenCallSid(activeCallSid);
      return;
    }

    try {
      const activeResult = await leadsApi.activeCalls();
      const freshMap = activeResult.activeCalls || {};
      const status = await leadsApi.callingStatus();
      const freshCallSid = status.activeCallSid || Object.values(freshMap)[0];
      setListeningEnabled(true);
      if (freshCallSid) {
        setActiveCallSid(freshCallSid);
        setListenCallSid(freshCallSid);
        return;
      }
      setListenCallSid(null);
      setMessage('Listen Live ON hai. Next call connect hoti hi audio aur transcript yahan aa jayegi.');
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Live call info load nahi ho saki');
    }
  };

  const skipLiveCall = async (callSid: string, reason: string) => {
    await leadsApi.skipActiveCall({ callSid, reason });
    setMessage('Current call machine/bad call mark ho gayi. Dialer next assigned lead par move karega.');
    setListenCallSid(null);
    await loadPipeline();
  };

  const stats = useMemo(() => ({
    assigned: callingStatus?.stageCounts?.assigned || 0,
    calling: callingStatus?.stageCounts?.calling || 0,
    called: callingStatus?.stageCounts?.called || 0,
    noAnswer: callingStatus?.stageCounts?.no_answer || 0,
    interested: callingStatus?.stageCounts?.interested || 0,
    won: callingStatus?.stageCounts?.closed_won || 0,
  }), [callingStatus]);

  const activeLead = useMemo(
    () => leads.find((lead) => lead.id === callingStatus?.activeLeadId) || null,
    [leads, callingStatus?.activeLeadId],
  );

  const bannerText = useMemo(() => {
    if (!callingStatus) return '';
    if (activeLead) {
      return `Abhi call ${activeLead.company_name || activeLead.domain} ko ja rahi hai${activeLead.primary_phone ? ` (${activeLead.primary_phone})` : ''}.`;
    }
    if (callingStatus.isRunning && callingStatus.nextLead) {
      return `Calling ON hai. Next lead ${callingStatus.nextLead.company_name || callingStatus.nextLead.domain}${callingStatus.nextLead.primary_phone ? ` (${callingStatus.nextLead.primary_phone})` : ''} queue me hai.`;
    }
    if (callingStatus.isRunning) {
      return 'Calling ON hai, lekin is waqt koi live call nahi chal rahi.';
    }
    if (callingStatus.lastCall) {
      return `Calling OFF hai. Last call ${callingStatus.lastCall.company_name || callingStatus.lastCall.domain}${callingStatus.lastCall.primary_phone ? ` (${callingStatus.lastCall.primary_phone})` : ''} ko gayi thi aur stage ${STAGE_LABELS[callingStatus.lastCall.lead_stage]}.`;
    }
    return 'Calling abhi OFF hai. Start Calling dabao to assigned leads par automatic calls shuru ho jayengi.';
  }, [activeLead, callingStatus]);

  const callingEmptyText = useMemo(() => {
    if (!callingStatus?.isRunning) return 'No leads in this stage';
    if (callingStatus.nextLead) {
      return `Live call abhi nahi chal rahi. Next lead ${callingStatus.nextLead.company_name || callingStatus.nextLead.domain} queue me hai.`;
    }
    return 'Calling ON hai, lekin is waqt koi live call nahi chal rahi.';
  }, [callingStatus]);

  const activeRecordingUrl = getRecordingUrl(activeLead);
  const lastRecordingUrl = getRecordingUrl(callingStatus?.lastCall || null);
  const recentActivity = callingStatus?.recentActivity || [];

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 pb-12 font-sans">
      <div className="flex flex-wrap justify-between items-start gap-6 mb-2">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-extrabold text-gray-900 m-0">
            <div className="p-2.5 bg-teal-50 border border-teal-100 rounded-2xl shadow-sm">
              <Bot size={28} className="text-teal-700" />
            </div>
            AI Agent Pipeline
          </h1>
          <p className="mt-2 text-sm text-gray-500 font-medium ml-1">Fully automated outbound calling pipeline</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={selectedNicheId}
            onChange={(event) => setSelectedNicheId(event.target.value)}
            aria-label="Select niche"
            className="w-56 h-10 px-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all cursor-pointer hover:border-gray-300"
          >
            <option value="">All niches</option>
            {niches.map((niche) => (
              <option key={niche.id} value={niche.id}>{niche.name} ({niche.contact_count || 0})</option>
            ))}
          </select>
          <button 
            disabled={controlBusy} 
            onClick={() => void toggleCalling()} 
            className={`flex items-center gap-2 h-10 px-4 rounded-xl font-bold text-xs text-white shadow-sm hover:shadow-md transition-all duration-200 ${controlBusy ? 'bg-slate-400 cursor-not-allowed' : automationRunning ? 'bg-red-600 hover:bg-red-700 active:scale-95' : 'bg-teal-600 hover:bg-teal-700 active:scale-95'}`}
          >
            {automationRunning ? <Square size={14} fill="currentColor" /> : <PhoneCall size={15} />}
            {controlBusy ? 'Please wait...' : automationRunning ? 'Stop Calling' : 'Start Calling'}
          </button>
          <button 
            onClick={() => void toggleLiveListen()} 
            className={`flex items-center gap-2 h-10 px-4 rounded-xl font-bold text-xs text-white shadow-sm hover:shadow-md transition-all duration-200 active:scale-95 ${listeningEnabled ? 'bg-red-600 hover:bg-red-700' : 'bg-violet-600 hover:bg-violet-700'}`}
          >
            {listeningEnabled ? <Square size={14} fill="currentColor" /> : <Volume2 size={16} />}
            {listeningEnabled ? 'Stop Listening' : 'Listen Live'}
          </button>
          <button onClick={() => setIsTestingBrowser(true)} className="flex items-center gap-2 h-10 px-4 rounded-xl font-bold text-xs text-white bg-blue-600 hover:bg-blue-700 shadow-sm hover:shadow-md transition-all duration-200 active:scale-95">
            <Mic size={15} /> Test Agent
          </button>
          <button onClick={() => void loadPipeline()} title="Refresh" className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-all duration-200">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Stat label="Assigned" value={stats.assigned} colorClass="text-slate-800" bgClass="bg-white border-slate-200 shadow-sm" />
        <Stat label="Active Calls" value={stats.calling} colorClass="text-blue-700" bgClass="bg-blue-50/80 border-blue-200 shadow-sm" />
        <Stat label="Called" value={stats.called} colorClass="text-indigo-700" bgClass="bg-indigo-50/80 border-indigo-200 shadow-sm" />
        <Stat label="No Answer" value={stats.noAnswer} colorClass="text-orange-700" bgClass="bg-orange-50/80 border-orange-200 shadow-sm" />
        <Stat label="Interested" value={stats.interested} colorClass="text-emerald-700" bgClass="bg-emerald-50/80 border-emerald-200 shadow-sm" />
        <Stat label="Closed Won" value={stats.won} colorClass="text-lime-700" bgClass="bg-lime-50/80 border-lime-200 shadow-sm" />
      </div>

      <div className="flex justify-end relative">
        <div className="relative w-full max-w-[320px]">
          <Search size={16} className="absolute left-3.5 top-3 text-gray-400" />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search leads..."
            className="w-full h-11 pl-10 pr-4 bg-white border border-gray-200 rounded-xl text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
          />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 border-b border-gray-200 hide-scrollbar">
        {AGENT_TABS.map((tab) => {
          const selected = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-shrink-0 px-4 py-2.5 text-sm font-bold border-b-2 transition-all duration-200 ${selected ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'}`}
            >
              {tab.label} <span className={`ml-1.5 rounded-full px-2 py-0.5 text-xs font-bold transition-all ${selected ? 'bg-teal-100 text-teal-800' : 'bg-gray-100 text-gray-600'}`}>{tabCount(tab.key)}</span>
            </button>
          );
        })}
      </div>

      {listeningEnabled && (
        <LiveCallMonitor
          callSid={listenCallSid}
          autoStart
          autoFollow
          activeLeadName={activeLead ? activeLead.company_name || activeLead.domain : null}
          onClose={() => {
            setListeningEnabled(false);
            setListenCallSid(null);
          }}
          onCallEnded={(callSid, status) => {
            setMessage(`Live listen: call ${callSid.slice(0, 8)} ${status}. Waiting for next call.`);
            setListenCallSid(null);
            void loadPipeline();
          }}
          onSkipCurrentCall={skipLiveCall}
        />
      )}
      {error && <Alert text={error} danger />}
      {message && <Alert text={message} />}
      {!!bannerText && (
        <Alert
          text={bannerText}
          action={callingStatus ? (
            <div className="flex gap-4 flex-wrap font-medium">
              <span>Queue: {callingStatus.queueCount}</span>
              {callingStatus.lastCall?.last_contacted_at && (
                <span>Last call: {formatCallClock(getCallStartedAt(callingStatus.lastCall))}</span>
              )}
              {callingStatus.lastCall && (
                <span>Duration: {formatDurationSeconds(getCallDurationSeconds(callingStatus.lastCall))}</span>
              )}
            </div>
          ) : null}
        />
      )}
      
      {activeTab === 'calling' && (
        <>
          {callingStatus && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatusStripCard
            title="Current Lead"
            accentClass="text-blue-600"
            borderClass="border-blue-200"
            name={activeLead ? activeLead.company_name || activeLead.domain : 'No live call'}
            detail={activeLead?.primary_phone || (callingStatus.isRunning ? 'Waiting for live call connect' : 'Calling is currently stopped')}
            helper={activeLead ? `${STAGE_LABELS[activeLead.lead_stage]} | ${formatCallTiming(activeLead, true)}` : callingStatus.isRunning ? 'Auto dialer is on' : 'Press Start Calling to resume'}
          />
          <StatusStripCard
            title="Next Lead"
            accentClass="text-teal-600"
            borderClass="border-teal-200"
            name={callingStatus.nextLead ? callingStatus.nextLead.company_name || callingStatus.nextLead.domain : 'No lead in queue'}
            detail={callingStatus.nextLead?.primary_phone || `Queue count: ${callingStatus.queueCount}`}
            helper={callingStatus.nextLead ? `Stage: ${STAGE_LABELS[callingStatus.nextLead.lead_stage]}` : 'Assign more leads or start follow-up queue'}
          />
          <StatusStripCard
            title="Last Call"
            accentClass="text-amber-600"
            borderClass="border-amber-200"
            name={callingStatus.lastCall ? callingStatus.lastCall.company_name || callingStatus.lastCall.domain : 'No previous call'}
            detail={callingStatus.lastCall?.primary_phone || 'No phone available'}
            helper={callingStatus.lastCall ? `${getCallStatusText(callingStatus.lastCall)} | ${formatCallTiming(callingStatus.lastCall)}` : 'Result will appear here'}
          />
        </div>
      )}

      <div className="p-5 border border-gray-200 rounded-2xl bg-white shadow-sm">
        <div className="text-xs font-bold text-gray-500 mb-4 tracking-wider">CALL RECORDINGS</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RecordingPanel
            title="Current Call Recording"
            subtitle={activeLead ? activeLead.company_name || activeLead.domain : 'No active lead'}
            url={activeRecordingUrl}
            status={getRecordingStatus(activeLead)}
            emptyText="Current live call ki recording abhi available nahi hai."
          />
          <RecordingPanel
            title="Last Call Recording"
            subtitle={callingStatus?.lastCall ? callingStatus.lastCall.company_name || callingStatus.lastCall.domain : 'No previous call'}
            url={lastRecordingUrl}
            status={getRecordingStatus(callingStatus?.lastCall || null)}
            emptyText="Last call ki recording abhi save nahi hui ya Twilio callback pending hai."
          />
        </div>
      </div>

      <div className="p-5 border border-gray-200 rounded-2xl bg-white shadow-sm">
        <div className="text-xs font-bold text-gray-500 mb-4 tracking-wider">RECENT CALL ACTIVITY</div>
        {recentActivity.length ? (
          <div className="flex flex-col gap-3">
            {recentActivity.map((lead) => (
              <div key={lead.id} className="grid grid-cols-[1.5fr_0.8fr_0.8fr_1.3fr_0.9fr] gap-4 items-center p-4 border border-gray-100 rounded-xl bg-gray-50/50 hover:bg-white hover:shadow-sm transition-all duration-200">
                <div className="min-w-0">
                  <div className="text-gray-900 text-sm font-bold truncate">
                    {lead.company_name || lead.domain}
                  </div>
                  <div className="text-gray-500 text-xs font-medium mt-1 truncate">
                    {lead.primary_email || lead.domain}
                  </div>
                </div>
                <PhoneValue value={lead.primary_phone || 'No phone'} />
                <div>
                   <span className="px-2.5 py-1 text-[10px] font-bold rounded-full uppercase tracking-wide whitespace-nowrap" style={{ backgroundColor: `${STAGE_COLORS[lead.lead_stage]}20`, color: STAGE_COLORS[lead.lead_stage] }}>{STAGE_LABELS[lead.lead_stage]}</span>
                </div>
                <div className="min-w-0">
                  <div className="text-gray-700 text-xs font-semibold">Called: {formatCallClock(getCallStartedAt(lead))}</div>
                  <div className="text-gray-600 text-xs font-bold mt-1">
                    Duration: {formatDurationSeconds(getCallDurationSeconds(lead))}
                  </div>
                  <div className="text-gray-500 text-xs font-medium mt-1 truncate">
                    {getCallStatusText(lead)} | {getLeadResultText(lead)}
                  </div>
                </div>
                <div className="flex justify-end">
                  {getRecordingUrl(lead) ? (
                    <audio controls preload="none" className="w-full max-w-[180px] h-8 rounded" src={getRecordingUrl(lead)!} />
                  ) : (
                    <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full uppercase tracking-wide whitespace-nowrap ${getRecordingStatus(lead) === 'in-progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                      {getRecordingStatus(lead) === 'in-progress' ? 'Recording...' : 'No recording'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty text="Abhi recent call activity available nahi hai." />
        )}
      </div>
        </>
      )}

      {activeTab === 'leads' ? (
        <AvailableLeadList
          selectedNicheId={selectedNicheId}
          contacts={paginatedAvailableContacts}
          totalItems={availableContacts.length}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          itemsPerPage={ITEMS_PER_PAGE}
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
          leads={paginatedVisibleLeads}
          totalItems={visibleLeads.length}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          itemsPerPage={ITEMS_PER_PAGE}
          loading={loading}
          emptyText={activeTab === 'calling' ? callingEmptyText : 'No leads in this stage'}
        />
      )}
    </div>
  );
}

function AvailableLeadList({
  selectedNicheId,
  contacts,
  totalItems,
  currentPage,
  onPageChange,
  itemsPerPage,
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
  totalItems: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  itemsPerPage: number;
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
      <div className="flex justify-end gap-3 flex-wrap mb-4">
        <button onClick={onSelectAll} className="h-10 px-4 border border-gray-300 rounded-xl bg-white text-gray-700 text-xs font-bold hover:bg-gray-50 shadow-sm transition-all duration-200">
          {selectedIds.length === contacts.length ? 'Clear Selection' : 'Select All'}
        </button>
        <button disabled={!selectedIds.length || queueing} onClick={onAssign} className={`flex items-center gap-2 h-10 px-4 rounded-xl text-xs font-bold text-white shadow-sm transition-all duration-200 ${selectedIds.length && !queueing ? 'bg-teal-600 hover:bg-teal-700 hover:shadow-md' : 'bg-slate-400 cursor-not-allowed'}`}>
          <UserPlus size={15} /> {queueing ? 'Assigning...' : `Assign Selected (${selectedIds.length})`}
        </button>
        <button disabled={queueing} onClick={onAssignAll} className="h-10 px-4 border border-gray-300 rounded-xl bg-white text-gray-700 text-xs font-bold hover:bg-gray-50 shadow-sm transition-all duration-200">Assign All</button>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[900px] flex flex-col gap-3">
          {contacts.map((contact) => (
            <label key={contact.id} className="grid grid-cols-[1.6fr_48px_0.8fr_0.7fr_1fr_0.9fr] gap-4 items-center min-h-[74px] p-4 border border-gray-200 rounded-xl bg-white hover:bg-gray-50 hover:shadow-sm transition-all duration-200 cursor-pointer">
            <input type="checkbox" checked={selectedIds.includes(contact.id)} onChange={() => onToggle(contact.id)} className="w-5 h-5 accent-teal-600 cursor-pointer justify-self-center" />
            <LeadIdentity name={contact.company || contact.name} niche={contact.niche_name} detail={contact.name} />
            <Score value={contact.score || 0} />
            <PhoneValue value={contact.phone_number} />
            <span className="text-gray-500 text-xs font-medium">{contact.email || 'No email'}</span>
            <span className="justify-self-end px-3 py-1.5 text-xs font-bold rounded-full bg-teal-100 text-teal-800 uppercase tracking-wide">Ready</span>
            </label>
          ))}
        </div>
      </div>
      <Pagination currentPage={currentPage} totalItems={totalItems} itemsPerPage={itemsPerPage} onPageChange={onPageChange} />
    </>
  );
}

function PipelineLeadList({
  leads,
  totalItems,
  currentPage,
  onPageChange,
  itemsPerPage,
  loading,
  emptyText,
}: {
  leads: Lead[];
  totalItems: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  itemsPerPage: number;
  loading: boolean;
  emptyText: string;
}) {
  if (loading) return <Empty text="Loading pipeline..." />;
  if (!leads.length) return <Empty text={emptyText} />;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[900px] flex flex-col gap-3">
        {leads.map((lead) => (
          <div key={lead.id} className={`grid grid-cols-[1.6fr_48px_0.8fr_0.7fr_1fr_0.9fr] gap-4 items-center min-h-[74px] p-4 border rounded-xl transition-all duration-200 ${lead.lead_stage === 'calling' ? 'bg-amber-50 border-amber-300 shadow-md' : 'bg-white border-gray-200 hover:shadow-md'}`}>
          <LeadIdentity name={lead.company_name || lead.domain} niche={lead.raw_data?.niche_name || lead.industry_guess} detail={lead.primary_email || lead.domain} />
          <Score value={lead.ai_score || 0} />
          <PhoneValue value={lead.primary_phone || 'No phone'} />
          <div className="min-w-0">
            <span className="px-2.5 py-1 text-[10px] font-bold rounded-full uppercase tracking-wide whitespace-nowrap" style={{ backgroundColor: `${STAGE_COLORS[lead.lead_stage]}20`, color: STAGE_COLORS[lead.lead_stage] }}>{STAGE_LABELS[lead.lead_stage]}</span>
            <div className="text-gray-600 text-xs font-semibold mt-1.5">{formatCallClock(getCallStartedAt(lead))}</div>
            <div className="text-gray-500 text-xs font-medium mt-0.5">{formatDurationSeconds(getCallDurationSeconds(lead, lead.lead_stage === 'calling'))}</div>
          </div>
          <span className="text-gray-600 text-xs font-medium truncate">
            {getMeetingTime(lead)
              ? `Meeting: ${new Date(getMeetingTime(lead) as string).toLocaleString()}`
              : lead.ai_summary || lead.lead_notes || 'No notes yet'}
          </span>
          <div className="justify-self-end w-full max-w-[180px]">
            {getRecordingUrl(lead) ? (
              <audio controls preload="none" className="w-full h-8 rounded" src={getRecordingUrl(lead)!} />
            ) : (
              <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full uppercase tracking-wide whitespace-nowrap float-right ${getRecordingStatus(lead) === 'in-progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                {getRecordingStatus(lead) === 'in-progress' ? 'Recording...' : 'No recording'}
              </span>
            )}
          </div>
          </div>
        ))}
      </div>
      <Pagination currentPage={currentPage} totalItems={totalItems} itemsPerPage={itemsPerPage} onPageChange={onPageChange} />
    </div>
  );
}

function Pagination({
  currentPage,
  totalItems,
  itemsPerPage,
  onPageChange,
}: {
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200 mt-4 rounded-xl">
      <div className="flex-1 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-700">
            Showing <span className="font-bold">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-bold">{Math.min(currentPage * itemsPerPage, totalItems)}</span> of <span className="font-bold">{totalItems}</span> leads
          </p>
        </div>
        <div>
          <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className={`relative inline-flex items-center px-3 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-bold ${currentPage === 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-50'}`}
            >
              Previous
            </button>
            <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-gray-50 text-sm font-bold text-gray-700">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className={`relative inline-flex items-center px-3 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-bold ${currentPage === totalPages ? 'text-gray-300 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-50'}`}
            >
              Next
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
}

function LeadIdentity({ name, niche, detail }: { name: string; niche?: string | null; detail?: string | null }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 min-w-0 mb-1">
        <strong className="text-gray-900 text-sm font-bold truncate">{name}</strong>
        {niche && <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-purple-100 text-purple-800 uppercase tracking-wide shrink-0">{niche}</span>}
      </div>
      <div className="text-gray-500 text-xs font-medium truncate">{detail || 'No details'}</div>
    </div>
  );
}

function Score({ value }: { value: number }) {
  return <span className="w-10 h-10 flex items-center justify-center rounded-full bg-amber-100 text-amber-700 text-sm font-black shadow-sm">{value}</span>;
}

function PhoneValue({ value }: { value: string }) {
  return <span className="flex items-center gap-2 text-gray-900 text-sm font-bold"><Phone size={14} className="text-teal-600" /> {value}</span>;
}

function Stat({ label, value, colorClass, bgClass }: { label: string; value: number; colorClass: string; bgClass: string }) {
  return (
    <div className={`p-4 rounded-2xl border transition-all duration-300 hover:shadow-md hover:-translate-y-1 ${bgClass}`}>
      <div className={`text-[11px] font-bold uppercase tracking-wider ${colorClass}`}>{label}</div>
      <div className={`mt-2 text-2xl font-black ${colorClass}`}>{value}</div>
    </div>
  );
}

function StatusStripCard({
  title,
  accentClass,
  borderClass,
  name,
  detail,
  helper,
}: {
  title: string;
  accentClass: string;
  borderClass: string;
  name: string;
  detail: string;
  helper: string;
}) {
  return (
    <div className={`p-5 rounded-2xl bg-white border shadow-sm transition-all duration-300 hover:shadow-md ${borderClass}`}>
      <div className={`text-[11px] font-bold uppercase tracking-wider ${accentClass}`}>{title}</div>
      <div className="mt-2.5 text-gray-900 text-[15px] font-extrabold truncate">{name}</div>
      <div className="mt-1.5 text-slate-700 text-[13px] font-bold truncate">{detail}</div>
      <div className="mt-1.5 text-slate-500 text-xs font-medium truncate">{helper}</div>
    </div>
  );
}

function RecordingPanel({
  title,
  subtitle,
  url,
  status,
  emptyText,
}: {
  title: string;
  subtitle: string;
  url: string | null;
  status: string | null;
  emptyText: string;
}) {
  return (
    <div className="p-4 rounded-xl border border-gray-200 bg-gray-50/50 min-h-[112px]">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-xs font-bold text-gray-900">{title}</div>
        {status && <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wide ${status === 'completed' ? 'bg-emerald-100 text-emerald-800' : status === 'in-progress' ? 'bg-blue-100 text-blue-800' : 'bg-gray-200 text-gray-600'}`}>{status}</span>}
      </div>
      <div className="text-xs text-gray-600 font-medium mb-3">{subtitle}</div>
      {url ? (
        <audio controls preload="none" className="w-full h-9 rounded" src={url} />
      ) : (
        <div className="text-xs text-gray-400 font-medium">{emptyText}</div>
      )}
    </div>
  );
}

function Alert({ text, danger = false, action = null }: { text: string; danger?: boolean; action?: React.ReactNode }) {
  return (
    <div className={`mb-4 p-4 flex items-center justify-between gap-4 border rounded-xl text-sm font-medium shadow-sm ${danger ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
      <span>{text}</span>
      {action}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="p-10 border border-dashed border-gray-300 rounded-2xl bg-gray-50 text-center text-gray-500 text-sm font-semibold">{text}</div>;
}
