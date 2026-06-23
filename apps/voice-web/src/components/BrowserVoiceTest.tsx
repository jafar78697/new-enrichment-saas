import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

// --- Component ---

export default function BrowserVoiceTest() {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState('Idle');
  const [error, setError] = useState<string | null>(null);
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Playback state
  const audioChunksRef = useRef<Float32Array[]>([]);
  const chunkLengthRef = useRef(0);
  const nextPlayTimeRef = useRef(0);

  const stopTest = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    setIsActive(false);
    isTestingRef.current = false;
    setStatus('Ready to test');
    audioChunksRef.current = [];
    chunkLengthRef.current = 0;
    nextPlayTimeRef.current = 0;
  };

  const processIncomingPCM = (pcmBuffer: ArrayBuffer) => {
    if (!audioCtxRef.current) return;
    
    try {
      const int16Array = new Int16Array(pcmBuffer);
      const float32Array = new Float32Array(int16Array.length);
      
      // Convert Int16 to Float32 for Web Audio API
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }

      audioChunksRef.current.push(float32Array);
      chunkLengthRef.current += float32Array.length;

      // When we have enough audio (e.g. 0.1s of audio at 24kHz = 2400 samples)
      if (chunkLengthRef.current > 2400) {
        schedulePlayback();
      }
    } catch (e) {
      console.error('Error processing PCM buffer', e);
    }
  };

  const schedulePlayback = () => {
    if (!audioCtxRef.current || audioChunksRef.current.length === 0) return;
    
    try {
      const audioCtx = audioCtxRef.current;
      const mergedData = new Float32Array(chunkLengthRef.current);
      let offset = 0;
      for (const chunk of audioChunksRef.current) {
        mergedData.set(chunk, offset);
        offset += chunk.length;
      }
      
      audioChunksRef.current = [];
      chunkLengthRef.current = 0;

      // Backend sends 24000Hz PCM
      const audioBuffer = audioCtx.createBuffer(1, mergedData.length, 24000);
      audioBuffer.getChannelData(0).set(mergedData);
      
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);
      
      let startTime = nextPlayTimeRef.current;
      if (startTime < audioCtx.currentTime) {
        startTime = audioCtx.currentTime + 0.05; // Tighten jitter buffer
      }
      
      source.start(startTime);
      nextPlayTimeRef.current = startTime + audioBuffer.duration;
    } catch (e) {
      console.error('Playback error', e);
    }
  };

  const isTestingRef = useRef(false);

  const startTest = async () => {
    try {
      if (isTestingRef.current) return;
      isTestingRef.current = true;
      setError(null);
      setStatus('Starting microphone...');

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000
      });
      
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      audioCtxRef.current = audioCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      streamRef.current = stream;

      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      
      setStatus('Connecting to AI agent...');
      const socket = io(API_URL + '/voice-browser', {
        reconnection: false // Don't try to reconnect automatically if it fails completely
      });
      socketRef.current = socket;

      const testSid = 'browser-session-' + Math.random().toString(36).substring(2, 9);

      socket.on('connect_error', (err) => {
        // Socket.IO may emit connect_error during websocket upgrade attempts.
        // We MUST ignore these if the polling connection is still active and working.
        if (socket.connected) return;
        setStatus('Connection Error: ' + err.message);
        stopTest(); // Proper cleanup of microphone and locks
      });

      socket.on('connect', () => {
        setStatus('Connected! Say hello...');
        setIsActive(true);

        socket.emit('start_session', {
          sessionId: testSid,
          voiceAgentId: 'default'
        });

        const source = audioCtx.createMediaStreamSource(stream);
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          // Output absolute silence to prevent microphone feedback loop
          e.outputBuffer.getChannelData(0).fill(0);

          // --- INPUT (Microphone) ---
          if (socket.connected) {
            const inputData = e.inputBuffer.getChannelData(0);
            
            // Downsample to 24000Hz PCM
            const inputSampleRate = audioCtx.sampleRate;
            const ratio = inputSampleRate / 24000;
            const newLength = Math.round(inputData.length / ratio);
            
            const pcm16 = new Int16Array(newLength);
            for (let i = 0; i < newLength; i++) {
              let sample = inputData[Math.floor(i * ratio)];
              // Prevent clipping
              sample = Math.max(-1, Math.min(1, sample));
              pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            }
            
            const uint8Array = new Uint8Array(pcm16.buffer);
            let binaryString = '';
            for (let i = 0; i < uint8Array.byteLength; i++) {
              binaryString += String.fromCharCode(uint8Array[i]);
            }
            const base64Audio = btoa(binaryString);
            
            // Emit base64 audio
            socket.emit('audio_stream', {
              sessionId: testSid,
              audio: base64Audio
            });
          }
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);
      });

      socket.on('audio_playback', (data: { audio: ArrayBuffer }) => {
        processIncomingPCM(data.audio);
      });

      socket.on('disconnect', () => {
        stopTest();
      });
    } catch (err: any) {
      setStatus('Error: ' + err.message);
      setIsActive(false);
    }
  };

  return (
    <div style={{ padding: '20px', background: '#f8fafc', borderRadius: 12, border: '1px solid var(--color-border)', textAlign: 'center' }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0, color: 'var(--color-primary)' }}>Test AI Agent via Browser</h3>
        <p style={{ margin: '8px 0 0', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
          Speak directly into your microphone to test the AI. Completely free, bypasses Twilio billing.
        </p>
      </div>

      <div style={{ 
        width: 80, 
        height: 80, 
        borderRadius: '50%', 
        background: isActive ? 'var(--color-primary)' : '#e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 20px',
        boxShadow: isActive ? '0 0 20px rgba(99, 102, 241, 0.5)' : 'none',
        transition: 'all 0.3s ease'
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill={isActive ? 'white' : '#64748b'}>
          <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
        </svg>
      </div>

      <p style={{ fontWeight: 500, color: isActive ? 'var(--color-primary)' : 'inherit' }}>
        {status}
      </p>

      <div style={{ marginTop: 20 }}>
        {!isActive ? (
          <button className="btn btn-primary" onClick={startTest} style={{ padding: '10px 24px' }}>
            Start Microphone Test
          </button>
        ) : (
          <button className="btn" onClick={stopTest} style={{ padding: '10px 24px', background: '#ef4444', color: 'white', border: 'none' }}>
            End Test Call
          </button>
        )}
      </div>
    </div>
  );
}
