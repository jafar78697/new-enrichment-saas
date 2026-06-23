/**
 * Call Orchestrator — Voice Architecture v3 (Event-Driven Voice Kernel)
 */

import { createOpenAISession } from '../services/llm/openai-realtime.service.js';
import { getSystemPrompt } from '../services/llm/prompts/system-prompts.js';
import { broadcastCallAudio, broadcastCallTranscript } from '../websocket/call-monitor.js';
import { VoiceKernel } from './voice.kernel.js';

import {
  createSession,
  getSession,
  updateSession,
  addConversationTurn,
  setState,
  incrementInterruptions,
  deleteSession,
} from '../services/session/session-store.js';
import { onStreamEvent, sendMediaToTwilio, clearTwilioAudio } from '../websocket/media-server.js';
import { env } from '../config/env.js';
import { processPostCall } from '../services/post-call/processor.js';
import { query } from '../../calls-module/db/index.js';
import twilio from 'twilio';

// Active pipeline instances per streamSid
const activePipelines = new Map();

/**
 * Initialize the orchestrator — listen for new media stream events.
 */
export function initOrchestrator() {
  console.log('[voice-agent:orchestrator] Initializing Voice Architecture v3...');

  onStreamEvent('stream:start', (data) => {
    const { streamSid, callSid, customParams, contactId, tenantId } = data;
    console.log(`[voice-agent:orchestrator] New call: ${callSid} (stream: ${streamSid})`);
    if (contactId) {
      customParams.contactId = contactId;
    }
    if (tenantId) {
      customParams.tenantId = tenantId;
    }
    startCallPipeline(streamSid, callSid, customParams);
  });

  onStreamEvent('stream:audio', (data) => {
    const { streamSid, callSid, payload } = data;
    const pipeline = activePipelines.get(streamSid);
    if (!pipeline || !pipeline.kernel) return;

    if (callSid) {
      broadcastCallAudio(callSid, 'prospect', payload);
    }
    
    pipeline.kernel.emit('audio.in', { base64Audio: payload });
  });

  onStreamEvent('stream:stop', (data) => {
    const { streamSid, callSid } = data;
    console.log(`[voice-agent:orchestrator] Call ended: ${callSid}`);
    endCallPipeline(streamSid, callSid);
  });

  console.log('[voice-agent:orchestrator] v3 Ready');
}

/**
 * Start the voice pipeline using Voice Kernel.
 */
export async function startCallPipeline(streamSid, callSid, customParams = {}, adapter = null) {
  const activeAdapter = adapter || {
    type: 'twilio',
    sendAudio: sendMediaToTwilio,
    clearAudio: clearTwilioAudio,
    audioFormat: 'g711_ulaw'
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
        contactId: customParams.contactId || null,
        agentType: customParams.agentType || 'sales',
        industry: customParams.industry || null,
        voiceId: customParams.voiceId || env.ELEVENLABS_VOICE_ID,
      },
    });

    let systemPrompt = getSystemPrompt({
      agentType: session.metadata.agentType,
      industry: session.metadata.industry,
    });

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

    startOpenAIPipeline(streamSid, callSid, customParams, activeAdapter, systemPrompt, null);

  } catch (err) {
    console.error(`[voice-agent:orchestrator] Failed to start pipeline for ${callSid}:`, err.message);
  }
}

/**
 * Start the OpenAI Realtime pipeline using VoiceKernel
 */
export function startOpenAIPipeline(streamSid, callSid, customParams, activeAdapter, systemPrompt, initialUtterance) {
  console.log(`[voice-agent:orchestrator] Bridging ${callSid} to OpenAI Realtime via VoiceKernel`);
  
  const tools = [
    {
      name: 'book_meeting',
      description: 'Schedules a meeting and sends a calendar invite.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
          meeting_time: { type: 'string' },
        },
        required: ['email', 'meeting_time']
      }
    },
    {
      name: 'press_keypad',
      description: 'Sends a DTMF tone.',
      parameters: {
        type: 'object',
        properties: {
          digit: { type: 'string' }
        },
        required: ['digit']
      }
    },
    {
      name: 'end_call',
      description: 'Hangs up the call immediately.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string' }
        },
        required: ['reason']
      }
    }
  ];

  let kernel;

  const openaiSession = createOpenAISession({
    systemPrompt,
    tools,
    audioFormat: activeAdapter.audioFormat || 'g711_ulaw',
    
    onUsage: (usage) => {
      import('../services/session/session-store.js').then(async ({ getSession, updateSession }) => {
        const session = await getSession(callSid);
        if (session) {
          const currentInput = session.metadata.inputTokens || 0;
          const currentOutput = session.metadata.outputTokens || 0;
          await updateSession(callSid, {
            metadata: {
              ...session.metadata,
              inputTokens: currentInput + (usage.input_tokens || 0),
              outputTokens: currentOutput + (usage.output_tokens || 0),
            }
          });
        }
      }).catch(e => console.error(e.message));
    },

    onAudioDelta: (base64Audio) => {
      if (kernel) kernel.emit('ai.response', { delta: base64Audio, adapter: activeAdapter });
    },
    
    onTranscription: async (text) => {
      console.log(`[voice-agent:orchestrator] User said (${callSid}): "${text}"`);
      await addConversationTurn(callSid, 'user', text);
      broadcastCallTranscript(callSid, 'prospect', text);
    },
    
    onAssistantText: async (text) => {
      console.log(`[voice-agent:orchestrator] AI responded (${callSid}): "${text}"`);
      await addConversationTurn(callSid, 'assistant', text);
      broadcastCallTranscript(callSid, 'ai', text);
    },
    
    onToolCall: async (toolCall) => {
      if (kernel) kernel.emit('tool.call', { call_id: toolCall.call_id, name: toolCall.name, args: toolCall.args });
    },
    
    // Server VAD detected speech -> hard interrupt Twilio
    onBargeIn: () => {
      if (kernel) kernel.emit('barge.in', {});
    },
    
    // NEW v3 READY SIGNAL: Clean, deterministic, and event-driven!
    onSystemReady: async () => {
      console.log(`[voice-agent:orchestrator] 🚀 OpenAI System Ready for ${callSid}. Triggering greeting.`);
      await setState(callSid, 'listening');

      if (initialUtterance) {
        openaiSession.triggerResponse(`User said: "${initialUtterance}". Respond naturally.`);
      } else {
        openaiSession.triggerResponse('The phone call has just connected. Greet the caller warmly, introduce yourself as the Jento AI assistant, and ask one short opening question.');
      }
    },
    
    onError: (err) => {
      console.error(`[voice-agent:orchestrator] OpenAI Pipeline Error:`, err.message);
    }
  });

  kernel = new VoiceKernel(callSid, streamSid, openaiSession);

  // Override handlers using kernel.on() so the event bus map is properly updated
  kernel.on('ai.response', (event, state) => {
    const { delta, adapter } = event.payload;
    if (state.bargeInActive) return;
    adapter.sendAudio(streamSid, delta);
    broadcastCallAudio(callSid, 'ai', delta);
  });

  // Override handleBargeIn adapter logic
  kernel.on('barge.in', (event, state) => {
    kernel.logger.log(`[VoiceKernel] 🛑 BARGE-IN DETECTED for ${kernel.callSid}`);
    state.bargeInActive = true;
    
    if (kernel.openaiSession) {
      kernel.openaiSession.cancelResponse();
      kernel.openaiSession.clearBuffer();
    }
    
    activeAdapter.clearAudio(streamSid);

    setTimeout(() => {
      state.bargeInActive = false;
    }, 500);
  });
  
  // Custom tool call override for end_call delay etc
  kernel.on('tool.call', async (event, state) => {
    const { call_id, name, args } = event.payload;
    
    if (name === 'end_call') {
      kernel.logger.log(`[VoiceKernel] 🛑 End call triggered for ${callSid}`);
      broadcastCallAudio(callSid, 'ai', null); // clear
      
      const delay = args?.delay_ms ?? 300;
      setTimeout(async () => {
        try {
          if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
            const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
            await client.calls(callSid).update({ status: 'completed' });
          }
        } catch (err) {
          kernel.logger.error(`[VoiceKernel] ❌ Failed to hang up ${callSid}: ${err.message}`);
        }
        activeAdapter.clearAudio(streamSid);
      }, delay);
      
      if (kernel.openaiSession) {
        kernel.openaiSession.submitToolResult(call_id, JSON.stringify({ success: true, action: 'ending_call' }));
      }
      return;
    }
    
    // Fallback to kernel queue
    kernel.logger.log(`[VoiceKernel] 🛠️ Queuing Tool: ${name} (${call_id})`);
    
    kernel.toolQueue.push(async () => {
      try {
        let resultStr = '';
        
        if (name === 'book_meeting') {
          if (env.N8N_WEBHOOK_URL) {
            const axios = (await import('axios')).default;
            await axios.post(env.N8N_WEBHOOK_URL, {
              event: 'book_meeting',
              callSid,
              ...args
            });
            resultStr = JSON.stringify({ success: true, message: 'Meeting workflow triggered' });
          } else {
            resultStr = JSON.stringify({ success: true, message: 'Simulated booking (N8N not configured)' });
          }
        } else if (name === 'press_keypad') {
          const digit = String(args?.digit ?? args?.digits ?? '').trim();
          if (!digit || !/^[0-9*#]$/.test(digit)) {
            resultStr = JSON.stringify({ success: false, error: `Invalid DTMF digit: ${digit || '(empty)'}` });
          } else if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
            const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
            await client.calls(callSid).update({ sendDigits: digit });
            resultStr = JSON.stringify({ success: true, digits_sent: digit });
          } else {
            resultStr = JSON.stringify({ success: true, digits_sent: digit, message: 'Simulated keypad press' });
          }
        } else {
          resultStr = JSON.stringify({ error: 'Tool not found or not executable' });
        }

        if (kernel.openaiSession) {
          kernel.openaiSession.submitToolResult(call_id, resultStr);
        }
      } catch (err) {
        kernel.logger.error(`[VoiceKernel] ❌ Tool execution error: ${err.message}`);
        if (kernel.openaiSession) {
          kernel.openaiSession.submitToolResult(call_id, JSON.stringify({ error: err.message }));
        }
      }
    });
    
    kernel.processToolQueue();
  });

  activePipelines.set(streamSid, {
    streamSid,
    callSid,
    adapter: activeAdapter,
    kernel,
    openaiSession,
    contactId: customParams.contactId || null
  });
}

/**
 * Handle barge-in (interruption)
 */
export async function handleBargeIn(streamSid, callSid) {
  const pipeline = activePipelines.get(streamSid);
  if (!pipeline || !pipeline.kernel) return;

  pipeline.kernel.emit('barge.in', {});
  await incrementInterruptions(callSid);
}

/**
 * End the call pipeline and trigger post-call processing.
 */
export async function endCallPipeline(streamSid, callSid) {
  const pipeline = activePipelines.get(streamSid);
  if (!pipeline) return;

  try {
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
      contactId: p.contactId
    })),
  };
}

export default {
  initOrchestrator,
  getPipelineStats,
};
