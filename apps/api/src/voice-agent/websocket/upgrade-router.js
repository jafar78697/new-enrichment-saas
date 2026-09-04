import { WebSocketServer } from 'ws';

const routers = new WeakMap();

function pathnameOf(request) {
  try {
    return new URL(request.url || '/', 'http://localhost').pathname;
  } catch {
    return null;
  }
}

function routerFor(httpServer) {
  let router = routers.get(httpServer);
  if (router) return router;

  // Socket.IO registers an upgrade listener before the voice-agent module. It
  // responds with 400 for unknown upgrade paths, so preserve it as a fallback
  // while routing our dedicated paths before it sees those requests.
  const fallbackListeners = httpServer.listeners('upgrade');
  const routes = new Map();
  httpServer.removeAllListeners('upgrade');
  httpServer.on('upgrade', (request, socket, head) => {
    const wss = routes.get(pathnameOf(request));
    if (wss) {
      wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
      return;
    }
    for (const listener of fallbackListeners) listener.call(httpServer, request, socket, head);
  });

  router = { routes };
  routers.set(httpServer, router);
  return router;
}

export function createVoiceAgentWebSocketServer(httpServer, path, options = {}) {
  const router = routerFor(httpServer);
  if (router.routes.has(path)) throw new Error(`Voice-agent WebSocket route already exists: ${path}`);

  const wss = new WebSocketServer({ noServer: true, ...options });
  router.routes.set(path, wss);
  return wss;
}
