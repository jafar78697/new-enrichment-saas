import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { parsePhoneNumberFromString } from 'libphonenumber-js/min';
import { Bot, CheckCircle2, Filter, Phone, PhoneCall, RefreshCw, Search, Settings2, Square, UserPlus, X } from 'lucide-react';
import { leadsApi, type CallingQueueLead, type CallingStatusResponse, type Lead } from '../services/crmApi';
import { nichesApi, type Niche } from '../services/nichesApi';
import { callsApi, type Contact } from '../services/callsApi';
import { deepgramAgentsApi, type DeepgramAgent, type DeepgramAgentStatus } from '../services/deepgramAgentsApi';
import LiveCallMonitor from '../components/LiveCallMonitor';
import { getCallingBlocker, type CallingBlocker } from '../utils/calling-readiness';
import { unlockLiveAudio } from '../utils/live-audio';
import LaneDashboard from './multi-ai/LaneDashboard';

const LEAD_FILTERS = [
  { key: 'new', label: 'New Leads' },
  { key: 'assigned', label: 'Assigned Leads' },
  { key: 'voicemail', label: 'Voicemail' },
  { key: 'no_answer', label: 'No Answer' },
  { key: 'followup', label: 'Follow-up' },
  { key: 'interested', label: 'Interested' },
  { key: 'not_interested', label: 'Not Interested' },
] as const;

type LeadFilter = (typeof LEAD_FILTERS)[number]['key'];

type AiResultNotice = {
  callSid: string;
  leadName: string;
  phone: string | null;
  label: string;
  summary: string;
  color: string;
};

type LeadStatusSource = Pick<Lead, 'lead_stage' | 'lead_notes' | 'raw_data'> | Pick<CallingQueueLead, 'lead_stage' | 'lead_notes' | 'raw_data'>;

function isVoicemailLead(lead: Pick<LeadStatusSource, 'lead_notes' | 'raw_data'>) {
  const detected = `${String(lead.raw_data?.answered_by || '')} ${String(lead.raw_data?.call_status || '')} ${lead.lead_notes || ''}`;
  return /machine|voicemail|answering machine/i.test(detected);
}

function isIvrLead(lead: Pick<LeadStatusSource, 'lead_notes' | 'raw_data'>) {
  const detected = `${String(lead.raw_data?.answered_by || '')} ${String(lead.raw_data?.call_status || '')} ${lead.lead_notes || ''}`;
  return /ivr|phone menu|automated menu/i.test(detected);
}

function callResultSource(lead: Pick<LeadStatusSource, 'lead_notes' | 'raw_data'>): 'ai' | 'manual' | null {
  const source = String(lead.raw_data?.ai_outcome_source || lead.raw_data?.call_result_source || '').toLowerCase();
  if (source === 'manual') return 'manual';
  if (['ai', 'automatic', 'live_tool', 'telecom_event'].includes(source)) return 'ai';
  if (/\[Call result\]/i.test(lead.lead_notes || '')) return 'manual';
  if (lead.raw_data?.ai_outcome || lead.raw_data?.answered_by || lead.raw_data?.call_status) return 'ai';
  return null;
}

function simpleLeadStatus(lead: LeadStatusSource) {
  const source = callResultSource(lead);
  const resultColor = source === 'ai' ? '#059669' : source === 'manual' ? '#dc2626' : null;
  if (lead.lead_stage === 'interested') return { label: 'Interested', color: resultColor || '#047857', source };
  if (lead.lead_stage === 'closed_lost') return { label: 'Not Interested', color: resultColor || '#be123c', source };
  if (lead.lead_stage === 'followup') return { label: 'Follow-up', color: resultColor || '#ca8a04', source };
  if (isVoicemailLead(lead)) return { label: 'Voicemail', color: resultColor || '#7c3aed', source };
  if (lead.lead_stage === 'no_answer') return { label: isIvrLead(lead) ? 'IVR Menu' : 'No Answer', color: resultColor || '#ea580c', source };
  if (lead.lead_stage === 'calling') return { label: 'Calling', color: '#2563eb' };
  if (lead.lead_stage === 'assigned') return { label: 'Assigned Lead', color: '#0f766e' };
  return { label: 'Needs Result', color: '#64748b' };
}

function aiOutcomeStatus(lead: Lead) {
  const outcome = String(lead.raw_data?.ai_outcome || '').toLowerCase();
  if (outcome === 'voicemail') return { label: 'Voicemail', color: '#059669' };
  if (outcome === 'no_answer') return { label: isIvrLead(lead) ? 'IVR Menu' : 'No Answer', color: '#059669' };
  if (outcome === 'interested') return { label: 'Interested', color: '#059669' };
  if (outcome === 'followup') return { label: 'Follow-up', color: '#059669' };
  if (['not_interested', 'do_not_call'].includes(outcome)) return { label: 'Not Interested', color: '#059669' };
  if (outcome === 'technical_error') return { label: 'Technical Error', color: '#dc2626' };
  if (outcome === 'called' || lead.lead_stage === 'called') return { label: 'Call Completed', color: '#059669' };
  const status = simpleLeadStatus(lead);
  return { label: status.label, color: status.color };
}

function isCallableNorthAmericanNumber(raw: string | null | undefined) {
  if (!raw) return false;
  const digits = raw.replace(/\D/g, '');
  const candidate = raw.trim().startsWith('+')
    ? raw.trim()
    : digits.length === 10
      ? `+1${digits}`
      : digits.length === 11 && digits.startsWith('1')
        ? `+${digits}`
        : '';
  const phone = candidate ? parsePhoneNumberFromString(candidate) : undefined;
  return Boolean(phone?.isValid() && ['US', 'CA'].includes(phone.country || ''));
}

function getMeetingTime(lead: Lead) {
  const meeting = lead.raw_data?.meeting;
  if (!meeting || typeof meeting !== 'object') return null;
  const value = (meeting as Record<string, unknown>).meeting_time;
  return typeof value === 'string' ? value : null;
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
  return lead ? simpleLeadStatus({ ...lead, lead_notes: null }).label : 'No status';
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

export default function AgentPipelinePage() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [niches, setNiches] = useState<Niche[]>([]);
  const [agents, setAgents] = useState<DeepgramAgent[]>([]);
  const [agentStatus, setAgentStatus] = useState<DeepgramAgentStatus | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const pageMode = searchParams.get('mode') === 'multi' ? 'multi' : 'single';
  function setPageMode(mode: 'single' | 'multi') {
    setSearchParams(previous => {
      const next = new URLSearchParams(previous);
      next.set('mode', mode);
      return next;
    });
  }
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [nicheContacts, setNicheContacts] = useState<Contact[]>([]);
  const [selectedNicheId, setSelectedNicheId] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<number[]>([]);
  const [leadFilter, setLeadFilter] = useState<LeadFilter>('new');
  const [q, setQ] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;
  const [loading, setLoading] = useState(true);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pipelineError, setPipelineError] = useState('');
  const [listenCallSid, setListenCallSid] = useState<string | null>(null);
  const [listeningEnabled, setListeningEnabled] = useState(false);
  const [dismissedLiveCallSid, setDismissedLiveCallSid] = useState<string | null>(null);
  const [automationRunning, setAutomationRunning] = useState(false);
  const [controlBusy, setControlBusy] = useState(false);
  const [activeCallSid, setActiveCallSid] = useState<string | null>(null);
  const [activeCallLeadId, setActiveCallLeadId] = useState<string | null>(null);
  const [callingStatus, setCallingStatus] = useState<CallingStatusResponse | null>(null);
  const [manualCallingId, setManualCallingId] = useState<string | null>(null);
  const [aiResultNotice, setAiResultNotice] = useState<AiResultNotice | null>(null);
  const nicheSelectRef = useRef<HTMLSelectElement>(null);
  const leadListRef = useRef<HTMLDivElement>(null);

  const outboundAgents = useMemo(
    () => agents.filter((agent) => agent.isActive && agent.mode === 'outbound'),
    [agents],
  );
  const selectedAgent = useMemo(
    () => outboundAgents.find((agent) => agent.id === selectedAgentId) || null,
    [outboundAgents, selectedAgentId],
  );

  const loadPipeline = async () => {
    try {
      const [leadResult, activeResult, callingStatus] = await Promise.all([
        leadsApi.list({ limit: 5000, assigned_to_ai: true }),
        leadsApi.activeCalls(),
        leadsApi.callingStatus(),
      ]);
      const freshLeads = leadResult.leads || [];
      setLeads(freshLeads);
      setCallingStatus(callingStatus);
      setAutomationRunning(callingStatus.isRunning);
      const liveCallSid = callingStatus.activeCallSid || Object.values(activeResult.activeCalls || {})[0] || null;
      setActiveCallSid(liveCallSid);
      const mappedLeadId = callingStatus.activeLeadId
        || Object.entries(activeResult.activeCalls || {}).find(([, sid]) => sid === liveCallSid)?.[0]
        || null;
      setActiveCallLeadId(mappedLeadId);
      setPipelineError('');
    } catch (e: any) {
      setPipelineError(e?.response?.data?.error || e?.message || 'Failed to load AI agent pipeline');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPipeline();
    nichesApi.list().then((res) => setNiches(res.niches || [])).catch(() => setNiches([]));
    Promise.all([deepgramAgentsApi.list(), deepgramAgentsApi.status()])
      .then(([agentsResult, statusResult]) => {
        const available = agentsResult.agents.filter((agent) => agent.isActive && agent.mode === 'outbound');
        setAgents(agentsResult.agents);
        setAgentStatus(statusResult);
        setSelectedAgentId((current) => available.some((agent) => agent.id === current) ? current : available[0]?.id || '');
      })
      .catch((e: any) => setError(e?.message || 'Outbound agents load nahi ho sake'));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => void loadPipeline(), 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!activeCallSid) {
      setDismissedLiveCallSid(null);
      if (listeningEnabled) setListenCallSid(null);
      return;
    }
    if (dismissedLiveCallSid === activeCallSid) return;
    setListeningEnabled(true);
    setListenCallSid(activeCallSid);
  }, [activeCallSid, dismissedLiveCallSid, listeningEnabled]);

  useEffect(() => {
    setCurrentPage(1);
  }, [leadFilter, q, selectedNicheId]);

  useEffect(() => {
    if (!aiResultNotice) return;
    const timer = window.setTimeout(() => setAiResultNotice(null), 7000);
    return () => window.clearTimeout(timer);
  }, [aiResultNotice]);

  useEffect(() => {
    let cancelled = false;
    setSelectedContactIds([]);
    setNicheContacts([]);
    if (!selectedNicheId) {
      setContactsLoading(false);
      return;
    }
    setContactsLoading(true);
    callsApi.listContactsByNiche(Number(selectedNicheId))
      .then((res) => { if (!cancelled) setNicheContacts(res.contacts || []); })
      .catch((e: any) => { if (!cancelled) setError(e?.message || 'Failed to load niche leads'); })
      .finally(() => { if (!cancelled) setContactsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedNicheId]);

  const assignedContactIds = useMemo(() => new Set(
    leads
      .map((lead) => Number(lead.raw_data?.source_contact_id))
      .filter((id) => Number.isInteger(id) && id > 0),
  ), [leads]);

  const marketContacts = useMemo(() => nicheContacts.filter((contact) => (
    isCallableNorthAmericanNumber(contact.phone_number) && !assignedContactIds.has(contact.id)
  )), [nicheContacts, assignedContactIds]);

  const availableContacts = useMemo(() => {
    const term = q.trim().toLowerCase();
    return marketContacts.filter((contact) => {
      if (!term) return true;
      return [contact.name, contact.company, contact.email, contact.phone_number]
        .some((value) => value?.toLowerCase().includes(term));
    });
  }, [marketContacts, q]);

  const assignableContacts = useMemo(() => marketContacts.filter((contact) => (
    contact.do_not_call !== true
    && contact.unsubscribed !== true
  )), [marketContacts]);
  const selectableContactIds = useMemo(() => new Set(
    availableContacts
      .filter((contact) => contact.do_not_call !== true && contact.unsubscribed !== true)
      .map((contact) => contact.id),
  ), [availableContacts]);


  const blockedContactCount = useMemo(() => marketContacts.filter((contact) => (
    contact.do_not_call === true || contact.unsubscribed === true
  )).length, [marketContacts]);

  const hiddenNonNorthAmericaContacts = useMemo(
    () => nicheContacts.filter((contact) => (
      !assignedContactIds.has(contact.id) && !isCallableNorthAmericanNumber(contact.phone_number)
    )).length,
    [nicheContacts, assignedContactIds],
  );

  const visibleLeads = useMemo(() => {
    const term = q.trim().toLowerCase();
    return leads.filter((lead) => {
      if (selectedNicheId && String(lead.raw_data?.niche_id || '') !== selectedNicheId) return false;
      if (leadFilter === 'assigned' && !['assigned', 'calling'].includes(lead.lead_stage)) return false;
      if (leadFilter === 'voicemail' && !isVoicemailLead(lead)) return false;
      if (leadFilter === 'no_answer' && (lead.lead_stage !== 'no_answer' || isVoicemailLead(lead))) return false;
      if (leadFilter === 'followup' && lead.lead_stage !== 'followup') return false;
      if (leadFilter === 'interested' && lead.lead_stage !== 'interested') return false;
      if (leadFilter === 'not_interested' && lead.lead_stage !== 'closed_lost') return false;
      if (!term) return true;
      return [lead.company_name, lead.domain, lead.primary_email, lead.primary_phone]
        .some((value) => value?.toLowerCase().includes(term));
    });
  }, [leads, leadFilter, selectedNicheId, q]);

  const paginatedAvailableContacts = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return availableContacts.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [availableContacts, currentPage]);

  const paginatedVisibleLeads = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return visibleLeads.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [visibleLeads, currentPage]);

  const queueContacts = async (contactIds: number[]) => {
    if (!selectedNicheId || !contactIds.length) return;
    if (!selectedAgentId) {
      setError('Pehle active outbound agent select karein.');
      return;
    }
    const assignableIds = new Set(assignableContacts.map((contact) => contact.id));
    const safeContactIds = contactIds.filter((id) => assignableIds.has(id));
    if (!safeContactIds.length) {
      setError('Selected leads blocked hain ya USA/Canada numbers nahi hain.');
      return;
    }
    setQueueing(true);
    setError('');
    setMessage('');
    try {
      const result = await leadsApi.queueAi({
        agent_id: selectedAgentId,
        niche_id: Number(selectedNicheId),
        contact_ids: safeContactIds,
        limit: safeContactIds.length,
      });
      const skipped = result.invalidRegionCount + result.blockedCount;
      setMessage(`${result.totalQueued} leads ${selectedAgent?.name || 'outbound agent'} ko assign ho gayi. Ab Assigned Leads filter se Enable Calling dabayein.${skipped ? ` ${skipped} blocked/invalid leads skip hui.` : ''}`);
      setSelectedContactIds([]);
      await loadPipeline();
      const contacts = await callsApi.listContactsByNiche(Number(selectedNicheId));
      setNicheContacts(contacts.contacts || []);
      setLeadFilter('assigned');
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

  const startBlocker: CallingBlocker | null = pipelineError
    ? { message: pipelineError, action: 'refresh' }
    : getCallingBlocker(callingStatus, selectedAgentId, agentStatus?.outboundEnabled);

  const resolveStartBlocker = (blocker: CallingBlocker) => {
    setError('');
    if (blocker.action === 'agent') navigate('/ai-agent');
    if (blocker.action === 'refresh') void loadPipeline();
    if (blocker.action === 'leads') {
      setLeadFilter('assigned');
      if (!selectedNicheId) nicheSelectRef.current?.focus();
    }
  };

  const toggleCalling = async () => {
    // Unlock audio while this button click still has browser user activation.
    void unlockLiveAudio().catch(() => null);
    if (controlBusy) return;
    const shouldStopCalling = automationRunning || Boolean(activeCallSid) || callingStatus?.isRunning === true;
    if (!shouldStopCalling) {
      if (startBlocker) {
        resolveStartBlocker(startBlocker);
        return;
      }
      if (!callingStatus) return;
    }
    setControlBusy(true);
    setMessage('');
    setError('');
    try {
      if (shouldStopCalling) {
        const result = await leadsApi.stopCalling();
        setAutomationRunning(false);
        setListeningEnabled(false);
        setListenCallSid(null);
        setActiveCallSid(null);
        setActiveCallLeadId(null);
        setMessage(`Calling stopped${result.stoppedCalls ? `; ${result.stoppedCalls} live call ended` : ''}`);
      } else {
        // Open and connect the monitor during the user's click, before the
        // backend can dequeue and dial the first lead. This preserves the
        // visible order: popup -> preparing -> ringing -> answered.
        setDismissedLiveCallSid(null);
        setListenCallSid(null);
        setListeningEnabled(true);
        const result = await leadsApi.startCalling();
        if (!result.ok) throw new Error(result.message || 'AI outbound calling server policy se band hai.');
        setAutomationRunning(true);
        setMessage('Automatic calling started for assigned leads. Live listen enabled.');
      }
      await loadPipeline();
      setLeadFilter('assigned');
    } catch (e: any) {
      if (!shouldStopCalling) {
        setListeningEnabled(false);
        setListenCallSid(null);
      }
      setError(e?.response?.data?.error || e?.response?.data?.message || e?.message || 'Calling control update nahi ho saka');
    } finally {
      setControlBusy(false);
    }
  };

  const disableCallingFromMonitor = async () => {
    const result = await leadsApi.stopCalling();
    setAutomationRunning(false);
    setListeningEnabled(false);
    setListenCallSid(null);
    setActiveCallSid(null);
    setActiveCallLeadId(null);
    setMessage(`AI calling disabled${result.stoppedCalls ? `; ${result.stoppedCalls} live call ended` : ''}.`);
    await loadPipeline();
    setLeadFilter('assigned');
  };

  const toggleLiveListen = async () => {
    if (listeningEnabled) {
      setDismissedLiveCallSid(activeCallSid);
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
    setActiveCallLeadId(null);
    await loadPipeline();
  };

  const showAiResultForFinishedCall = async (callSid: string) => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, attempt === 0 ? 300 : 500));
      try {
        const result = await leadsApi.list({ limit: 5000, assigned_to_ai: true });
        const lead = (result.leads || []).find((item) => (
          String(item.raw_data?.call_sid || '') === callSid
          || String(item.raw_data?.active_call_sid || '') === callSid
        ));
        if (!lead) continue;

        const isFinal = ['called', 'no_answer', 'followup', 'interested', 'closed_won', 'closed_lost'].includes(lead.lead_stage)
          || Boolean(lead.raw_data?.ai_outcome)
          || Boolean(lead.raw_data?.call_ended_at);
        if (!isFinal) continue;

        const resultStatus = aiOutcomeStatus(lead);
        setAiResultNotice({
          callSid,
          leadName: lead.company_name || lead.domain,
          phone: lead.primary_phone || null,
          label: resultStatus.label,
          summary: lead.ai_summary || 'AI ne call ka result CRM mein save kar diya hai.',
          color: resultStatus.color,
        });
        return;
      } catch {
        // Retry briefly because the telecom terminal event can arrive before
        // the AI outcome transaction becomes visible to the browser.
      }
    }

    setAiResultNotice({
      callSid,
      leadName: 'Recent call',
      phone: null,
      label: 'Result Processing',
      summary: 'AI result abhi CRM mein process ho raha hai. Lead list automatically refresh hogi.',
      color: '#d97706',
    });
  };

  const callLeadNow = async (lead: Lead) => {
    // Unlock audio before the asynchronous call request so Listen Live can
    // play the first AI greeting as soon as the popup opens.
    void unlockLiveAudio().catch(() => null);
    setManualCallingId(lead.id);
    // Render the monitor immediately. SignalWire can begin dialing before the
    // start-call HTTP response returns, so waiting for callSid made the popup
    // appear several seconds behind the real call.
    setActiveCallLeadId(lead.id);
    setDismissedLiveCallSid(null);
    setListenCallSid(null);
    setListeningEnabled(true);
    setError('');
    setMessage('');
    try {
      const result = await leadsApi.startCall(lead.id);
      setActiveCallSid(result.callSid);
      setListenCallSid(result.callSid);
      setLeadFilter('assigned');
      setMessage(`${lead.company_name || lead.domain} ko call start ho gayi hai. Listen Live khul gaya hai.`);
      await loadPipeline();
    } catch (e: any) {
      setListeningEnabled(false);
      setListenCallSid(null);
      setActiveCallSid(null);
      setActiveCallLeadId(null);
      setError(e?.response?.data?.error || e?.message || 'Call start nahi ho saki');
    } finally {
      setManualCallingId(null);
    }
  };

  const activeLead = useMemo(() => {
    const currentLeadId = callingStatus?.activeLeadId || activeCallLeadId;
    return currentLeadId ? leads.find((lead) => lead.id === currentLeadId) || null : null;
  }, [leads, callingStatus?.activeLeadId, activeCallLeadId]);

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
      return `Calling OFF hai. Last call ${callingStatus.lastCall.company_name || callingStatus.lastCall.domain}${callingStatus.lastCall.primary_phone ? ` (${callingStatus.lastCall.primary_phone})` : ''} ko gayi thi aur result ${simpleLeadStatus(callingStatus.lastCall).label}.`;
    }
    return 'Calling abhi OFF hai. Enable Calling dabao to assigned leads par automatic calls shuru ho jayengi.';
  }, [activeLead, callingStatus]);

  const modeTabs = (
    <div className="flex gap-2 border-b border-gray-200">
      {([['single', 'Single Agent'], ['multi', 'Multi-AI Lanes']] as const).map(([key, label]) => (
        <button
          key={key}
          onClick={() => setPageMode(key)}
          className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 transition ${
            pageMode === key ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  if (pageMode === 'multi') {
    return (
      <div className="w-full min-w-0 max-w-[1400px] mx-auto space-y-5 pb-12 font-sans">
        <h1 className="flex items-center gap-3 text-3xl font-extrabold text-gray-900 m-0">
          <div className="p-2.5 bg-teal-50 border border-teal-100 rounded-lg shadow-sm">
            <Bot size={28} className="text-teal-700" />
          </div>
          AI Calling
        </h1>
        {modeTabs}
        <LaneDashboard />
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 max-w-[1400px] mx-auto space-y-5 pb-12 font-sans">
      {modeTabs}
      <div className="flex flex-wrap justify-between items-start gap-6 mb-2">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-extrabold text-gray-900 m-0">
            <div className="p-2.5 bg-teal-50 border border-teal-100 rounded-lg shadow-sm">
              <Bot size={28} className="text-teal-700" />
            </div>
            AI Calling
          </h1>
          <p className="mt-2 text-sm text-gray-500 font-medium ml-1">USA &amp; Canada</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={selectedAgentId}
            onChange={(event) => setSelectedAgentId(event.target.value)}
            disabled={automationRunning}
            aria-label="Select outbound AI agent"
            className="w-60 h-10 px-3 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-100"
          >
            <option value="">Select outbound agent</option>
            {outboundAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
          </select>
          <select
            ref={nicheSelectRef}
            value={selectedNicheId}
            onChange={(event) => setSelectedNicheId(event.target.value)}
            aria-label="Select niche"
            className="w-56 h-10 px-3 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all cursor-pointer hover:border-gray-300"
          >
            <option value="">Select niche</option>
            {niches.map((niche) => (
              <option key={niche.id} value={niche.id}>{niche.name} ({niche.contact_count || 0})</option>
            ))}
          </select>
          <button 
            disabled={controlBusy}
            aria-describedby={!automationRunning && !activeCallSid && startBlocker ? 'calling-start-reason' : undefined}
            title={!automationRunning && !activeCallSid && startBlocker ? startBlocker.message : undefined}
            onClick={() => void toggleCalling()} 
            className={`flex items-center gap-2 h-10 px-4 rounded-md font-bold text-xs text-white shadow-sm transition-colors ${controlBusy ? 'bg-slate-400 cursor-not-allowed' : automationRunning || activeCallSid ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-600 hover:bg-teal-700'}`}
          >
            {automationRunning || activeCallSid ? <Square size={14} fill="currentColor" /> : <PhoneCall size={15} />}
            {controlBusy ? 'Please wait...' : automationRunning || activeCallSid ? 'Disable Calling' : 'Enable Calling'}
          </button>

          <button onClick={() => navigate('/ai-agent')} className="flex items-center gap-2 h-10 px-4 rounded-lg font-bold text-xs text-white bg-blue-600 hover:bg-blue-700 shadow-sm hover:shadow-md transition-all duration-200 active:scale-95">
            <Settings2 size={15} /> Agent Setup
          </button>
          <button onClick={() => void loadPipeline()} title="Refresh" className="w-10 h-10 flex items-center justify-center rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-all duration-200">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {!automationRunning && startBlocker && (
        <div id="calling-start-reason" role="status" className="flex flex-wrap items-center justify-between gap-3 border-y border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="min-w-0 break-words">{startBlocker.message}</span>
          <button onClick={() => resolveStartBlocker(startBlocker)} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 text-xs font-bold">
            {startBlocker.action === 'leads' ? <UserPlus size={15} /> : startBlocker.action === 'refresh' ? <RefreshCw size={15} /> : <Settings2 size={15} />}
            {startBlocker.action === 'leads' ? 'Select & assign leads' : startBlocker.action === 'agent' ? 'Agent Setup' : 'Retry status'}
          </button>
        </div>
      )}
      {error && <Alert text={error} danger />}

      {!outboundAgents.length && (
        <Alert
          danger
          text="Abhi active outbound agent nahi bana. Agent Setup khol kar agent save karein, phir yahan leads select hongi."
          action={<button onClick={() => navigate('/ai-agent')} className="h-9 px-3 rounded-md bg-slate-900 text-white text-xs font-bold">Create agent</button>}
        />
      )}
      {agentStatus && !agentStatus.outboundEnabled && (
        <Alert danger text="Outbound calling server safety policy se paused hai. Leads assign ho sakti hain, lekin calls start nahi hongi." />
      )}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Leads</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">Select, call aur call result isi section se manage karein.</p>
          </div>
          <div className="flex w-full flex-wrap justify-end gap-3 sm:w-auto">
            <label className="relative min-w-[190px] flex-1 sm:flex-none">
              <Filter size={15} className="absolute left-3 top-3 text-slate-400" />
              <select
                value={leadFilter}
                onChange={(event) => setLeadFilter(event.target.value as LeadFilter)}
                aria-label="Filter leads by call result"
                className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-sm font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {LEAD_FILTERS.map((filter) => <option key={filter.key} value={filter.key}>{filter.label}</option>)}
              </select>
            </label>
            <div className="relative min-w-[220px] flex-1 sm:w-[300px] sm:flex-none">
          <Search size={16} className="absolute left-3.5 top-3 text-gray-400" />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search leads..."
                className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-10 pr-4 text-sm shadow-sm transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
            </div>
          </div>
        </div>
      </section>

      {listeningEnabled && (
        <LiveCallMonitor
          callSid={listenCallSid}
          autoStart
          autoFollow
          activeLeadName={activeLead ? activeLead.company_name || activeLead.domain : null}
          fromPhone={(activeLead?.raw_data?.from_phone as string) || null}
          onClose={() => {
            setDismissedLiveCallSid(listenCallSid);
            setListeningEnabled(false);
            setListenCallSid(null);
          }}
          onCallEnded={(callSid, status) => {
            setMessage(`Live listen: call ${callSid.slice(0, 8)} ${status}. AI result save ho raha hai.`);
            void showAiResultForFinishedCall(callSid);
            setDismissedLiveCallSid(callSid);
            setListeningEnabled(false);
            setListenCallSid(null);
            setActiveCallSid(null);
            setActiveCallLeadId(null);
            void loadPipeline();
          }}
          onSkipCurrentCall={skipLiveCall}
          onDisableCalling={disableCallingFromMonitor}
        />
      )}
      {aiResultNotice && (
        <div className="ai-result-notice fixed left-4 right-4 top-4 z-[10000] mx-auto max-w-md overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-2xl sm:left-auto sm:right-6 sm:top-6 sm:mx-0 sm:w-[390px]" role="status" aria-live="polite">
          <div className="flex items-start gap-3 p-4">
            <div className="ai-result-icon mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 size={25} strokeWidth={2.5} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-emerald-700">AI Call Result</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-extrabold text-slate-900">{aiResultNotice.leadName}</h3>
                <span className="rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide" style={{ backgroundColor: `${aiResultNotice.color}18`, color: aiResultNotice.color }}>
                  {aiResultNotice.label}
                </span>
              </div>
              {aiResultNotice.phone && <p className="mt-1 text-xs font-semibold text-slate-500">{aiResultNotice.phone}</p>}
              <p className="mt-2 line-clamp-2 text-xs font-medium leading-5 text-slate-600">{aiResultNotice.summary}</p>
            </div>
            <button type="button" onClick={() => setAiResultNotice(null)} aria-label="Close AI result" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
              <X size={18} />
            </button>
          </div>
          <div className="h-1 bg-emerald-100">
            <div className="ai-result-progress h-full bg-emerald-500" />
          </div>
        </div>
      )}
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

      <div ref={leadListRef} tabIndex={-1}>
      {leadFilter === 'new' ? (
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
            selectedContactIds.length === selectableContactIds.size ? [] : Array.from(selectableContactIds),
          )}
          onAssign={() => void queueContacts(selectedContactIds)}
          onAssignAll={() => void queueContacts(assignableContacts.map((contact) => contact.id))}
          canAssign={Boolean(selectedAgentId)}
          agentName={selectedAgent?.name || null}
          hiddenNonUSCount={hiddenNonNorthAmericaContacts}
          blockedCount={blockedContactCount}
          selectableCount={selectableContactIds.size}
        />
      ) : (
        <PipelineLeadList
          leads={paginatedVisibleLeads}
          totalItems={visibleLeads.length}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          itemsPerPage={ITEMS_PER_PAGE}
          loading={loading}
          emptyText="Is filter mein koi lead nahi hai."
          manualCallingId={manualCallingId}
          activeCallLeadId={activeCallLeadId}
          onCall={(lead) => void callLeadNow(lead)}
        />
      )}
      </div>

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
  canAssign,
  agentName,
  hiddenNonUSCount,
  blockedCount,
  selectableCount,
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
  canAssign: boolean;
  agentName: string | null;
  hiddenNonUSCount: number;
  blockedCount: number;
  selectableCount: number;
}) {
  if (!selectedNicheId) return <Empty text="Select a niche to view leads" />;
  if (loading) return <Empty text="Loading leads..." />;
  if (!contacts.length) {
    return <Empty text={hiddenNonUSCount ? `${hiddenNonUSCount} non-USA/Canada ya invalid phone leads safety ke liye hidden hain` : 'No available leads in this niche'} />;
  }

  return (
    <>
      <div className="flex justify-end gap-3 flex-wrap mb-4">
        <div className="mr-auto self-center text-sm font-semibold text-slate-700">
          Agent: {agentName || 'Select an outbound agent above'}
          <span className="ml-3 text-emerald-700">{selectableCount} selectable</span>
          {blockedCount > 0 && <span className="ml-3 text-rose-700">{blockedCount} blocked</span>}
          {hiddenNonUSCount > 0 && <span className="ml-3 text-slate-500">{hiddenNonUSCount} outside USA/Canada</span>}
        </div>
        <button onClick={onSelectAll} className="h-10 px-4 border border-gray-300 rounded-lg bg-white text-gray-700 text-xs font-bold hover:bg-gray-50 shadow-sm transition-all duration-200">
          {selectedIds.length === selectableCount && selectableCount > 0 ? 'Clear Selection' : 'Select All'}
        </button>
        <button disabled={!canAssign || !selectedIds.length || queueing} onClick={onAssign} className={`flex items-center gap-2 h-10 px-4 rounded-lg text-xs font-bold text-white shadow-sm transition-all duration-200 ${canAssign && selectedIds.length && !queueing ? 'bg-teal-600 hover:bg-teal-700 hover:shadow-md' : 'bg-slate-400 cursor-not-allowed'}`}>
          <UserPlus size={15} /> {queueing ? 'Assigning...' : `Assign Selected (${selectedIds.length})`}
        </button>
        <button disabled={!canAssign || !selectableCount || queueing} onClick={onAssignAll} className="h-10 px-4 border border-gray-300 rounded-md bg-white text-gray-700 text-xs font-bold hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 shadow-sm transition-colors">Assign All Eligible</button>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[900px] flex flex-col gap-3">
          {contacts.map((contact) => {
            const blocked = contact.do_not_call === true || contact.unsubscribed === true;
            const callable = !blocked;
            return (
            <div key={contact.id} className="grid grid-cols-[36px_minmax(200px,1.6fr)_52px_170px_minmax(160px,1fr)_170px] gap-4 items-center min-h-[74px] p-4 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 hover:shadow-sm transition-colors">
            <input type="checkbox" aria-label={`Select ${contact.company || contact.name}`} title={blocked ? 'Do Not Call / unsubscribed' : undefined} disabled={blocked || queueing} checked={selectedIds.includes(contact.id)} onChange={() => onToggle(contact.id)} className="w-5 h-5 accent-teal-600 cursor-pointer justify-self-center disabled:cursor-not-allowed disabled:opacity-30" />
            <div className="min-w-0"><LeadIdentity name={contact.company || contact.name} niche={contact.niche_name} detail={contact.name} />
            </div>
            <Score value={contact.score || 0} />
            <PhoneValue value={contact.phone_number} />
            <span className="text-gray-500 text-xs font-medium">{contact.email || 'No email'}</span>
            <div className="justify-self-end flex flex-col items-end gap-1.5">
              {blocked ? (
                <span className="px-3 py-1.5 text-xs font-bold rounded-full bg-rose-100 text-rose-800 uppercase">DNC / Blocked</span>
              ) : (
                <span className="px-3 py-1.5 text-xs font-bold rounded-full bg-teal-100 text-teal-800 uppercase">Eligible</span>
              )}
            </div>
            </div>
          );})}
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
  manualCallingId,
  activeCallLeadId,
  onCall,
}: {
  leads: Lead[];
  totalItems: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  itemsPerPage: number;
  loading: boolean;
  emptyText: string;
  manualCallingId: string | null;
  activeCallLeadId: string | null;
  onCall: (lead: Lead) => void;
}) {
  if (loading) return <Empty text="Loading pipeline..." />;
  if (!leads.length) return <Empty text={emptyText} />;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[900px] flex flex-col gap-3">
        {leads.map((lead) => {
          const callInProgress = lead.lead_stage === 'calling' || activeCallLeadId === lead.id;
          const leadStatus = simpleLeadStatus(lead);
          return (
          <div key={lead.id} className={`grid grid-cols-[1.6fr_48px_0.8fr_0.7fr_1fr_0.9fr] gap-4 items-center min-h-[74px] p-4 border rounded-lg transition-all duration-200 ${callInProgress ? 'bg-red-50 border-red-300 shadow-md' : 'bg-white border-gray-200 hover:shadow-md'}`}>
          <LeadIdentity name={lead.company_name || lead.domain} niche={lead.raw_data?.niche_name || lead.industry_guess} detail={lead.primary_email || lead.domain} />
          <Score value={lead.ai_score || 0} />
          <PhoneValue value={lead.primary_phone || 'No phone'} />
          <div className="min-w-0">
            <span className="px-2.5 py-1 text-[10px] font-bold rounded-full uppercase tracking-wide whitespace-nowrap" style={{ backgroundColor: `${leadStatus.color}20`, color: leadStatus.color }}>{leadStatus.label}</span>
            {'source' in leadStatus && leadStatus.source && (
              <div className="mt-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: leadStatus.color }}>
                {leadStatus.source === 'ai' ? 'AI result' : 'Manual result'}
              </div>
            )}
            <div className="text-gray-600 text-xs font-semibold mt-1.5">{formatCallClock(getCallStartedAt(lead))}</div>
            <div className="text-gray-500 text-xs font-medium mt-0.5">{formatDurationSeconds(getCallDurationSeconds(lead, lead.lead_stage === 'calling'))}</div>
          </div>
          <span className="text-gray-600 text-xs font-medium truncate">
            {getMeetingTime(lead)
              ? `Meeting: ${new Date(getMeetingTime(lead) as string).toLocaleString()}`
              : lead.ai_summary || lead.lead_notes || 'No notes yet'}
          </span>
          <div className="justify-self-end w-full max-w-[180px] flex flex-col items-end gap-1.5">
            <span className="px-2.5 py-1 text-[10px] font-bold rounded-full uppercase tracking-wide whitespace-nowrap bg-slate-100 text-slate-700">
              {lead.do_not_call ? 'DNC / Blocked' : String(lead.raw_data?.answered_by || getCallStatusText(lead))}
            </span>
            {callInProgress ? (
              <button
                type="button"
                disabled
                className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-md bg-red-600 px-3 text-[11px] font-bold text-white cursor-not-allowed animate-pulse"
              >
                <PhoneCall size={13} /> Call in progress
              </button>
            ) : (lead.lead_stage === 'assigned' || lead.lead_stage === 'followup') && (
              <button
                type="button"
                disabled={lead.do_not_call || manualCallingId === lead.id}
                onClick={() => onCall(lead)}
                className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-md bg-teal-600 px-3 text-[11px] font-bold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <PhoneCall size={13} /> {manualCallingId === lead.id ? 'Calling...' : 'Call now'}
              </button>
            )}
          </div>
          </div>
        );})}
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
    <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200 mt-4 rounded-lg">
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

function Alert({ text, danger = false, action = null }: { text: string; danger?: boolean; action?: React.ReactNode }) {
  return (
    <div className={`mb-4 p-4 flex flex-wrap items-center justify-between gap-4 border rounded-lg text-sm font-medium shadow-sm ${danger ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
      <span className="min-w-0 break-words">{text}</span>
      {action}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="p-10 border border-dashed border-gray-300 rounded-lg bg-gray-50 text-center text-gray-500 text-sm font-semibold">{text}</div>;
}
