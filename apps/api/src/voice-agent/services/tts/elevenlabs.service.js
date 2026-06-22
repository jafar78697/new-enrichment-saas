/**
 * ElevenLabs WebSocket TTS Service
 *
 * Provides ultra-low-latency text-to-speech using the ElevenLabs WebSocket API.
 * Text chunks are streamed from Vertex AI and immediately converted to audio,
 * minimizing the total latency of the voice pipeline.
 *
 * Audio format: PCM 16-bit, 24kHz mono → converted to mulaw 8kHz for Twilio
 */

import WebSocket from 'ws';
import { env } from '../../config/env.js';

/**
 * Create an ElevenLabs TTS stream for a call.
 *
 * @param {Object} options
 * @param {string} options.streamSid - Twilio stream SID
 * @param {string} options.callSid - Twilio call SID
 * @param {Function} options.onAudio - Called with base64-encoded mulaw audio chunks
 * @param {Function} options.onReady - Called when the WebSocket connection is established
 * @param {Function} options.onError - Called on error
 * @param {Function} options.onEnd - Called when TTS stream naturally ends
 * @returns {Object} TTS controller with send(), clear(), close(), isActive()
 */
export function createTTSStream({
  streamSid,
  callSid,
  outputFormat = 'ulaw_8000',
  onAudio,
  onReady,
  onError,
  onEnd,
}) {
  if (!env.ELEVENLABS_API_KEY) {
    console.warn('[voice-agent:tts] ElevenLabs API key not configured — TTS disabled');
    return createDisabledTTS();
  }

  let ws = null;
  let isActive = false;
  let isReady = false;
  let closed = false;
  let totalCharacters = 0;
  let sendBuffer = [];
  let reconnectAttempts = 0;
  const MAX_RECONNECTS = 3;

  const voiceId = 'f0ign4OCWcX0pECFZyU2'; // Hardcoded to bypass any env issues

  let isFirstMessage = true;

  function connect() {
    if (closed) return;

    const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input?model_id=eleven_turbo_v2_5&output_format=${outputFormat}&optimize_streaming_latency=2`;

    try {
      ws = new WebSocket(wsUrl, {
        headers: {
          'xi-api-key': env.ELEVENLABS_API_KEY
        }
      });

      ws.on('open', () => {
        console.log(`[voice-agent:tts] ElevenLabs WS connected for ${callSid}`);
        reconnectAttempts = 0;
        isActive = true;
        isReady = true;
        isFirstMessage = true;
        if (onReady) onReady();

        // Send any buffered texts
        if (sendBuffer.length > 0) {
          const firstText = sendBuffer.shift();
          ws.send(JSON.stringify({
            text: firstText,
            voice_settings: {
              stability: 0.35,
              similarity_boost: 0.8,
              style: 0.4,
              use_speaker_boost: true,
            }
          }));
          isFirstMessage = false;

          for (const txt of sendBuffer) {
            ws.send(JSON.stringify({ text: txt }));
          }
          sendBuffer = [];
        }
      });

      ws.on('message', (data) => {
        try {
          let isJson = false;
          let msgStr = '';

          if (typeof data === 'string') {
            isJson = true;
            msgStr = data;
          } else if (Buffer.isBuffer(data)) {
            // Check if the buffer is a JSON string (starts with '{')
            if (data[0] === 123) { // 123 is ASCII for '{'
              isJson = true;
              msgStr = data.toString('utf8');
            }
          }

          if (isJson) {
            const msg = JSON.parse(msgStr);

            if (msg.error || msg.message) {
              console.error(`[voice-agent:tts] ElevenLabs WS returned error:`, msg.error || msg.message);
            }

            if (msg.audio) {
              if (onAudio) {
                const audioBuffer = Buffer.from(msg.audio, 'base64');
                if (outputFormat === 'pcm_16000') {
                  onAudio(audioBuffer);
                } else {
                  // Twilio drops large WebSocket frames. Chunk the audio.
                  const chunkSize = 160;
                  for (let i = 0; i < audioBuffer.length; i += chunkSize) {
                    const chunk = audioBuffer.slice(i, i + chunkSize);
                    onAudio(chunk.toString('base64'));
                  }
                }
              }
            }

            if (msg.isFinal) {
              // This chunk is the final part
            }

            if (msg.normalizedAlignment) {
              // Alignment data — marks the audio position (handled earlier)
            }
          }

          if (!isJson && Buffer.isBuffer(data)) {
            // Raw binary audio
            if (onAudio) {
              if (outputFormat === 'pcm_16000') {
                onAudio(data);
              } else {
                const chunkSize = 160;
                for (let i = 0; i < data.length; i += chunkSize) {
                  const chunk = data.slice(i, i + chunkSize);
                  onAudio(chunk.toString('base64'));
                }
              }
            }
          }
        } catch (err) {
          console.error(`[voice-agent:tts] Error processing ElevenLabs message for ${callSid}:`, err.message);
        }
      });

      ws.on('close', (code, reason) => {
        console.log(`[voice-agent:tts] ElevenLabs WS closed for ${callSid}: code=${code}, reason=${reason.toString()}`);
        isActive = false;
        isReady = false;

        // Code 1000 is normal after EOS. We will reconnect on the next utterance.
        if (code === 1000) return;

        if (!closed && reconnectAttempts < MAX_RECONNECTS) {
          reconnectAttempts++;
          console.log(`[voice-agent:tts] Reconnecting (attempt ${reconnectAttempts}/${MAX_RECONNECTS}) for ${callSid}`);
          setTimeout(connect, 500);
        } else if (!closed) {
          if (onEnd) onEnd();
        }
      });

      ws.on('error', (err) => {
        console.error(`[voice-agent:tts] ElevenLabs WS error for ${callSid}:`, err.message);
        if (onError) onError(err);
      });
    } catch (err) {
      console.error(`[voice-agent:tts] Failed to connect ElevenLabs WS for ${callSid}:`, err.message);
      if (onError) onError(err);
    }
  }

  // Start connection
  connect();

  return {
    /**
     * Send text to be synthesized. If connection isn't ready yet,
     * buffer the text until it is.
     */
    send(text) {
      if (closed) return;
      if (!text || text.trim() === '') return; // Skip empty chunks
      
      totalCharacters += text.length;

      // Reconnect if this is a new utterance and previous socket closed naturally
      if (!ws || ws.readyState === WebSocket.CLOSED) {
        connect();
      }

      if (!isReady || !ws || ws.readyState !== WebSocket.OPEN) {
        sendBuffer.push(text);
        return;
      }

      try {
        if (isFirstMessage) {
          ws.send(JSON.stringify({
            text,
            voice_settings: {
              stability: 0.35,
              similarity_boost: 0.8,
              style: 0.4,
              use_speaker_boost: true,
            }
          }));
          isFirstMessage = false;
        } else {
          ws.send(JSON.stringify({
            text,
          }));
        }
      } catch (err) {
        console.error(`[voice-agent:tts] Error sending text for ${callSid}:`, err.message);
      }
    },

    /**
     * Send the end-of-stream marker.
     */
    finish() {
      if (closed || !ws || ws.readyState !== WebSocket.OPEN) return;

      try {
        ws.send(JSON.stringify({ text: '' })); // Empty text = EOS
      } catch (err) {
        console.error(`[voice-agent:tts] Error sending EOS for ${callSid}:`, err.message);
      }
    },

    /**
     * Immediately abort current TTS generation (for barge-in).
     */
    clear() {
      if (closed) return;

      // Close current connection and reconnect for clean state
      if (ws) {
        try {
          ws.close(1000, 'barge-in');
        } catch (err) {
          // Ignore
        }
      }

      isActive = false;
      isReady = false;
      sendBuffer = [];

      // Reconnect for next utterance
      connect();
    },

    /**
     * Close the TTS stream permanently.
     */
    close() {
      closed = true;
      isActive = false;

      if (ws) {
        try {
          ws.send(JSON.stringify({ text: '' }));
          ws.close(1000, 'call-ended');
        } catch (err) {
          // Ignore
        }
      }

      sendBuffer = [];
      console.log(`[voice-agent:tts] TTS stream closed for ${callSid} (${totalCharacters} chars)`);
    },

    /**
     * Check if the TTS stream is active.
     */
    isActive() {
      return isActive && !closed;
    },

    /**
     * Get total characters processed.
     */
    getTotalCharacters() {
      return totalCharacters;
    },

    streamSid,
    callSid,
  };
}

function createDisabledTTS() {
  return {
    send: () => {},
    finish: () => {},
    clear: () => {},
    close: () => {},
    isActive: () => false,
    getTotalCharacters: () => 0,
  };
}
