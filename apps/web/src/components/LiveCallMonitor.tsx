import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Bot, Headphones, SkipForward, Square, User, VolumeX, X, RefreshCw } from 'lucide-react';
import { getLiveAudioContext, LiveAudioPlayer, unlockLiveAudio } from '../utils/live-audio';

interface LiveCallMonitorProps {
  callSid: string | null;
  onClose: () => void;
  autoStart?: boolean;
  autoFollow?: boolean;
  activeLeadName?: string | null;
  onCallEnded?: (callSid: string, status: string) => void;
  onSkipCurrentCall?: (callSid: string, reason: string) => Promise<void> | void;
  onDisableCalling?: () => Promise<void> | void;
  fromPhone?: string | null;
}

interface TranscriptEntry {
  callSid?: string;
  speaker: 'ai' | 'prospect';
  text: string;
  timestamp: string;
}

export default function LiveCallMonitor({
  callSid,
  onClose,
  autoStart = false,
  autoFollow = false,
  activeLeadName = null,
  onCallEnded,
  onSkipCurrentCall,
  onDisableCalling,
  fromPhone = null,
}: LiveCallMonitorProps) {
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [callStatus, setCallStatus] = useState<string>(callSid ? 'ringing' : 'waiting');
  const [error, setError] = useState<string | null>(null);
  const [skipping, setSkipping] = useState(false);
  const [ending, setEnding] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [aiAudioDetected, setAiAudioDetected] = useState(false);
  const [prospectAudioDetected, setProspectAudioDetected] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playerRef = useRef<LiveAudioPlayer | null>(null);
  const pendingAudioRef = useRef<Array<{ audio: string; speaker: 'ai' | 'prospect' }>>([]);
  const subscribedCallSidRef = useRef<string | null>(null);
  const callSidRef = useRef<string | null>(callSid);
  const onCallEndedRef = useRef(onCallEnded);
  const announcedTerminalStatusRef = useRef<string | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const ringbackRef = useRef<{ oscillators: OscillatorNode[], interval: number | null }>({ oscillators: [], interval: null });
  const isTerminalRef = useRef<boolean>(false);

  callSidRef.current = callSid;
  onCallEndedRef.current = onCallEnded;

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  const startRingback = () => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;
    if (ringbackRef.current.interval) return;

    const playRing = () => {
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.1);
      gain.gain.setValueAtTime(0.3, now + 1.9);
      gain.gain.linearRampToValueAtTime(0, now + 2.0);
      gain.connect(ctx.destination);

      const osc1 = ctx.createOscillator();
      osc1.frequency.value = 440;
      osc1.connect(gain);
      osc1.start(now);
      osc1.stop(now + 2.0);

      const osc2 = ctx.createOscillator();
      osc2.frequency.value = 480;
      osc2.connect(gain);
      osc2.start(now);
      osc2.stop(now + 2.0);

      ringbackRef.current.oscillators.push(osc1, osc2);
      setTimeout(() => {
        try { gain.disconnect(); } catch(e) {}
        ringbackRef.current.oscillators = ringbackRef.current.oscillators.filter(o => o !== osc1 && o !== osc2);
      }, 2100);
    };

    playRing();
    ringbackRef.current.interval = window.setInterval(playRing, 6000);
  };

  const stopRingback = () => {
    if (ringbackRef.current.interval) {
      clearInterval(ringbackRef.current.interval);
      ringbackRef.current.interval = null;
    }
    ringbackRef.current.oscillators.forEach(o => {
      try { o.stop(); o.disconnect(); } catch(e) {}
    });
    ringbackRef.current.oscillators = [];
  };

  useEffect(() => {
    if (callStatus === 'ringing' || callStatus === 'initiated') {
      startRingback();
    } else {
      stopRingback();
    }
  }, [callStatus]);

  const enableAudio = async () => {
    if (!audioContextRef.current) {
      const context = getLiveAudioContext();
      audioContextRef.current = context;
      playerRef.current = new LiveAudioPlayer(context);
      context.onstatechange = () => setAudioReady(context.state === 'running');
    }
    try {
      const context = await unlockLiveAudio();
      setAudioReady(context.state === 'running');
      const pending = pendingAudioRef.current.splice(0);
      for (const frame of pending) playerRef.current?.play(frame.audio, frame.speaker);
    } catch {
      setError('Audio enable karne ke liye Enable audio dabayein.');
    }
  };

  const startListening = () => {
    try {
      void enableAudio();
      if (!callSidRef.current) {
        setCallStatus('waiting');
      }
      setIsConnecting(true);
      if (socketRef.current) {
        if (!socketRef.current.connected) socketRef.current.connect();
        else if (callSidRef.current && subscribedCallSidRef.current !== callSidRef.current) {
          socketRef.current.emit('subscribe_call', { callSid: callSidRef.current });
          subscribedCallSidRef.current = callSidRef.current;
        }
        return;
      }

      const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const token = localStorage.getItem('enr_token') || localStorage.getItem('call_token');
      socketRef.current = io(`${SOCKET_URL}/call-monitor`, {
        auth: { token },
        // Polling establishes a reliable Cloudflare session first, then
        // Socket.IO upgrades it to WebSocket for low-latency audio.
        transports: ['polling', 'websocket'],
        upgrade: true,
        tryAllTransports: true,
        timeout: 20000,
        reconnectionDelay: 500,
        reconnectionDelayMax: 3000,
        reconnectionAttempts: Infinity,
      });

      socketRef.current.on('connect', () => {
        setIsConnecting(false);
        setIsListening(true);
        setError(null);
        const currentCallSid = callSidRef.current;
        if (currentCallSid) {
          socketRef.current?.emit('subscribe_call', { callSid: currentCallSid });
          subscribedCallSidRef.current = currentCallSid;
        }
      });

      socketRef.current.on('monitor_subscribed', (data: { callSid: string }) => {
        if (data.callSid !== callSidRef.current) return;
        setIsListening(true);
        setError(null);
      });

      socketRef.current.on('call_status', (data: { callSid?: string; status: string }) => {
        const currentCallSid = callSidRef.current;
        if (data.callSid && data.callSid !== currentCallSid) return;
        
        const terminalStates = ['completed', 'canceled', 'busy', 'failed', 'no-answer', 'voicemail'];
        if (isTerminalRef.current && !terminalStates.includes(data.status)) return;
        
        if (terminalStates.includes(data.status)) {
          isTerminalRef.current = true;
        }
        
        setCallStatus(data.status);
        if (['voicemail', 'no-answer'].includes(data.status) && announcedTerminalStatusRef.current !== data.status) {
          announcedTerminalStatusRef.current = data.status;
          if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const announcement = new SpeechSynthesisUtterance(
              data.status === 'voicemail' ? 'Voicemail detected. Call ended.' : 'No answer. Call ended.',
            );
            announcement.lang = 'en-US';
            announcement.rate = 0.95;
            window.speechSynthesis.speak(announcement);
          }
        }
        if (terminalStates.includes(data.status) && currentCallSid) {
          playerRef.current?.clear();
          onCallEndedRef.current?.(currentCallSid, data.status);
        }
      });

      socketRef.current.on('live_audio', (data: { callSid?: string; speaker: string; audio: string }) => {
        if (data.callSid && data.callSid !== callSidRef.current) return;
        
        // Ignore audio playback if the call is already marked terminal
        if (isTerminalRef.current) {
          return;
        }
        setCallStatus((current) => current === 'in-progress' ? current : 'in-progress');
        
        if (data.speaker !== 'ai' && data.speaker !== 'prospect') return;
        if (data.speaker === 'ai') setAiAudioDetected(true);
        if (data.speaker === 'prospect') setProspectAudioDetected(true);
        if (audioContextRef.current?.state !== 'running') {
          // Preserve a short backlog until the user unlocks browser audio.
          if (pendingAudioRef.current.length >= 800) pendingAudioRef.current.shift();
          pendingAudioRef.current.push({ audio: data.audio, speaker: data.speaker });
          return;
        }
        try { playerRef.current?.play(data.audio, data.speaker); }
        catch { setError('Live audio frame decode nahi ho saka.'); }
      });

      socketRef.current.on('clear_audio', (data: { callSid?: string }) => {
        if (!data.callSid || data.callSid === callSidRef.current) playerRef.current?.clear('ai');
      });
      socketRef.current.on('disconnect', () => {
        setIsListening(false);
        playerRef.current?.clear();
      });

      socketRef.current.on('live_transcript', (data: TranscriptEntry) => {
        if (data.callSid && data.callSid !== callSidRef.current) return;
        setTranscripts((prev) => [...prev, data]);
      });

      socketRef.current.on('connect_error', (err) => {
        console.error('Socket connect error:', err);
        setError(err.message === 'timeout'
          ? 'Live audio reconnect ho raha hai. Call chalti rahegi; 2-3 seconds wait karein.'
          : (err.message || 'Failed to connect to live stream server.'));
        setIsListening(false);
      });

      socketRef.current.on('monitor_error', (data: { error?: string }) => {
        setError(data.error || 'Live call access could not be verified.');
      });

    } catch (err: any) {
      setError(err.message || 'Failed to start audio playback. Ensure your browser allows autoplay.');
    }
  };

  const stopListening = () => {
    stopRingback();
    if (socketRef.current) {
      if (subscribedCallSidRef.current) {
        socketRef.current.emit('unsubscribe_call', { callSid: subscribedCallSidRef.current });
      }
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    subscribedCallSidRef.current = null;
    playerRef.current?.clear();
    setIsListening(false);
  };

  useEffect(() => {
    setTranscripts([]);
    setCallStatus(callSid ? 'ringing' : 'waiting');
    setAiAudioDetected(false);
    setProspectAudioDetected(false);
    announcedTerminalStatusRef.current = null;
    isTerminalRef.current = false;
    const socket = socketRef.current;
    const previousCallSid = subscribedCallSidRef.current;
    if (socket && previousCallSid && previousCallSid !== callSid) {
      socket.emit('unsubscribe_call', { callSid: previousCallSid });
      subscribedCallSidRef.current = null;
    }
    if (socket?.connected && callSid && subscribedCallSidRef.current !== callSid) {
      socket.emit('subscribe_call', { callSid });
      subscribedCallSidRef.current = callSid;
    }
  }, [callSid]);

  useEffect(() => {
    if (autoStart) startListening();
    return () => stopListening();
  }, [autoStart]);

  useEffect(() => () => {
    // Keep the shared context unlocked for the next automatic call.
    if (audioContextRef.current) audioContextRef.current.onstatechange = null;
    audioContextRef.current = null;
    playerRef.current = null;
  }, []);

  const handleSkip = async () => {
    if (!callSid || !onSkipCurrentCall || skipping) return;
    setSkipping(true);
    setError(null);
    try {
      await onSkipCurrentCall(callSid, 'machine_or_bad_call');
      isTerminalRef.current = true;
      playerRef.current?.clear();
      setCallStatus('completed');
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Could not skip this call.');
    } finally {
      setSkipping(false);
    }
  };

  const endLiveCall = async () => {
    if (!callSid || ending) return;
    setEnding(true);
    setError(null);
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const token = localStorage.getItem('enr_token') || localStorage.getItem('call_token');
      const res = await fetch(`${API_URL}/api/telephony/call-end/${callSid}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to end call');
      isTerminalRef.current = true;
      playerRef.current?.clear();
      setCallStatus('completed');
    } catch (err: any) {
      setError(err.message || 'Could not end the call.');
    } finally {
      setEnding(false);
    }
  };

  const disableAutomaticCalling = async () => {
    if (!onDisableCalling || disabling) return;
    setDisabling(true);
    setError(null);
    try {
      await onDisableCalling();
      isTerminalRef.current = true;
      playerRef.current?.clear();
      setCallStatus('completed');
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Automatic calling disable nahi ho saki.');
    } finally {
      setDisabling(false);
    }
  };

  const statusLabel = () => {
    if (!callSid) return activeLeadName ? 'Preparing call' : autoFollow ? 'Waiting for next call' : 'No active call';
    if (!isListening) return 'Live monitor disconnected';
    if (callStatus === 'initiated') return 'Starting call';
    if (callStatus === 'ringing') return 'Phone ringing';
    if (callStatus === 'answered') return 'Answered — connecting AI';
    if (callStatus === 'ivr-navigation') return 'IVR menu — pressing key';
    if (['starting', 'streaming', 'in-progress'].includes(callStatus)) return 'AI call live';
    if (callStatus === 'voicemail') return 'Voicemail detected';
    if (callStatus === 'voicemail-detected') return 'Voicemail greeting detected';
    if (callStatus === 'no-answer') return 'No answer';
    if (callStatus === 'completed') return 'Call ended';
    return callStatus.charAt(0).toUpperCase() + callStatus.slice(1);
  };

  const statusHelp = () => {
    if (!callSid) return activeLeadName
      ? `${activeLeadName} ki call prepare ho rahi hai. Number dial hote hi yahan Ringing show hoga.`
      : 'Listen Live on hai. Agli call start hote hi yahan uska status aayega.';
    if (!isListening) return 'Live connection band hai. Connect Audio & Transcript dabayein.';
    if (['initiated', 'ringing'].includes(callStatus)) return 'Phone abhi baj raha hai. Customer ne abhi call receive nahi ki.';
    if (callStatus === 'answered') return 'Customer ne call receive kar li hai. AI ki greeting connect ho rahi hai.';
    if (callStatus === 'ivr-navigation') return 'Automated menu mila hai. AI abhi jaan boojh kar silent hai aur representative wala key press kar raha hai.';
    if (['starting', 'streaming', 'in-progress'].includes(callStatus)) {
      return aiAudioDetected || prospectAudioDetected
        ? 'Call live hai. Neeche AI aur customer ki baat show ho rahi hai.'
        : 'Call answer ho gayi hai. AI ki greeting aur conversation ka wait ho raha hai.';
    }
    if (callStatus === 'voicemail') return 'SignalWire ne answering machine detect ki. Call end ho gayi hai aur result Voicemail select hoga.';
    if (callStatus === 'voicemail-detected') return 'Voicemail greeting mil gayi hai. Audio sun sakte hain; system final call status ka wait kar raha hai.';
    if (callStatus === 'no-answer') return 'Kisi ne phone answer nahi kiya. Call end ho gayi hai aur result No Answer select hoga.';
    if (['completed', 'canceled', 'busy', 'failed'].includes(callStatus)) return 'Call finish ho gayi hai. Ab result popup se status save karein.';
    return 'Call status update ho raha hai.';
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 500
    }}>
      <div style={{
        background: '#111827', color: '#F3F4F6', width: 'min(560px, calc(100vw - 32px))',
        borderRadius: '8px', padding: '20px', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto',
        border: '1px solid #374151', boxShadow: '0 24px 70px rgba(0,0,0,0.4)'
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Headphones size={18} />
            <span style={{ 
              width: 10, height: 10, borderRadius: '50%', 
              backgroundColor: isListening ? '#10B981' : '#EF4444',
              boxShadow: isListening ? '0 0 8px #10B981' : 'none'
            }}></span>
            Listen Live
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ 
              fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', 
              padding: '4px 8px', borderRadius: '4px',
              backgroundColor: ['initiated', 'ringing', 'answered'].includes(callStatus) ? '#F59E0B' : ['starting', 'streaming', 'in-progress'].includes(callStatus) ? '#10B981' : '#374151'
            }}>
              {statusLabel()}
            </span>
            <button onClick={onClose} title="Close live monitor" style={{
              background: 'transparent', border: 'none', color: '#9CA3AF', cursor: 'pointer', width: 32, height: 32,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
            }}><X size={18} /></button>
          </div>
        </div>

        {error && <div style={{ background: '#7F1D1D', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' }}>{error}</div>}
        {!audioReady && <button onClick={() => void enableAudio()} className="mb-3 flex items-center justify-center gap-2 rounded-md bg-blue-600 p-3 text-sm font-semibold"><Headphones size={16} /> Enable live audio</button>}
        <div style={{
          background: callSid ? '#0F172A' : '#312E81',
          border: '1px solid #374151',
          color: '#CBD5E1',
          padding: '10px 12px',
          borderRadius: 8,
          marginBottom: 12,
          fontSize: 13,
          lineHeight: 1.4
        }}>
          <strong style={{ display: 'block', color: '#F8FAFC', marginBottom: 4 }}>
            {callSid ? activeLeadName || 'Current live call' : activeLeadName ? `Preparing: ${activeLeadName}` : 'Waiting for next call'}
          </strong>
          {fromPhone && callSid && (
            <div style={{ color: '#22C55E', fontWeight: 600, fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ position: 'relative', display: 'flex', width: 8, height: 8 }}>
                <span style={{ position: 'absolute', display: 'inline-flex', width: '100%', height: '100%', borderRadius: '50%', background: '#4ADE80', opacity: 0.75, animation: 'ping 1s cubic-bezier(0, 0, 0.2, 1) infinite' }}></span>
                <span style={{ position: 'relative', display: 'inline-flex', width: 8, height: 8, borderRadius: '50%', background: '#22C55E' }}></span>
              </span>
              Calling from: {fromPhone}
            </div>
          )}
          {statusHelp()}
        </div>

        {callSid && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div style={{ border: '1px solid #374151', borderRadius: 8, padding: '10px 12px', background: aiAudioDetected ? '#064E3B' : '#1F2937' }}>
              <div style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', fontWeight: 700 }}>AI voice</div>
              <div style={{ color: '#F8FAFC', fontSize: 13, fontWeight: 700, marginTop: 3 }}>
                {aiAudioDetected ? 'Speaking / audio received' : callStatus === 'ivr-navigation' ? 'Silent while IVR connects' : 'Waiting for greeting'}
              </div>
            </div>
            <div style={{ border: '1px solid #374151', borderRadius: 8, padding: '10px 12px', background: prospectAudioDetected ? '#1D4ED8' : '#1F2937' }}>
              <div style={{ color: '#CBD5E1', fontSize: 11, textTransform: 'uppercase', fontWeight: 700 }}>Customer voice</div>
              <div style={{ color: '#F8FAFC', fontSize: 13, fontWeight: 700, marginTop: 3 }}>{prospectAudioDetected ? 'Speaking / audio received' : 'Waiting for response'}</div>
            </div>
          </div>
        )}

        <div style={{
          flex: '1 1 300px', minHeight: 120, background: '#111827', borderRadius: '8px',
          padding: '16px', overflowY: 'auto', marginBottom: '16px', border: '1px solid #374151'
        }}>
          {transcripts.length === 0 && (
            <p style={{ color: '#6B7280', textAlign: 'center', marginTop: '100px' }}>
              {callSid ? statusHelp() : 'Waiting for next call...'}
            </p>
          )}
          {transcripts.map((t, idx) => (
            <div key={idx} style={{ 
              marginBottom: '12px', 
              textAlign: t.speaker === 'ai' ? 'left' : 'right' 
            }}>
              <span style={{ 
                display: 'inline-block',
                background: t.speaker === 'ai' ? '#374151' : '#2563EB',
                padding: '8px 12px',
                borderRadius: '8px',
                maxWidth: '80%',
                wordWrap: 'break-word',
                fontSize: '14px'
              }}>
                <div style={{ fontSize: '11px', opacity: 0.6, marginBottom: '4px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    {t.speaker === 'ai' ? <Bot size={12} /> : <User size={12} />}
                    {t.speaker === 'ai' ? 'AI Agent' : 'Prospect'}
                  </span>
                </div>
                {t.text}
              </span>
            </div>
          ))}
          <div ref={transcriptEndRef} />
        </div>

        {!callSid ? (
          <button disabled style={{
            background: '#4B5563', color: 'white', padding: '12px', borderRadius: '8px',
            border: 'none', fontWeight: 'bold', width: '100%'
          }}>
            {activeLeadName ? 'Preparing call...' : 'Waiting for next call'}
          </button>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              {!isListening ? (
                <button onClick={startListening} disabled={isConnecting} style={{
                  background: isConnecting ? '#4B5563' : '#2563EB', color: 'white', padding: '12px', borderRadius: '8px',
                  border: 'none', fontWeight: 'bold', cursor: isConnecting ? 'wait' : 'pointer', flex: 1
                }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    {isConnecting ? <RefreshCw size={16} className="animate-spin" /> : <Headphones size={16} />}
                    {isConnecting ? 'Connecting...' : 'Connect Audio'}
                  </span>
                </button>
              ) : (
                <>
                  {onSkipCurrentCall && (
                    <button onClick={() => void handleSkip()} disabled={skipping} style={{
                      background: skipping ? '#6B7280' : '#F59E0B', color: '#111827', padding: '12px', borderRadius: '8px',
                      border: 'none', fontWeight: 'bold', cursor: skipping ? 'default' : 'pointer', flex: 1
                    }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}><SkipForward size={16} /> {skipping ? 'Skipping...' : 'Machine / Skip Next'}</span>
                    </button>
                  )}
                  <button onClick={stopListening} style={{
                    background: '#374151', color: 'white', padding: '12px', borderRadius: '8px',
                    border: 'none', fontWeight: 'bold', cursor: 'pointer', flex: 1
                  }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}><VolumeX size={16} /> Disconnect Audio</span>
                  </button>
                </>
              )}
              <button onClick={() => void endLiveCall()} disabled={ending} style={{
                background: ending ? '#6B7280' : '#DC2626', color: 'white', padding: '12px', borderRadius: '8px',
                border: 'none', fontWeight: 'bold', cursor: ending ? 'default' : 'pointer', flex: 1
              }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}><X size={16} /> {ending ? 'Ending...' : 'End Call'}</span>
              </button>
            </div>
            {onDisableCalling && (
              <button onClick={() => void disableAutomaticCalling()} disabled={disabling} style={{
                background: disabling ? '#6B7280' : '#991B1B', color: 'white', padding: '12px', borderRadius: '8px',
                border: '1px solid #EF4444', fontWeight: 'bold', cursor: disabling ? 'default' : 'pointer', width: '100%'
              }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                  <Square size={16} fill="currentColor" /> {disabling ? 'Disabling...' : 'Disable AI Calling'}
                </span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
