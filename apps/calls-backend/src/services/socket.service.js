let io = null;

export function initializeSocket(socketServer) {
  io = socketServer;

  io.on('connection', (socket) => {
    const agentId = socket.handshake.auth?.agentId || socket.handshake.query?.agentId;
    if (agentId) {
      socket.join(`agent:${agentId}`);
    }
  });

  return io;
}

export function emitToAgent(agentId, event, payload) {
  if (!io || !agentId) {
    return;
  }

  io.to(`agent:${agentId}`).emit(event, payload);
}

