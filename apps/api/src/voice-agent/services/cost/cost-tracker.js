/**
 * Cost Tracking Service
 *
 * Tracks the services used by the current call path: Twilio, OpenAI Realtime,
 * and OpenAI transcription. Post-call analysis remains a separate estimate.
 */

// Pricing constants (USD)
const PRICING = {
  twilio: {
    inboundPerMinute: 0.0085,
    outboundPerMinute: 0.013,
    recordingPerMinute: 0.0025,
  },
  vertexAI: {
    inputPer1KChars: 0.00001875,
    outputPer1KChars: 0.000075,
  },
  elevenLabs: {
    per1KChars: 0.001, // Turbo v2.5
  },
  openAI: {
    model: 'gpt-realtime-mini',
    audioInputPer1M: 10,
    audioOutputPer1M: 20,
    textInputPer1M: 0.60,
    textOutputPer1M: 2.40,
    transcriptionPerMinute: 0.003,
  },
};

/**
 * Calculate total cost for a call.
 *
 * @param {Object} params
 * @param {string} params.callSid - Call SID
 * @param {number} params.durationSeconds - Total call duration in seconds
 * @param {string} [params.direction='outbound'] - Call direction
 * @param {number} [params.inputTokens=0] - Vertex AI input tokens
 * @param {number} [params.outputTokens=0] - Vertex AI output tokens
 * @param {number} [params.ttsCharacters=0] - ElevenLabs characters processed
 * @param {boolean} [params.wasRecorded=false] - Whether call was recorded
 * @returns {Object} Cost breakdown
 */
export function trackCallCost({
  callSid,
  durationSeconds = 0,
  direction = 'outbound',
  inputTokens = 0,
  outputTokens = 0,
  ttsCharacters = 0,
  wasRecorded = false,
  openAiInputTokens = 0,
  openAiOutputTokens = 0,
  openAiInputAudioTokens = 0,
  openAiOutputAudioTokens = 0,
  openAiInputTextTokens = 0,
  openAiOutputTextTokens = 0,
}) {
  const durationMinutes = durationSeconds / 60;

  // Twilio cost
  const twilioPerMinute = direction === 'inbound'
    ? PRICING.twilio.inboundPerMinute
    : PRICING.twilio.outboundPerMinute;
  const twilioVoiceCost = durationMinutes * twilioPerMinute;
  const twilioRecordingCost = wasRecorded
    ? durationMinutes * PRICING.twilio.recordingPerMinute
    : 0;
  const twilioTotalCost = twilioVoiceCost + twilioRecordingCost;

  // Realtime transcription is billed independently from speech-to-speech usage.
  const transcriptionCost = durationMinutes * PRICING.openAI.transcriptionPerMinute;

  // Vertex AI cost (per 1K characters, approximate token-to-char conversion)
  // ~4 chars per token for English
  const inputChars = inputTokens * 4;
  const outputChars = outputTokens * 4;
  const vertexInputCost = (inputChars / 1000) * PRICING.vertexAI.inputPer1KChars;
  const vertexOutputCost = (outputChars / 1000) * PRICING.vertexAI.outputPer1KChars;
  const vertexTotalCost = vertexInputCost + vertexOutputCost;

  // ElevenLabs cost
  const elevenLabsCost = (ttsCharacters / 1000) * PRICING.elevenLabs.per1KChars;

  // Realtime usage reports audio and text token details separately. Older
  // responses without details are conservatively treated as audio tokens.
  const classifiedInput = openAiInputAudioTokens + openAiInputTextTokens;
  const classifiedOutput = openAiOutputAudioTokens + openAiOutputTextTokens;
  const unclassifiedInput = Math.max(0, openAiInputTokens - classifiedInput);
  const unclassifiedOutput = Math.max(0, openAiOutputTokens - classifiedOutput);
  const billedInputAudioTokens = openAiInputAudioTokens + unclassifiedInput;
  const billedOutputAudioTokens = openAiOutputAudioTokens + unclassifiedOutput;
  const openAiAudioInputCost = (billedInputAudioTokens / 1_000_000) * PRICING.openAI.audioInputPer1M;
  const openAiAudioOutputCost = (billedOutputAudioTokens / 1_000_000) * PRICING.openAI.audioOutputPer1M;
  const openAiTextInputCost = (openAiInputTextTokens / 1_000_000) * PRICING.openAI.textInputPer1M;
  const openAiTextOutputCost = (openAiOutputTextTokens / 1_000_000) * PRICING.openAI.textOutputPer1M;
  const openAiInputCost = openAiAudioInputCost + openAiTextInputCost;
  const openAiOutputCost = openAiAudioOutputCost + openAiTextOutputCost;
  const openAiCost = openAiInputCost + openAiOutputCost;

  // Totals
  const totalCost = twilioTotalCost + vertexTotalCost + elevenLabsCost + openAiCost + transcriptionCost;

  const breakdown = {
    callSid,
    durationSeconds,
    durationMinutes: Math.round(durationMinutes * 100) / 100,
    direction,
    timestamp: new Date().toISOString(),
    twilio: {
      voiceCost: roundToCents(twilioVoiceCost),
      recordingCost: roundToCents(twilioRecordingCost),
      total: roundToCents(twilioTotalCost),
      perMinuteRate: twilioPerMinute,
    },
    transcription: {
      model: 'gpt-4o-mini-transcribe',
      cost: roundToCents(transcriptionCost),
      perMinuteRate: PRICING.openAI.transcriptionPerMinute,
    },
    vertexAI: {
      inputCost: roundToCents(vertexInputCost),
      outputCost: roundToCents(vertexOutputCost),
      total: roundToCents(vertexTotalCost),
      inputTokens,
      outputTokens,
      inputChars,
      outputChars,
    },
    elevenLabs: {
      cost: roundToCents(elevenLabsCost),
      characters: ttsCharacters,
      per1KCharsRate: PRICING.elevenLabs.per1KChars,
    },
    openAI: {
      cost: roundToCents(openAiCost),
      model: PRICING.openAI.model,
      inputTokens: openAiInputTokens,
      outputTokens: openAiOutputTokens,
      inputAudioTokens: billedInputAudioTokens,
      outputAudioTokens: billedOutputAudioTokens,
      inputTextTokens: openAiInputTextTokens,
      outputTextTokens: openAiOutputTextTokens,
      inputCost: roundToCents(openAiInputCost),
      outputCost: roundToCents(openAiOutputCost),
      transcriptionCost: roundToCents(transcriptionCost),
    },
    total: roundToCents(totalCost),
  };

  console.log(`[voice-agent:cost] Call ${callSid}: $${breakdown.total.toFixed(4)} (${durationMinutes.toFixed(1)} min)`);

  return breakdown;
}

/**
 * Aggregate costs for a date range.
 *
 * @param {Array} sessions - Array of voice_call_sessions with cost_breakdown
 * @returns {Object} Aggregated cost summary
 */
export function aggregateCosts(sessions) {
  if (!sessions || sessions.length === 0) {
    return {
      totalCost: 0,
      totalCalls: 0,
      totalDuration: 0,
      avgCostPerCall: 0,
      twilioCost: 0,
      sttCost: 0,
      vertexCost: 0,
      elevenLabsCost: 0,
      openAiCost: 0,
      totalTokens: 0,
      totalCharacters: 0,
    };
  }

  let totalCost = 0;
  let totalDuration = 0;
  let twilioCost = 0;
  let sttCost = 0;
  let vertexCost = 0;
  let elevenLabsCost = 0;
  let openAiCost = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCharacters = 0;

  for (const session of sessions) {
    const breakdown = typeof session.cost_breakdown === 'string'
      ? JSON.parse(session.cost_breakdown)
      : session.cost_breakdown;

    if (!breakdown) continue;

    totalCost += breakdown.total || 0;
    totalDuration += breakdown.durationSeconds || 0;
    twilioCost += breakdown.twilio?.total || 0;
    sttCost += breakdown.transcription?.cost || breakdown.googleSTT?.cost || 0;
    vertexCost += breakdown.vertexAI?.total || 0;
    elevenLabsCost += breakdown.elevenLabs?.cost || 0;
    openAiCost += breakdown.openAI?.cost || 0;
    totalInputTokens += breakdown.vertexAI?.inputTokens || 0;
    totalOutputTokens += breakdown.vertexAI?.outputTokens || 0;
    totalCharacters += breakdown.elevenLabs?.characters || 0;
  }

  const count = sessions.length;

  return {
    totalCost: roundToCents(totalCost),
    totalCalls: count,
    totalDuration: Math.round(totalDuration),
    avgCostPerCall: roundToCents(totalCost / count),
    twilioCost: roundToCents(twilioCost),
    sttCost: roundToCents(sttCost),
    vertexCost: roundToCents(vertexCost),
    elevenLabsCost: roundToCents(elevenLabsCost),
    openAiCost: roundToCents(openAiCost),
    totalInputTokens,
    totalOutputTokens,
    totalCharacters,
  };
}

function roundToCents(value) {
  return Math.round(value * 10000) / 10000;
}

export default {
  trackCallCost,
  aggregateCosts,
};
