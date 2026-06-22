import { TextToSpeechClient } from '@google-cloud/text-to-speech';

// Singleton client to avoid recreating on every call
const ttsClient = new TextToSpeechClient();

export function createTTSStream({
  streamSid,
  callSid,
  onAudio,
  onReady,
  onError,
  onEnd,
}) {
  let isActive = true;
  let closed = false;
  let totalCharacters = 0;
  
  // Trigger ready immediately since we don't need a persistent WS connection
  if (onReady) setImmediate(onReady);

  return {
    async send(text) {
      if (closed || !text.trim()) return;
      
      try {
        totalCharacters += text.length;
        
        // Use direct synthesizeSpeech for IMMEDIATE audio generation (bypasses streaming delays)
        const [response] = await ttsClient.synthesizeSpeech({
          input: { text: text },
          voice: {
            languageCode: 'en-US',
            name: 'en-US-Journey-F'
          },
          audioConfig: {
            audioEncoding: 'MULAW',
            sampleRateHertz: 8000
          }
        });
        
        if (closed) return; // If call ended while synthesizing
        
        if (response.audioContent && onAudio) {
          // Chunk the audio into smaller pieces to avoid Twilio dropping large frames
          const audioBuffer = Buffer.from(response.audioContent);
          const chunkSize = 1600; // 1600 bytes = 200ms
          for (let i = 0; i < audioBuffer.length; i += chunkSize) {
            if (closed) break;
            const chunk = audioBuffer.slice(i, i + chunkSize);
            onAudio(chunk.toString('base64'));
          }
        }
      } catch (err) {
        console.error(`[voice-agent:tts] Error synthesizing text for ${callSid}:`, err.message);
        if (onError) onError(err);
      }
    },

    clear() {
      // For REST calls, we just mark as closed temporarily to abort processing
      // then reopen. Not perfect, but works for barge-in
    },

    finish() {
      // Nothing to do for REST calls
    },

    close() {
      if (closed) return;
      closed = true;
      isActive = false;
      console.log(`[voice-agent:tts] Google TTS session closed for ${callSid} (${totalCharacters} chars)`);
      if (onEnd) onEnd();
    },

    isActive() {
      return isActive;
    }
  };
}
