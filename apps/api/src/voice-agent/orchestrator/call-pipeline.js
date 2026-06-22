/**
 * Call Orchestrator — Voice AI Pipeline (OpenAI Realtime V2 with Hybrid Smart Routing)
 *
 * Implements a hybrid routing approach:
 * 1. Uses Google STT to listen to the first utterance.
 * 2. Uses Vertex AI (Gemini) to classify the contact (Owner vs Gatekeeper/Voicemail).
 * 3. Routes to OpenAI Realtime for Owners, or Cheap Engine for others.
 */

import { createOpenAISession } from '../services/llm/openai-realtime.service.js';
import { getSystemPrompt } from '../services/llm/prompts/system-prompts.js';
import { createSTTSession } from '../services/stt/google-stt.service.js';
import { generateCompletion } from '../services/llm/vertex-ai.service.js';
import { CLASSIFIER_SYSTEM_PROMPT } from '../services/llm/prompts/classifier-prompts.js';
import { handleCheapEngineFlow } from './cheap-engine.js';
import { broadcastCallAudio, broadcastCallTranscript } from '../websocket/call-monitor.js';

import {
  createSession,
  getSession,
  updateSession,
  addConversationTurn,
  getAIConversation,
  setState,
  incrementInterruptions,
  addSilenceDuration,
  deleteSession,
} from '../services/session/session-store.js';
import { onStreamEvent, sendMediaToTwilio, clearTwilioAudio } from '../websocket/media-server.js';
import { env } from '../config/env.js';
import { processPostCall } from '../services/post-call/processor.js';
import { DTMF_TONES } from '../utils/dtmf.js';

import { query } from '../../calls-module/db/index.js';

// Active pipeline instances per streamSid
const activePipelines = new Map();

// Configuration
const SILENCE_TIMEOUT_MS = env.VOICE_SILENCE_TIMEOUT_MS;
const MAX_CONVERSATION_TURNS = env.VOICE_MAX_CONVERSATION_TURNS;

/**
 * Initialize the orchestrator — listen for new media stream events.
 */
export function initOrchestrator() {
  console.log('[voice-agent:orchestrator] Initializing Hybrid Smart Routing Pipeline...');

  onStreamEvent('stream:start', (data) => {
    const { streamSid, callSid, customParams, contactId } = data;
    console.log(`[voice-agent:orchestrator] New call: ${callSid} (stream: ${streamSid})`);
    if (contactId) {
      customParams.contactId = contactId;
    }
    startCallPipeline(streamSid, callSid, customParams);
  });

  onStreamEvent('stream:audio', (data) => {
    const { streamSid, callSid, payload } = data;
    handleIncomingAudio(streamSid, callSid, payload);
  });

  onStreamEvent('stream:stop', (data) => {
    const { streamSid, callSid } = data;
    console.log(`[voice-agent:orchestrator] Call ended: ${callSid}`);
    endCallPipeline(streamSid, callSid);
  });

  console.log('[voice-agent:orchestrator] Ready');
}

/**
 * Handle incoming audio buffer from Twilio.
 */
export function handleIncomingAudio(streamSid, callSid, payload) {
  const pipeline = activePipelines.get(streamSid);
  if (!pipeline) return;

  // Broadcast prospect audio to live listeners
  if (callSid) {
    broadcastCallAudio(callSid, 'prospect', payload);
  }

  if (pipeline.phase === 'classifier' && pipeline.sttSession) {
    pipeline.sttSession.write(payload);
  } else if (pipeline.phase === 'openai' && pipeline.openaiSession) {
    // Pipe raw audio directly to OpenAI!
    pipeline.openaiSession.writeAudio(payload);
  }
}

/**
 * Start the voice pipeline for a new call (Classifier Phase).
 */
export async function startCallPipeline(streamSid, callSid, customParams = {}, adapter = null) {
  const activeAdapter = adapter || {
    type: 'twilio',
    sendAudio: sendMediaToTwilio,
    clearAudio: clearTwilioAudio
  };

  try {
    const session = await createSession(callSid, {
      streamSid,
      direction: customParams.direction || 'outbound',
      from: customParams.from || '',
      to: customParams.to || '',
      metadata: {
        agentId: customParams.voiceAgentId || 'default',
        tenantId: customParams.tenantId || 'default',
        agentType: customParams.agentType || 'sales',
        industry: customParams.industry || null,
        voiceId: customParams.voiceId || env.ELEVENLABS_VOICE_ID,
      },
    });

    let systemPrompt = getSystemPrompt({
      agentType: session.metadata.agentType,
      industry: session.metadata.industry,
    });

    // Inject Lead Context if this is an outbound call to an enriched lead
    if (customParams.contactId) {
      try {
        const { rows } = await query('SELECT company_name, industry_guess, one_line_pitch, ai_pain_points FROM enrichment_results WHERE id = $1', [customParams.contactId]);
        if (rows.length > 0) {
          const lead = rows[0];
          systemPrompt += `\n\nLEAD CONTEXT:\nYou are speaking with someone from ${lead.company_name || 'this company'}.
Industry: ${lead.industry_guess || 'Unknown'}
What they do: ${lead.one_line_pitch || 'Unknown'}
Pain Points: ${lead.ai_pain_points || 'None identified'}
Use this context subtly to personalize the conversation. Do not sound like you are reading a script.`;
        }
      } catch (err) {
        console.error('[voice-agent:orchestrator] Error fetching lead context:', err.message);
      }
    }

    await setState(callSid, 'listening');

    // START CLASSIFIER PHASE
    let hasClassified = false;

    const setupClassifierSTT = () => {
      return createSTTSession({
        streamSid,
        callSid,
        contactId: customParams.contactId,
        onTranscription: async ({ text, isFinal }) => {
          if (isFinal && !hasClassified) {
            hasClassified = true;
            console.log(`[voice-agent:classifier] Initial contact utterance: "${text}"`);
            
            const pipeline = activePipelines.get(streamSid);
            if (pipeline && pipeline.sttSession) {
               pipeline.sttSession.close();
            }

            try {
              // Classify with Vertex AI / Gemini
              const classificationResult = await generateCompletion({
                systemPrompt: CLASSIFIER_SYSTEM_PROMPT,
                userPrompt: text
              });
              
              let parsed = { intent: 'OWNER_PROBABLE', digit: null };
              try {
                const jsonStr = classificationResult.text.replace(/```json/gi, '').replace(/```/g, '').trim();
                parsed = JSON.parse(jsonStr);
              } catch (e) {
                console.error(`[voice-agent:classifier] Failed to parse JSON:`, classificationResult.text);
              }

              const label = parsed.intent;
              console.log(`[voice-agent:classifier] Classified as: ${label}`, parsed);

              if (label === 'IVR_SYSTEM') {
                const digit = parsed.digit || '0';
                if (DTMF_TONES[digit]) {
                  console.log(`[voice-agent:classifier] Sending DTMF tone for digit: ${digit}`);
                  activeAdapter.sendAudio(streamSid, DTMF_TONES[digit]);
                  await addConversationTurn(callSid, 'assistant', `(Pressed DTMF: ${digit})`);
                }
                
                // Allow classification again for the next utterance
                hasClassified = false;
                
                // Wait briefly for DTMF to play, then restart STT
                setTimeout(() => {
                  const currentPipeline = activePipelines.get(streamSid);
                  if (currentPipeline && currentPipeline.phase === 'classifier') {
                    currentPipeline.sttSession = setupClassifierSTT();
                  }
                }, 1000);
              }
              else if (label === 'OWNER_PROBABLE') {
                // Transition to OpenAI Realtime
                startOpenAIPipeline(streamSid, callSid, customParams, activeAdapter, systemPrompt, text);
              } else {
                // Non-Owner Flow
                await handleCheapEngineFlow(streamSid, callSid, label);
                endCallPipeline(streamSid, callSid); // Hang up
              }
            } catch (err) {
              console.error('[voice-agent:classifier] Classification error:', err.message);
              // Fallback to OpenAI Realtime if classification fails
              startOpenAIPipeline(streamSid, callSid, customParams, activeAdapter, systemPrompt, text);
            }
          }
        },
        onBargeIn: () => {},
        onError: (err) => {
          console.error('[voice-agent:classifier] STT Error:', err.message);
        }
      });
    };

    const sttSession = setupClassifierSTT();

    activePipelines.set(streamSid, {
      phase: 'classifier',
      streamSid,
      callSid,
      adapter: activeAdapter,
      sttSession,
      systemPrompt, // Store for later
      contactId: customParams.contactId
    });

    // Fallback: If no speech detected in 15 seconds, assume Voicemail/No Answer and trigger cheap flow
    setTimeout(async () => {
      const pipeline = activePipelines.get(streamSid);
      if (pipeline && pipeline.phase === 'classifier' && !hasClassified) {
        hasClassified = true;
        console.log(`[voice-agent:classifier] Timeout reached, assuming VOICEMAIL/NO_ANSWER`);
        if (pipeline.sttSession) pipeline.sttSession.close();
        await handleCheapEngineFlow(streamSid, callSid, 'VOICEMAIL');
        endCallPipeline(streamSid, callSid);
      }
    }, 15000);

  } catch (err) {
    console.error(`[voice-agent:orchestrator] Failed to start pipeline for ${callSid}:`, err.message);
  }
}

/**
 * Start the OpenAI Realtime pipeline (Phase 2).
 */
export function startOpenAIPipeline(streamSid, callSid, customParams, activeAdapter, systemPrompt, initialUtterance) {
  console.log(`[voice-agent:orchestrator] Bridging ${callSid} to OpenAI Realtime`);
  
  const pipeline = activePipelines.get(streamSid);
  if (!pipeline) return;

  const tools = [
    {
      name: 'book_meeting',
      description: 'Schedules a meeting and sends a calendar invite to the prospect.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name of the prospect.' },
          email: { type: 'string', description: 'The email address of the prospect to send the invite to.' },
          meeting_time: { type: 'string', description: 'The agreed upon meeting date and time (e.g., "Thursday at 3 PM").' },
        },
        required: ['email', 'meeting_time']
      }
    },
    {
      name: 'press_keypad',
      description: 'Sends a DTMF tone (keypad press) into the call. Use this ONLY to navigate automated IVR menus (e.g. "Press 1 for Sales").',
      parameters: {
        type: 'object',
        properties: {
          digit: { type: 'string', description: 'The single digit to press (e.g., "1", "2", "*", "#").' }
        },
        required: ['digit']
      }
    }
  ];

  const openaiSession = createOpenAISession({
    systemPrompt,
    tools,
    
    // OpenAI sending audio to play to the user
    onAudioDelta: (base64Audio) => {
      activeAdapter.sendAudio(streamSid, base64Audio);
      broadcastCallAudio(callSid, 'ai', base64Audio);
    },
    
    // OpenAI completed transcribing what the user said
    onTranscription: async (text) => {
      console.log(`[voice-agent:orchestrator] User said (${callSid}): "${text}"`);
      await addConversationTurn(callSid, 'user', text);
      broadcastCallTranscript(callSid, 'prospect', text);
    },
    
    // OpenAI completed its own text response
    onAssistantText: async (text) => {
      console.log(`[voice-agent:orchestrator] AI responded (${callSid}): "${text}"`);
      await addConversationTurn(callSid, 'assistant', text);
      broadcastCallTranscript(callSid, 'ai', text);
    },
    
    // AI wants to call a tool
    onToolCall: async (toolCall) => {
      console.log(`[voice-agent:orchestrator] Tool call requested: ${toolCall.name}`, toolCall.args);
      
      if (toolCall.name === 'book_meeting') {
        if (env.N8N_WEBHOOK_URL) {
          import('axios').then(({ default: axios }) => {
            axios.post(env.N8N_WEBHOOK_URL, {
              event: 'meeting_booked',
              callSid,
              contact: toolCall.args
            }).catch(e => console.error('[voice-agent:orchestrator] Webhook error:', e.message));
          });
        }

        const resultStr = `Successfully booked meeting for ${toolCall.args.meeting_time} and sent invite to ${toolCall.args.email}.`;
        
        await addConversationTurn(callSid, 'assistant', null, { 
          tool_calls: [{ id: toolCall.call_id, type: 'function', function: { name: toolCall.name, arguments: JSON.stringify(toolCall.args) } }] 
        });
        await addConversationTurn(callSid, 'tool', resultStr, { 
          tool_call_id: toolCall.call_id,
          name: toolCall.name
        });

        openaiSession.submitToolResult(toolCall.call_id, resultStr);
      }
      else if (toolCall.name === 'press_keypad') {
        const digit = toolCall.args?.digit?.toString().trim();
        if (digit && DTMF_TONES[digit]) {
          console.log(`[voice-agent:orchestrator] Sending DTMF tone for digit: ${digit}`);
          activeAdapter.sendAudio(streamSid, DTMF_TONES[digit]);
          
          const resultStr = `Successfully pressed keypad digit: ${digit}`;
          await addConversationTurn(callSid, 'assistant', null, { 
            tool_calls: [{ id: toolCall.call_id, type: 'function', function: { name: toolCall.name, arguments: JSON.stringify(toolCall.args) } }] 
          });
          await addConversationTurn(callSid, 'tool', resultStr, { 
            tool_call_id: toolCall.call_id,
            name: toolCall.name
          });

          openaiSession.submitToolResult(toolCall.call_id, resultStr);
        } else {
          console.error(`[voice-agent:orchestrator] Invalid or missing DTMF digit: ${digit}`);
          openaiSession.submitToolResult(toolCall.call_id, `Error: Invalid DTMF digit ${digit}`);
        }
      }
    },
    
    onReady: async () => {
      console.log(`[voice-agent:orchestrator] OpenAI Pipeline ready for ${callSid}`);
      await setState(callSid, 'listening');

      if (initialUtterance) {
        // Feed the initial utterance to OpenAI so it knows what the user just said
        await addConversationTurn(callSid, 'user', initialUtterance);
        openaiSession.triggerResponse(`The user just answered the phone and said: "${initialUtterance}". Please respond to them naturally.`);
      }
    },
    
    onError: (err) => {
      console.error(`[voice-agent:orchestrator] OpenAI Pipeline Error:`, err.message);
    }
  });

  pipeline.phase = 'openai';
  pipeline.openaiSession = openaiSession;
  pipeline.sttSession = null;
}

/**
 * Handle barge-in (interruption)
 */
export async function handleBargeIn(streamSid, callSid) {
  const pipeline = activePipelines.get(streamSid);
  if (!pipeline) return;

  if (pipeline.adapter) pipeline.adapter.clearAudio(streamSid);
  
  if (pipeline.phase === 'openai' && pipeline.openaiSession) {
    pipeline.openaiSession.clearBuffer();
  }
  
  await incrementInterruptions(callSid);
}

/**
 * End the call pipeline and trigger post-call processing.
 */
export async function endCallPipeline(streamSid, callSid) {
  const pipeline = activePipelines.get(streamSid);
  if (!pipeline) return;

  try {
    if (pipeline.sttSession) pipeline.sttSession.close();
    if (pipeline.openaiSession) pipeline.openaiSession.close();
    
    activePipelines.delete(streamSid);
    await setState(callSid, 'ended');
    
    console.log(`[voice-agent:orchestrator] Starting post-call processing for ${callSid}`);
    await processPostCall(callSid);

    setTimeout(async () => {
      await deleteSession(callSid);
    }, 60000);

  } catch (err) {
    console.error(`[voice-agent:orchestrator] Error ending pipeline for ${callSid}:`, err.message);
  }
}

export function getPipelineStats() {
  return {
    activeCalls: activePipelines.size,
    pipelines: Array.from(activePipelines.values()).map((p) => ({
      streamSid: p.streamSid,
      callSid: p.callSid,
      phase: p.phase,
      contactId: p.contactId
    })),
  };
}

export default {
  initOrchestrator,
  getPipelineStats,
};
