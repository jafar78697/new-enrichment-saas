/**
 * Google Cloud Speech-to-Text Streaming Service
 *
 * Provides real-time speech recognition using Google's StreamingRecognize API.
 * Converts Twilio's mulaw audio to LINEAR16 for Google STT compatibility.
 *
 * Key features:
 * - Streaming recognition with interim results
 * - Barge-in detection (new speech while AI is speaking)
 * - Utterance endpoint detection (isFinal flag)
 * - Per-call recognition sessions
 */

import { SpeechClient } from '@google-cloud/speech';
// @ts-ignore — stream module types
import stream from 'stream';
import { env } from '../../config/env.js';

// Mulaw to LINEAR16 conversion table (8kHz mulaw → 16-bit PCM)
// Standard mulaw decoding lookup table
const MULAW_TABLE = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  // mulaw decode: transform 8-bit mulaw value to 16-bit linear PCM
  const mulaw = ~i & 0xFF;
  const sign = (mulaw & 0x80) ? 1 : -1;
  const exponent = (mulaw >> 4) & 0x07;
  const mantissa = mulaw & 0x0F;
  const sample = sign * ((mantissa << 3) + 0x84) << exponent;
  MULAW_TABLE[i] = sample;
}

/**
 * Decode base64-encoded mulaw audio to LINEAR16 PCM buffer.
 * @param {string} base64Payload - Base64-encoded mulaw audio from Twilio
 * @returns {Buffer} LINEAR16 PCM buffer
 */
function mulawToLinear16(base64Payload) {
  const mulawBuffer = Buffer.from(base64Payload, 'base64');
  const linearBuffer = Buffer.allocUnsafe(mulawBuffer.length * 2);

  for (let i = 0; i < mulawBuffer.length; i++) {
    const sample = MULAW_TABLE[mulawBuffer[i]];
    linearBuffer.writeInt16LE(sample, i * 2);
  }

  return linearBuffer;
}

// Active STT sessions per streamSid
const activeStreams = new Map();

/**
 * Create a Google STT streaming session for a call.
 *
 * @param {Object} options
 * @param {string} options.streamSid - Twilio stream SID
 * @param {string} options.callSid - Twilio call SID
 * @param {Function} options.onTranscription - Called with { text, isFinal, confidence }
 * @param {Function} options.onBargeIn - Called when new speech detected while AI speaking
 * @param {Function} options.onError - Called on error
 * @returns {Object} STT session controller
 */
export function createSTTSession({ streamSid, callSid, sampleRate = 8000, isPCM = false, onTranscription, onBargeIn, onError }) {
  if (!env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.warn('[voice-agent:stt] Google credentials not configured — STT disabled');
    return { write: () => {}, close: () => {}, streamSid };
  }

  let client;
  try {
    client = new SpeechClient();
  } catch (err) {
    console.error('[voice-agent:stt] Failed to initialize Speech client:', err.message);
    onError(err);
    return { write: () => {}, close: () => {}, streamSid };
  }

  let recognizeStream = null;
  let isActive = true;
  let interimText = '';
  let finalText = '';
  let speechDetected = false;
  let silenceTimer = null;
  let isAiSpeaking = false;

  function createRecognizeStream() {
    const request = {
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: sampleRate,
        languageCode: 'en-US',
        model: 'phone_call', // Best for continuous audio, we will manage endpointing
        useEnhanced: true,
        enableAutomaticPunctuation: true,
        enableWordTimeOffsets: false,
        interimResults: true,
        singleUtterance: true, // Forces FAST endpointing!
        speechContexts: [
          {
            phrases: [
              'Jento AI', 'cold calling', 'appointment', 'demo',
              'pricing', 'meeting', 'schedule', 'calendar',
              'follow up', 'email', 'website', 'contact',
              'interested', 'not interested', 'call back',
            ],
            boost: 10,
          },
        ],
      },
      interimResults: true,
    };

    return client.streamingRecognize(request);
  }

  function setupRecognizeStream() {
    // If there's an existing stream, clean it up
    if (recognizeStream && !recognizeStream.destroyed) {
      try { recognizeStream.destroy(); } catch (e) {}
    }

    recognizeStream = createRecognizeStream();

    recognizeStream.on('error', (err) => {
      console.error(`[voice-agent:stt] Stream error for ${callSid}:`, err.message);
      
      // Google sometimes throws 400 or 11 out of range on singleUtterance close.
      // We just ignore and recreate.
      if (isActive) {
        setTimeout(() => {
          if (isActive) setupRecognizeStream();
        }, 100);
      }
    });

    recognizeStream.on('data', (data) => {
      if (!isActive) return;

      if (data.error) {
        console.error(`[voice-agent:stt] Recognition error for ${callSid}:`, data.error);
        return;
      }

      if (data.results && data.results.length > 0) {
        const result = data.results[0];
        const alternative = result.alternatives && result.alternatives[0];

        if (alternative) {
          const text = alternative.transcript || '';
          const confidence = alternative.confidence || 0;
          const isFinal = result.isFinal || false;

          if (text.trim()) {
            speechDetected = true;

            // Reset silence timer on any speech
            if (silenceTimer) {
              clearTimeout(silenceTimer);
              silenceTimer = null;
            }

            // Check for barge-in
            const isSignificantSpeech = text.trim().length > 4;
            if (isAiSpeaking && !isFinal && confidence > env.VOICE_BARGE_IN_CONFIDENCE && isSignificantSpeech) {
              console.log(`[voice-agent:stt] BARGE-IN detected for ${callSid}: "${text}"`);
              onBargeIn({ text, confidence });
            }

            if (isFinal) {
              finalText = text;
              console.log(`[voice-agent:stt] Final transcript for ${callSid}: "${text}" (confidence: ${confidence})`);
              onTranscription({ text, isFinal: true, confidence });
              interimText = '';
              speechDetected = false;
            } else {
              interimText = text;
              onTranscription({ text, isFinal: false, confidence });
            }
          }
        }
      }
    });

    recognizeStream.on('end', () => {
      // With singleUtterance: true, Google ends the stream after the user finishes a sentence.
      // We must immediately recreate it to keep listening!
      if (isActive) {
        setupRecognizeStream();
      }
    });
  }

  // Initialize first stream
  setupRecognizeStream();

  // Store reference
  activeStreams.set(streamSid, {
    recognizeStream,
    speechDetected,
    isAiSpeaking,
    callSid,
    streamSid,
  });

  /**
   * Feed audio data to the STT recognizer.
   * @param {string|Buffer} payload - Base64-encoded mulaw audio or raw PCM Buffer
   */
  function write(payload) {
    if (!isActive || !recognizeStream || recognizeStream.destroyed) return;

    try {
      if (isPCM) {
        recognizeStream.write(payload);
      } else {
        const linearBuffer = mulawToLinear16(payload);
        recognizeStream.write(linearBuffer);
      }
    } catch (err) {
      console.error(`[voice-agent:stt] Error writing audio for ${callSid}:`, err.message);
    }
  }

  /**
   * Set whether the AI is currently speaking (for barge-in detection).
   */
  function setAiSpeaking(speaking) {
    isAiSpeaking = speaking;
    const session = activeStreams.get(streamSid);
    if (session) {
      session.isAiSpeaking = speaking;
    }
  }

  /**
   * Check if speech has been detected in the current utterance.
   */
  function hasSpeech() {
    return speechDetected;
  }

  /**
   * Reset speech detection flag.
   */
  function resetSpeechDetection() {
    speechDetected = false;
    interimText = '';
    finalText = '';
  }

  /**
   * Close the STT session and clean up.
   */
  function close() {
    isActive = false;
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
    if (recognizeStream && !recognizeStream.destroyed) {
      try {
        recognizeStream.end();
      } catch (err) {
        // Ignore errors on close
      }
    }
    activeStreams.delete(streamSid);
    console.log(`[voice-agent:stt] STT session closed for ${callSid}`);
  }

  return {
    write,
    setAiSpeaking,
    hasSpeech,
    resetSpeechDetection,
    close,
    streamSid,
    callSid,
  };
}

/**
 * Generate a silence detection wrapper that triggers a callback
 * when no speech is detected for a given duration.
 */
export function createSilenceDetector(callback, timeoutMs = 3000) {
  let timer = null;

  return {
    activity() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        callback();
      }, timeoutMs);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

export { mulawToLinear16 };
