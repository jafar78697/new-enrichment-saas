import React, { useState, useEffect, useRef } from 'react';

// --- Mu-law encoding/decoding utilities ---

const MULAW_BIAS = 0x84;
const MULAW_MAX = 32635;

function linearToMulaw(sample: number): number {
  if (sample > MULAW_MAX) sample = MULAW_MAX;
  else if (sample < -MULAW_MAX) sample = -MULAW_MAX;
  
  let sign = (sample >> 8) & 0x80;
  if (sign !== 0) sample = -sample;
  
  sample += MULAW_BIAS;
  
  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {}
  
  let mantissa = (sample >> (exponent + 3)) & 0x0F;
  let mulaw = ~(sign | (exponent << 4) | mantissa);
  
  return mulaw & 0xFF;
}

const MULAW_TABLE = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  const mulaw = ~i & 0xFF;
  const sign = (mulaw & 0x80) ? 1 : -1;
  const exponent = (mulaw >> 4) & 0x07;
  const mantissa = mulaw & 0x0F;
  MULAW_TABLE[i] = sign * ((mantissa << 3) + 0x84) << exponent;
}

function encodeMulaw(float32Array: Float32Array): Uint8Array {
  const mulawBuffer = new Uint8Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const sample = Math.max(-1, Math.min(1, float32Array[i])) * 32767;
    mulawBuffer[i] = linearToMulaw(Math.round(sample));
  }
  return mulawBuffer;
}

function decodeMulaw(mulawBuffer: Uint8Array): Float32Array {
  const float32Array = new Float32Array(mulawBuffer.length);
  for (let i = 0; i < mulawBuffer.length; i++) {
    const sample = MULAW_TABLE[mulawBuffer[i]];
    float32Array[i] = sample / 32768.0;
  }
  return float32Array;
}

function arrayBufferToBase64(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.byteLength; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): Uint8Array {
  const binary_string = atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes;
}

// --- Component ---

export default function BrowserVoiceTest() {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState('Idle');
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  
  const nextPlayTimeRef = useRef<number>(0);

  const startTest = async () => {
    setStatus('Connecting to microphone...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const wsUrl = API_URL.replace('http', 'ws') + '/api/voice/media';
      
      setStatus('Connecting to AI agent...');
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const testSid = 'web-test-' + Math.random().toString(36).substring(2, 9);

      ws.onopen = () => {
        setStatus('Connected! Start speaking.');
        setIsActive(true);
        
        // Mimic Twilio start event
        ws.send(JSON.stringify({
          event: 'start',
          streamSid: testSid,
          start: { callSid: testSid }
        }));

        // Setup audio processing
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 8000 });
        audioCtxRef.current = audioCtx;
        nextPlayTimeRef.current = audioCtx.currentTime;

        const source = audioCtx.createMediaStreamSource(stream);
        
        // Deprecated but easiest way without serving a separate worklet file
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (ws.readyState === WebSocket.OPEN) {
            const inputData = e.inputBuffer.getChannelData(0);
            const mulawData = encodeMulaw(inputData);
            const base64Data = arrayBufferToBase64(mulawData);
            
            ws.send(JSON.stringify({
              event: 'media',
              streamSid: testSid,
              media: { payload: base64Data }
            }));
          }
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event === 'media' && msg.media?.payload) {
            playAudio(msg.media.payload);
          } else if (msg.event === 'clear') {
            // Barge-in: Stop current audio
            if (audioCtxRef.current) {
              nextPlayTimeRef.current = audioCtxRef.current.currentTime;
            }
          }
        } catch (err) {
          console.error(err);
        }
      };

      ws.onclose = () => {
        stopTest();
      };

    } catch (err: any) {
      setStatus('Error: ' + err.message);
      setIsActive(false);
    }
  };

  const playAudio = (base64Payload: string) => {
    const audioCtx = audioCtxRef.current;
    if (!audioCtx) return;

    const mulawData = base64ToArrayBuffer(base64Payload);
    const float32Data = decodeMulaw(mulawData);
    
    const audioBuffer = audioCtx.createBuffer(1, float32Data.length, 8000);
    audioBuffer.getChannelData(0).set(float32Data);
    
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);
    
    // Ensure sequential playback
    const startTime = Math.max(audioCtx.currentTime, nextPlayTimeRef.current);
    source.start(startTime);
    nextPlayTimeRef.current = startTime + audioBuffer.duration;
  };

  const stopTest = () => {
    setIsActive(false);
    setStatus('Idle');
    
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
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
