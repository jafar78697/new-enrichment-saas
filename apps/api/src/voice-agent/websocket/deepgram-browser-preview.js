import { WebSocket } from 'ws';
import { env } from '../config/env.js';
import { buildBrowserPreviewSettings } from '../providers/deepgram-agent.js';
import { claimBrowserPreviewTicket } from '../services/browser-preview-tickets.js';
import { createVoiceAgentWebSocketServer } from './upgrade-router.js';

const PREVIEW_PATH = '/api/voice/browser-preview/v1/agent/converse';

function parseJson(data) {
  try {
    return JSON.parse(data.toString());
  } catch {
    return null;
  }
}

function ticketFromRequest(request) {
  const protocols = String(request.headers['sec-websocket-protocol'] || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const bearerIndex = protocols.findIndex((value) => value.toLowerCase() === 'bearer');
  return bearerIndex >= 0 ? protocols[bearerIndex + 1] || null : null;
}

function closeSocket(socket, code, reason) {
  if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
    socket.close(code, reason);
  }
}

/**
 * Gives the browser an authenticated Deepgram Agent connection without ever
 * exposing the permanent Deepgram API key or relying on /v1/auth/grant.
 * The short-lived random ticket exists only in this API process and can only
 * open one configured agent preview.
 */
export function attachDeepgramBrowserPreviewBridge(httpServer) {
  const wss = createVoiceAgentWebSocketServer(httpServer, PREVIEW_PATH, {
    maxPayload: 1024 * 1024,
  });

  wss.on('connection', (browserWs, request) => {
    const ticket = ticketFromRequest(request);
    const preview = ticket ? claimBrowserPreviewTicket(ticket) : null;
    if (!preview || !env.DEEPGRAM_API_KEY) {
      closeSocket(browserWs, 1008, 'invalid-preview-ticket');
      return;
    }

    let deepgramWs = null;
    let settingsForwarded = false;
    let closed = false;
    const remainingMs = Math.max(1, preview.expiresAt - Date.now());
    const expiryTimer = setTimeout(() => finish(1008, 'preview-expired'), remainingMs);

    function finish(code = 1000, reason = 'preview-ended') {
      if (closed) return;
      closed = true;
      clearTimeout(expiryTimer);
      closeSocket(browserWs, code, reason);
      if (deepgramWs) closeSocket(deepgramWs, code, reason);
    }

    deepgramWs = new WebSocket('wss://agent.deepgram.com/v1/agent/converse', {
      headers: { Authorization: `Token ${env.DEEPGRAM_API_KEY}` },
    });

    deepgramWs.on('message', (data, isBinary) => {
      if (browserWs.readyState !== WebSocket.OPEN) return;
      browserWs.send(data, { binary: isBinary });
    });
    deepgramWs.on('unexpected-response', (_request, response) => {
      console.error(`[deepgram-browser-preview] Unexpected Deepgram response: ${response.statusCode}`);
      finish(1011, 'deepgram-connection-failed');
    });
    deepgramWs.on('error', (error) => {
      console.error('[deepgram-browser-preview] Deepgram socket error:', error.message);
      finish(1011, 'deepgram-connection-error');
    });
    deepgramWs.on('close', () => finish(1000, 'deepgram-closed'));

    browserWs.on('message', (data, isBinary) => {
      if (!deepgramWs || deepgramWs.readyState !== WebSocket.OPEN) return;
      if (isBinary) {
        deepgramWs.send(data, { binary: true });
        return;
      }

      const message = parseJson(data);
      if (!message?.type) return;
      if (message.type === 'Settings') {
        if (!settingsForwarded) {
          deepgramWs.send(JSON.stringify(buildBrowserPreviewSettings(preview.agentConfig)));
          settingsForwarded = true;
        }
        return;
      }

      // KeepAlive and tool results are protocol messages, never credentials or
      // agent configuration. Browser settings are deliberately ignored above.
      if (message.type === 'KeepAlive' || message.type === 'FunctionCallResponse') {
        deepgramWs.send(JSON.stringify(message));
      }
    });
    browserWs.on('error', (error) => console.error('[deepgram-browser-preview] Browser socket error:', error.message));
    browserWs.on('close', () => finish(1000, 'browser-closed'));
  });

  console.log(`[deepgram-browser-preview] Secure preview bridge attached at ${PREVIEW_PATH}`);
}
