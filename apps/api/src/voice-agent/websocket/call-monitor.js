import { mulawToLinear16 } from '../services/stt/google-stt.service.js';

let ioInstance = null;
let monitorNamespace = null;

export function initCallMonitorSocket(io) {
  ioInstance = io;
  monitorNamespace = io.of('/call-monitor');

  monitorNamespace.on('connection', (socket) => {
    console.log(`[voice-agent:call-monitor] Admin connected: ${socket.id}`);

    socket.on('subscribe_call', ({ callSid }) => {
      console.log(`[voice-agent:call-monitor] ${socket.id} subscribed to call: ${callSid}`);
      socket.join(`call_${callSid}`);
    });

    socket.on('unsubscribe_call', ({ callSid }) => {
      console.log(`[voice-agent:call-monitor] ${socket.id} unsubscribed from call: ${callSid}`);
      socket.leave(`call_${callSid}`);
    });

    socket.on('disconnect', () => {
      console.log(`[voice-agent:call-monitor] Admin disconnected: ${socket.id}`);
    });
  });
}

/**
 * Broadcast an audio chunk (base64 mulaw from Twilio) to all subscribers of a call.
 * We convert it to LINEAR16 PCM before sending because browsers can't easily play mulaw.
 */
export function broadcastCallAudio(callSid, speaker, base64Mulaw) {
  if (!monitorNamespace) return;
  
  try {
    const pcmBuffer = mulawToLinear16(base64Mulaw);
    const pcmBase64 = pcmBuffer.toString('base64');
    
    monitorNamespace.to(`call_${callSid}`).emit('live_audio', {
      speaker, // 'prospect' or 'ai'
      audio: pcmBase64
    });
  } catch (err) {
    // Ignore conversion errors
  }
}

/**
 * Broadcast a live transcript text to all subscribers.
 */
export function broadcastCallTranscript(callSid, speaker, text) {
  if (!monitorNamespace) return;
  
  monitorNamespace.to(`call_${callSid}`).emit('live_transcript', {
    speaker,
    text,
    timestamp: new Date().toISOString()
  });
}

/**
 * Broadcast call status (ringing, in-progress, completed) to subscribers.
 */
export function broadcastCallStatus(callSid, status) {
  if (!monitorNamespace) return;
  
  monitorNamespace.to(`call_${callSid}`).emit('call_status', {
    status,
    timestamp: new Date().toISOString()
  });
}
