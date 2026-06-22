/**
 * Twilio Media Streams WebSocket Server
 *
 * Handles bidirectional audio streaming with Twilio using the Media Streams protocol.
 * Protocol: https://www.twilio.com/docs/voice/media-streams/websocket-messages
 *
 * Message types from Twilio:
 *   - connected: WebSocket connection established
 *   - start: Stream started with streamSid, callSid, custom params
 *   - media: Base64-encoded mulaw audio payload (8kHz)
 *   - stop: Stream/call ended
 *
 * Message types to Twilio:
 *   - media: Base64-encoded mulaw audio to play
 *   - mark: Named marker for synchronization
 *   - clear: Flush the audio playback buffer immediately (for barge-in)
 */

import { WebSocketServer } from 'ws';
import { VOICE_AGENT_ENABLED, env } from '../config/env.js';

// Active media streams indexed by streamSid
const activeStreams = new Map();

// Event emitter for orchestrator integration
const streamEventHandlers = new Map();

/**
 * Attach the WebSocket server for Twilio Media Streams to an existing HTTP server.
 * Called from the main Fastify server startup.
 *
 * @param {import('http').Server} httpServer - The Node.js HTTP server
 * @returns {WebSocketServer} The created WebSocket server instance
 */
export function attachMediaServer(httpServer) {
  if (!VOICE_AGENT_ENABLED) {
    console.log('[voice-agent:ws] Media Streams WebSocket disabled (VOICE_AGENT_ENABLED=false)');
    return null;
  }

  const wss = new WebSocketServer({
    server: httpServer,
    path: '/api/voice/media',
    maxPayload: 1024 * 1024, // 1MB max payload
  });

  wss.on('connection', (ws, req) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`[voice-agent:ws] New media stream connection from ${clientIp} on ${req.url}`);

    let contactId = null;
    try {
      // req.url is like /api/voice/media?contactId=123
      const urlParams = new URL(req.url, `http://localhost`).searchParams;
      contactId = urlParams.get('contactId');
    } catch (e) {}

    let streamSid = null;
    let callSid = null;
    let streamActive = false;

    // Track mark events for synchronization
    let markQueue = [];
    let markHandlers = new Map();

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleMessage(ws, message);
      } catch (err) {
        console.error('[voice-agent:ws] Failed to parse message:', err.message);
      }
    });

    ws.on('close', (code, reason) => {
      console.log(`[voice-agent:ws] Media stream closed: streamSid=${streamSid}, callSid=${callSid}, code=${code}`);
      cleanupStream(streamSid, callSid);
    });

    ws.on('error', (err) => {
      console.error(`[voice-agent:ws] WebSocket error for streamSid=${streamSid}:`, err.message);
      cleanupStream(streamSid, callSid);
    });

    function handleMessage(ws, msg) {
      switch (msg.event) {
        case 'connected':
          console.log(`[voice-agent:ws] Connected event: ${msg.protocol || 'unknown protocol'}`);
          break;

        case 'start':
          streamSid = msg.streamSid;
          callSid = msg.start?.callSid || 'unknown';
          streamActive = true;
          console.log(`[voice-agent:ws] Stream started: streamSid=${streamSid}, callSid=${callSid}, contactId=${contactId}`);

          // Store stream reference
          activeStreams.set(streamSid, {
            ws,
            callSid,
            streamSid,
            startedAt: new Date(),
            customParams: msg.start?.customParameters || {},
            contactId,
          });

          // Notify orchestrator of new stream
          emitStreamEvent('stream:start', {
            streamSid,
            callSid,
            ws,
            customParams: msg.start?.customParameters || {},
            contactId,
          });
          break;

        case 'media':
          if (!streamActive) return;

          // Twilio sends base64-encoded mulaw audio at 8kHz
          const audioPayload = msg.media?.payload;
          if (audioPayload) {
            // Emit audio data to orchestrator for STT processing
            emitStreamEvent('stream:audio', {
              streamSid,
              callSid,
              payload: audioPayload,
              track: msg.media?.track || 'inbound',
            });
          }
          break;

        case 'mark':
          // Twilio confirms a mark we sent earlier
          const markName = msg.mark?.name;
          if (markName && markHandlers.has(markName)) {
            const handler = markHandlers.get(markName);
            handler(msg.mark);
            markHandlers.delete(markName);
          }
          break;

        case 'stop':
          console.log(`[voice-agent:ws] Stream stopped: streamSid=${streamSid}, callSid=${callSid}`);
          streamActive = false;

          emitStreamEvent('stream:stop', {
            streamSid,
            callSid,
            reason: msg.stop?.reason || 'call-ended',
          });

          cleanupStream(streamSid, callSid);
          break;

        default:
          console.log(`[voice-agent:ws] Unknown event: ${msg.event}`);
      }
    }
  });

  wss.on('error', (err) => {
    console.error('[voice-agent:ws] WebSocket server error:', err.message);
  });

  console.log('[voice-agent:ws] Media Streams WebSocket server attached at /media');
  return wss;
}

/**
 * Register a handler for media stream events.
 * Used by the orchestrator to listen for new call starts, audio data, and stops.
 *
 * @param {string} event - Event name ('stream:start', 'stream:audio', 'stream:stop')
 * @param {Function} handler - Handler function
 */
export function onStreamEvent(event, handler) {
  if (!streamEventHandlers.has(event)) {
    streamEventHandlers.set(event, []);
  }
  streamEventHandlers.get(event).push(handler);
}

function emitStreamEvent(event, data) {
  const handlers = streamEventHandlers.get(event) || [];
  for (const handler of handlers) {
    try {
      handler(data);
    } catch (err) {
      console.error(`[voice-agent:ws] Error in ${event} handler:`, err.message);
    }
  }
}

/**
 * Send media audio to Twilio.
 * @param {string} streamSid - The stream ID
 * @param {string} payload - Base64-encoded mulaw audio
 */
export function sendMediaToTwilio(streamSid, payload) {
  const stream = activeStreams.get(streamSid);
  if (!stream) {
    console.warn(`[voice-agent:ws] Cannot send media — stream ${streamSid} not found in activeStreams`);
    return false;
  }
  if (stream.ws.readyState !== 1) {
    console.warn(`[voice-agent:ws] Cannot send media — stream ${streamSid} ws.readyState is ${stream.ws.readyState}`);
    return false;
  }

  try {
    stream.ws.send(JSON.stringify({
      event: 'media',
      streamSid,
      media: {
        payload,
      },
    }));
    return true;
  } catch (err) {
    console.error(`[voice-agent:ws] Error sending media for ${streamSid}:`, err.message);
    return false;
  }
}

/**
 * Send a clear command to flush Twilio's audio buffer (for barge-in).
 * @param {string} streamSid - The stream ID
 */
export function clearTwilioAudio(streamSid) {
  const stream = activeStreams.get(streamSid);
  if (!stream || stream.ws.readyState !== 1) {
    return false;
  }

  try {
    stream.ws.send(JSON.stringify({
      event: 'clear',
      streamSid,
    }));
    console.log(`[voice-agent:ws] Clear command sent for stream ${streamSid}`);
    return true;
  } catch (err) {
    console.error(`[voice-agent:ws] Error sending clear for ${streamSid}:`, err.message);
    return false;
  }
}

/**
 * Send a mark event for synchronization.
 * @param {string} streamSid
 * @param {string} name - Mark name
 */
export function sendMark(streamSid, name) {
  const stream = activeStreams.get(streamSid);
  if (!stream || stream.ws.readyState !== 1) {
    return false;
  }

  try {
    stream.ws.send(JSON.stringify({
      event: 'mark',
      streamSid,
      mark: { name },
    }));
    return true;
  } catch (err) {
    console.error(`[voice-agent:ws] Error sending mark for ${streamSid}:`, err.message);
    return false;
  }
}

/**
 * Get active stream info.
 */
export function getStream(streamSid) {
  return activeStreams.get(streamSid) || null;
}

/**
 * Get all active stream IDs.
 */
export function getActiveStreamIds() {
  return Array.from(activeStreams.keys());
}

/**
 * Check if a stream is active.
 */
export function isStreamActive(streamSid) {
  return activeStreams.has(streamSid);
}

function cleanupStream(streamSid, callSid) {
  if (streamSid && activeStreams.has(streamSid)) {
    activeStreams.delete(streamSid);
  }
}

export default {
  attachMediaServer,
  onStreamEvent,
  sendMediaToTwilio,
  clearTwilioAudio,
  sendMark,
  getStream,
  getActiveStreamIds,
  isStreamActive,
};
