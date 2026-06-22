/**
 * Cost Tracking Service
 *
 * Calculates and tracks per-call costs across all services:
 * - Twilio: per-minute voice + recording storage
 * - Google STT: per 15-second increment
 * - Vertex AI Gemini: per 1K input/output tokens
 * - ElevenLabs: per 1K characters
 *
 * Pricing (approximate, update with actual rates):
 * - Twilio inbound: $0.0085/min, outbound: $0.013/min
 * - Twilio recording: $0.0025/min
 * - Google STT (enhanced phone_call model): $0.006/15s
 * - Vertex AI Gemini 1.5 Flash: $0.00001875/1K input chars, $0.000075/1K output chars
 * - ElevenLabs (turbo v2.5): $0.001/1K chars
 */

// Pricing constants (USD)
const PRICING = {
  twilio: {
    inboundPerMinute: 0.0085,
    outboundPerMinute: 0.013,
    recordingPerMinute: 0.0025,
  },
  googleSTT: {
    per15Seconds: 0.006,
    modelMultiplier: 1.0, // phone_call model same as standard
  },
  vertexAI: {
    inputPer1KChars: 0.00001875,
    outputPer1KChars: 0.000075,
  },
  elevenLabs: {
    per1KChars: 0.001, // Turbo v2.5
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

  // STT cost (charged per 15-second increment)
  const stt15SecondIncrements = Math.ceil(durationSeconds / 15);
  const sttCost = stt15SecondIncrements * PRICING.googleSTT.per15Seconds;

  // Vertex AI cost (per 1K characters, approximate token-to-char conversion)
  // ~4 chars per token for English
  const inputChars = inputTokens * 4;
  const outputChars = outputTokens * 4;
  const vertexInputCost = (inputChars / 1000) * PRICING.vertexAI.inputPer1KChars;
  const vertexOutputCost = (outputChars / 1000) * PRICING.vertexAI.outputPer1KChars;
  const vertexTotalCost = vertexInputCost + vertexOutputCost;

  // ElevenLabs cost
  const elevenLabsCost = (ttsCharacters / 1000) * PRICING.elevenLabs.per1KChars;

  // Totals
  const totalCost = twilioTotalCost + sttCost + vertexTotalCost + elevenLabsCost;

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
    googleSTT: {
      cost: roundToCents(sttCost),
      increments: stt15SecondIncrements,
      per15SecondRate: PRICING.googleSTT.per15Seconds,
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
    sttCost += breakdown.googleSTT?.cost || 0;
    vertexCost += breakdown.vertexAI?.total || 0;
    elevenLabsCost += breakdown.elevenLabs?.cost || 0;
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
