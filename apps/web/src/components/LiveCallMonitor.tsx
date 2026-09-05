import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Bot, Headphones, SkipForward, User, VolumeX, X } from 'lucide-react';
import { LiveAudioPlayer } from '../utils/live-audio';

interface LiveCallMonitorProps {
  callSid: string | null;
  onClose: () => void;
  autoStart?: boolean;
  autoFollow?: boolean;
  activeLeadName?: string | null;
  onCallEnded?: (callSid: string, status: string) => void;
  onSkipCurrentCall?: (callSid: string, reason: string) => Promise<void> | void;
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
}: LiveCallMonitorProps) {
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [callStatus, setCallStatus] = useState<string>(callSid ? 'ringing' : 'waiting');
  const [error, setError] = useState<string | null>(null);
  const [skipping, setSkipping] = useState(false);
  const [audioReady, setAudioReady] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playerRef = useRef<LiveAudioPlayer | null>(null);
  const subscribedCallSidRef = useRef<string | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const ringbackRef = useRef<{ oscillators: OscillatorNode[], interval: number | null }>({ oscillators: [], interval: null });

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

  const enableAudio = () => {
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const context = new AudioContextClass({ sampleRate: 8000 }) as AudioContext;
      audioContextRef.current = context;
      playerRef.current = new LiveAudioPlayer(context);
      context.onstatechange = () => setAudioReady(context.state === 'running');
    }
    const context = audioContextRef.current;
    void context.resume().then(() => setAudioReady(context.state === 'running')).catch(() => {
      setError('Audio enable karne ke liye Enable audio dabayein.');
    });
  };

  const startListening = () => {
    try {
      enableAudio();
      if (!callSid) {
        setCallStatus('waiting');
        return;
      }
      if (socketRef.current) {
        socketRef.current.connect();
        return;
      }

      const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const token = localStorage.getItem('enr_token') || localStorage.getItem('call_token');
      socketRef.current = io(`${SOCKET_URL}/call-monitor`, {
        auth: { token },
        transports: ['websocket', 'polling'],
        timeout: 10000,
        reconnectionAttempts: 3,
      });

      socketRef.current.on('connect', () => {
        socketRef.current?.emit('subscribe_call', { callSid });
        subscribedCallSidRef.current = callSid;
      });

      socketRef.current.on('monitor_subscribed', (data: { callSid: string }) => {
        if (data.callSid !== callSid) return;
        setIsListening(true);
        setError(null);
      });

      socketRef.current.on('call_status', (data: { callSid?: string; status: string }) => {
        if (data.callSid && data.callSid !== callSid) return;
        setCallStatus(data.status);
        if (['completed', 'canceled', 'busy', 'failed', 'no-answer'].includes(data.status) && callSid) {
          playerRef.current?.clear();
          onCallEnded?.(callSid, data.status);
        }
      });

      socketRef.current.on('live_audio', (data: { callSid?: string; speaker: string; audio: string }) => {
        if (data.callSid && data.callSid !== callSid) return;
        if (callStatus !== 'in-progress') setCallStatus('in-progress');
        if (data.speaker !== 'ai' && data.speaker !== 'prospect') return;
        if (audioContextRef.current?.state !== 'running') return;
        try { playerRef.current?.play(data.audio, data.speaker); }
        catch { setError('Live audio frame decode nahi ho saka.'); }
      });

      socketRef.current.on('clear_audio', (data: { callSid?: string }) => {
        if (!data.callSid || data.callSid === callSid) playerRef.current?.clear('ai');
      });
      socketRef.current.on('disconnect', () => {
        setIsListening(false);
        playerRef.current?.clear();
      });

      socketRef.current.on('live_transcript', (data: TranscriptEntry) => {
        if (data.callSid && data.callSid !== callSid) return;
        setTranscripts((prev) => [...prev, data]);
      });

      socketRef.current.on('connect_error', (err) => {
        console.error('Socket connect error:', err);
        setError(err.message || 'Failed to connect to live stream server.');
        setIsListening(false);
      });

      socketRef.current.on('monitor_error', (data: { error?: string }) => {
        setError(data.error || 'Live call access could not be verified.');
        setIsListening(false);
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
    if (autoStart) startListening();
    return () => {
      stopListening();
    };
  }, [callSid, autoStart]);

  useEffect(() => () => {
    const context = audioContextRef.current;
    if (context) {
      context.onstatechange = null;
      void context.close();
    }
    audioContextRef.current = null;
    playerRef.current = null;
  }, []);

  const handleSkip = async () => {
    if (!callSid || !onSkipCurrentCall || skipping) return;
    setSkipping(true);
    setError(null);
    try {
      await onSkipCurrentCall(callSid, 'machine_or_bad_call');
      setCallStatus('completed');
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Could not skip this call.');
    } finally {
      setSkipping(false);
    }
  };

  const statusLabel = () => {
    if (!callSid) return autoFollow ? 'Waiting for next call' : 'No active call';
    if (!isListening) return 'Disconnected';
    if (callStatus === 'ringing') return 'Ringing...';
    if (callStatus === 'in-progress') return 'Connected';
    if (callStatus === 'completed') return 'Call Ended';
    return callStatus.charAt(0).toUpperCase() + callStatus.slice(1);
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000
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
            Live Monitor ({callSid ? `Call: ${callSid.slice(0, 8)}...` : 'waiting'})
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ 
              fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', 
              padding: '4px 8px', borderRadius: '4px',
              backgroundColor: callStatus === 'ringing' ? '#F59E0B' : callStatus === 'in-progress' ? '#10B981' : '#374151'
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
        {!audioReady && <button onClick={enableAudio} className="mb-3 flex items-center justify-center gap-2 rounded-md bg-blue-600 p-3 text-sm font-semibold"><Headphones size={16} /> Enable audio</button>}
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
          {callSid
            ? activeLeadName || 'Current live call'
            : 'Waiting for next call'}
        </div>

        <div style={{
          flex: '1 1 300px', minHeight: 120, background: '#111827', borderRadius: '8px',
          padding: '16px', overflowY: 'auto', marginBottom: '16px', border: '1px solid #374151'
        }}>
          {transcripts.length === 0 && (
            <p style={{ color: '#6B7280', textAlign: 'center', marginTop: '100px' }}>
              {callSid ? 'Waiting for conversation...' : 'Waiting for next call...'}
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
            Waiting for next call
          </button>
        ) : !isListening ? (
          <button onClick={startListening} style={{
            background: '#2563EB', color: 'white', padding: '12px', borderRadius: '8px',
            border: 'none', fontWeight: 'bold', cursor: 'pointer', width: '100%'
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Headphones size={16} /> Connect Audio & Transcript</span>
          </button>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: onSkipCurrentCall ? '1fr 1fr' : '1fr', gap: 10 }}>
            {onSkipCurrentCall && (
              <button onClick={() => void handleSkip()} disabled={skipping} style={{
                background: skipping ? '#6B7280' : '#F59E0B', color: '#111827', padding: '12px', borderRadius: '8px',
                border: 'none', fontWeight: 'bold', cursor: skipping ? 'default' : 'pointer', width: '100%'
              }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><SkipForward size={16} /> {skipping ? 'Skipping...' : 'Machine / Skip Next'}</span>
              </button>
            )}
            <button onClick={stopListening} style={{
              background: '#DC2626', color: 'white', padding: '12px', borderRadius: '8px',
              border: 'none', fontWeight: 'bold', cursor: 'pointer', width: '100%'
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><VolumeX size={16} /> Disconnect</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
