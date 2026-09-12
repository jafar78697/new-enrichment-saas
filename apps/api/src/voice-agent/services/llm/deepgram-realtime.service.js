import WebSocket from 'ws';
import { env } from '../../config/env.js';

export function createDeepgramSession(config) {
  const wsUrl = `wss://agent.deepgram.com/v1/agent/converse`;
  const apiKey = env.DEEPGRAM_API_KEY || process.env.DEEPGRAM_API_KEY;

  if (!apiKey) {
    throw new Error('DEEPGRAM_API_KEY is missing. Cannot start Deepgram session.');
  }

  const ws = new WebSocket(wsUrl, {
    headers: {
      Authorization: `Token ${apiKey}`
    },
  });

  ws.on('unexpected-response', (req, res) => {
    console.error(`[voice-agent:deepgram] ❌ Unexpected server response: ${res.statusCode}`);
    if (config.onError) config.onError(new Error(`Deepgram WS error: ${res.statusCode}`));
  });

  const state = {
    sessionReady: false,
    responseActive: false,
  };

  const mappedTools = (config.tools || []).map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters
  }));

  // Map audio format
  function toDeepgramAudioFormat(format) {
    if (format === 'g711_ulaw') return { encoding: 'mulaw', sample_rate: 8000 };
    if (format === 'g711_alaw') return { encoding: 'alaw', sample_rate: 8000 };
    return { encoding: 'linear16', sample_rate: 24000 }; // fallback
  }

  const audioConfig = toDeepgramAudioFormat(config.audioFormat);

  const sessionSettings = {
    type: 'Settings',
    audio: {
      input: audioConfig,
      output: audioConfig
    },
    agent: {
      listen: {
        model: 'nova-3'
      },
      think: {
        provider: {
          type: 'open_ai'
        },
        model: env.OPENAI_REALTIME_MODEL || 'gpt-4o',
        instructions: config.systemPrompt || 'You are a helpful voice assistant.',
        functions: mappedTools
      },
      speak: {
        model: env.DEEPGRAM_VOICE || 'aura-asteria-en'
      }
    }
  };

  ws.on('open', () => {
    console.log('[voice-agent:deepgram] ✅ WebSocket OPEN — sending Settings');
    ws.send(JSON.stringify(sessionSettings));
  });

  ws.on('message', (data, isBinary) => {
    try {
      if (isBinary) {
        // Deepgram sends TTS audio as binary
        if (config.onAudioDelta) {
          // Send base64 back up to the pipeline for Twilio/SignalWire
          config.onAudioDelta(data.toString('base64'));
        }
        return;
      }

      const msg = JSON.parse(data.toString());
      
      // LOG EVERY MESSAGE END-TO-END EXCEPT AUDIO DELTAS (binary handles that)
      if (msg.type !== 'AgentAudioDone' && msg.type !== 'UserStartedSpeaking') {
        console.log(`[voice-agent:deepgram] 📩 RECEIVED: ${msg.type}`);
      }

      if (msg.type === 'SettingsApplied') {
        console.log(`[voice-agent:deepgram] ✅ SettingsApplied CONFIRMED.`);
        state.sessionReady = true;
        if (config.onSystemReady) {
          config.onSystemReady();
          config.onSystemReady = null; // fire once
        }
        if (config.onSessionUpdated) config.onSessionUpdated();
      }

      // Interruption detected by Deepgram
      if (msg.type === 'UserStartedSpeaking') {
        if (config.onSpeechStarted) config.onSpeechStarted();
        if (state.responseActive && config.onBargeIn) config.onBargeIn();
      }

      // AI audio output started
      if (msg.type === 'AgentStartedSpeaking') {
        state.responseActive = true;
      }

      // AI audio output finished
      if (msg.type === 'AgentAudioDone') {
        state.responseActive = false;
        if (config.onResponseDone) config.onResponseDone();
      }

      // Tool calls
      if (msg.type === 'FunctionCallRequest') {
        if (config.onToolCall) {
          // Deepgram gives function calls. The arguments might be an object or JSON string.
          let args = typeof msg.arguments === 'string' ? JSON.parse(msg.arguments || '{}') : msg.arguments || {};
          
          config.onToolCall({
            call_id: msg.call_id || msg.id, // Depending on Deepgram's exact payload
            name: msg.name || msg.function_name,
            args: args
          });
        }
      }

      // User transcription (Deepgram might send ConversationText or something similar)
      if (msg.type === 'UserTranscript') {
        if (config.onTranscription && msg.text) {
          config.onTranscription(msg.text);
        }
      }
      
      if (msg.type === 'AgentTranscript') {
        if (config.onAssistantText && msg.text) {
          config.onAssistantText(msg.text);
        }
      }

      // Errors
      if (msg.type === 'Error') {
        console.error('[voice-agent:deepgram] ❌ DEEPGRAM ERROR →', JSON.stringify(msg, null, 2));
        if (config.onError) config.onError(new Error(msg.message || 'Deepgram error'));
      }

    } catch (err) {
      console.error('[voice-agent:deepgram] Error parsing message:', err.message);
    }
  });

  ws.on('error', (err) => {
    console.error('[voice-agent:deepgram] ❌ WebSocket error:', err.message);
    if (config.onError) config.onError(err);
  });

  ws.on('close', (code) => {
    console.log(`[voice-agent:deepgram] 🔌 Connection closed: ${code}`);
    state.sessionReady = false;
    if (config.onClose) config.onClose();
  });

  return {
    writeAudio: (base64Audio) => {
      if (!base64Audio || ws.readyState !== WebSocket.OPEN || !state.sessionReady) return;
      // Convert base64 from Twilio into binary Buffer and send to Deepgram
      const buffer = Buffer.from(base64Audio, 'base64');
      ws.send(buffer);
    },

    triggerResponse: (textMessage = null) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      console.log(`[voice-agent:deepgram] 🚀 Triggering response...`);

      if (textMessage) {
        ws.send(JSON.stringify({
          type: 'UpdateInstructions',
          instructions: textMessage
        }));
      }
      // Deepgram Agent API automatically responds to user speech. 
      // If we need to force a response, we inject a text message.
      ws.send(JSON.stringify({
        type: 'InjectText',
        text: textMessage || "Hello"
      }));
    },

    submitToolResult: (callId, resultStr, triggerResponse = true) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      console.log(`[voice-agent:deepgram] 🛠️ Submitting tool result for ${callId}...`);

      ws.send(JSON.stringify({
        type: 'FunctionCallResponse',
        call_id: callId, // Ensure this matches what Deepgram expects, often function_call_id
        output: resultStr
      }));
    },

    cancelResponse: () => {
      // Not natively supported in the same way as OpenAI response.cancel, 
      // but we can clear audio buffer on our end in the pipeline adapter.
      state.responseActive = false;
    },

    clearBuffer: () => {
      // No-op for now unless Deepgram specifies a clear buffer command
    },

    close: () => {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    },
  };
}
