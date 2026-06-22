import { initOrchestrator, startCallPipeline, endCallPipeline, handleIncomingAudio } from '../orchestrator/call-pipeline.js';

let ioInstance = null;
const activeBrowserStreams = new Map();

/**
 * Initialize the Browser Voice Socket.IO Gateway.
 */
export function initBrowserVoiceSocket(io) {
  ioInstance = io;
  const browserNamespace = io.of('/voice-browser');

  browserNamespace.on('connection', (socket) => {
    console.log(`[voice-agent:browser-gateway] New connection from ${socket.id}`);

    let currentSessionId = null;

    socket.on('start_session', async (data) => {
      const { sessionId, voiceAgentId } = data;
      currentSessionId = sessionId;

      console.log(`[voice-agent:browser-gateway] Session started: ${sessionId}`);
      
      const adapter = {
        type: 'browser',
        sendAudio: (sid, payload) => {
          // Payload is 16kHz PCM Buffer from TTS
          socket.emit('audio_playback', { audio: payload });
        },
        clearAudio: (sid) => {
          socket.emit('clear_playback');
        }
      };

      activeBrowserStreams.set(sessionId, { socket, adapter });

      // Start the pipeline with the adapter
      await startCallPipeline(sessionId, sessionId, { voiceAgentId, direction: 'inbound', source: 'browser' }, adapter);
    });

    socket.on('audio_stream', (data) => {
      const { sessionId, audio } = data;
      // audio is a binary Buffer (Int16 PCM)
      handleIncomingAudio(sessionId, audio);
    });

    socket.on('disconnect', () => {
      console.log(`[voice-agent:browser-gateway] Disconnected: ${socket.id}`);
      if (currentSessionId) {
        endCallPipeline(currentSessionId, currentSessionId);
        activeBrowserStreams.delete(currentSessionId);
      }
    });
  });
}

export function sendMediaToBrowser(sessionId, payload) {
  const stream = activeBrowserStreams.get(sessionId);
  if (stream) {
    stream.adapter.sendAudio(sessionId, payload);
    return true;
  }
  return false;
}

export function clearBrowserAudio(sessionId) {
  const stream = activeBrowserStreams.get(sessionId);
  if (stream) {
    stream.adapter.clearAudio(sessionId);
    return true;
  }
  return false;
}
