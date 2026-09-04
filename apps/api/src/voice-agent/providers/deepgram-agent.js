import { env } from '../config/env.js';

const DEFAULT_PROMPT = `
You are the inbound phone assistant for Jento AI.

Your job is to welcome the caller, understand why they called, and answer only
from the information in this conversation. Keep every spoken reply short,
natural, and easy to understand on a phone call.

Rules:
- Never say that you placed an outbound call.
- Do not promise a callback, booking, transfer, email, payment, or any action
  unless the system has a real tool for that action.
- Do not request card details, passwords, API keys, or other sensitive data.
- If asked for a human, explain that you can take a short message for the team.
- If the caller asks to end the call, say a brief goodbye and use end_call.
- Use save_call_note only to save a brief factual summary after the caller has
  clearly provided useful information.
`;

function buildListenProvider() {
  const listenModel = env.DEEPGRAM_AGENT_LISTEN_MODEL || 'flux-general-en';
  const isFluxModel = listenModel.startsWith('flux-');
  const listenProvider = {
    type: 'deepgram',
    model: listenModel,
  };

  if (isFluxModel) {
    listenProvider.version = 'v2';
    listenProvider.eot_threshold = env.DEEPGRAM_AGENT_EOT_THRESHOLD;
    listenProvider.eager_eot_threshold = Math.min(
      env.DEEPGRAM_AGENT_EAGER_EOT_THRESHOLD,
      env.DEEPGRAM_AGENT_EOT_THRESHOLD,
    );
    listenProvider.eot_timeout_ms = env.DEEPGRAM_AGENT_EOT_TIMEOUT_MS;
  } else {
    listenProvider.smart_format = true;
  }

  return listenProvider;
}

function buildAgentCore(agentConfig, { includeTools = false } = {}) {
  const greeting = agentConfig?.greeting || 'Hello, thanks for calling Jento AI. How can I help you today?';
  const think = {
    provider: {
      type: 'open_ai',
      model: env.DEEPGRAM_AGENT_MODEL || 'gpt-4o-mini',
    },
    prompt: agentConfig?.prompt || DEFAULT_PROMPT,
  };

  if (includeTools) {
    think.functions = [
      {
        name: 'end_call',
        description: 'End this active phone call after a polite goodbye.',
        parameters: {
          type: 'object',
          properties: { reason: { type: 'string' } },
          required: ['reason'],
        },
      },
      {
        name: 'save_call_note',
        description: 'Save one brief factual CRM summary for this call.',
        parameters: {
          type: 'object',
          properties: {
            outcome: { type: 'string' },
            note: { type: 'string' },
          },
          required: ['outcome', 'note'],
        },
      },
    ];
  }

  return {
    language: agentConfig?.language || 'en',
    listen: { provider: buildListenProvider() },
    think,
    speak: {
      provider: {
        type: 'deepgram',
        version: 'v1',
        model: agentConfig?.voice || env.DEEPGRAM_AGENT_VOICE || 'aura-2-thalia-en',
      },
    },
    greeting,
  };
}

export function buildDeepgramSettings(_lead, agentConfig) {
  return {
    type: 'Settings',
    audio: {
      input: { encoding: 'mulaw', sample_rate: 8000 },
      output: { encoding: 'mulaw', sample_rate: 8000, container: 'none' },
    },
    agent: buildAgentCore(agentConfig, { includeTools: true }),
  };
}

export function buildBrowserAgentConfig(agentConfig) {
  return {
    agent: buildAgentCore(agentConfig),
    audio: {
      input: { encoding: 'linear16', sampleRate: 16000 },
      output: { encoding: 'linear16', sampleRate: 24000 },
    },
  };
}

export function buildBrowserPreviewSettings(agentConfig) {
  return {
    type: 'Settings',
    audio: {
      input: { encoding: 'linear16', sample_rate: 16000 },
      output: { encoding: 'linear16', sample_rate: 24000 },
    },
    agent: buildAgentCore(agentConfig),
  };
}
