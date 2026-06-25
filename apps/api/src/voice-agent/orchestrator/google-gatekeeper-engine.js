import { createSTTSession, createSilenceDetector } from '../services/stt/google-stt.service.js';
import { createTTSStream } from '../services/tts/google-tts.service.js';
import { streamGeminiResponse } from '../services/llm/vertex-ai.service.js';
import { sendMediaToTwilio, clearTwilioAudio } from '../websocket/media-server.js';

function splitIntoSpeakableChunks(text = '') {
  return String(text)
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);
}

export function createGoogleGatekeeperEngine({
  streamSid,
  callSid,
  systemPrompt,
  companyName,
  onTranscript,
  onOwnerDetected,
  onHoldDetected,
  onError,
}) {
  let closed = false;
  let aiSpeaking = false;
  let lastProspectSpeechAt = 0;
  let activeGeminiController = null;
  let currentPartial = '';
  let holdMode = false;
  const messageHistory = [];

  const tts = createTTSStream({
    streamSid,
    callSid,
    onAudio: (base64Audio) => {
      if (closed) return;
      sendMediaToTwilio(streamSid, base64Audio);
    },
    onError: (err) => onError?.(err),
    onEnd: () => {
      aiSpeaking = false;
      stt.setAiSpeaking(false);
    },
  });

  const silenceDetector = createSilenceDetector(() => {
    if (holdMode && !closed) {
      onHoldDetected?.({
        type: 'silence_hold',
        text: 'Long silence while waiting on hold',
      });
    }
  }, 14000);

  const stt = createSTTSession({
    streamSid,
    callSid,
    onTranscription: async ({ text, isFinal, confidence }) => {
      if (closed || !text?.trim()) return;

      lastProspectSpeechAt = Date.now();
      silenceDetector.activity();
      currentPartial = text.trim();

      if (/please hold|one moment|hold on|stay on the line|transfer you|connecting you/i.test(text)) {
        holdMode = true;
        onHoldDetected?.({ type: 'phrase_hold', text });
      }

      onTranscript?.({ text, isFinal, confidence, source: 'google_gatekeeper' });

      if (!isFinal) return;

      messageHistory.push({ role: 'user', content: text.trim() });

      if (typeof onOwnerDetected === 'function') {
        const shouldSwitch = await onOwnerDetected({ text, confidence, source: 'google_gatekeeper' });
        if (shouldSwitch) return;
      }

      await respondToGatekeeper(text.trim());
    },
    onBargeIn: () => {
      clearTwilioAudio(streamSid);
      aiSpeaking = false;
      stt.setAiSpeaking(false);
    },
    onError: (err) => onError?.(err),
  });

  async function speak(text) {
    const chunks = splitIntoSpeakableChunks(text);
    if (!chunks.length || closed) return;

    aiSpeaking = true;
    stt.setAiSpeaking(true);
    clearTwilioAudio(streamSid);

    for (const chunk of chunks) {
      if (closed) break;
      await tts.send(chunk);
    }

    aiSpeaking = false;
    stt.setAiSpeaking(false);
  }

  async function respondToGatekeeper(userText) {
    if (closed) return;

    if (/press\s+\d|for sales|for support|for appointments|main menu|operator/i.test(userText)) {
      return;
    }

    const fallback = companyName
      ? `Hi, this is Jento AI calling about ${companyName}. Am I speaking with the owner?`
      : 'Hi, this is Jento AI calling about a business matter. Am I speaking with the owner?';

    const messages = [
      ...messageHistory.slice(-6),
      {
        role: 'user',
        content: `Reply in one short phone sentence. Keep it simple. Goal: reach the owner or person handling calls. Latest message: ${userText}`,
      },
    ];

    let fullText = '';

    try {
      activeGeminiController = await streamGeminiResponse({
        messages,
        systemPrompt,
        onChunk: ({ text }) => {
          fullText += text;
        },
        onComplete: async ({ fullText: completedText }) => {
          const reply = (completedText || fullText || fallback).trim();
          messageHistory.push({ role: 'assistant', content: reply });
          await speak(reply);
        },
        onError: async () => {
          await speak(fallback);
        },
      });
    } catch (err) {
      onError?.(err);
      await speak(fallback);
    }
  }

  async function start() {
    const intro = companyName
      ? `Hi, this is Jento AI calling about ${companyName}. Am I speaking with the owner?`
      : 'Hi, this is Jento AI calling about your company. Am I speaking with the owner?';
    messageHistory.push({ role: 'assistant', content: intro });
    await speak(intro);
  }

  return {
    async start() {
      await start();
    },
    write(base64Audio) {
      if (closed) return;
      if (aiSpeaking && Date.now() - lastProspectSpeechAt < 250) {
        clearTwilioAudio(streamSid);
        aiSpeaking = false;
        stt.setAiSpeaking(false);
      }
      stt.write(base64Audio);
    },
    stopSpeaking() {
      clearTwilioAudio(streamSid);
      aiSpeaking = false;
      stt.setAiSpeaking(false);
    },
    close() {
      if (closed) return;
      closed = true;
      silenceDetector.cancel();
      try {
        activeGeminiController?.abort?.();
      } catch {}
      stt.close();
      tts.close();
    },
  };
}
