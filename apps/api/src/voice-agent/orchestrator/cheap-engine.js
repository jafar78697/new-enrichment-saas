import { createTTSStream } from '../services/tts/google-tts.service.js';
import { sendMediaToTwilio, clearTwilioAudio } from '../websocket/media-server.js';
import { setState, addConversationTurn } from '../services/session/session-store.js';

/**
 * Handles the "Non-Owner" paths of a call (Voicemail, Receptionist, Wrong Number).
 * Plays a predefined message using cheap Google TTS and then resolves so the call can end.
 */
export async function handleCheapEngineFlow(streamSid, callSid, label) {
  return new Promise(async (resolve) => {
    let script = '';
    
    switch (label) {
      case 'VOICEMAIL':
        script = 'Hi, I was trying to reach the owner regarding some business services we offer. I will try calling back at another time. Have a great day!';
        break;
      case 'RECEPTIONIST':
        script = 'Hi there, I was hoping to speak with the owner but I can try calling back another time. Thank you, have a great day!';
        break;
      case 'WRONG_NUMBER':
        script = 'Oh, I apologize, it seems I have the wrong number. Have a wonderful day!';
        break;
      default:
        script = 'Hello, I will try calling back later. Thank you!';
        break;
    }

    console.log(`[voice-agent:cheap-engine] Triggering cheap flow for label ${label}: "${script}"`);
    
    // Log the turn in the database
    await addConversationTurn(callSid, 'assistant', script);
    await setState(callSid, 'speaking');

    const tts = createTTSStream({
      streamSid,
      callSid,
      onAudio: (base64Audio) => {
        sendMediaToTwilio(streamSid, base64Audio);
      },
      onEnd: () => {
        // Automatically hang up after speaking
        setTimeout(() => resolve(), 1000); // Wait 1 second for audio to clear Twilio's buffer
      }
    });

    await tts.send(script);
    tts.close(); // Trigger the onEnd
  });
}
