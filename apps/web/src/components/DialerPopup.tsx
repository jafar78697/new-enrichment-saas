// DialerPopup — floating mobile-dialer-style softphone overlay powered by Twilio Voice SDK.
// Built for inline use on Funnel Intelligence page (pass a lead/phone to kick off a call).
import { useEffect, useMemo, useState } from 'react';
import { useTwilioDevice, type CallStatus, type DeviceStatus } from '../hooks/useTwilioDevice';
import { callsApi, type Agent } from '../services/callsApi';
import { toast } from 'sonner';

export interface DialerPopupProps {
  phone: string;
  contactId?: number | string | null;
  contactName?: string | null;
  contactCompany?: string | null;
  onClose: () => void;
  onEnded?: (context: { callSid: string | null; connected: boolean; seconds: number }) => void;
  autoStart?: boolean; // auto-start call on mount
  record?: boolean;
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
  const trimmed = String(raw || '').trim();
  const hasLeadingPlus = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length === 10 && !hasLeadingPlus) return '+1' + digitsOnly;
  if (digitsOnly.length === 11 && digitsOnly.startsWith('1') && !hasLeadingPlus) return '+' + digitsOnly;
  if (hasLeadingPlus) return `+${digitsOnly}`;
  return trimmed.replace(/[^\d*#]/g, '');
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

function useResolvedAgentId(): number | null {
  const [agentId, setAgentId] = useState<number | null>(() => {
    const raw = localStorage.getItem('call_agent_id');
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  });

  useEffect(() => {
    if (agentId != null) return;
    let cancelled = false;
    callsApi
      .listAgents()
      .then(({ agents }: { agents: Agent[] }) => {
        if (cancelled || !agents || agents.length === 0) return;
        const first = agents[0];
        localStorage.setItem('call_agent_id', String(first.id));
        setAgentId(first.id);
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
  autoStart = true,
  record = true,
}: DialerPopupProps) {
  const agentId = useResolvedAgentId();
  const [manualPhone, setManualPhone] = useState<string>(() => smartClean(phone));
  const [dtmfLog, setDtmfLog] = useState('');
  const [minimized, setMinimized] = useState(false);
  const [autoStarted, setAutoStarted] = useState(false);
  const [lastCallSid, setLastCallSid] = useState<string | null>(null);
  const [endedReported, setEndedReported] = useState(false);
  const [showWrapUp, setShowWrapUp] = useState(false);
  const [wrapUpNotes, setWrapUpNotes] = useState('');
  const [meetingTime, setMeetingTime] = useState('');
  const [showTransferMode, setShowTransferMode] = useState(false);
  const [availableAgents, setAvailableAgents] = useState<Agent[]>([]);

  const {
    deviceStatus,
    callStatus,
    isMuted,
    timerSeconds,
    activeCallSid,
    error,
    startCall,
    endCall,
    toggleMute,
    sendDtmf,
  } = useTwilioDevice(agentId);

  const isInCall = callStatus === 'dialing' || callStatus === 'ringing' || callStatus === 'connected' || callStatus === 'incoming';
  const isIdle = callStatus === 'idle' || callStatus === 'ended';
  const cleanPhone = smartClean(manualPhone);
  const canCall = cleanPhone.replace(/[^\d*#]/g, '').length >= 3 && deviceStatus === 'ready' && isIdle;

  useEffect(() => {
    if (activeCallSid) setLastCallSid(activeCallSid);
  }, [activeCallSid]);

  // Kick off the call automatically once device is ready
  useEffect(() => {
    if (!autoStart) return;
    if (autoStarted) return;
    if (deviceStatus !== 'ready') return;
    if (!canCall) return;
    setAutoStarted(true);
    startCall({ phoneNumber: cleanPhone, contactId, record }).catch(() => {
      /* error is surfaced via hook */
    });
  }, [autoStart, autoStarted, canCall, cleanPhone, contactId, deviceStatus, record, startCall]);

  // Report end-of-call outcome exactly once
  useEffect(() => {
    if (callStatus !== 'ended') return;
    if (endedReported) return;
    setEndedReported(true);
    onEnded?.({
      callSid: lastCallSid,
      connected: timerSeconds > 0,
      seconds: timerSeconds,
    });
    
    if (contactId) {
      setShowWrapUp(true);
    }
  }, [callStatus, endedReported, lastCallSid, onEnded, timerSeconds, contactId]);

  const handleSaveWrapUp = async (finalNote?: string | React.MouseEvent) => {
    const noteToSave = typeof finalNote === 'string' ? finalNote : wrapUpNotes;
    if (contactId) {
      try {
        await callsApi.updateContact(Number(contactId), {
          notes: noteToSave || null,
          meeting_time: meetingTime || null,
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

  const handleStart = () => {
    if (!canCall) return;
    setEndedReported(false);
    startCall({ phoneNumber: cleanPhone, contactId, record }).catch(() => {});
  };

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
  const displayName = contactName || 'Manual dial';
  const displayMeta = contactCompany || cleanPhone;

  if (minimized) {
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
      <div className="w-[380px] bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200">
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
                🎤 Left Voicemail
              </button>
              
              <button 
                className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2"
                onClick={() => {
                  setWrapUpNotes('Not Interested');
                  handleSaveWrapUp('Not Interested');
                }}
              >
                🛑 Not Interested
              </button>

              <button 
                className="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2"
                onClick={() => setWrapUpNotes('meeting')}
              >
                🗓 Book Meeting
              </button>

              <button 
                className="w-full bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2"
                onClick={() => setWrapUpNotes('note')}
              >
                📝 Add Custom Note
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
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${label.tone}`} />
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">{label.text}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              title="Minimize"
              className="w-8 h-8 rounded-full hover:bg-slate-200 text-slate-500 text-lg flex items-center justify-center"
              onClick={() => setMinimized(true)}
            >−</button>
            <button
              title="Close"
              className="w-8 h-8 rounded-full hover:bg-rose-100 text-slate-500 hover:text-rose-600 text-lg flex items-center justify-center"
              onClick={() => {
                try { endCall(); } catch { /* ignore */ }
                onClose();
              }}
            >✕</button>
          </div>
        </div>

        {/* Identity */}
        <div className="px-6 pt-5 pb-2 text-center">
          <div className="text-xs uppercase text-slate-400 font-semibold tracking-wide">Calling</div>
          <div className="mt-1 text-lg font-bold text-slate-900 truncate">{displayName}</div>
          <div className="text-xs text-slate-500 truncate">{displayMeta}</div>
        </div>

        {/* Big number display */}
        <div className="px-6 pb-3 text-center">
          <input
            value={manualPhone}
            onChange={(e) => setManualPhone(e.target.value)}
            onBlur={() => setManualPhone(smartClean(manualPhone))}
            disabled={isInCall}
            placeholder="+1 555 123 4567"
            className="w-full text-center text-2xl font-bold tracking-wider bg-transparent border-0 focus:outline-none text-slate-900 font-mono disabled:opacity-70"
          />
          {callStatus === 'connected' && (
            <div className="text-lg font-mono text-emerald-600 mt-1">{formatTimer(timerSeconds)}</div>
          )}
          {isInCall && dtmfLog && (
            <div className="text-xs text-slate-500 mt-1">Keys: {dtmfLog}</div>
          )}
        </div>

        {/* DTMF Grid */}
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
            {isMuted ? '🔇' : '🎤'}
          </button>

          {isIdle ? (
            <button
              disabled={!canCall}
              onClick={handleStart}
              className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-2xl flex items-center justify-center shadow-lg shadow-emerald-200 disabled:opacity-40 disabled:cursor-not-allowed transition"
              title="Call"
            >
              📞
            </button>
          ) : (
            <button
              onClick={endCall}
              className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-2xl flex items-center justify-center shadow-lg shadow-rose-200 transition"
              title="Hang up"
            >
              🛑
            </button>
          )}

          <button
            disabled={callStatus !== 'connected'}
            onClick={handleTransferClick}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition shadow-sm ${
              callStatus === 'connected' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
            title="Transfer Call"
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
            No Twilio agent configured yet. Add one on the Employees page.
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}
