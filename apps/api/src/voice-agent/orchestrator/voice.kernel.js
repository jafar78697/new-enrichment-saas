// Event-Driven Voice Kernel

export const SessionState = {
  INIT: 'INIT',
  CONNECTED: 'CONNECTED',
  READY: 'READY',
  STREAMING: 'STREAMING',
  ACTIVE: 'ACTIVE'
};

export class VoiceKernel {
  constructor(callSid, streamSid, openaiSession, logger = console) {
    this.callSid = callSid;
    this.streamSid = streamSid;
    this.openaiSession = openaiSession;
    this.logger = logger;
    
    this.state = {
      stage: SessionState.INIT,
      audioReady: false,
      aiReady: false,
      bargeInActive: false
    };

    this.handlers = new Map();
    this.toolQueue = [];
    this.isProcessingTools = false;

    // Default handlers
    this.on('audio.in', this.handleAudioIn.bind(this));
    this.on('ai.response', this.handleAiResponse.bind(this));
    this.on('barge.in', this.handleBargeIn.bind(this));
    this.on('tool.call', this.handleToolCall.bind(this));
  }

  on(eventType, handler) {
    this.handlers.set(eventType, handler);
  }

  emit(eventType, payload) {
    this.route({ type: eventType, payload });
  }

  route(event) {
    const handler = this.handlers.get(event.type);
    if (handler) {
      handler(event, this.state);
    } else {
      this.logger.warn(`[VoiceKernel] Unhandled event type: ${event.type}`);
    }
  }

  // --- Handlers ---

  handleAudioIn(event, state) {
    if (state.bargeInActive) return;
    const { base64Audio } = event.payload;
    if (this.openaiSession) {
      this.openaiSession.writeAudio(base64Audio);
    }
  }

  handleAiResponse(event, state) {
    const { delta, wsClient, adapter } = event.payload;
    if (state.bargeInActive || (!wsClient && !adapter)) return;
    
    // Pass audio back to Twilio
    if (adapter && adapter.sendAudio) {
      adapter.sendAudio(this.streamSid, delta);
    } else if (wsClient && wsClient.readyState === 1) {
      wsClient.send(
        JSON.stringify({
          event: 'media',
          streamSid: this.streamSid,
          media: { payload: delta },
        })
      );
    }
  }

  handleBargeIn(event, state) {
    this.logger.log(`[VoiceKernel] 🛑 BARGE-IN DETECTED for ${this.callSid}`);
    state.bargeInActive = true;
    
    if (this.openaiSession) {
      this.openaiSession.cancelResponse();
      this.openaiSession.clearBuffer();
    }
    
    const { wsClient, adapter } = event.payload;
    if (adapter && adapter.clearAudio) {
      adapter.clearAudio(this.streamSid);
    } else if (wsClient && wsClient.readyState === 1) {
      wsClient.send(
        JSON.stringify({
          event: 'clear',
          streamSid: this.streamSid,
        })
      );
    }

    // Reset barge-in state after a brief moment to allow new turn
    setTimeout(() => {
      state.bargeInActive = false;
    }, 500);
  }

  handleToolCall(event, state) {
    const { call_id, name, args } = event.payload;
    this.logger.log(`[VoiceKernel] 🛠️ Queuing Tool: ${name} (${call_id})`);
    
    this.toolQueue.push({ callId: call_id, name, args, status: 'pending' });
    this.processToolQueue();
  }

  // --- Async Tool Worker ---

  async processToolQueue() {
    if (this.isProcessingTools) return;
    this.isProcessingTools = true;

    while (this.toolQueue.length > 0) {
      const task = this.toolQueue.shift();
      try {
        await task();
      } catch (err) {
        this.logger.error(`[VoiceKernel] ❌ Tool execution error: ${err.message}`);
      }
    }

    this.isProcessingTools = false;
  }
}
