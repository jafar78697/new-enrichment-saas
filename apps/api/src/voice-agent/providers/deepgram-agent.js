import { env } from '../config/env.js';

const DEFAULT_PROMPT = `
You are an outbound sales assistant calling a business lead on behalf of Jento AI.

Introduce yourself clearly, ask whether this is a good time, understand the
lead's needs, and keep every spoken reply short and natural.

Rules:
- Never pretend that the lead called you.
- Respect a refusal or do-not-call request immediately and end the call.
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

function buildAgentCore(agentConfig, { includeTools = false, lead = null } = {}) {
  const companyName = typeof lead?.company_name === 'string' ? lead.company_name.trim().slice(0, 160) : '';
  const greetingTemplate = agentConfig?.greeting || 'Hi, this is the Jento AI assistant. Is now a good time for a quick conversation?';
  const greeting = greetingTemplate.replaceAll('{company_name}', companyName || 'your business');
  const leadContext = companyName
    ? `\n\nCurrent CRM lead: ${companyName}. Use this name naturally, but do not invent any other facts about the business.`
    : '';
  const think = {
    provider: {
      type: 'open_ai',
      model: env.DEEPGRAM_AGENT_MODEL || 'gpt-4o-mini',
    },
    prompt: `${agentConfig?.prompt || DEFAULT_PROMPT}${leadContext}`,
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
    agent: buildAgentCore(agentConfig, { includeTools: true, lead: _lead }),
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
