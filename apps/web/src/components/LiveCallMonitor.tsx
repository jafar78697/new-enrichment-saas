import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Bot, Headphones, SkipForward, User, VolumeX, X } from 'lucide-react';

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

  const socketRef = useRef<Socket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<{ [speaker: string]: number }>({});
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

  const startListening = async () => {
    if (!callSid) {
      setCallStatus('waiting');
      return;
    }
    if (socketRef.current) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContextClass({ sampleRate: 8000 });
      await audioContextRef.current.resume();

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
        setIsListening(true);
        setError(null);
      });

      socketRef.current.on('call_status', (data: { callSid?: string; status: string }) => {
        setCallStatus(data.status);
        if (['completed', 'canceled', 'busy', 'failed', 'no-answer'].includes(data.status) && callSid) {
          onCallEnded?.(callSid, data.status);
        }
      });

      socketRef.current.on('live_audio', (data: { speaker: string; audio: string }) => {
        if (callStatus !== 'in-progress') setCallStatus('in-progress');
        playAudioChunk(data.audio, data.speaker);
      });

      socketRef.current.on('live_transcript', (data: TranscriptEntry) => {
        setTranscripts((prev) => [...prev, data]);
      });

      socketRef.current.on('connect_error', (err) => {
        console.error('Socket connect error:', err);
        setError(err.message || 'Failed to connect to live stream server.');
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
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsListening(false);
  };

  useEffect(() => {
    setTranscripts([]);
    nextStartTimeRef.current = {};
    setCallStatus(callSid ? 'ringing' : 'waiting');
    if (autoStart && callSid) void startListening();
    return () => {
      stopListening();
    };
  }, [callSid, autoStart]);

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

  const playAudioChunk = (base64Pcm: string, _speaker: string) => {
    if (!audioContextRef.current) return;
    
    try {
      const binaryStr = atob(base64Pcm);
      const len = binaryStr.length;
      const sampleCount = Math.floor(len / 2);
      const float32Array = new Float32Array(sampleCount);
      for (let i = 0; i < sampleCount; i += 1) {
        const low = binaryStr.charCodeAt(i * 2) & 0xff;
        const high = binaryStr.charCodeAt(i * 2 + 1) & 0xff;
        const unsigned = low | (high << 8);
        const signed = unsigned >= 0x8000 ? unsigned - 0x10000 : unsigned;
        float32Array[i] = signed / 32768;
      }

      const audioBuffer = audioContextRef.current.createBuffer(1, float32Array.length, 8000);
      audioBuffer.getChannelData(0).set(float32Array);

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);

      const currentTime = audioContextRef.current.currentTime;
      let nextStart = nextStartTimeRef.current.all || currentTime;
      if (nextStart < currentTime) {
        nextStart = currentTime;
      }
      
      source.start(nextStart);
      nextStartTimeRef.current.all = nextStart + audioBuffer.duration;
    } catch (err) {
      console.error('Error decoding audio chunk:', err);
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
        borderRadius: '8px', padding: '22px', display: 'flex', flexDirection: 'column',
        border: '1px solid #374151', boxShadow: '0 24px 70px rgba(0,0,0,0.4)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
            ? `Listening to ${activeLeadName || 'current live call'}. If this is machine, voicemail, or bad audio, skip it to move the dialer to next lead.`
            : 'Listening mode is on. Waiting for the next live call to connect automatically.'}
        </div>

        <div style={{
          flex: 1, height: '300px', background: '#111827', borderRadius: '8px', 
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
