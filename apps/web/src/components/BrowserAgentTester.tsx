import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface BrowserAgentTesterProps {
  voiceAgentId?: string;
  onClose: () => void;
}

export default function BrowserAgentTester({ voiceAgentId = '1', onClose }: BrowserAgentTesterProps) {
  const [isCalling, setIsCalling] = useState(false);
  const [status, setStatus] = useState('Idle');
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sessionIdRef = useRef<string>(`session_${Date.now()}`);

  const startCall = async () => {
    setError(null);
    setStatus('Requesting microphone...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: 16000 } });
      mediaStreamRef.current = stream;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass({ sampleRate: 16000 });
      audioContextRef.current = ctx;
      nextStartTimeRef.current = ctx.currentTime;

      const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      socketRef.current = io(`${SOCKET_URL}/voice-browser`);

      socketRef.current.on('connect', () => {
        setStatus('Connected to Agent...');
        setIsCalling(true);
        socketRef.current?.emit('start_session', { sessionId: sessionIdRef.current, voiceAgentId });
      });

      // Handle sending microphone audio to server
      const source = ctx.createMediaStreamSource(stream);
      audioSourceRef.current = source;
      
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      
      processor.onaudioprocess = (e) => {
        if (!isCalling) return;
        const inputData = e.inputBuffer.getChannelData(0); // Float32Array
        // Convert Float32 to Int16
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          let s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        socketRef.current?.emit('audio_stream', { 
          sessionId: sessionIdRef.current, 
          audio: Buffer.from(pcm16.buffer) 
        });
      };

      source.connect(processor);
      processor.connect(ctx.destination);

      // Handle receiving audio from server
      socketRef.current.on('audio_playback', (data: { audio: ArrayBuffer }) => {
        playAudioBuffer(data.audio);
      });

      socketRef.current.on('clear_playback', () => {
        // Stop current audio if needed (interruption)
        // Hard to do with simple queue, would need a node registry
      });

      socketRef.current.on('connect_error', (err) => {
        setError('Connection failed. Make sure the server is running.');
        endCall();
      });

    } catch (err: any) {
      setError('Microphone access denied or error: ' + err.message);
      setStatus('Failed');
    }
  };

  const playAudioBuffer = (arrayBuffer: ArrayBuffer) => {
    if (!audioContextRef.current) return;
    try {
      const int16Array = new Int16Array(arrayBuffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }

      const audioBuffer = audioContextRef.current.createBuffer(1, float32Array.length, 16000);
      audioBuffer.getChannelData(0).set(float32Array);

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);

      const currentTime = audioContextRef.current.currentTime;
      if (nextStartTimeRef.current < currentTime) {
        nextStartTimeRef.current = currentTime;
      }
      
      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;
    } catch (err) {
      console.error('Failed to play incoming audio chunk', err);
    }
  };

  const endCall = () => {
    setIsCalling(false);
    setStatus('Idle');
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioSourceRef.current) {
      audioSourceRef.current.disconnect();
      audioSourceRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  };

  useEffect(() => {
    return () => { endCall(); };
  }, []);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 9999
    }}>
      <div style={{
        background: '#1F2937', color: '#F9FAFB', width: '400px',
        borderRadius: '16px', padding: '32px', display: 'flex', flexDirection: 'column',
        alignItems: 'center', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{ alignSelf: 'flex-end', cursor: 'pointer', fontSize: 20, color: '#9CA3AF' }} onClick={onClose}>
          ✕
        </div>

        <div style={{ 
          width: 100, height: 100, borderRadius: '50%', 
          background: isCalling ? '#10B981' : '#374151',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 48, marginBottom: 24,
          boxShadow: isCalling ? '0 0 30px #10B981' : 'none',
          transition: 'all 0.3s ease'
        }}>
          🤖
        </div>

        <h2 style={{ margin: '0 0 8px 0', fontSize: 20 }}>Web Browser Simulator</h2>
        <p style={{ color: '#9CA3AF', marginBottom: 24, textAlign: 'center', fontSize: 14 }}>
          {status}
        </p>

        {error && (
          <div style={{ background: '#7F1D1D', padding: 12, borderRadius: 8, marginBottom: 24, fontSize: 13, textAlign: 'center' }}>
            {error}
          </div>
        )}

        {!isCalling ? (
          <button onClick={startCall} style={{
            background: '#2563EB', color: 'white', padding: '12px 24px', borderRadius: '24px',
            border: 'none', fontWeight: 'bold', cursor: 'pointer', width: '100%', fontSize: 16
          }}>
            🎙️ Start AI Call
          </button>
        ) : (
          <button onClick={endCall} style={{
            background: '#DC2626', color: 'white', padding: '12px 24px', borderRadius: '24px',
            border: 'none', fontWeight: 'bold', cursor: 'pointer', width: '100%', fontSize: 16
          }}>
            ⏹️ End Call
          </button>
        )}
      </div>
    </div>
  );
}
