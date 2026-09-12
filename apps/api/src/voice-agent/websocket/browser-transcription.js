import jwt from 'jsonwebtoken';
import { createSTTSession } from '../services/stt/google-stt.service.js';
import { env } from '../config/env.js';

function verifyToken(token) {
  if (!token || typeof token !== 'string') throw new Error('Authentication required');

  const keys = [process.env.JWT_PUBLIC_KEY, process.env.JWT_PRIVATE_KEY, env.JWT_SECRET]
    .filter((value, index, values) => value && values.indexOf(value) === index);

  for (const key of keys) {
    try {
      return jwt.verify(token, key);
    } catch {
      // Try the next configured signing key.
    }
  }

  throw new Error('Invalid or expired session');
}

function toBuffer(audio) {
  if (Buffer.isBuffer(audio)) return audio;
  if (audio instanceof ArrayBuffer) return Buffer.from(audio);
  if (ArrayBuffer.isView(audio)) return Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength);
  return null;
}

/**
 * Receives remote WebRTC audio from the browser dialer. Google credentials
 * remain server-side and only the caller's own socket receives transcripts.
 */
export function initBrowserTranscriptionSocket(io) {
  const namespace = io.of('/browser-transcription');

  namespace.use((socket, next) => {
    try {
      socket.data.user = verifyToken(socket.handshake.auth?.token);
      next();
    } catch (error) {
      next(new Error(error.message || 'Authentication failed'));
    }
  });

  namespace.on('connection', (socket) => {
    let stt = null;
    let callId = null;

    const closeSession = () => {
      if (stt) stt.close();
      stt = null;
      callId = null;
    };

    socket.on('start', ({ callId: requestedCallId } = {}) => {
      closeSession();
      if (typeof requestedCallId !== 'string' || requestedCallId.length < 4 || requestedCallId.length > 160) {
        socket.emit('transcription_error', { error: 'Invalid call reference' });
        return;
      }

      if (!env.GOOGLE_APPLICATION_CREDENTIALS) {
        socket.emit('transcription_error', { error: 'Google Speech-to-Text is not configured' });
        return;
      }

      callId = requestedCallId;
      stt = createSTTSession({
        streamSid: `browser-${socket.id}-${callId}`,
        callSid: callId,
        sampleRate: 16000,
        isPCM: true,
        onTranscription: ({ text, isFinal, confidence }) => {
          if (!socket.connected || !text?.trim()) return;
          socket.emit('transcript', { text: text.trim(), isFinal: Boolean(isFinal), confidence });
        },
        onBargeIn: () => {},
        onError: (error) => {
          if (socket.connected) socket.emit('transcription_error', { error: error?.message || 'Transcription failed' });
        },
      });
      socket.emit('transcription_ready', { callId });
    });

    socket.on('audio', (audio) => {
      const buffer = toBuffer(audio);
      if (stt && buffer?.length) stt.write(buffer);
    });

    socket.on('stop', closeSession);
    socket.on('disconnect', closeSession);
  });
}
