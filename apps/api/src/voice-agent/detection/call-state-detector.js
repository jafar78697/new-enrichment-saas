/**
 * Call State Detector
 * 
 * Centralized logic for determining whether an AI call should continue based on the 
 * first 5-15 seconds of interaction (e.g. IVR, Voicemail, Transfer, AI Receptionist).
 */

export const CallStates = {
  UNKNOWN: 'UNKNOWN',
  HUMAN_LIVE: 'HUMAN_LIVE',
  VOICEMAIL: 'VOICEMAIL',
  IVR_OR_MENU: 'IVR_OR_MENU',
  AI_RECEPTIONIST_OR_BOT: 'AI_RECEPTIONIST_OR_BOT',
  TRANSFER_OR_AD: 'TRANSFER_OR_AD',
  CLOSED_OR_HOURS: 'CLOSED_OR_HOURS'
};

export function detectCallStateFromTranscript(transcript, agentConfig = null) {
  const text = transcript.toLowerCase();
  const endOnVoicemail = agentConfig?.end_on_voicemail !== false;
  const endOnIvr = agentConfig?.end_on_ivr !== false;
  const endOnAiReceptionist = agentConfig?.end_on_ai_receptionist === true;

  // 1. Voicemail
  if (
    text.includes('please leave a message') ||
    text.includes('record your message') ||
    text.includes('at the tone') ||
    text.includes('after the tone') ||
    text.includes('mailbox') ||
    text.includes('voicemail')
  ) {
    return { state: CallStates.VOICEMAIL, action: endOnVoicemail ? 'hangup' : 'leave_message' };
  }

  // 2. IVR / Menu
  if (
    text.includes('press 1') ||
    text.includes('press one') ||
    text.includes('press 2') ||
    text.includes('press two') ||
    text.includes('dial the extension') ||
    text.includes('main menu') ||
    text.includes('please listen carefully')
  ) {
    return { state: CallStates.IVR_OR_MENU, action: endOnIvr ? 'hangup' : 'continue' };
  }

  // 3. AI Receptionist
  if (text.includes('i am a virtual assistant') || text.includes('i am an ai') || text.includes('how can i help you today') && text.includes('bot')) {
    return { state: CallStates.AI_RECEPTIONIST_OR_BOT, action: endOnAiReceptionist ? 'hangup' : 'leave_message' };
  }

  // 4. Closed / After Hours
  if (text.includes('our office is currently closed') || text.includes('normal business hours') || text.includes('we are unavailable')) {
    return { state: CallStates.CLOSED_OR_HOURS, action: 'hangup' };
  }

  // 5. Transfer / Ad
  if (text.includes('please wait while we transfer') || text.includes('your call may be recorded for quality')) {
    return { state: CallStates.TRANSFER_OR_AD, action: 'wait' };
  }

  // Default: Human Live
  return { state: CallStates.HUMAN_LIVE, action: 'continue' };
}
