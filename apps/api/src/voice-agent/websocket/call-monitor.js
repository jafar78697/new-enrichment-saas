import jwt from 'jsonwebtoken';
import { query } from '../../calls-module/db/index.js';
import { env } from '../config/env.js';

let ioInstance = null;
let monitorNamespace = null;
const audioLogCounts = new Map();

const MULAW_TABLE = new Int16Array(256);
for (let i = 0; i < 256; i += 1) {
  const value = ~i & 0xff;
  const sign = (value & 0x80) ? 1 : -1;
  const exponent = (value >> 4) & 0x07;
  const mantissa = value & 0x0f;
  MULAW_TABLE[i] = sign * (((mantissa << 3) + 0x84) << exponent);
}

function mulawToLinear16(base64Payload) {
  const mulawBuffer = Buffer.from(base64Payload, 'base64');
  const linearBuffer = Buffer.allocUnsafe(mulawBuffer.length * 2);
  for (let i = 0; i < mulawBuffer.length; i += 1) {
    linearBuffer.writeInt16LE(MULAW_TABLE[mulawBuffer[i]], i * 2);
  }
  return linearBuffer;
}

function verifyMonitorToken(token) {
  if (!token || typeof token !== 'string') throw new Error('Authentication required');
  const keys = [process.env.JWT_PUBLIC_KEY, process.env.JWT_PRIVATE_KEY, env.JWT_SECRET]
    .filter((value, index, all) => value && all.indexOf(value) === index);
  for (const key of keys) {
    try {
      return jwt.verify(token, key);
    } catch (_err) {
      // Try the next configured signing key.
    }
  }
  throw new Error('Invalid or expired token');
}

export function initCallMonitorSocket(io) {
  ioInstance = io;
  monitorNamespace = io.of('/call-monitor');

  monitorNamespace.use((socket, next) => {
    try {
      const payload = verifyMonitorToken(socket.handshake.auth?.token);
      const role = String(payload.role || '').toLowerCase();
      if (!['owner', 'admin', 'manager', 'team_leader'].includes(role)) {
        return next(new Error('Manager access required'));
      }
      const tenantId = payload.tenant_id || payload.tenantId || env.VOICE_AGENT_TENANT_ID;
      if (!tenantId) return next(new Error('Tenant context missing'));
      socket.data.tenantId = tenantId;
      socket.data.userId = payload.user_id || payload.sub || null;
      next();
    } catch (err) {
      next(new Error(err.message || 'Authentication failed'));
    }
  });

  monitorNamespace.on('connection', (socket) => {
    console.log(`[voice-agent:call-monitor] Admin connected: ${socket.id}`);

    socket.on('subscribe_call', async ({ callSid }) => {
      if (typeof callSid !== 'string' || callSid.length < 4 || callSid.length > 100) {
        socket.emit('monitor_error', { error: 'Invalid call reference' });
        return;
      }
      try {
        const { rows } = await query(
          `SELECT 1
           FROM ai_call_sessions
           WHERE tenant_id = $1 AND signalwire_call_sid = $2
           UNION ALL
           SELECT 1
           FROM enrichment_results
           WHERE tenant_id = $1
             AND (raw_data->>'active_call_sid' = $2 OR raw_data->>'call_sid' = $2)
           LIMIT 1`,
          [socket.data.tenantId, callSid],
        );
        if (!rows.length) {
          socket.emit('monitor_error', { error: 'This call is not available in your workspace' });
          return;
        }
        console.log(`[voice-agent:call-monitor] ${socket.id} subscribed to call: ${callSid}`);
        socket.join(`call_${callSid}`);
      } catch (err) {
        console.error('[voice-agent:call-monitor] Subscription check failed:', err.message);
        socket.emit('monitor_error', { error: 'Could not verify this live call' });
      }
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
    const room = `call_${callSid}`;
    const count = (audioLogCounts.get(callSid) || 0) + 1;
    audioLogCounts.set(callSid, count);
    if (count === 1 || count % 250 === 0) {
      const subscriberCount = monitorNamespace.adapter.rooms.get(room)?.size || 0;
      console.log(`[voice-agent:call-monitor] emitting live_audio call=${callSid} speaker=${speaker} frames=${count} subscribers=${subscriberCount}`);
    }
    
    monitorNamespace.to(room).emit('live_audio', {
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
  if (['completed', 'canceled', 'busy', 'failed', 'no-answer'].includes(status)) {
    audioLogCounts.delete(callSid);
  }
  
  monitorNamespace.to(`call_${callSid}`).emit('call_status', {
    status,
    timestamp: new Date().toISOString()
  });
}
