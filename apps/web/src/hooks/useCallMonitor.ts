import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import api from '../services/api'; // using default export API config

// Utility to convert Base64 16-bit PCM to Float32Array
function convertPCM16ToFloat32(base64: string): Float32Array {
  const binaryString = window.atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const int16Array = new Int16Array(bytes.buffer);
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    const s = Math.max(-1, Math.min(1, int16Array[i] / 32768));
    float32Array[i] = s;
  }
  return float32Array;
}

export type TranscriptMessage = {
  speaker: 'ai' | 'prospect';
  text: string;
  timestamp: string;
};

export function useCallMonitor(callSid: string | null) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<string>('disconnected');
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [isVolumeOn, setIsVolumeOn] = useState(false);
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const nextPlayTimeAiRef = useRef<number>(0);
  const nextPlayTimeProspectRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<{source: AudioBufferSourceNode, speaker: string}>>(new Set());
  const lastCallSidRef = useRef<string | null>(null);
  const isTerminalRef = useRef<boolean>(false);

  // Keep a ref of isVolumeOn so socket effect doesn't re-run
  const isVolumeOnRef = useRef(isVolumeOn);
  useEffect(() => {
    isVolumeOnRef.current = isVolumeOn;
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = isVolumeOn ? 1 : 0;
    }
  }, [isVolumeOn]);

  const initAudio = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 8000 });
      masterGainRef.current = audioCtxRef.current.createGain();
      masterGainRef.current.connect(audioCtxRef.current.destination);
      masterGainRef.current.gain.value = isVolumeOnRef.current ? 1 : 0;
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  };

  const toggleVolume = useCallback(() => {
    setIsVolumeOn((prev) => {
      const nextState = !prev;
      if (nextState) {
        initAudio();
      }
      return nextState;
    });
  }, []);

  const playAudioChunk = useCallback((base64Audio: string, speaker: string) => {
    if (!audioCtxRef.current || !masterGainRef.current) return;
    
    try {
      const audioCtx = audioCtxRef.current;
      const float32Data = convertPCM16ToFloat32(base64Audio);
      
      const audioBuffer = audioCtx.createBuffer(1, float32Data.length, 8000);
      audioBuffer.getChannelData(0).set(float32Data);

      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(masterGainRef.current);

      const sourceObj = { source, speaker };
      source.onended = () => {
        activeSourcesRef.current.delete(sourceObj);
      };
      activeSourcesRef.current.add(sourceObj);

      const currentTime = audioCtx.currentTime;
      const timeRef = speaker === 'ai' ? nextPlayTimeAiRef : nextPlayTimeProspectRef;
      
      if (timeRef.current < currentTime) {
        timeRef.current = currentTime + 0.05; // 50ms buffer
      }
      
      source.start(timeRef.current);
      timeRef.current += audioBuffer.duration;

    } catch (e) {
      console.error("Audio playback error:", e);
    }
  }, []);

  useEffect(() => {
    if (lastCallSidRef.current !== callSid) {
      setTranscript([]);
      lastCallSidRef.current = callSid;
      isTerminalRef.current = false;
      
      // Clear audio on call change
      activeSourcesRef.current.forEach(obj => {
        try { obj.source.stop(); } catch(e){}
      });
      activeSourcesRef.current.clear();
      nextPlayTimeAiRef.current = 0;
      nextPlayTimeProspectRef.current = 0;
    }

    if (!callSid) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    const token = localStorage.getItem('enr_token') || localStorage.getItem('call_token');
    if (!token) return;

    // Use the api.defaults.baseURL to find the host
    const apiUrl = api.defaults.baseURL?.replace('/v1', '') || 'https://api.jentoai.pro';
    
    const newSocket = io(`${apiUrl}/call-monitor`, {
      auth: { token },
      transports: ['websocket'],
    });

    newSocket.on('connect', () => {
      if (!isTerminalRef.current) setStatus('connected');
      newSocket.emit('subscribe_call', { callSid });
    });

    newSocket.on('monitor_subscribed', () => {
      if (!isTerminalRef.current) setStatus('monitoring');
    });

    newSocket.on('monitor_error', (data) => {
      if (!isTerminalRef.current) setStatus(`error: ${data.error}`);
    });

    newSocket.on('call_status', (data) => {
      const terminalStates = ['completed', 'failed', 'busy', 'no-answer', 'canceled', 'voicemail'];
      
      // If already terminal, ignore non-terminal updates
      if (isTerminalRef.current && !terminalStates.includes(data.status)) {
        return;
      }
      
      if (terminalStates.includes(data.status)) {
        isTerminalRef.current = true;
        activeSourcesRef.current.forEach(obj => {
          try { obj.source.stop(); } catch(e){}
        });
        activeSourcesRef.current.clear();
        nextPlayTimeAiRef.current = 0;
        nextPlayTimeProspectRef.current = 0;
      }
      setStatus(data.status);
    });

    newSocket.on('live_transcript', (data: TranscriptMessage) => {
      setTranscript(prev => [...prev, data]);
    });

    newSocket.on('live_audio', (data: { callSid: string, speaker: string, audio: string }) => {
      if (isTerminalRef.current) {
        activeSourcesRef.current.forEach(obj => {
          try { obj.source.stop(); } catch(e){}
        });
        activeSourcesRef.current.clear();
        nextPlayTimeAiRef.current = 0;
        nextPlayTimeProspectRef.current = 0;
        return;
      }
      playAudioChunk(data.audio, data.speaker);
    });

    newSocket.on('clear_audio', () => {
       activeSourcesRef.current.forEach(obj => {
         if (obj.speaker === 'ai') {
           try { obj.source.stop(); } catch(e){}
           activeSourcesRef.current.delete(obj);
         }
       });
       nextPlayTimeAiRef.current = 0;
    });

    setSocket(newSocket);

    return () => {
      newSocket.emit('unsubscribe_call', { callSid });
      newSocket.disconnect();
    };
  }, [callSid, playAudioChunk]);

  return { status, transcript, isVolumeOn, toggleVolume };
}
