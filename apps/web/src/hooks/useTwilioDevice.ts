// Twilio Voice Device hook — TypeScript port of the call-system frontend hook.
// Ported from call system/frontend/src/hooks/useTwilioDevice.js
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Device } from '@twilio/voice-sdk';
import { callsApi } from '../services/callsApi';

export type DeviceStatus = 'offline' | 'registering' | 'ready' | 'error';
export type CallStatus =
  | 'idle'
  | 'dialing'
  | 'ringing'
  | 'incoming'
  | 'connected'
  | 'ended';

interface RingtoneRef {
  audioContext: AudioContext | null;
  gain: GainNode | null;
  interval: number | null;
  oscillators: OscillatorNode[];
}

function formatSdkCallSid(parameters: any): string | null {
  if (!parameters) return null;
  return parameters.CallSid || parameters.CallSID || null;
}

function describeTwilioError(twilioError: any, fallback: string): string {
  if (!twilioError) return fallback;
  const code = twilioError.code || twilioError.twilioError?.code;
  const message = twilioError.message || twilioError.description || fallback;
  const details: string[] = [message];
  if (code) details.push(`Code: ${code}`);
  if (twilioError.explanation) details.push(twilioError.explanation);
  if (Array.isArray(twilioError.solutions) && twilioError.solutions.length > 0) {
    details.push(twilioError.solutions[0]);
  }
  return details.join(' | ');
}

export interface UseTwilioDeviceResult {
  deviceStatus: DeviceStatus;
  activeCallSid: string | null;
  callStatus: CallStatus;
  isMuted: boolean;
  timerSeconds: number;
  incomingCall: any;
  error: string;
  startCall: (args: {
    phoneNumber: string;
    contactId?: number | string | null;
    record?: boolean;
  }) => Promise<any>;
  endCall: () => void;
  toggleMute: () => void;
  acceptIncoming: () => void;
  rejectIncoming: () => void;
  sendDtmf: (digit: string) => void;
}

export function useTwilioDevice(agentId: number | null | undefined): UseTwilioDeviceResult {
  const deviceRef = useRef<Device | null>(null);
  const idleResetRef = useRef<number | null>(null);
  const ringtoneRef = useRef<RingtoneRef>({
    audioContext: null,
    gain: null,
    interval: null,
    oscillators: [],
  });
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>('offline');
  const [activeCall, setActiveCall] = useState<any>(null);
  const [activeCallSid, setActiveCallSid] = useState<string | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [incomingCall, setIncomingCall] = useState<any>(null);
  const [error, setError] = useState('');

  const stopIncomingRingtone = useCallback(() => {
    const ringtone = ringtoneRef.current;
    if (ringtone.interval) {
      window.clearInterval(ringtone.interval);
      ringtone.interval = null;
    }
    ringtone.oscillators.forEach((oscillator) => {
      try {
        oscillator.stop();
      } catch {
        /* already stopped */
      }
      oscillator.disconnect();
    });
    ringtone.oscillators = [];
    if (ringtone.gain) {
      ringtone.gain.disconnect();
      ringtone.gain = null;
    }
  }, []);

  const resetActiveCall = useCallback(() => {
    if (idleResetRef.current) {
      window.clearTimeout(idleResetRef.current);
      idleResetRef.current = null;
    }
    stopIncomingRingtone();
    setActiveCall(null);
    setActiveCallSid(null);
    setCallStatus('idle');
    setIsMuted(false);
    setTimerSeconds(0);
    setIncomingCall(null);
  }, [stopIncomingRingtone]);

  const teardownDevice = useCallback(() => {
    stopIncomingRingtone();
    if (deviceRef.current) {
      deviceRef.current.destroy();
      deviceRef.current = null;
    }
  }, [stopIncomingRingtone]);

  const scheduleIdleReset = useCallback(() => {
    if (idleResetRef.current) {
      window.clearTimeout(idleResetRef.current);
    }
    idleResetRef.current = window.setTimeout(() => {
      resetActiveCall();
    }, 1200);
  }, [resetActiveCall]);

  const unlockRingtoneAudio = useCallback(async () => {
    const AudioContextConstructor =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextConstructor) return;
    if (!ringtoneRef.current.audioContext) {
      ringtoneRef.current.audioContext = new AudioContextConstructor();
    }
    if (ringtoneRef.current.audioContext?.state === 'suspended') {
      await ringtoneRef.current.audioContext.resume().catch(() => {});
    }
  }, []);

  const startIncomingRingtone = useCallback(() => {
    const AudioContextConstructor =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextConstructor) return;

    stopIncomingRingtone();

    const audioContext: AudioContext =
      ringtoneRef.current.audioContext || new AudioContextConstructor();
    ringtoneRef.current.audioContext = audioContext;
    audioContext.resume().catch(() => {});

    const playBurst = () => {
      const now = audioContext.currentTime;
      const gain = audioContext.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.32, now + 0.03);
      gain.gain.setValueAtTime(0.32, now + 0.68);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.78);
      gain.connect(audioContext.destination);
      ringtoneRef.current.gain = gain;

      const oscillators = [880, 660].map((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(frequency, now + index * 0.18);
        oscillator.connect(gain);
        oscillator.start(now + index * 0.18);
        oscillator.stop(now + 0.82);
        oscillator.onended = () => oscillator.disconnect();
        return oscillator;
      });

      ringtoneRef.current.oscillators.push(...oscillators);
      window.setTimeout(() => {
        gain.disconnect();
        ringtoneRef.current.oscillators = ringtoneRef.current.oscillators.filter(
          (oscillator) => !oscillators.includes(oscillator),
        );
      }, 900);
    };

    playBurst();
    ringtoneRef.current.interval = window.setInterval(playBurst, 1450);
  }, [stopIncomingRingtone]);

  const wireCallEvents = useCallback(
    (call: any) => {
      setActiveCall(call);
      setError('');

      call.on('ringing', () => setCallStatus('ringing'));
      call.on('accept', () => {
        stopIncomingRingtone();
        setCallStatus('connected');
        setActiveCallSid(formatSdkCallSid(call.parameters));
        setIncomingCall(null);
      });
      call.on('disconnect', () => {
        stopIncomingRingtone();
        setCallStatus('ended');
        setIsMuted(false);
        setIncomingCall(null);
        scheduleIdleReset();
      });
      call.on('cancel', () => {
        stopIncomingRingtone();
        setCallStatus('ended');
        setIncomingCall(null);
        scheduleIdleReset();
      });
      call.on('reject', () => {
        stopIncomingRingtone();
        setCallStatus('ended');
        setIncomingCall(null);
        scheduleIdleReset();
      });
      call.on('error', (twilioError: any) => {
        stopIncomingRingtone();
        // eslint-disable-next-line no-console
        console.error('Twilio call error', twilioError);
        setError(describeTwilioError(twilioError, 'Call error'));
        setCallStatus('ended');
        setIncomingCall(null);
        scheduleIdleReset();
      });
    },
    [scheduleIdleReset, stopIncomingRingtone],
  );

  useEffect(() => {
    const unlock = () => {
      unlockRingtoneAudio();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      stopIncomingRingtone();
    };
  }, [stopIncomingRingtone, unlockRingtoneAudio]);

  const refreshToken = useCallback(async () => {
    if (!agentId || !deviceRef.current) return;
    const { token } = await callsApi.getToken(agentId);
    await deviceRef.current.updateToken(token);
  }, [agentId]);

  useEffect(() => {
    let cancelled = false;

    async function setupDevice() {
      if (!agentId) {
        teardownDevice();
        resetActiveCall();
        setDeviceStatus('offline');
        return;
      }

      teardownDevice();
      resetActiveCall();
      setDeviceStatus('registering');
      setError('');

      const { token } = await callsApi.getToken(agentId);
      if (cancelled) return;

      const device = new Device(token, {
        codecPreferences: ['opus', 'pcmu'] as any,
        edge: ['singapore', 'frankfurt', 'dublin', 'ashburn'],
        maxCallSignalingTimeoutMs: 30000,
      } as any);

      deviceRef.current = device;

      device.on('registering', () => setDeviceStatus('registering'));
      device.on('registered', () => setDeviceStatus('ready'));
      device.on('unregistered', () => setDeviceStatus('offline'));
      device.on('tokenWillExpire', refreshToken);
      device.on('error', (twilioError: any) => {
        // eslint-disable-next-line no-console
        console.error('Twilio device error', twilioError);
        setError(describeTwilioError(twilioError, 'Device error'));
        setDeviceStatus('error');
      });
      device.on('incoming', (call: any) => {
        startIncomingRingtone();
        setIncomingCall(call);
        setCallStatus('incoming');
        wireCallEvents(call);
      });

      await device.register();
    }

    setupDevice().catch((setupError) => {
      // eslint-disable-next-line no-console
      console.error('Twilio device setup error', setupError);
      setError(describeTwilioError(setupError, 'Unable to initialize Twilio device'));
      setDeviceStatus('error');
    });

    return () => {
      cancelled = true;
      teardownDevice();
    };
  }, [
    agentId,
    refreshToken,
    resetActiveCall,
    teardownDevice,
    wireCallEvents,
    startIncomingRingtone,
  ]);

  useEffect(() => {
    if (callStatus !== 'connected') return undefined;
    const interval = window.setInterval(() => {
      setTimerSeconds((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [callStatus]);

  const startCall = useCallback(
    async ({
      phoneNumber,
      contactId,
      record,
    }: {
      phoneNumber: string;
      contactId?: number | string | null;
      record?: boolean;
    }) => {
      if (!deviceRef.current) {
        throw new Error('Phone device is not ready yet');
      }
      resetActiveCall();
      setCallStatus('dialing');
      const call = await deviceRef.current.connect({
        params: {
          To: phoneNumber,
          agentId: String(agentId ?? ''),
          contactId: contactId ? String(contactId) : '',
          record: String(Boolean(record)),
        },
      });
      wireCallEvents(call);
      return call;
    },
    [agentId, resetActiveCall, wireCallEvents],
  );

  const endCall = useCallback(() => {
    activeCall?.disconnect();
  }, [activeCall]);

  const toggleMute = useCallback(() => {
    if (!activeCall) return;
    const nextValue = !activeCall.isMuted();
    activeCall.mute(nextValue);
    setIsMuted(nextValue);
  }, [activeCall]);

  const acceptIncoming = useCallback(() => {
    if (!incomingCall) return;
    incomingCall.accept();
    stopIncomingRingtone();
    setIncomingCall(null);
  }, [incomingCall, stopIncomingRingtone]);

  const rejectIncoming = useCallback(() => {
    if (!incomingCall) return;
    incomingCall.reject();
    stopIncomingRingtone();
    setIncomingCall(null);
    setCallStatus('idle');
  }, [incomingCall, stopIncomingRingtone]);

  const sendDtmf = useCallback(
    (digit: string) => {
      if (!activeCall) return;
      activeCall.sendDigits(digit);
    },
    [activeCall],
  );

  return useMemo(
    () => ({
      deviceStatus,
      activeCallSid,
      callStatus,
      isMuted,
      timerSeconds,
      incomingCall,
      error,
      startCall,
      endCall,
      toggleMute,
      acceptIncoming,
      rejectIncoming,
      sendDtmf,
    }),
    [
      acceptIncoming,
      activeCallSid,
      callStatus,
      deviceStatus,
      endCall,
      error,
      incomingCall,
      isMuted,
      rejectIncoming,
      sendDtmf,
      startCall,
      timerSeconds,
      toggleMute,
    ],
  );
}

export default useTwilioDevice;
