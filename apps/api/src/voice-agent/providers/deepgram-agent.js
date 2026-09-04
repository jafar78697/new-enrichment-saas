import { env } from '../config/env.js';

const DEFAULT_PROMPT = `
You are Jento AI's outbound assistant for salons, spas, and beauty businesses.

Introduce yourself clearly, ask whether this is a good time, then ask for the
owner or person who handles calls and bookings. Ask one short question at a
time about missed calls, appointment booking, no-shows, or slow follow-up.
Connect only their stated problem to fewer missed customers or less front-desk
phone work. Let the prospect speak more than you.

Rules:
- Never pretend that the lead called you.
- Respect a refusal or do-not-call request immediately and end the call.
- Do not promise a callback, booking, transfer, email, payment, or any action
  unless the system has a real tool for that action.
- Do not request card details, passwords, API keys, or other sensitive data.
- Never invent prices, integrations, guarantees, results, or business facts.
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
  const prompt = `${agentConfig?.prompt || DEFAULT_PROMPT}${leadContext}`;
  const primaryModel = env.DEEPGRAM_AGENT_MODEL || 'gpt-5.6-luna';
  const fallbackModel = env.DEEPGRAM_AGENT_FALLBACK_MODEL || 'gpt-5.4-mini';
  const thinkProviders = [primaryModel, fallbackModel]
    .filter((model, index, models) => model && models.indexOf(model) === index)
    .map((model) => ({
      provider: { type: 'open_ai', model },
      prompt,
    }));

  if (includeTools) {
    const functions = [
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
    thinkProviders.forEach((provider) => {
      provider.functions = functions;
    });
  }

  const voice = agentConfig?.voice || env.DEEPGRAM_AGENT_VOICE || 'flux-kit-en';

  return {
    language: agentConfig?.language || 'en',
    listen: { provider: buildListenProvider() },
    think: thinkProviders.length === 1 ? thinkProviders[0] : thinkProviders,
    speak: {
      provider: {
        type: 'deepgram',
        version: voice.startsWith('flux-') ? 'v2' : 'v1',
        model: voice,
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
