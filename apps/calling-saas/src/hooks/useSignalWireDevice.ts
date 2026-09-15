import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Relay } from '@signalwire/js';
import { io, type Socket } from 'socket.io-client';
import { callsApi } from '../services/callsApi';

export type DeviceStatus = 'offline' | 'registering' | 'ready' | 'error';
export type CallStatus = 'idle' | 'dialing' | 'ringing' | 'incoming' | 'connected' | 'ended';

type RelayCall = {
  id: string;
  state: string;
  cause?: string;
  causeCode?: string | number;
  error?: string | { message?: string };
  hangup: () => void;
  answer?: () => void | Promise<void>;
  dtmf: (digit: string) => void;
  toggleAudioMute: () => void;
  remoteCallerName?: string;
  remoteCallerNumber?: string;
  options?: {
    remoteCallerName?: string;
    remoteCallerNumber?: string;
    destinationNumber?: string;
  };
};

type RelayClient = {
  on: (event: string, callback: (payload: any) => void) => RelayClient;
  off: (event: string, callback?: (payload: any) => void) => RelayClient;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  newCall: (options: Record<string, unknown>) => Promise<RelayCall>;
  remoteElement: HTMLAudioElement;
};

export interface UseSignalWireDeviceResult {
  deviceStatus: DeviceStatus;
  activeCallSid: string | null;
  callStatus: CallStatus;
  isMuted: boolean;
  timerSeconds: number;
  incomingCall: { id: string; callerName: string; callerNumber: string } | null;
  liveTranscript: string;
  isTranscribing: boolean;
  transcriptStatus: string;
  error: string;
  startCall: (args: {
    phoneNumber: string;
    contactId?: number | string | null;
    record?: boolean;
  }) => Promise<RelayCall>;
  endCall: () => void;
  toggleMute: () => void;
  acceptIncoming: () => void;
  rejectIncoming: () => void;
  sendDtmf: (digit: string) => void;
}

const CALLS_ORIGIN = (import.meta.env.VITE_CALLS_URL as string | undefined) || window.location.origin;
const NO_ANSWER_TIMEOUT_SECONDS = 60;

function toLinear16(input: Float32Array, inputRate: number, outputRate = 16000): ArrayBuffer {
  const ratio = inputRate / outputRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Int16Array(outputLength);

  for (let index = 0; index < outputLength; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(input.length, Math.floor((index + 1) * ratio));
    let total = 0;
    let count = 0;
    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      total += input[sampleIndex];
      count += 1;
    }
    const sample = Math.max(-1, Math.min(1, count ? total / count : input[start] || 0));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return output.buffer;
}

function incomingDetails(call: RelayCall) {
  const callerNumber = call.remoteCallerNumber || call.options?.remoteCallerNumber || 'Unknown caller';
  const callerName = call.remoteCallerName || call.options?.remoteCallerName || 'Incoming call';
  return { id: call.id, callerName, callerNumber };
}

function describeError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isEmergencyDestination(phoneNumber: string): boolean {
  return ['911', '112', '999', '1911'].includes(phoneNumber.replace(/\D/g, ''));
}

function callEndReason(call: RelayCall): string {
  const reportedReason =
    typeof call.error === 'string' ? call.error : call.error?.message || call.cause || call.causeCode;

  if (reportedReason) return `Call ended before connecting: ${reportedReason}.`;
  return 'Call ended before connecting. Check the number and that this account can dial its country.';
}

function isTerminalCall(call: RelayCall | null | undefined): boolean {
  return Boolean(call && ['hangup', 'destroy', 'purge'].includes(call.state));
}

export function useSignalWireDevice(agentId: number | null | undefined): UseSignalWireDeviceResult {
  const clientRef = useRef<RelayClient | null>(null);
  const activeCallRef = useRef<RelayCall | null>(null);
  const incomingCallRef = useRef<RelayCall | null>(null);
  const callStartInProgressRef = useRef(false);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const callTimeoutRef = useRef<number | null>(null);
  const callConnectTimeoutRef = useRef<number | null>(null);
  const connectedRef = useRef(false);
  const endedLocallyRef = useRef(false);
  const activeTrackedCallIdRef = useRef<string | null>(null);
  const connectedAtRef = useRef<number | null>(null);
  const settledTrackedIdsRef = useRef<Set<string>>(new Set());
  const transcriptionSocketRef = useRef<Socket | null>(null);
  const transcriptionContextRef = useRef<AudioContext | null>(null);
  const transcriptionSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const transcriptionProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const transcriptionGainRef = useRef<GainNode | null>(null);
  const transcriptionStartedForCallRef = useRef<string | null>(null);
  const transcriptionRetryTimerRef = useRef<number | null>(null);
  const transcriptionRetryAttemptsRef = useRef(0);
  const startTranscriptionRef = useRef<() => void>(() => {});
  const finalTranscriptRef = useRef('');

  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>('offline');
  const [activeCallSid, setActiveCallSid] = useState<string | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [incomingCall, setIncomingCall] = useState<UseSignalWireDeviceResult['incomingCall']>(null);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptStatus, setTranscriptStatus] = useState('');
  const [error, setError] = useState('');
  const [callerId, setCallerId] = useState('');
  const [maxCallSeconds, setMaxCallSeconds] = useState(600);

  const clearCallTimeout = useCallback(() => {
    if (callTimeoutRef.current !== null) {
      window.clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
  }, []);

  const clearCallConnectTimeout = useCallback(() => {
    if (callConnectTimeoutRef.current !== null) {
      window.clearTimeout(callConnectTimeoutRef.current);
      callConnectTimeoutRef.current = null;
    }
  }, []);

  const clearTranscriptionRetry = useCallback(() => {
    if (transcriptionRetryTimerRef.current !== null) {
      window.clearTimeout(transcriptionRetryTimerRef.current);
      transcriptionRetryTimerRef.current = null;
    }
    transcriptionRetryAttemptsRef.current = 0;
  }, []);

  const stopTranscription = useCallback(() => {
    clearTranscriptionRetry();
    transcriptionProcessorRef.current?.disconnect();
    transcriptionSourceRef.current?.disconnect();
    transcriptionGainRef.current?.disconnect();
    transcriptionProcessorRef.current = null;
    transcriptionSourceRef.current = null;
    transcriptionGainRef.current = null;

    const context = transcriptionContextRef.current;
    transcriptionContextRef.current = null;
    if (context && context.state !== 'closed') void context.close();

    const socket = transcriptionSocketRef.current;
    transcriptionSocketRef.current = null;
    if (socket) {
      socket.emit('stop');
      socket.disconnect();
    }

    transcriptionStartedForCallRef.current = null;
    finalTranscriptRef.current = '';
    setLiveTranscript('');
    setIsTranscribing(false);
    setTranscriptStatus('');
  }, [clearTranscriptionRetry]);

  const settleTrackedCall = useCallback((status = 'completed') => {
    const trackedCallId = activeTrackedCallIdRef.current;
    if (!trackedCallId || settledTrackedIdsRef.current.has(trackedCallId)) return;

    settledTrackedIdsRef.current.add(trackedCallId);
    const durationSeconds = connectedAtRef.current
      ? Math.max(0, Math.ceil((Date.now() - connectedAtRef.current) / 1000))
      : 0;
    const providerCallId = activeCallRef.current?.id;

    void callsApi.settleOutboundCall({
      trackedCallId,
      providerCallId,
      durationSeconds,
      billableSeconds: durationSeconds,
      status,
    }).catch((settleError) => {
      console.error('[CallingService] Failed to settle outbound call', settleError);
    });

    activeTrackedCallIdRef.current = null;
    connectedAtRef.current = null;
  }, []);

  const finishCall = useCallback((status = 'completed', nextStatus: CallStatus = 'ended') => {
    settleTrackedCall(status);
    clearCallTimeout();
    clearCallConnectTimeout();
    stopTranscription();
    activeCallRef.current = null;
    incomingCallRef.current = null;
    callStartInProgressRef.current = false;
    connectedRef.current = false;
    setIsMuted(false);
    setIncomingCall(null);
    setCallStatus(nextStatus);
  }, [clearCallConnectTimeout, clearCallTimeout, settleTrackedCall, stopTranscription]);

  const updateCallStatus = useCallback((call: RelayCall | undefined) => {
    if (!call || (activeCallRef.current && call.id !== activeCallRef.current.id)) return;

    if (call.state === 'active') {
      clearCallConnectTimeout();
      connectedRef.current = true;
      if (!connectedAtRef.current) connectedAtRef.current = Date.now();
      setCallStatus('connected');
      return;
    }
    if (['trying', 'requesting', 'new'].includes(call.state)) {
      setCallStatus('dialing');
      return;
    }
    if (['ringing', 'early'].includes(call.state)) {
      setCallStatus(incomingCallRef.current?.id === call.id ? 'incoming' : 'ringing');
      return;
    }
    if (['hangup', 'destroy', 'purge'].includes(call.state)) {
      if (!endedLocallyRef.current && !connectedRef.current) {
        setError(callEndReason(call));
      }
      finishCall(call.state === 'hangup' ? 'completed' : call.state);
    }
  }, [clearCallConnectTimeout, finishCall]);

  const handleCallNotification = useCallback((notification: any) => {
    // Keep the raw Relay update in the browser console. Browser SDK call
    // UUIDs are not REST call SIDs, so this is the only place we can see the
    // provider's immediate hangup cause for browser-originated calls.
    console.info('[CallingService] SignalWire notification', notification);
    if (notification?.type !== 'callUpdate') return;
    const call = notification.call as RelayCall | undefined;
    if (!call) return;

    const isNewIncomingCall =
      ['ringing', 'early'].includes(call.state) &&
      !activeCallRef.current &&
      !callStartInProgressRef.current;

    if (isNewIncomingCall) {
      activeCallRef.current = call;
      incomingCallRef.current = call;
      endedLocallyRef.current = false;
      connectedRef.current = false;
      setTimerSeconds(0);
      setActiveCallSid(call.id);
      setIncomingCall(incomingDetails(call));
      setCallStatus('incoming');
      return;
    }

    updateCallStatus(call);
  }, [updateCallStatus]);

  useEffect(() => {
    let cancelled = false;
    let client: RelayClient | null = null;
    let readyHandler: ((payload: any) => void) | undefined;
    let errorHandler: ((payload: any) => void) | undefined;
    let notificationHandler: ((payload: any) => void) | undefined;

    async function connectRelay() {
      if (!agentId) {
        setDeviceStatus('offline');
        return;
      }

      try {
        setDeviceStatus('registering');
        setError('');
        const credentials = await callsApi.getToken(agentId);
        if (cancelled) return;

        setCallerId(credentials.callerId);
        setMaxCallSeconds(credentials.maxCallSeconds);

        const audio = document.createElement('audio');
        audio.autoplay = true;
        audio.setAttribute('playsinline', '');
        audio.style.display = 'none';
        document.body.appendChild(audio);
        remoteAudioRef.current = audio;

        client = new Relay({
          project: credentials.projectId,
          token: credentials.token,
        }) as unknown as RelayClient;
        client.remoteElement = audio;
        clientRef.current = client;

        readyHandler = () => {
          if (!cancelled) setDeviceStatus('ready');
        };
        errorHandler = (relayError) => {
          if (cancelled) return;
          setError(describeError(relayError, 'Unable to connect to Calling Relay'));
          setDeviceStatus('error');
        };
        notificationHandler = (notification) => {
          handleCallNotification(notification);
          if (notification?.type === 'refreshToken') {
            setError('Calling session expired. Close and reopen the dialer before making another call.');
            setDeviceStatus('offline');
          }
          if (notification?.type === 'userMediaError') {
            setError('Microphone permission is required to make a browser call.');
          }
        };

        client
          .on('signalwire.ready', readyHandler)
          .on('signalwire.error', errorHandler)
          .on('signalwire.notification', notificationHandler);
        await client.connect();
        if (!cancelled) setDeviceStatus('ready');
      } catch (connectError) {
        if (cancelled) return;
        setError(describeError(connectError, 'Unable to set up browser calling'));
        setDeviceStatus('error');
      }
    }

    void connectRelay();

    return () => {
      cancelled = true;
      clearCallTimeout();
      clearCallConnectTimeout();
      // Route changes, refreshes, and tab closes must not leave a live PSTN
      // leg or a reserved tracked call behind. The server also recovers
      // stale initiated/ringing rows as a second line of defense.
      if (activeCallRef.current) {
        try {
          activeCallRef.current.hangup();
        } catch {
          // The Relay client may already be disconnected during teardown.
        }
      }
      if (activeTrackedCallIdRef.current) {
        settleTrackedCall(connectedRef.current ? 'completed' : 'no_answer');
      }
      if (client) {
        if (readyHandler) client.off('signalwire.ready', readyHandler);
        if (errorHandler) client.off('signalwire.error', errorHandler);
        if (notificationHandler) client.off('signalwire.notification', notificationHandler);
        void client.disconnect();
      }
      clientRef.current = null;
      activeCallRef.current = null;
      connectedRef.current = false;
      endedLocallyRef.current = false;
      activeTrackedCallIdRef.current = null;
      connectedAtRef.current = null;
      if (remoteAudioRef.current) {
        remoteAudioRef.current.remove();
        remoteAudioRef.current = null;
      }
    };
  }, [agentId, clearCallConnectTimeout, clearCallTimeout, handleCallNotification, settleTrackedCall, stopTranscription]);

  useEffect(() => {
    if (callStatus !== 'connected') return;
    const interval = window.setInterval(() => setTimerSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(interval);
  }, [callStatus]);

  const startTranscription = useCallback(() => {
    const callId = activeCallRef.current?.id || activeCallSid;
    if (!callId || transcriptionStartedForCallRef.current === callId) return;

    const audio = remoteAudioRef.current as (HTMLAudioElement & { captureStream?: () => MediaStream }) | null;
    if (!audio?.captureStream) {
      setTranscriptStatus('Live transcription is unavailable in this browser.');
      return;
    }

    const stream = audio.captureStream();
    if (!stream.getAudioTracks().length) {
      if (transcriptionRetryAttemptsRef.current >= 12) {
        setTranscriptStatus('Live call audio was not available for transcription.');
        return;
      }

      transcriptionRetryAttemptsRef.current += 1;
      setTranscriptStatus('Preparing live transcript...');
      transcriptionRetryTimerRef.current = window.setTimeout(() => {
        transcriptionRetryTimerRef.current = null;
        startTranscriptionRef.current();
      }, 500);
      return;
    }

    try {
      clearTranscriptionRetry();
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const gain = context.createGain();
      gain.gain.value = 0;
      const token = localStorage.getItem('token') || localStorage.getItem('enr_token') || '';
      const socket = io(`${CALLS_ORIGIN}/browser-transcription`, {
        auth: { token },
        transports: ['websocket', 'polling'],
      });
      let sessionReady = false;

      socket.on('connect', () => {
        setTranscriptStatus('Starting live transcript...');
        socket.emit('start', { callId });
      });
      socket.on('transcription_ready', () => {
        sessionReady = true;
        setIsTranscribing(true);
        setTranscriptStatus('Listening for the other caller...');
      });
      socket.on('transcript', (payload: { text?: string; isFinal?: boolean }) => {
        const text = payload?.text?.trim();
        if (!text) return;

        if (payload.isFinal) {
          finalTranscriptRef.current = [finalTranscriptRef.current, text].filter(Boolean).join('\n');
          setLiveTranscript(finalTranscriptRef.current);
          return;
        }

        setLiveTranscript([finalTranscriptRef.current, text].filter(Boolean).join('\n'));
      });
      const markTranscriptUnavailable = () => {
        sessionReady = false;
        setIsTranscribing(false);
        setTranscriptStatus('Live transcript is unavailable for this call.');
      };
      socket.on('transcription_error', markTranscriptUnavailable);
      socket.on('connect_error', markTranscriptUnavailable);

      processor.onaudioprocess = (event) => {
        if (!socket.connected || !sessionReady) return;
        const samples = event.inputBuffer.getChannelData(0);
        socket.emit('audio', toLinear16(samples, context.sampleRate));
      };

      source.connect(processor);
      processor.connect(gain);
      gain.connect(context.destination);
      void context.resume();

      transcriptionSocketRef.current = socket;
      transcriptionContextRef.current = context;
      transcriptionSourceRef.current = source;
      transcriptionProcessorRef.current = processor;
      transcriptionGainRef.current = gain;
      transcriptionStartedForCallRef.current = callId;
      finalTranscriptRef.current = '';
      setLiveTranscript('');
      setIsTranscribing(false);
      setTranscriptStatus('Connecting live transcript...');
    } catch (transcriptionError) {
      console.warn('[CallingService] Live transcription could not start', transcriptionError);
      stopTranscription();
      setTranscriptStatus('Live transcript is unavailable for this call.');
    }
  }, [activeCallSid, clearTranscriptionRetry, stopTranscription]);

  useEffect(() => {
    startTranscriptionRef.current = startTranscription;
  }, [startTranscription]);

  useEffect(() => {
    if (callStatus === 'connected') {
      const timer = window.setTimeout(startTranscription, 350);
      return () => window.clearTimeout(timer);
    }
    stopTranscription();
    return undefined;
  }, [callStatus, startTranscription, stopTranscription]);

  const startCall = useCallback(async ({
    phoneNumber,
    contactId,
    record = false,
  }: {
    phoneNumber: string;
    contactId?: number | string | null;
    record?: boolean;
  }) => {
    if (callStartInProgressRef.current || activeCallRef.current) {
      throw new Error('A call is already being started.');
    }

    const client = clientRef.current;
    if (!client || deviceStatus !== 'ready') {
      const notReadyError = new Error('Calling device is still connecting. Please wait a moment.');
      setError(notReadyError.message);
      throw notReadyError;
    }

    if (isEmergencyDestination(phoneNumber)) {
      const emergencyError = new Error('Emergency numbers cannot be dialed from the browser dialer.');
      setError(emergencyError.message);
      throw emergencyError;
    }

    setError('');
    setTimerSeconds(0);
    callStartInProgressRef.current = true;
    connectedRef.current = false;
    endedLocallyRef.current = false;
    activeTrackedCallIdRef.current = null;
    connectedAtRef.current = null;
    setCallStatus('dialing');

    try {
      const authorization = agentId
        ? await callsApi.authorizeOutboundCall({
            to: phoneNumber,
            agentId,
            contactId,
            expectedMaxDurationSeconds: maxCallSeconds,
          })
        : null;
      activeTrackedCallIdRef.current = authorization?.trackedCallId || null;

      const call = await client.newCall({
        destinationNumber: authorization?.to || phoneNumber,
        callerNumber: authorization?.callerId || callerId || undefined,
        audio: true,
        video: false,
        remoteElement: remoteAudioRef.current || undefined,
        onNotification: (notification: any) => {
          handleCallNotification(notification);
        },
      });

      // Relay can emit a terminal update before newCall() resolves. Do not
      // resurrect an already-ended call in activeCallRef in that race.
      if (isTerminalCall(call)) {
        const reason = connectedRef.current ? '' : callEndReason(call);
        if (reason && !endedLocallyRef.current) setError(reason);
        finishCall(connectedRef.current ? 'completed' : 'no_answer', 'ended');
        throw new Error(reason || 'The call ended before connecting.');
      }

      activeCallRef.current = call;
      callStartInProgressRef.current = false;
      setActiveCallSid(call.id);
      updateCallStatus(call);
      setCallStatus((current) => current === 'dialing' ? 'ringing' : current);

      callTimeoutRef.current = window.setTimeout(() => {
        if (activeCallRef.current?.id !== call.id) return;
        endedLocallyRef.current = true;
        call.hangup();
        setError(`Manual call ended after the ${Math.floor(maxCallSeconds / 60)} minute safety limit.`);
        finishCall();
      }, maxCallSeconds * 1000);

      // A network or Relay routing failure must not leave the customer stuck on
      // the orange calling screen forever. Normal PSTN ringing is still allowed.
      callConnectTimeoutRef.current = window.setTimeout(() => {
        if (activeCallRef.current?.id !== call.id || connectedRef.current) return;
        endedLocallyRef.current = true;
        call.hangup();
        setError(`The call did not connect within ${NO_ANSWER_TIMEOUT_SECONDS} seconds. Please try again or check the destination number.`);
        finishCall('no_answer');
      }, NO_ANSWER_TIMEOUT_SECONDS * 1000);

      if (agentId) {
        try {
          await callsApi.logOutboundCall({
            to: phoneNumber,
            agentId,
            contactId,
            callSid: call.id,
            trackedCallId: authorization?.trackedCallId,
            record,
          });
        } catch (logError) {
          console.error('[CallingService] Failed to log browser call in CRM', logError);
        }
      }

      return call;
    } catch (callError) {
      callStartInProgressRef.current = false;
      const message = describeError(callError, 'Unable to start browser call');
      setError(message);
      // Keep the popup in the ended state so an immediate Relay failure is
      // visible to the user instead of silently returning to Ready/closing.
      finishCall('failed', 'ended');
      throw new Error(message);
    }
  }, [agentId, callerId, deviceStatus, finishCall, handleCallNotification, maxCallSeconds, updateCallStatus]);

  const endCall = useCallback(() => {
    endedLocallyRef.current = true;
    activeCallRef.current?.hangup();
    finishCall();
  }, [finishCall]);

  const acceptIncoming = useCallback(() => {
    const call = incomingCallRef.current;
    if (!call) return;
    if (!call.answer) {
      setError('This incoming call cannot be answered by the current browser session. Reopen the page and try again.');
      return;
    }
    setError('');
    setIncomingCall(null);
    incomingCallRef.current = null;
    setCallStatus('dialing');
    Promise.resolve(call.answer()).catch((answerError) => {
      setError(describeError(answerError, 'Unable to answer the incoming call.'));
      finishCall('failed');
    });
  }, [finishCall]);

  const rejectIncoming = useCallback(() => {
    endedLocallyRef.current = true;
    incomingCallRef.current?.hangup();
    finishCall('declined');
  }, [finishCall]);

  const toggleMute = useCallback(() => {
    const call = activeCallRef.current;
    if (!call) return;
    call.toggleAudioMute();
    setIsMuted((muted) => !muted);
  }, []);

  const sendDtmf = useCallback((digit: string) => {
    activeCallRef.current?.dtmf(digit);
  }, []);

  // Gracefully terminate the call if the user refreshes or closes the page
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (activeCallRef.current) {
        endedLocallyRef.current = true;
        activeCallRef.current.hangup();
      }
      if (incomingCallRef.current) {
        endedLocallyRef.current = true;
        incomingCallRef.current.hangup();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  return useMemo(
    () => ({
      deviceStatus,
      activeCallSid,
      callStatus,
      isMuted,
      timerSeconds,
      incomingCall,
      liveTranscript,
      isTranscribing,
      transcriptStatus,
      error,
      startCall,
      endCall,
      toggleMute,
      acceptIncoming,
      rejectIncoming,
      sendDtmf,
    }),
    [acceptIncoming, activeCallSid, callStatus, deviceStatus, endCall, error, incomingCall, isMuted, isTranscribing, liveTranscript, rejectIncoming, sendDtmf, startCall, timerSeconds, toggleMute, transcriptStatus],
  );
}

export default useSignalWireDevice;
