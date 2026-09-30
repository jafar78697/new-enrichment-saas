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
  ,SCREENING: 'SCREENING'
};

export function detectCallStateFromTranscript(transcript, agentConfig = null) {
  const text = String(transcript || '').toLowerCase().replace(/[’']/g, "'");
  const endOnVoicemail = agentConfig?.end_on_voicemail !== false;
  // This outbound campaign targets a real decision-maker. An automated keypad
  // menu is a terminal machine result; continuing wastes a caller ID and can
  // make the agent speak over recordings.
  const endOnIvr = agentConfig?.end_on_ivr !== false;
  const endOnAiReceptionist = agentConfig?.end_on_ai_receptionist === true;

  // Screening is not voicemail: identify yourself and wait for the recipient.
  if (/\b(?:say|state|record|provide)\b.{0,30}\b(?:your name|name and (?:reason|purpose))\b|\b(?:name|reason for calling)\b.{0,50}\b(?:connect|screen|accept)\b/.test(text)) {
    return { state: CallStates.SCREENING, action: 'identify' };
  }
  const conversationalMention = /\b(?:i|i've|i was|we were)\b.{0,35}\b(?:checking|checked|heard|listening to)\b.{0,25}\bvoicemail\b/.test(text);
  if (!conversationalMention && /\b(?:please\s+)?leave (?:us |me |your |a )?(?:short |brief |voice )?message\b|\b(?:please\s+)?record (?:your|a) message\b|\b(?:after|at|following) the (?:tone|beep|sound)\b|\byou(?:'ve| have) reached (?:the )?(?:voice ?mail|mailbox)\b|\bmailbox (?:is full|has not been set up|belonging to)\b|\bcall has been forwarded to (?:an? )?(?:automated )?voice messaging system\b|\bperson (?:you are|you're) calling (?:is )?(?:not available|unavailable)\b/.test(text)) {
    return { state: CallStates.VOICEMAIL, action: endOnVoicemail ? 'hangup' : 'leave_message' };
  }

  // 2. IVR / Menu
  if (/\bpress\s+(?:[0-9*#]|one|two|three|four|five|six|seven|eight|nine|zero)\b|\bdial (?:the|your) extension\b|\bmain menu\b|\b(?:choose|select) (?:from )?(?:the )?(?:following )?(?:options|menu)\b/.test(text)) {
    return { state: CallStates.IVR_OR_MENU, action: endOnIvr ? 'hangup' : 'wait' };
  }

  // 3. AI Receptionist
  if (text.includes('i am a virtual assistant') || text.includes('i am an ai') || text.includes('how can i help you today') && text.includes('bot')) {
    return { state: CallStates.AI_RECEPTIONIST_OR_BOT, action: 'identify' };
  }

  // 4. Closed / After Hours
  if (/\b(?:office|business) is (?:currently )?closed\b|\bnormal business hours\b|\b(?:person|subscriber|customer).{0,35}\b(?:not available|unavailable)\b/.test(text)) {
    return { state: CallStates.CLOSED_OR_HOURS, action: 'wait' };
  }

  // 5. Transfer / Ad
  if (/\b(?:please )?(?:hold|stay on the line)\b|\bplease wait while we transfer\b|\brecorded for quality\b|\bis being recorded\b|\bquality assurance\b/.test(text)) {
    return { state: CallStates.TRANSFER_OR_AD, action: 'wait' };
  }

  // Default: Human Live
  return { state: CallStates.HUMAN_LIVE, action: 'continue' };
}

export async function detectCallStateFromTranscriptML(transcript, agentConfig = null) {
  const fastHeuristic = detectCallStateFromTranscript(transcript, agentConfig);
  return fastHeuristic;
  /* Remote classification is intentionally disabled here: an ambiguous,
     speculative fragment must never cause an irreversible hangup. */
  /*
  // If the heuristic strongly detected something other than HUMAN, trust it to avoid LLM latency
  if (fastHeuristic.state !== CallStates.HUMAN_LIVE) {
    return fastHeuristic;
  }
  
  // If the transcript is very short, just return the heuristic immediately
  if (transcript.split(/\s+/).length < 5) {
    return fastHeuristic;
  }

  try {
    const { generateCompletion } = await import('../services/llm/openai-analysis.service.js');
    const systemPrompt = `You are an AI analyzing the first few seconds of an outbound phone call transcript.
Determine if the transcript represents a LIVE HUMAN answering, a VOICEMAIL greeting, an IVR/Menu, an AI BOT, or a CLOSED/AFTER-HOURS message.
Note: "The person you are calling is not available", "Please leave your message", or generic automated operator messages indicating unavailability should be classified as VOICEMAIL.
Return exactly one word from this list: HUMAN_LIVE, VOICEMAIL, IVR_OR_MENU, AI_RECEPTIONIST_OR_BOT, CLOSED_OR_HOURS, TRANSFER_OR_AD.
If unsure, default to HUMAN_LIVE.`;

    const result = await generateCompletion({
      systemPrompt,
      userPrompt: `Transcript: "${transcript}"`,
      temperature: 0.0,
      maxTokens: 10
    });
    
    const llmState = result.text.trim();
    if (Object.keys(CallStates).includes(llmState)) {
      // Re-apply the action logic based on the LLM's chosen state
      const endOnVoicemail = agentConfig?.end_on_voicemail !== false;
      const endOnIvr = agentConfig?.end_on_ivr === true;
      const endOnAiReceptionist = agentConfig?.end_on_ai_receptionist === true;

      switch (llmState) {
        case CallStates.VOICEMAIL: return { state: llmState, action: endOnVoicemail ? 'hangup' : 'leave_message' };
        case CallStates.IVR_OR_MENU: return { state: llmState, action: endOnIvr ? 'hangup' : 'wait' };
        case CallStates.AI_RECEPTIONIST_OR_BOT: return { state: llmState, action: endOnAiReceptionist ? 'hangup' : 'leave_message' };
        case CallStates.CLOSED_OR_HOURS: return { state: llmState, action: 'hangup' };
        case CallStates.TRANSFER_OR_AD: return { state: llmState, action: 'wait' };
        default: return { state: CallStates.HUMAN_LIVE, action: 'continue' };
      }
    }
  } catch (err) {
    console.error('[call-state-detector] ML classification failed, falling back to heuristics:', err.message);
  }
  return fastHeuristic; */
}
