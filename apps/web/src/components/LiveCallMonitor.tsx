import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface LiveCallMonitorProps {
  callSid: string;
  onClose: () => void;
  autoStart?: boolean;
}

interface TranscriptEntry {
  speaker: 'ai' | 'prospect';
  text: string;
  timestamp: string;
}

export default function LiveCallMonitor({ callSid, onClose, autoStart = false }: LiveCallMonitorProps) {
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to bottom when new transcript arrives
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  const startListening = async () => {
    if (socketRef.current) return;
    try {
      // Initialize Web Audio API
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContextClass({ sampleRate: 8000 });
      await audioContextRef.current.resume();
      nextStartTimeRef.current = audioContextRef.current.currentTime;

      // Connect to the specific namespace we created in the backend
      const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      socketRef.current = io(`${SOCKET_URL}/call-monitor`);

      socketRef.current.on('connect', () => {
        socketRef.current?.emit('subscribe_call', { callSid });
        setIsListening(true);
      });

      socketRef.current.on('live_audio', (data: { speaker: string; audio: string }) => {
        playAudioChunk(data.audio);
      });

      socketRef.current.on('live_transcript', (data: TranscriptEntry) => {
        setTranscripts((prev) => [...prev, data]);
      });

      socketRef.current.on('connect_error', (err) => {
        console.error('Socket connect error:', err);
        setError('Failed to connect to live stream server.');
        setIsListening(false);
      });

    } catch (err: any) {
      setError(err.message || 'Failed to start audio playback. Ensure your browser allows autoplay.');
    }
  };

  const stopListening = () => {
    if (socketRef.current) {
      socketRef.current.emit('unsubscribe_call', { callSid });
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsListening(false);
  };

  useEffect(() => {
    if (autoStart) void startListening();
    return () => {
      stopListening();
    };
  }, [callSid, autoStart]);

  // Decode base64 16-bit PCM (8000Hz) and play it
  const playAudioChunk = (base64PCM: string) => {
    if (!audioContextRef.current) return;
    
    try {
      const binaryStr = atob(base64PCM);
      const len = binaryStr.length;
      const buffer = new ArrayBuffer(len);
      const view = new Uint8Array(buffer);
      for (let i = 0; i < len; i++) {
        view[i] = binaryStr.charCodeAt(i);
      }

      // PCM 16-bit to Float32 (-1.0 to 1.0)
      const int16Array = new Int16Array(buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }

      const audioBuffer = audioContextRef.current.createBuffer(1, float32Array.length, 8000);
      audioBuffer.getChannelData(0).set(float32Array);

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);

      // Ensure smooth continuous playback
      const currentTime = audioContextRef.current.currentTime;
      if (nextStartTimeRef.current < currentTime) {
        nextStartTimeRef.current = currentTime; // Reset if we fell behind
      }
      
      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;
    } catch (err) {
      console.error('Error decoding audio chunk:', err);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{
        background: '#1F2937', color: '#F3F4F6', width: '500px',
        borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ 
              width: 10, height: 10, borderRadius: '50%', 
              backgroundColor: isListening ? '#10B981' : '#EF4444',
              boxShadow: isListening ? '0 0 8px #10B981' : 'none'
            }}></span>
            Live Monitor (Call: {callSid.slice(0, 8)}...)
          </h2>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: '16px'
          }}>✕</button>
        </div>

        {error && <div style={{ background: '#7F1D1D', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' }}>{error}</div>}

        <div style={{
          flex: 1, height: '300px', background: '#111827', borderRadius: '8px', 
          padding: '16px', overflowY: 'auto', marginBottom: '16px', border: '1px solid #374151'
        }}>
          {transcripts.length === 0 && (
            <p style={{ color: '#6B7280', textAlign: 'center', marginTop: '100px' }}>
              Waiting for conversation...
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
                  {t.speaker === 'ai' ? '🤖 AI Agent' : '👤 Prospect'}
                </div>
                {t.text}
              </span>
            </div>
          ))}
          <div ref={transcriptEndRef} />
        </div>

        {!isListening ? (
          <button onClick={startListening} style={{
            background: '#2563EB', color: 'white', padding: '12px', borderRadius: '8px',
            border: 'none', fontWeight: 'bold', cursor: 'pointer', width: '100%'
          }}>
            ▶️ Connect Audio & Transcript
          </button>
        ) : (
          <button onClick={stopListening} style={{
            background: '#DC2626', color: 'white', padding: '12px', borderRadius: '8px',
            border: 'none', fontWeight: 'bold', cursor: 'pointer', width: '100%'
          }}>
            ⏹️ Disconnect
          </button>
        )}
      </div>
    </div>
  );
}
