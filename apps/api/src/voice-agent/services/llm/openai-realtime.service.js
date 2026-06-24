import WebSocket from 'ws';
import { env } from '../../config/env.js';

class AudioBufferEngine {
  constructor(onFlush) {
    this.onFlush = onFlush;
  }

  push(chunk) {
    // Direct pass-through for lowest latency
    this.onFlush(chunk);
  }

  clear() {
    // No-op
  }
}

export function createOpenAISession(config) {
  const realtimeModel = env.OPENAI_REALTIME_MODEL;
  const wsUrl = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(realtimeModel)}`;
  const apiKey = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing. Cannot start OpenAI Realtime session.');
  }

  const ws = new WebSocket(wsUrl, {
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
  });

  ws.on('unexpected-response', (req, res) => {
    console.error(`[voice-agent:openai] ❌ Unexpected server response: ${res.statusCode}`);
    if (config.onError) config.onError(new Error(`OpenAI WS error: ${res.statusCode}`));
  });

  const state = {
    sessionReady: false,
    responseActive: false,
  };

  const audioBuffer = new AudioBufferEngine((base64Payload) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    
    // Backpressure control
    if (ws.bufferedAmount > 1_500_000) {
      console.warn('[voice-agent:openai] ⚠️ WS backpressure high. Dropping audio frames.');
      return; 
    }

    ws.send(JSON.stringify({
      type: 'input_audio_buffer.append',
      audio: base64Payload,
    }));
  });

  const mappedTools = (config.tools || []).map(t => ({
    type: 'function',
    name: t.name,
    description: t.description,
    parameters: t.parameters
  }));

  function toRealtimeAudioFormat(format) {
    if (format === 'g711_ulaw') return { type: 'audio/pcmu' };
    if (format === 'g711_alaw') return { type: 'audio/pcma' };
    return { type: 'audio/pcm', rate: 24000 };
  }

  const audioFormat = toRealtimeAudioFormat(config.audioFormat);

  const sessionUpdate = {
    type: 'session.update',
    session: {
      type: 'realtime',
      model: realtimeModel,
      output_modalities: ['audio'],
      instructions: config.systemPrompt || 'You are a helpful voice assistant.',
      tools: mappedTools,
      tool_choice: 'auto',
      audio: {
        input: {
          format: audioFormat,
          turn_detection: {
            type: 'semantic_vad',
            eagerness: 'auto',
            create_response: true,
            interrupt_response: true
          },
          transcription: {
            model: env.OPENAI_TRANSCRIPTION_MODEL
          }
        },
        output: {
          format: audioFormat
        }
      },
      truncation: {
        type: 'retention_ratio',
        retention_ratio: 0.8,
        token_limits: { post_instructions: 4000 }
      },
      max_output_tokens: env.OPENAI_REALTIME_MAX_OUTPUT_TOKENS,
    },
  };

  ws.on('open', () => {
    console.log('[voice-agent:openai] ✅ WebSocket OPEN — sending session.update');
    ws.send(JSON.stringify(sessionUpdate));
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      
      // LOG EVERY MESSAGE END-TO-END EXCEPT RAW DELTAS WHICH CAN SPAM
      if (msg.type !== 'response.audio.delta' && msg.type !== 'response.output_audio.delta') {
        console.log(`[voice-agent:openai] 📩 RECEIVED: ${msg.type}`);
      }

      if (msg.type === 'session.updated') {
        console.log(`[voice-agent:openai] ✅ session.updated CONFIRMED.`);
        state.sessionReady = true;
        if (config.onSystemReady) {
          config.onSystemReady();
          config.onSystemReady = null; // fire once
        }
        if (config.onSessionUpdated) config.onSessionUpdated();
      }

      // AI audio output
      if (msg.type === 'response.audio.delta' || msg.type === 'response.output_audio.delta') {
        if (config.onAudioDelta && msg.delta) {
          config.onAudioDelta(msg.delta);
        }
      }

      if (msg.type === 'response.created') state.responseActive = true;

      // Server VAD cancels the model response. Only clear playback when the
      // customer actually interrupts active AI audio.
      if (msg.type === 'input_audio_buffer.speech_started') {
        if (state.responseActive && config.onBargeIn) config.onBargeIn();
      }

      // User transcription
      if (msg.type === 'conversation.item.input_audio_transcription.completed') {
        if (config.onTranscription && msg.transcript) {
          config.onTranscription(msg.transcript);
        }
      }

      // AI text transcription
      if (msg.type === 'response.audio_transcript.done' || msg.type === 'response.output_audio_transcript.done') {
        if (config.onAssistantText && msg.transcript) {
          config.onAssistantText(msg.transcript);
        }
      }

      // Tool calls
      if (msg.type === 'response.function_call_arguments.done') {
        if (config.onToolCall) {
          let args = {};
          try { 
            args = JSON.parse(msg.arguments || '{}'); 
          } catch(e) {
            console.error("[voice-agent:openai] ❌ Tool arg parse failed", msg.arguments);
            args = {};
          }
          config.onToolCall({
            call_id: msg.call_id,
            name: msg.name,
            args: args
          });
        }
      }

      // Errors
      if (msg.type === 'error' || msg.type === 'session.error' || msg.type === 'response.error' || msg.error) {
        console.error('[voice-agent:openai] ❌ OPENAI ERROR →', JSON.stringify(msg, null, 2));
        if (config.onError) config.onError(new Error(msg.error?.message || 'OpenAI error'));
      }

      // Usage
      if (msg.type === 'response.done') {
        state.responseActive = false;
        if (config.onUsage && msg.response && msg.response.usage) {
          config.onUsage(msg.response.usage);
        }
      }

    } catch (err) {
      console.error('[voice-agent:openai] Error parsing message:', err.message);
    }
  });

  ws.on('error', (err) => {
    console.error('[voice-agent:openai] ❌ WebSocket error:', err.message);
    if (config.onError) config.onError(err);
  });

  ws.on('close', (code) => {
    console.log(`[voice-agent:openai] 🔌 Connection closed: ${code}`);
    state.sessionReady = false;
    if (config.onClose) config.onClose();
  });

  return {
    writeAudio: (base64Audio) => {
      if (!base64Audio) return;
      audioBuffer.push(base64Audio);
    },

    triggerResponse: (textMessage = null) => {
      if (ws.readyState !== WebSocket.OPEN) return;

      console.log(`[voice-agent:openai] 🚀 Triggering response...`);

      if (textMessage) {
        ws.send(JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: textMessage }]
          }
        }));
      }

      ws.send(JSON.stringify({
        type: 'response.create',
        response: {
          output_modalities: ['audio'],
          max_output_tokens: env.OPENAI_REALTIME_MAX_OUTPUT_TOKENS,
          audio: {
            output: {
              format: audioFormat
            }
          }
        }
      }));
    },

    submitToolResult: (callId, resultStr, triggerResponse = true) => {
      if (ws.readyState !== WebSocket.OPEN) return;

      console.log(`[voice-agent:openai] 🛠️ Submitting tool result for ${callId}...`);

      ws.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: callId,
          output: resultStr
        }
      }));

      if (triggerResponse) {
        ws.send(JSON.stringify({
          type: 'response.create',
          response: {
            output_modalities: ['audio'],
            max_output_tokens: env.OPENAI_REALTIME_MAX_OUTPUT_TOKENS,
            audio: {
              output: {
                format: audioFormat
              }
            }
          }
        }));
      }
    },

    cancelResponse: () => {
      if (ws.readyState === WebSocket.OPEN && state.responseActive) {
        ws.send(JSON.stringify({ type: 'response.cancel' }));
        state.responseActive = false;
      }
    },

    clearBuffer: () => {
      audioBuffer.clear();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input_audio_buffer.clear' }));
      }
    },

    close: () => {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    },
  };
}
