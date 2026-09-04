import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Relay } from '@signalwire/js';
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
  dtmf: (digit: string) => void;
  toggleAudioMute: () => void;
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
  incomingCall: null;
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
  return 'Call ended before connecting. Check the number and that this SignalWire account can dial its country.';
}

export function useSignalWireDevice(agentId: number | null | undefined): UseSignalWireDeviceResult {
  const clientRef = useRef<RelayClient | null>(null);
  const activeCallRef = useRef<RelayCall | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const callTimeoutRef = useRef<number | null>(null);
  const connectedRef = useRef(false);
  const endedLocallyRef = useRef(false);

  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>('offline');
  const [activeCallSid, setActiveCallSid] = useState<string | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [error, setError] = useState('');
  const [callerId, setCallerId] = useState('');
  const [maxCallSeconds, setMaxCallSeconds] = useState(600);

  const clearCallTimeout = useCallback(() => {
    if (callTimeoutRef.current !== null) {
      window.clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
  }, []);

  const finishCall = useCallback(() => {
    clearCallTimeout();
    activeCallRef.current = null;
    connectedRef.current = false;
    setIsMuted(false);
    setCallStatus('ended');
  }, [clearCallTimeout]);

  const updateCallStatus = useCallback((call: RelayCall | undefined) => {
    if (!call || (activeCallRef.current && call.id !== activeCallRef.current.id)) return;

    if (call.state === 'active') {
      connectedRef.current = true;
      setCallStatus('connected');
      return;
    }
    if (['trying', 'requesting', 'new'].includes(call.state)) {
      setCallStatus('dialing');
      return;
    }
    if (['ringing', 'early'].includes(call.state)) {
      setCallStatus('ringing');
      return;
    }
    if (['hangup', 'destroy', 'purge'].includes(call.state)) {
      if (!endedLocallyRef.current && !connectedRef.current) {
        setError(callEndReason(call));
      }
      finishCall();
    }
  }, [finishCall]);

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
          setError(describeError(relayError, 'Unable to connect to SignalWire Relay'));
          setDeviceStatus('error');
        };
        notificationHandler = (notification) => {
          if (notification?.type === 'callUpdate') {
            updateCallStatus(notification.call as RelayCall | undefined);
          }
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
      if (remoteAudioRef.current) {
        remoteAudioRef.current.remove();
        remoteAudioRef.current = null;
      }
    };
  }, [agentId, clearCallTimeout, updateCallStatus]);

  useEffect(() => {
    if (callStatus !== 'connected') return;
    const interval = window.setInterval(() => setTimerSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(interval);
  }, [callStatus]);

  const startCall = useCallback(async ({
    phoneNumber,
    contactId,
  }: {
    phoneNumber: string;
    contactId?: number | string | null;
    record?: boolean;
  }) => {
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
    connectedRef.current = false;
    endedLocallyRef.current = false;
    setCallStatus('dialing');

    try {
      const call = await client.newCall({
        destinationNumber: phoneNumber,
        callerNumber: callerId || undefined,
        audio: true,
        video: false,
        remoteElement: remoteAudioRef.current || undefined,
        onNotification: (notification: any) => {
          if (notification?.type === 'callUpdate') {
            updateCallStatus(notification.call as RelayCall | undefined);
          }
        },
      });

      activeCallRef.current = call;
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

      if (agentId) {
        try {
          await callsApi.logOutboundCall({
            to: phoneNumber,
            agentId,
            contactId,
            callSid: call.id,
            record: false,
          });
        } catch (logError) {
          console.error('[SignalWire] Failed to log browser call in CRM', logError);
        }
      }

      return call;
    } catch (callError) {
      const message = describeError(callError, 'Unable to start browser call');
      setError(message);
      finishCall();
      throw new Error(message);
    }
  }, [agentId, callerId, deviceStatus, finishCall, maxCallSeconds, updateCallStatus]);

  const endCall = useCallback(() => {
    endedLocallyRef.current = true;
    activeCallRef.current?.hangup();
    finishCall();
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

  return useMemo(
    () => ({
      deviceStatus,
      activeCallSid,
      callStatus,
      isMuted,
      timerSeconds,
      incomingCall: null,
      error,
      startCall,
      endCall,
      toggleMute,
      acceptIncoming: () => {},
      rejectIncoming: () => {},
      sendDtmf,
    }),
    [activeCallSid, callStatus, deviceStatus, endCall, error, isMuted, sendDtmf, startCall, timerSeconds, toggleMute],
  );
}

export default useSignalWireDevice;
