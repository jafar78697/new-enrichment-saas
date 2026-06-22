import WebSocket from 'ws';
import { env } from '../../config/env.js';

/**
 * Create an OpenAI Realtime API session via WebSockets.
 * This completely replaces STT, LLM, and TTS with a single sub-300ms latency stream.
 *
 * @param {Object} config
 * @param {string} config.systemPrompt - The AI persona instructions
 * @param {Array} config.tools - Array of tool definitions (e.g. book_meeting, press_keypad)
 * @param {Function} config.onAudioDelta - Called when OpenAI sends audio to play
 * @param {Function} config.onTranscription - Called when the user's speech is transcribed
 * @param {Function} config.onAssistantText - Called when the assistant speaks text
 * @param {Function} config.onToolCall - Called when the AI requests a tool
 * @param {Function} config.onUsage - Called when usage metrics are received
 * @param {Function} config.onReady - Called when the session is successfully configured
 * @param {Function} config.onError - Called on errors
 * @param {Function} config.onClose - Called when the socket closes
 */
export function createOpenAISession(config) {
  const apiKey = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing. Cannot start OpenAI Realtime session.');
  }

  // Use the latest realtime model
  const wsUrl = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17';
  
  const ws = new WebSocket(wsUrl, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'OpenAI-Beta': 'realtime=v1',
    },
  });

  let isReady = false;
  let activeResponseId = null;

  // We map standard JSON Schema tools to OpenAI Realtime tool format
  const mappedTools = (config.tools || []).map(t => ({
    type: 'function',
    name: t.name,
    description: t.description,
    parameters: t.parameters
  }));

  ws.on('open', () => {
    console.log('[voice-agent:openai] Connected to OpenAI Realtime API');
    
    // Initialize session with Twilio-compatible ulaw audio
    const sessionUpdate = {
      type: 'session.update',
      session: {
        modalities: ['audio', 'text'],
        instructions: config.systemPrompt,
        voice: 'alloy', // Can be alloy, ash, ballad, coral, echo, sage, shimmer, or verse
        input_audio_format: 'g711_ulaw',
        output_audio_format: 'g711_ulaw',
        input_audio_transcription: {
          model: 'whisper-1',
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 1000,
        },
        tools: mappedTools,
        tool_choice: 'auto',
      }
    };
    
    ws.send(JSON.stringify(sessionUpdate));
    isReady = true;
    if (config.onReady) config.onReady();
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      
      switch (msg.type) {
        // AI generated audio to play to the user
        case 'response.audio.delta':
          if (config.onAudioDelta && msg.delta) {
            config.onAudioDelta(msg.delta); // base64 mulaw
          }
          break;

        // User transcription (what the user said)
        case 'conversation.item.input_audio_transcription.completed':
          if (config.onTranscription && msg.transcript) {
            config.onTranscription(msg.transcript);
          }
          break;

        // AI text (what the AI said, for logging)
        case 'response.audio_transcript.done':
          if (config.onAssistantText && msg.transcript) {
            config.onAssistantText(msg.transcript);
          }
          break;

        // Tool execution requested by AI
        case 'response.function_call_arguments.done':
          if (config.onToolCall) {
            let args = {};
            try { args = JSON.parse(msg.arguments); } catch(e) {}
            
            config.onToolCall({
              call_id: msg.call_id,
              name: msg.name,
              args: args
            });
          }
          break;

        case 'error':
          console.error('[voice-agent:openai] API Error:', msg.error);
          if (config.onError) config.onError(new Error(msg.error.message));
          break;
          
        case 'response.done':
          if (config.onUsage && msg.response && msg.response.usage) {
            config.onUsage(msg.response.usage);
          }
          break;
          
        case 'response.created':
          activeResponseId = msg.response.id;
          break;
      }
    } catch (err) {
      console.error('[voice-agent:openai] Error parsing message:', err.message);
    }
  });

  ws.on('error', (err) => {
    console.error('[voice-agent:openai] WebSocket error:', err.message);
    if (config.onError) config.onError(err);
  });

  ws.on('close', (code, reason) => {
    console.log(`[voice-agent:openai] Connection closed: ${code}`);
    isReady = false;
    if (config.onClose) config.onClose();
  });

  // Public API
  return {
    /**
     * Feed base64 mulaw audio from Twilio into OpenAI.
     */
    writeAudio: (base64Payload) => {
      if (ws.readyState === WebSocket.OPEN && isReady) {
        ws.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: base64Payload
        }));
      }
    },

    /**
     * Trigger a response manually (e.g. for the initial greeting).
     */
    triggerResponse: (textMessage = null) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      
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
        response: {}
      }));
    },

    /**
     * Provide the tool execution result back to the AI.
     */
    submitToolResult: (call_id, result_string) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      
      ws.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: call_id,
          output: result_string
        }
      }));
      
      // Tell AI to continue processing based on the tool result
      ws.send(JSON.stringify({
        type: 'response.create',
        response: {}
      }));
    },

    /**
     * Clear the buffer (e.g. during a barge-in).
     */
    clearBuffer: () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input_audio_buffer.clear' }));
        // Also cancel any ongoing response
        if (activeResponseId) {
          ws.send(JSON.stringify({ type: 'response.cancel' }));
        }
      }
    },

    close: () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }
  };
}
