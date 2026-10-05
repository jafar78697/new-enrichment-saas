import { useState, useRef, useEffect } from 'react';
import { Play, Pause, AlertCircle, Phone, Volume2, VolumeX, Activity, X, SkipForward, User, Briefcase, List, ThumbsUp, ThumbsDown, Voicemail, Settings, Square } from 'lucide-react';
import { useCallMonitor } from '../../../hooks/useCallMonitor';

export default function LaneCard({ lane, handleToggleStatus, openAssignModal }: { lane: any, handleToggleStatus: (id: string, status: string) => void, openAssignModal: (slot: number) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { status: monitorStatus, transcript, isVolumeOn, toggleVolume } = useCallMonitor(
    lane.active_call_sid || null
  );

  const isLive = !!lane.active_call_sid;
  const isCampaignOn = lane.status === 'running';

  const [ending, setEnding] = useState(false);
  const [skipping, setSkipping] = useState(false);

  const endLiveCall = async (markAsMachine = false) => {
    if (!lane.active_call_sid || ending || skipping) return;
    if (markAsMachine) setSkipping(true);
    else setEnding(true);

    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const token = localStorage.getItem('enr_token') || localStorage.getItem('call_token');
      
      const endpoint = markAsMachine ? `/api/telephony/call-skip/${lane.active_call_sid}` : `/api/telephony/call-end/${lane.active_call_sid}`;
      
      await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: markAsMachine ? JSON.stringify({ reason: 'machine_or_bad_call' }) : undefined
      });
    } catch (err) {
      console.error('Failed to end call:', err);
    } finally {
      setEnding(false);
      setSkipping(false);
    }
  };

  // Auto-scroll transcript
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [transcript]);

  return (
    <div className={`bg-white border ${isLive ? 'border-blue-400 shadow-md ring-1 ring-blue-100' : 'border-gray-200 shadow-sm'} rounded-xl overflow-hidden flex flex-col transition-all duration-300`}>
      <div className={`p-4 border-b flex justify-between items-center transition-colors ${isLive ? 'bg-blue-50/50 border-blue-100' : (isCampaignOn ? 'bg-green-50/50 border-green-100' : 'bg-gray-50 border-gray-200')}`}>
        <div className="flex items-center space-x-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold relative
            ${lane.status === 'running' ? 'bg-green-100 text-green-700 border border-green-300' :
              lane.status === 'paused' ? 'bg-yellow-100 text-yellow-700 border border-yellow-300' :
              'bg-gray-100 text-gray-500 border border-gray-200'}`}>
            {lane.slot_number}
            {isLive && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
              </span>
            )}
            {!isLive && isCampaignOn && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
            )}
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900 m-0 flex items-center">
              {lane.name || `Lane ${lane.slot_number}`}
              {isLive ? (
                <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium flex items-center"><Activity className="w-3 h-3 mr-1" /> {lane.active_call_state || 'Connected'}</span>
              ) : (
                isCampaignOn && <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium flex items-center">Waiting</span>
              )}
            </h3>
            <div className="text-sm text-gray-500 capitalize flex items-center">
              Campaign: <span className={`ml-1 mr-3 ${isCampaignOn ? 'text-green-600 font-medium' : 'text-gray-500'}`}>{lane.status}</span>
              Call: <span className={`ml-1 ${lane.active_call_sid ? 'text-blue-500 font-medium' : 'text-gray-400'}`}>
                {lane.active_call_sid ? (monitorStatus !== 'disconnected' ? monitorStatus : lane.active_call_state || 'ringing') : (isCampaignOn ? 'waiting' : 'idle')}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {isLive && (
            <button
              onClick={toggleVolume}
              className={`p-2 rounded-lg transition-colors border ${isVolumeOn ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'}`}
              title={isVolumeOn ? "Mute live call" : "Listen to live call"}
            >
              {isVolumeOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>
          )}

          {lane.id && (
            <>
              <button
                onClick={() => openAssignModal(lane.slot_number)}
                className="p-2 rounded-lg transition-colors border bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200"
                title="Configure Lane"
              >
                <Settings className="w-5 h-5" />
              </button>
              {lane.status === 'running' ? (
                <>
                  <button
                    onClick={() => handleToggleStatus(lane.id, lane.status)}
                    className="p-2 rounded-lg transition-colors border bg-yellow-100 text-yellow-700 border-yellow-200 hover:bg-yellow-200"
                    title="Pause After This Call"
                  >
                    <Pause className="w-5 h-5" />
                  </button>
                  <button
                    onClick={async () => {
                      setEnding(true);
                      try {
                        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
                        const token = localStorage.getItem('enr_token') || localStorage.getItem('call_token');
                        const res = await fetch(`${API_URL}/api/v1/multi-calling/lanes/${lane.id}/stop`, {
                          method: 'POST',
                          headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (!res.ok) {
                          const errorData = await res.json().catch(() => ({}));
                          alert(`Failed to stop agent: ${errorData.error || res.statusText}`);
                        }
                        await handleToggleStatus(lane.id, lane.status); // Just to refresh state in parent
                      } finally {
                        setEnding(false);
                      }
                    }}
                    disabled={ending}
                    className="p-2 rounded-lg transition-colors border bg-red-100 text-red-700 border-red-200 hover:bg-red-200 disabled:opacity-50"
                    title="Stop Agent Now"
                  >
                    <Square className="w-5 h-5 fill-current" />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => handleToggleStatus(lane.id, lane.status)}
                  className="p-2 rounded-lg transition-colors border bg-green-100 text-green-700 border-green-200 hover:bg-green-200"
                  title="Start Lane"
                >
                  <Play className="w-5 h-5" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="p-4 flex-1 space-y-4">
        {lane.status === 'empty' ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 py-8">
            <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
            <p>Slot is empty</p>
            <button 
              onClick={() => openAssignModal(lane.slot_number)}
              className="mt-4 text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              Assign Configuration
            </button>
          </div>
        ) : (
          <>
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-sm mb-4 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-gray-500 text-xs uppercase font-bold block mb-0.5">Agent</span>
                  <span className="font-medium text-gray-800">{lane.agent_name || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-500 text-xs uppercase font-bold block mb-0.5">Niche</span>
                  <span className="font-medium text-gray-800">{lane.niche_name || 'N/A'}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-500 text-xs uppercase font-bold block mb-0.5">Assigned Script</span>
                  <span className="font-medium text-gray-800">
                    {lane.script_name ? `${lane.script_name} (v${lane.script_version || 1})` : 'N/A'}
                  </span>
                </div>
                {lane.numbers && lane.numbers.length > 0 && (
                  <div className="col-span-2">
                    <span className="text-gray-500 text-xs uppercase font-bold block mb-0.5">Caller Numbers (A/B)</span>
                    <div className="flex flex-wrap gap-1">
                      {lane.numbers.map((num: any) => (
                        <span key={num.phone_number_id} className={`text-xs px-1.5 py-0.5 rounded ${lane.rotation_cursor === num.position ? 'bg-blue-100 text-blue-700 border border-blue-200 font-medium' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                          {num.phone_number} {lane.rotation_cursor === num.position ? '(Next)' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {isLive && (
              <div className="bg-gray-900 rounded-lg border border-gray-800 flex flex-col shadow-inner" style={{ height: '280px' }}>
                <div className="bg-gray-800 text-gray-300 text-xs px-3 py-2 border-b border-gray-700 flex justify-between items-center">
                  <span className="font-semibold text-white tracking-wider uppercase flex items-center">
                    <Activity className="w-3 h-3 mr-2 text-blue-400" />
                    Live Transmission
                  </span>
                  {isVolumeOn && (
                    <div className="flex items-center space-x-1 text-blue-400">
                      <span className="h-2 w-1 bg-blue-400 animate-bounce delay-75"></span>
                      <span className="h-3 w-1 bg-blue-400 animate-bounce delay-150"></span>
                      <span className="h-2 w-1 bg-blue-400 animate-bounce delay-300"></span>
                    </div>
                  )}
                </div>

                {lane.active_prospect && (
                  <div className="bg-gray-800/50 px-3 py-2 border-b border-gray-700/50 flex flex-col gap-1">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 text-[10px] uppercase font-bold tracking-wider">Target Acquired</span>
                      <span className="text-blue-300 text-xs font-mono">{lane.active_prospect.phone}</span>
                    </div>
                    <div className="flex items-center text-gray-200 text-sm font-medium">
                      <User className="w-3 h-3 mr-1.5 text-gray-400" /> {lane.active_prospect.name || 'Unknown'}
                    </div>
                    <div className="flex items-center text-gray-400 text-xs">
                      <Briefcase className="w-3 h-3 mr-1.5" /> {lane.active_prospect.company}
                    </div>
                  </div>
                )}

                <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 font-mono text-sm relative scroll-smooth">
                  {transcript.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500 italic space-y-2">
                      <div className="flex space-x-1">
                        <span className="h-2 w-2 bg-gray-600 rounded-full animate-bounce"></span>
                        <span className="h-2 w-2 bg-gray-600 rounded-full animate-bounce delay-75"></span>
                        <span className="h-2 w-2 bg-gray-600 rounded-full animate-bounce delay-150"></span>
                      </div>
                      <span>{lane.active_call_sid ? 'Connecting...' : 'Dialing Next Lead...'}</span>
                    </div>
                  ) : (
                    transcript.map((msg, i) => (
                      <div key={i} className={`flex flex-col ${msg.speaker === 'prospect' ? 'items-end' : 'items-start'} transform transition-all duration-300 translate-y-0 opacity-100`}>
                        <span className={`text-[10px] mb-0.5 font-bold tracking-wider ${msg.speaker === 'prospect' ? 'text-green-400' : 'text-blue-400'}`}>
                          {msg.speaker === 'prospect' ? 'PROSPECT' : 'AI AGENT'}
                        </span>
                        <div className={`px-3 py-2 rounded-lg max-w-[85%] shadow-sm ${msg.speaker === 'prospect' ? 'bg-green-900/40 text-green-100 border border-green-800/50 rounded-br-none' : 'bg-blue-900/40 text-blue-100 border border-blue-800/50 rounded-bl-none'}`}>
                          {msg.text}
                        </div>
                      </div>
                    ))
                  )}
                  {/* Subtle pulsing indicator at bottom when live */}
                  <div className="h-2"></div>
                </div>
              </div>
            )}

            {isLive && (
              <div className="flex gap-2 w-full mt-2">
                <button
                  onClick={() => endLiveCall(true)}
                  disabled={skipping || ending}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 border border-amber-200"
                  title="Mark as Machine/Voicemail and Hang up"
                >
                  <SkipForward size={14} />
                  {skipping ? 'Skipping...' : 'Machine'}
                </button>
                <button
                  onClick={() => endLiveCall(false)}
                  disabled={ending || skipping}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-red-500/10 text-red-600 hover:bg-red-500/20 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 border border-red-200"
                >
                  <X size={14} />
                  {ending ? 'Ending...' : 'End Call'}
                </button>
              </div>
            )}

            <div className={`grid grid-cols-2 gap-4 text-sm transition-all`}>
              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 flex flex-col">
                <div className="text-gray-500 mb-1 flex items-center">
                  <List className="w-3 h-3 mr-1.5" /> Queue Status
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-900 font-medium">{lane.queue?.queued || 0} waiting</span>
                  <span className="text-blue-600 font-medium">{lane.queue?.claimed || 0} active</span>
                </div>
                {/* Upcoming Leads Preview */}
                {lane.queue_preview && lane.queue_preview.length > 0 && (
                  <div className="mt-1 pt-2 border-t border-gray-200">
                    <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1 block">Next Up</span>
                    <ul className="space-y-1">
                      {lane.queue_preview.map((p: any, i: number) => (
                        <li key={i} className="text-xs text-gray-600 truncate flex items-center">
                          <span className="w-1 h-1 bg-gray-300 rounded-full mr-1.5"></span>
                          {p.company_name || p.domain}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div className="space-y-4">
                <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                  <div className="text-gray-500 mb-1">Voice Agent</div>
                  <div className="text-gray-900 font-medium truncate" title={lane.agent_name}>{lane.agent_name || 'Default Voice'}</div>
                </div>
                {/* Outcomes Stats */}
                <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                  <div className="text-gray-500 mb-2 flex items-center text-xs">
                     Session Outcomes
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center text-green-700 bg-green-100/50 px-2 py-1 rounded">
                      <ThumbsUp className="w-3 h-3 mr-1" /> {lane.stats?.interested || 0}
                    </div>
                    <div className="flex items-center text-red-700 bg-red-100/50 px-2 py-1 rounded">
                      <ThumbsDown className="w-3 h-3 mr-1" /> {lane.stats?.not_interested || 0}
                    </div>
                    <div className="flex items-center text-purple-700 bg-purple-100/50 px-2 py-1 rounded">
                      <Voicemail className="w-3 h-3 mr-1" /> {lane.stats?.voicemail || 0}
                    </div>
                    <div className="flex items-center text-gray-700 bg-gray-200/50 px-2 py-1 rounded">
                      <Phone className="w-3 h-3 mr-1" /> {lane.stats?.no_answer || 0}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {!isLive && (
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-2 flex items-center">
                  <Phone className="w-4 h-4 mr-2" />
                  Assigned Numbers
                </h4>
                <div className="space-y-2">
                  {lane.numbers?.map((num: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center bg-gray-50 p-2 rounded border border-gray-200 text-sm">
                      <span className="text-gray-700">{num.phone_number}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${num.health_status === 'healthy' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {num.health_status}
                      </span>
                    </div>
                  ))}
                  {(!lane.numbers || lane.numbers.length === 0) && (
                    <div className="text-sm text-red-700 bg-red-50 p-2 rounded">Requires 2 numbers</div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {lane.id && !isLive && (
        <div className="bg-gray-50 p-3 border-t border-gray-200 flex justify-between items-center text-sm">
          <span className="text-gray-500">Cursor: Number {lane.rotation_cursor === 0 ? 'A' : 'B'}</span>
          <button onClick={() => openAssignModal(lane.slot_number)} className="text-gray-500 hover:text-gray-900 transition-colors">Configure</button>
        </div>
      )}
    </div>
  );
}
