// DialerPopup - floating mobile-dialer-style softphone overlay.
// Built for inline use on Funnel Intelligence page (pass a lead/phone to kick off a call).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ClipboardPenLine, LoaderCircle, Mic, PhoneCall, PhoneOff, Volume2, VolumeX } from 'lucide-react';
import useWebRTCDevice, { type CallStatus, type DeviceStatus } from '../hooks/useWebRTCDevice';
import { callsApi, type Agent } from '../services/callsApi';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

export interface DialerPopupProps {
  phone: string;
  contactId?: number | string | null;
  contactName?: string | null;
  contactCompany?: string | null;
  onClose: () => void;
  onEnded?: (context: { callSid: string | null; connected: boolean; seconds: number }) => void;
  isOpen?: boolean; // Controls visual visibility while keeping hook mounted
  autoStart?: boolean;
}

const DTMF_KEYS: Array<{ digit: string; letters: string }> = [
  { digit: '1', letters: '' },
  { digit: '2', letters: 'ABC' },
  { digit: '3', letters: 'DEF' },
  { digit: '4', letters: 'GHI' },
  { digit: '5', letters: 'JKL' },
  { digit: '6', letters: 'MNO' },
  { digit: '7', letters: 'PQRS' },
  { digit: '8', letters: 'TUV' },
  { digit: '9', letters: 'WXYZ' },
  { digit: '*', letters: '' },
  { digit: '0', letters: '+' },
  { digit: '#', letters: '' },
];

function smartClean(raw: string): string {
  if (!raw) return '';
  // Strip common extension formats (e.g., "x123", "ext. 123")
  const noExt = raw.split(/(?:x|ext)[ .]?\d+/i)[0].trim();
  const digitsOnly = noExt.replace(/\D/g, '');

  // 00 is an international dial prefix, not part of an E.164 number.
  if (digitsOnly.startsWith('00')) return `+${digitsOnly.substring(2)}`;

  if (noExt.startsWith('+')) return `+${digitsOnly}`;

  // The CRM is configured for US leads. Only a valid 10-digit US number is
  // automatically given the +1 country code.
  if (/^[2-9]\d{9}$/.test(digitsOnly)) return `+1${digitsOnly}`;

  if (/^1[2-9]\d{9}$/.test(digitsOnly)) return `+${digitsOnly}`;

  // Never guess a country code from malformed scraped data.
  return digitsOnly.length >= 10 ? `+${digitsOnly}` : digitsOnly;
}

function isValidUSNumber(phoneNumber: string): boolean {
  return /^\+1[2-9]\d{9}$/.test(phoneNumber);
}

function formatTimer(totalSeconds: number): string {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function statusLabel(deviceStatus: DeviceStatus, callStatus: CallStatus): { text: string; tone: string } {
  if (callStatus === 'connected') return { text: 'Connected', tone: 'bg-emerald-500' };
  if (callStatus === 'ringing' || callStatus === 'dialing') return { text: 'Calling…', tone: 'bg-amber-500' };
  if (callStatus === 'incoming') return { text: 'Incoming call', tone: 'bg-amber-500' };
  if (callStatus === 'ended') return { text: 'Call ended', tone: 'bg-rose-500' };
  if (deviceStatus === 'ready') return { text: 'Ready', tone: 'bg-emerald-500' };
  if (deviceStatus === 'registering') return { text: 'Connecting device…', tone: 'bg-slate-400' };
  if (deviceStatus === 'error') return { text: 'Device error', tone: 'bg-rose-500' };
  return { text: 'Offline', tone: 'bg-slate-400' };
}

function useIncomingRingtone(isIncoming: boolean) {
  const contextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const primeAudio = () => {
      if (contextRef.current) return;
      const context = new AudioContext();
      contextRef.current = context;
      void context.resume().then(() => context.suspend());
    };

    window.addEventListener('pointerdown', primeAudio, { once: true });
    return () => window.removeEventListener('pointerdown', primeAudio);
  }, []);

  useEffect(() => {
    if (!isIncoming) return;

    const context = contextRef.current || new AudioContext();
    contextRef.current = context;
    const playTone = () => {
      void context.resume();
      [0, 0.24].forEach((offset) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const startAt = context.currentTime + offset;
        oscillator.type = 'sine';
        oscillator.frequency.value = 780;
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(0.16, startAt + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.18);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(startAt);
        oscillator.stop(startAt + 0.2);
      });
    };

    playTone();
    const interval = window.setInterval(playTone, 1800);
    return () => window.clearInterval(interval);
  }, [isIncoming]);

  useEffect(() => () => {
    const context = contextRef.current;
    if (context && context.state !== 'closed') void context.close();
  }, []);
}

function useResolvedAgentId(): number | null {
  const [agentId, setAgentId] = useState<number | null>(() => {
    const raw = localStorage.getItem('call_agent_id');
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  });

  useEffect(() => {
    let cancelled = false;
    callsApi
      .listAgents()
      .then(({ agents }: { agents: Agent[] }) => {
        if (cancelled || !agents || agents.length === 0) return;
        
        // Ensure the cached agent ID actually belongs to this user.
        // If not (e.g. previous user logged out but localStorage wasn't cleared),
        // fallback to the user's first available agent.
        const cachedRaw = localStorage.getItem('call_agent_id');
        const cachedParsed = cachedRaw ? parseInt(cachedRaw, 10) : NaN;
        
        let validAgentId = Number.isFinite(cachedParsed) ? cachedParsed : null;
        if (!validAgentId || !agents.some(a => a.id === validAgentId)) {
          validAgentId = agents[0].id;
          localStorage.setItem('call_agent_id', String(validAgentId));
        }
        
        if (agentId !== validAgentId) {
          setAgentId(validAgentId);
        }
      })
      .catch(() => {
        /* silent — caller will see device error */
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  return agentId;
}

export default function DialerPopup({
  phone,
  contactId,
  contactName,
  contactCompany,
  onClose,
  onEnded,
  isOpen = true,
  autoStart = false,
}: DialerPopupProps) {
  const { user } = useAuth();
  const agentId = useResolvedAgentId();
  const [manualPhone, setManualPhone] = useState<string>(() => smartClean(phone));
  const [dtmfLog, setDtmfLog] = useState('');
  const [minimized, setMinimized] = useState(false);
  const [lastCallSid, setLastCallSid] = useState<string | null>(null);
  const [endedReported, setEndedReported] = useState(false);
  const [showWrapUp, setShowWrapUp] = useState(false);
  const [wrapUpNotes, setWrapUpNotes] = useState('');
  const [meetingTime, setMeetingTime] = useState('');
  const [showTransferMode, setShowTransferMode] = useState(false);
  const [availableAgents, setAvailableAgents] = useState<Agent[]>([]);
  const [isStarting, setIsStarting] = useState(autoStart);
  const autoStartAttemptedRef = useRef(false);
  const startInProgressRef = useRef(false);
  const startUnlockTimerRef = useRef<number | null>(null);
  const callReachedActiveLifecycleRef = useRef(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);



  const {
    deviceStatus,
    callStatus,
    isMuted,
    timerSeconds,
    activeCallSid,
    error,
    incomingCall,
    transcriptMessages,
    isTranscribing,
    transcriptStatus,
    startCall,
    endCall,
    toggleMute,
    sendDtmf,
    acceptIncoming,
    rejectIncoming,
  } = useWebRTCDevice(agentId);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcriptMessages]);

  const isIncoming = callStatus === 'incoming';
  const isInCall = callStatus === 'dialing' || callStatus === 'ringing' || callStatus === 'connected' || callStatus === 'incoming';
  const isIdle = callStatus === 'idle' || callStatus === 'ended';
  const cleanPhone = smartClean(manualPhone);
  const hasInvalidUSNumber = Boolean(manualPhone) && !isValidUSNumber(cleanPhone);
  const canCall = isValidUSNumber(cleanPhone) && deviceStatus === 'ready' && isIdle;
  const callIsStarting = isStarting || callStatus === 'dialing';

  // One mounted dialer owns the Relay connection. When a Lead List row opens it,
  // reset just the UI target without creating a second browser phone session.
  useEffect(() => {
    setManualPhone(smartClean(phone));
    setDtmfLog('');
    setLastCallSid(null);
    setEndedReported(false);
    setShowWrapUp(false);
    setWrapUpNotes('');
    setMeetingTime('');
    setIsStarting(autoStart);
    autoStartAttemptedRef.current = false;
    startInProgressRef.current = false;
    callReachedActiveLifecycleRef.current = false;
  }, [autoStart, contactId, phone]);

  // The wrapper keeps this dialer mounted to preserve the browser phone
  // registration. Clear the completed-call UI whenever its window closes.
  useEffect(() => {
    if (isOpen) return;
    setShowWrapUp(false);
    setShowTransferMode(false);
    setWrapUpNotes('');
    setMeetingTime('');
    setIsStarting(false);
    autoStartAttemptedRef.current = false;
    startInProgressRef.current = false;
    callReachedActiveLifecycleRef.current = false;
  }, [isOpen]);

  useEffect(() => {
    if (activeCallSid) setLastCallSid(activeCallSid);
  }, [activeCallSid]);

  useEffect(() => {
    if (['dialing', 'ringing', 'incoming', 'connected'].includes(callStatus)) {
      callReachedActiveLifecycleRef.current = true;
    }
  }, [callStatus]);

  // Report end-of-call outcome exactly once
  useEffect(() => {
    if (callStatus !== 'ended') return;
    if (!isOpen) return;
    if (!callReachedActiveLifecycleRef.current) return;
    if (endedReported) return;
    setEndedReported(true);
    callReachedActiveLifecycleRef.current = false;
    onEnded?.({
      callSid: lastCallSid,
      connected: timerSeconds > 0,
      seconds: timerSeconds,
    });
    
    if (contactId && !error) {
      setShowWrapUp(true);
    }
  }, [callStatus, endedReported, isOpen, lastCallSid, onEnded, timerSeconds, contactId, error]);

  const handleSaveWrapUp = async (finalNote?: string | React.MouseEvent) => {
    const noteToSave = typeof finalNote === 'string' ? finalNote : wrapUpNotes;
    
    let stage: string | undefined;
    if (noteToSave === 'VM') stage = 'voicemail';
    else if (noteToSave === 'Not Interested') stage = 'not_interested';
    else if (noteToSave === 'meeting') stage = 'interested';

    if (contactId) {
      try {
        await callsApi.updateContact(Number(contactId), {
          notes: noteToSave || null,
          meeting_time: meetingTime || null,
          stage,
        });
      } catch (err) {
        console.error('Failed to save wrap up details', err);
      }
    }
    onClose();
  };

  const handleKeypad = (digit: string) => {
    if (isInCall) {
      sendDtmf(digit);
      setDtmfLog((prev) => (prev + digit).slice(-10));
    } else {
      setManualPhone((prev) => prev + digit);
    }
  };

  const beginOutboundCall = useCallback(async () => {
    if (!canCall || startInProgressRef.current) return;

    startInProgressRef.current = true;
    callReachedActiveLifecycleRef.current = false;
    setEndedReported(false);
    setShowWrapUp(false);
    setManualPhone(cleanPhone);
    setIsStarting(true);

    try {
      await startCall({ phoneNumber: cleanPhone, contactId, record: Boolean(user?.call_recording_enabled) });
      // A brief lock prevents a double-click from immediately becoming a hang-up.
      startUnlockTimerRef.current = window.setTimeout(() => {
        startInProgressRef.current = false;
        setIsStarting(false);
      }, 900);
    } catch {
      startInProgressRef.current = false;
      setIsStarting(false);
    }
  }, [canCall, cleanPhone, contactId, startCall, user?.call_recording_enabled]);

  useEffect(() => {
    if (!autoStart || autoStartAttemptedRef.current || !canCall) return;
    autoStartAttemptedRef.current = true;
    void beginOutboundCall();
  }, [autoStart, beginOutboundCall, canCall]);

  useEffect(() => () => {
    if (startUnlockTimerRef.current !== null) window.clearTimeout(startUnlockTimerRef.current);
  }, []);

  useEffect(() => {
    if (autoStart && (deviceStatus === 'error' || hasInvalidUSNumber) && !startInProgressRef.current) {
      setIsStarting(false);
    }
  }, [autoStart, deviceStatus, hasInvalidUSNumber]);

  // @ts-ignore
  const handleTransferClick = async () => {
    setShowTransferMode(true);
    try {
      const { agents } = await callsApi.listAgents();
      // Filter out self
      setAvailableAgents(agents.filter(a => a.id !== agentId));
    } catch (err) {
      console.error(err);
    }
  };

  const executeTransfer = async (targetAgentId: number) => {
    if (!activeCallSid) return;
    try {
      await callsApi.transferCall(activeCallSid, targetAgentId);
      endCall();
      if (contactId) {
        setShowWrapUp(true);
      } else {
        onClose();
      }
    } catch (err) {
      console.error('Transfer failed', err);
      toast.error('Transfer failed');
    }
  };


  const label = useMemo(() => statusLabel(deviceStatus, callStatus), [deviceStatus, callStatus]);
  const displayName = isIncoming ? incomingCall?.callerName || 'Incoming call' : contactName || 'Manual dial';
  const displayMeta = isIncoming ? incomingCall?.callerNumber || 'Unknown caller' : contactCompany || cleanPhone;
  const displayPhone = isIncoming ? incomingCall?.callerNumber || '' : manualPhone;

  useIncomingRingtone(isIncoming);

  // If not open and idle, return null to hide UI but keep the hook active.
  if (!isOpen && isIdle) {
    return null;
  }

  // Force open if incoming call
  const isVisuallyMinimized = minimized && callStatus !== 'incoming';

  if (isVisuallyMinimized) {
    return (
      <div
        className="fixed bottom-6 right-6 z-[70] bg-white border border-slate-200 shadow-2xl rounded-2xl px-4 py-3 flex items-center gap-3 cursor-pointer hover:shadow-xl transition"
        onClick={() => setMinimized(false)}
      >
        <span className={`w-3 h-3 rounded-full ${label.tone}`} />
        <div className="text-sm">
          <div className="font-semibold text-slate-900">{displayName}</div>
          <div className="text-xs text-slate-500">
            {label.text}
            {callStatus === 'connected' ? ` · ${formatTimer(timerSeconds)}` : ''}
          </div>
        </div>
        <button className="text-slate-400 hover:text-slate-600 text-sm px-2" onClick={(e) => { e.stopPropagation(); setMinimized(false); }}>▢</button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className={`w-[380px] bg-white rounded-3xl shadow-2xl overflow-hidden border ${isIncoming ? 'border-rose-400 ring-4 ring-rose-500/25' : 'border-slate-200'}`}>
        {showTransferMode ? (
          <div className="flex flex-col h-full p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Transfer Call</h3>
            <p className="text-sm text-slate-500 mb-4">Select a closer to transfer to:</p>
            <div className="flex flex-col gap-2 overflow-y-auto max-h-64">
              {availableAgents.length === 0 ? (
                <p className="text-sm text-slate-400">Loading or no agents available...</p>
              ) : (
                availableAgents.map(a => (
                  <button
                    key={a.id}
                    onClick={() => executeTransfer(a.id)}
                    className="w-full bg-slate-50 hover:bg-slate-100 text-slate-700 py-3 rounded-xl font-semibold transition flex items-center justify-between px-4 border border-slate-200"
                  >
                    <span>{a.name}</span>
                    <span className={a.is_available ? 'text-emerald-500 text-xs font-bold' : 'text-slate-400 text-xs'}>
                      {a.is_available ? 'AVAILABLE' : 'OFFLINE'}
                    </span>
                  </button>
                ))
              )}
            </div>
            <button
              className="mt-6 w-full text-slate-400 hover:text-slate-600 text-sm font-medium transition"
              onClick={() => setShowTransferMode(false)}
            >
              Cancel Transfer
            </button>
          </div>
        ) : showWrapUp ? (
          <div className="flex flex-col h-full p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Call Wrap-up</h3>
            <p className="text-sm text-slate-500 mb-6">Select outcome for {displayName}</p>
            
            <div className="flex flex-col gap-3">
              <button 
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2"
                onClick={() => {
                  setWrapUpNotes('VM');
                  handleSaveWrapUp('VM');
                }}
              >
                <><Mic size={17} /> Left Voicemail</>
              </button>
              
              <button 
                className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2"
                onClick={() => {
                  setWrapUpNotes('Not Interested');
                  handleSaveWrapUp('Not Interested');
                }}
              >
                <><PhoneOff size={17} /> Not Interested</>
              </button>

              <button 
                className="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2"
                onClick={() => setWrapUpNotes('meeting')}
              >
                <><CalendarDays size={17} /> Book Meeting</>
              </button>

              <button 
                className="w-full bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2"
                onClick={() => setWrapUpNotes('note')}
              >
                <><ClipboardPenLine size={17} /> Add Custom Note</>
              </button>
            </div>

            {(wrapUpNotes === 'meeting' || wrapUpNotes === 'note' || (wrapUpNotes !== '' && wrapUpNotes !== 'VM' && wrapUpNotes !== 'Not Interested' && wrapUpNotes !== 'meeting' && wrapUpNotes !== 'note')) && (
              <div className="mt-6 pt-6 border-t border-slate-100">
                {wrapUpNotes === 'meeting' && (
                  <>
                    <label className="text-sm font-semibold text-slate-700 mb-1 block">Meeting Time</label>
                    <input
                      type="datetime-local"
                      className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-4"
                      value={meetingTime}
                      onChange={(e) => setMeetingTime(e.target.value)}
                    />
                  </>
                )}
                
                <label className="text-sm font-semibold text-slate-700 mb-1 block">Notes (Optional)</label>
                <textarea
                  className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-4"
                  rows={2}
                  placeholder="Additional details..."
                  defaultValue=""
                  id="custom-note-input"
                />

                <div className="flex gap-3">
                  <button 
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-xl font-semibold transition"
                    onClick={() => setWrapUpNotes('')} // Go back to options
                  >
                    Back
                  </button>
                  <button 
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-semibold transition"
                    onClick={() => {
                      const customNote = (document.getElementById('custom-note-input') as HTMLTextAreaElement)?.value || '';
                      handleSaveWrapUp(customNote);
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
            
            {wrapUpNotes === '' && (
              <button 
                className="mt-6 w-full text-slate-400 hover:text-slate-600 text-sm font-medium transition"
                onClick={onClose}
              >
                Skip wrap-up
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Header */}
        <div className={`flex items-center justify-between px-5 py-3 border-b ${isIncoming ? 'border-rose-400 bg-rose-600 text-white' : 'border-slate-100 bg-slate-50'}`}>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${isIncoming ? 'bg-white animate-pulse' : label.tone}`} />
            <span className={`text-xs font-semibold uppercase tracking-wide ${isIncoming ? 'text-white' : 'text-slate-700'}`}>{label.text}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              title="Minimize"
              className={`w-8 h-8 rounded-full text-lg flex items-center justify-center ${isIncoming ? 'text-white/80 hover:bg-white/15' : 'hover:bg-slate-200 text-slate-500'}`}
              onClick={() => setMinimized(true)}
            >−</button>
            <button
              title={callIsStarting ? 'Preparing call' : 'Close'}
              disabled={callIsStarting}
              className={`w-8 h-8 rounded-full text-lg flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-40 ${isIncoming ? 'text-white hover:bg-white/15' : 'hover:bg-rose-100 text-slate-500 hover:text-rose-600'}`}
              onClick={() => {
                if (callStatus === 'connected' || callStatus === 'ringing' || callStatus === 'dialing') {
                  try { endCall(); } catch { /* ignore */ }
                }
                if (callStatus === 'incoming') {
                  try { rejectIncoming(); } catch { /* ignore */ }
                }
                onClose();
              }}
            >✕</button>
          </div>
        </div>

        {/* Identity */}
        <div className="px-6 pt-5 pb-2 text-center">
          <div className={`text-xs uppercase font-semibold tracking-wide ${isIncoming ? 'text-rose-500' : callStatus === 'connected' ? 'text-emerald-600' : 'text-slate-400'}`}>{isIncoming ? 'Incoming call' : callStatus === 'connected' ? 'Connected' : isInCall || callIsStarting ? 'Calling' : 'Ready to call'}</div>
          <div className="mt-1 text-lg font-bold text-slate-900 truncate">{displayName}</div>
          <div className="text-xs text-slate-500 truncate">{displayMeta}</div>
        </div>

        {/* Big number display */}
        <div className="px-6 pb-3 text-center">
          <input
            value={displayPhone}
            onChange={(e) => setManualPhone(e.target.value)}
            onBlur={() => setManualPhone(smartClean(manualPhone))}
            disabled={isInCall}
            placeholder="+1 203 204 7415"
            className="w-full text-center text-2xl font-bold tracking-wider bg-transparent border-0 focus:outline-none text-slate-900 font-mono disabled:opacity-70"
          />
          {callStatus === 'connected' && (
            <div className="text-lg font-mono text-emerald-600 mt-1">{formatTimer(timerSeconds)}</div>
          )}
          {isInCall && dtmfLog && (
            <div className="text-xs text-slate-500 mt-1">Keys: {dtmfLog}</div>
          )}
          {hasInvalidUSNumber && !isInCall && (
            <div className="text-xs text-rose-600 mt-2">
              This lead has no valid US number. Enter +1 followed by a 10-digit US number before calling.
            </div>
          )}
        </div>

        {callStatus === 'connected' ? (
          <section className="mx-6 mb-4 flex min-h-[390px] flex-col rounded-xl border border-slate-200 bg-slate-50 text-left">
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 bg-white rounded-t-xl">
              <Volume2 size={15} className={isTranscribing ? 'text-emerald-600' : 'text-slate-400'} />
              Live transcription
              <span className={`ml-auto h-2 w-2 rounded-full ${isTranscribing ? 'bg-emerald-500' : 'bg-amber-400'}`} aria-label={isTranscribing ? 'Live' : 'Preparing'} />
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
              {transcriptMessages && transcriptMessages.length > 0 ? (
                <>
                  {transcriptMessages.map((msg: any) => (
                    <div key={msg.id} className={`flex flex-col max-w-[85%] ${msg.speaker === 'You' ? 'self-end items-end' : 'self-start items-start'}`}>
                      <span className="text-[10px] font-semibold uppercase text-slate-400 mb-1 ml-1 tracking-wider">{msg.speaker}</span>
                      <div className={`px-3 py-2 rounded-2xl text-sm ${msg.speaker === 'You' ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm'}`}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  <div ref={transcriptEndRef} />
                </>
              ) : (
                <p className="text-sm leading-6 text-slate-500 text-center mt-4">{transcriptStatus || 'Preparing live transcript...'}</p>
              )}
            </div>
          </section>
        ) : (
          <div className="px-6 pb-4 grid grid-cols-3 gap-3">
            {DTMF_KEYS.map(({ digit, letters }) => (
              <button
                key={digit}
                onClick={() => handleKeypad(digit)}
                className="aspect-square rounded-full bg-slate-100 hover:bg-slate-200 active:bg-slate-300 transition flex flex-col items-center justify-center"
              >
                <span className="text-2xl font-semibold text-slate-900">{digit}</span>
                {letters && <span className="text-[10px] font-semibold tracking-widest text-slate-500">{letters}</span>}
              </button>
            ))}
          </div>
        )}

        {/* Controls */}
        <div className="px-6 pb-6 flex items-center justify-center gap-4">
          <button
            disabled={callStatus !== 'connected'}
            onClick={toggleMute}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition shadow-sm ${
              isMuted ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX size={22} /> : <Mic size={22} />}
          </button>

          {callStatus === 'incoming' ? (
            <>
              <button
                onClick={acceptIncoming}
                className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-2xl flex items-center justify-center shadow-lg shadow-emerald-200 transition"
                title="Accept Call"
              >
                <PhoneCall size={27} />
              </button>
              <button
                onClick={rejectIncoming}
                className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-2xl flex items-center justify-center shadow-lg shadow-rose-200 transition"
                title="Decline Call"
              >
                <PhoneOff size={27} />
              </button>
            </>
          ) : isIdle ? (
            <button
              disabled={!canCall || callIsStarting}
              onClick={beginOutboundCall}
              className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-2xl flex items-center justify-center shadow-lg shadow-emerald-200 disabled:opacity-40 disabled:cursor-not-allowed transition"
              title={callIsStarting ? 'Preparing call' : 'Call'}
            >
              {callIsStarting ? <LoaderCircle size={25} className="animate-spin" /> : <PhoneCall size={27} />}
            </button>
          ) : callIsStarting ? (
            <button
              disabled
              className="w-16 h-16 rounded-full bg-amber-500 text-slate-900 text-2xl flex items-center justify-center shadow-lg shadow-amber-200 cursor-not-allowed"
              title="Starting call"
            >
              <LoaderCircle size={25} className="animate-spin" />
            </button>
          ) : (
            <button
              onClick={endCall}
              className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-2xl flex items-center justify-center shadow-lg shadow-rose-200 transition"
              title="Hang up"
            >
              <PhoneOff size={27} />
            </button>
          )}

          <button
            disabled
            className={`w-14 h-14 rounded-full flex items-center justify-center transition shadow-sm ${
              'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
            title="Transfer is unavailable for protected browser calls"
          >
            ↪️
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="px-5 py-3 bg-rose-50 border-t border-rose-100 text-xs text-rose-700">
            {error}
          </div>
        )}
        {!agentId && (
          <div className="px-5 py-3 bg-amber-50 border-t border-amber-100 text-xs text-amber-800">
            No calling agent is configured yet. Add one on the Employees page.
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}
