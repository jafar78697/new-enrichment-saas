/**
 * Post-Call Processor — replaces external n8n webhook integration
 *
 * When a voice AI call ends, this service:
 * 1. Compiles the full transcript
 * 2. Generates call summary and sentiment analysis via Vertex AI
 * 3. Qualifies the lead
 * 4. Saves everything to the database (voice_call_sessions + calls table)
 * 5. Creates CRM follow-up tasks if lead is qualified
 * 6. Emits real-time events via Socket.io for dashboard updates
 */

import { getSession } from '../session/session-store.js';
import { generateCompletion } from '../llm/deepseek.service.js';
import { trackCallCost } from '../cost/cost-tracker.js';

// Lazy imports from calls-module — initialized on first use
let callsQuery = null;
let emitToAgent = null;
let importsInitialized = false;

async function initImports() {
  if (importsInitialized) return;
  try {
    const dbModule = await import('../../calls-module/db/index.js');
    callsQuery = dbModule.query;

    const socketModule = await import('../../calls-module/services/socket.service.js');
    emitToAgent = socketModule.emitToAgent;
    importsInitialized = true;
  } catch (err) {
    console.warn('[voice-agent:post-call] Could not import calls-module — DB/socket features disabled:', err.message);
    callsQuery = null;
    emitToAgent = null;
    importsInitialized = true; // Don't retry
  }
}

/**
 * Process a completed voice AI call.
 * @param {string} callSid - Twilio Call SID
 */
export async function processPostCall(callSid) {
  console.log(`[voice-agent:post-call] Processing completed call: ${callSid}`);

  // Lazy-init imports on first call
  await initImports();

  try {
    // 1. Get session data
    const session = await getSession(callSid);
    if (!session) {
      console.warn(`[voice-agent:post-call] No session found for ${callSid}`);
      return;
    }

    const transcript = formatTranscript(session.conversation);
    const duration = computeDuration(session);

    // 2. Generate AI analysis (parallel calls)
    const [summary, sentiment, leadQualification] = await Promise.all([
      generateSummary(transcript, session),
      analyzeSentiment(transcript),
      qualifyLead(transcript, session),
    ]);

    console.log(`[voice-agent:post-call] Analysis complete for ${callSid}:`, {
      summary: summary.text?.slice(0, 100),
      sentiment: sentiment.score,
      leadQualified: leadQualification.isQualified,
    });

    // 3. Calculate cost
    const costBreakdown = trackCallCost({
      callSid,
      durationSeconds: duration,
      inputTokens: summary.inputTokens + sentiment.inputTokens + leadQualification.inputTokens,
      outputTokens: summary.outputTokens + sentiment.outputTokens + leadQualification.outputTokens,
      ttsCharacters: session.ttsCharacters || 0,
    });

    // 4. Save to voice_call_sessions table
    if (callsQuery) {
      try {
        await callsQuery(
          `INSERT INTO voice_call_sessions 
           (call_sid, transcript, summary, sentiment_score, sentiment_analysis, 
            lead_qualified, lead_score, outcome, cost_breakdown, duration_seconds, 
            interruptions_count, conversation_turns, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (call_sid) DO UPDATE SET
             transcript = EXCLUDED.transcript,
             summary = EXCLUDED.summary,
             sentiment_score = EXCLUDED.sentiment_score,
             sentiment_analysis = EXCLUDED.sentiment_analysis,
             lead_qualified = EXCLUDED.lead_qualified,
             lead_score = EXCLUDED.lead_score,
             outcome = EXCLUDED.outcome,
             cost_breakdown = EXCLUDED.cost_breakdown,
             duration_seconds = EXCLUDED.duration_seconds`,
          [
            callSid,
            JSON.stringify(transcript),
            summary.text,
            sentiment.score,
            JSON.stringify(sentiment),
            leadQualification.isQualified,
            leadQualification.score,
            leadQualification.outcome,
            JSON.stringify(costBreakdown),
            duration,
            session.interruptions || 0,
            session.turnCount || 0,
            JSON.stringify({ ...(session.metadata || {}), client_details: leadQualification.client_details || {} }),
          ],
        );
      } catch (dbErr) {
        console.error(`[voice-agent:post-call] DB save error for ${callSid}:`, dbErr.message);
      }

      // 5. Update the calls table with AI-specific fields
      try {
        await callsQuery(
          `UPDATE calls 
           SET call_type = COALESCE(call_type, 'ai_voice'),
               sentiment_score = $2,
               ai_agent_id = $3
           WHERE call_sid = $1`,
          [
            callSid,
            sentiment.score,
            session.metadata?.agentId || null,
          ],
        );
      } catch (dbErr) {
        console.warn(`[voice-agent:post-call] Could not update calls table for ${callSid}:`, dbErr.message);
      }

      // 6. Update enrichment_results stage and create CRM follow-up
      if (session.metadata?.contactId) {
        try {
          let nextStage = 'called';
          if (leadQualification.outcome === 'interested' || leadQualification.outcome === 'meeting_booked') {
            nextStage = 'interested';
          } else if (leadQualification.outcome === 'callback_requested') {
            nextStage = 'followup';
          } else if (leadQualification.outcome === 'not_interested') {
            nextStage = 'closed_lost';
          }
          await callsQuery(
            `UPDATE enrichment_results SET lead_stage = $1 WHERE id = $2`,
            [nextStage, session.metadata.contactId]
          );
        } catch (crmErr) {
          console.warn(`[voice-agent:post-call] Could not update enrichment_results stage for ${callSid}:`, crmErr.message);
        }

        if (leadQualification.isQualified) {
          try {
            await createCRMFollowUp(session, leadQualification, summary.text);
          } catch (crmErr) {
            console.warn(`[voice-agent:post-call] CRM follow-up creation failed for ${callSid}:`, crmErr.message);
          }
        }
      }
    }

    // 7. Emit real-time event for dashboard
    if (emitToAgent) {
      try {
        emitToAgent(session.metadata?.agentId || 'system', 'voice.call.completed', {
          callSid,
          summary: summary.text,
          sentiment: sentiment.score,
          leadQualified: leadQualification.isQualified,
          leadScore: leadQualification.score,
          duration,
          costBreakdown,
          transcriptPreview: transcript.slice(0, 500),
        });
      } catch (socketErr) {
        console.warn(`[voice-agent:post-call] Socket emit error for ${callSid}:`, socketErr.message);
      }
    }

    console.log(`[voice-agent:post-call] Post-call processing complete for ${callSid}`);
  } catch (err) {
    console.error(`[voice-agent:post-call] Fatal error processing ${callSid}:`, err.message);
  }
}

/**
 * Format conversation into readable transcript.
 */
function formatTranscript(conversation) {
  if (!conversation || conversation.length === 0) return [];

  return conversation.map((turn) => ({
    role: turn.role,
    text: turn.content,
    timestamp: turn.timestamp,
  }));
}

/**
 * Compute call duration from session data.
 */
function computeDuration(session) {
  if (!session.startedAt) return 0;
  const start = new Date(session.startedAt).getTime();
  const end = Date.now();
  return Math.floor((end - start) / 1000);
}

/**
 * Generate call summary using Vertex AI.
 */
async function generateSummary(transcript, session) {
  const transcriptText = transcript
    .map((t) => `${t.role === 'user' ? 'Customer' : 'AI Agent'}: ${t.text}`)
    .join('\n');

  const prompt = `Summarize this sales call transcript in 2-3 sentences. Include:
- What the customer was interested in
- Any objections raised
- Next steps agreed upon
- Whether a follow-up is needed

Transcript:
${transcriptText.slice(-4000)}`;

  return generateCompletion({
    systemPrompt: 'You are a call analysis assistant. Be concise and factual.',
    userPrompt: prompt,
    temperature: 0.2,
    maxTokens: 256,
  });
}

/**
 * Analyze sentiment of the call.
 */
async function analyzeSentiment(transcript) {
  const transcriptText = transcript
    .map((t) => `${t.role === 'user' ? 'Customer' : 'AI Agent'}: ${t.text}`)
    .join('\n');

  const prompt = `Analyze the sentiment of this sales call. Return a JSON object with:
- "score": number from -1 (very negative) to 1 (very positive)
- "label": "positive", "neutral", or "negative"
- "key_moments": array of 2-3 notable sentiment shifts with timestamps
- "overall_tone": brief description of the call's emotional arc

Call transcript:
${transcriptText.slice(-4000)}

Respond ONLY with valid JSON, no markdown formatting.`;

  try {
    const result = await generateCompletion({
      systemPrompt: 'You are a sentiment analysis expert. Return ONLY valid JSON.',
      userPrompt: prompt,
      temperature: 0.1,
      maxTokens: 512,
    });

    // Parse JSON response
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return {
        ...JSON.parse(jsonMatch[0]),
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      };
    }
  } catch (err) {
    console.warn('[voice-agent:post-call] Sentiment parsing failed, using defaults:', err.message);
  }

  return {
    score: 0,
    label: 'neutral',
    key_moments: [],
    overall_tone: 'Unable to analyze',
    inputTokens: 0,
    outputTokens: 0,
  };
}

/**
 * Qualify the lead based on the call transcript.
 */
async function qualifyLead(transcript, session) {
  const transcriptText = transcript
    .map((t) => `${t.role === 'user' ? 'Customer' : 'AI Agent'}: ${t.text}`)
    .join('\n');

  const prompt = `You are a lead qualification expert. Analyze this cold call transcript and return a JSON object with:
- "isQualified": boolean — true if the lead showed genuine interest
- "score": number from 0-100 — lead quality score
- "outcome": one of "interested", "not_interested", "callback_requested", "meeting_booked", "voicemail", "no_answer", "wrong_number"
- "reasoning": brief explanation of the qualification decision
- "suggested_follow_up": if qualified, what the next step should be
- "budget_mentioned": boolean
- "timeline_mentioned": boolean
- "decision_maker": boolean — if the person has decision-making authority
- "client_details": an object containing specific details provided by the client (e.g., name, company, email, phone number, budget, pain points, specific requirements). Omit keys if they were not mentioned.

Call Transcript:
${transcriptText.slice(-4000)}

Respond ONLY with valid JSON, no markdown formatting.`;

  try {
    const result = await generateCompletion({
      systemPrompt: 'You are a B2B lead qualification expert. Return ONLY valid JSON.',
      userPrompt: prompt,
      temperature: 0.2,
      maxTokens: 512,
    });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return {
        ...JSON.parse(jsonMatch[0]),
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      };
    }
  } catch (err) {
    console.warn('[voice-agent:post-call] Lead qualification parsing failed:', err.message);
  }

  return {
    isQualified: false,
    score: 0,
    outcome: 'unknown',
    reasoning: 'Unable to analyze',
    suggested_follow_up: null,
    budget_mentioned: false,
    timeline_mentioned: false,
    decision_maker: false,
    client_details: {},
    inputTokens: 0,
    outputTokens: 0,
  };
}

/**
 * Create a CRM follow-up task for a qualified lead.
 */
async function createCRMFollowUp(session, leadQualification, summary) {
  if (!callsQuery) return;

  const contactId = session.metadata?.contactId;
  if (!contactId) return;

  try {
    // Add follow-up note to the contact
    await callsQuery(
      `UPDATE contacts 
       SET notes = COALESCE(notes, '') || $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [
        `\n[AI Voice Call ${new Date().toISOString()}]\n` +
        `Outcome: ${leadQualification.outcome}\n` +
        `Lead Score: ${leadQualification.score}/100\n` +
        `Summary: ${summary}\n` +
        `Suggested Follow-up: ${leadQualification.suggested_follow_up || 'N/A'}`,
        contactId,
      ],
    );

    console.log(`[voice-agent:post-call] CRM follow-up created for contact ${contactId}`);
  } catch (err) {
    console.error(`[voice-agent:post-call] CRM follow-up error:`, err.message);
  }
}

export default {
  processPostCall,
};
