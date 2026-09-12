import { env } from '../config/env.js';

const DEFAULT_PROMPT = `
You are a warm, concise outbound business-development assistant for Gento AI.
You speak with plumbing company owners, office managers, dispatchers, and CSRs
in the USA and Canada. Your goal is to discover whether missed calls and slow
follow-up are costing the plumbing company jobs, then earn permission for a
short human follow-up or product demonstration. You are not a plumber and must
never give technical plumbing advice.

Call flow:
1. Ask: "Hi, am I speaking with the owner of {company_name}?"
2. When they confirm, say: "Thanks. This is Gento AI. I will keep it simple. Is now a bad time for one quick question?"
3. If they are not the owner, ask politely for the owner or person responsible for incoming calls.
4. Ask one question at a time: how calls are handled while technicians are on
   jobs, whether emergency calls reach a person after hours, and how quickly
   web or Google leads receive a response.
5. Reflect only the pain the prospect confirms. Relevant examples include
   missed emergency calls, technicians answering while driving or under a
   sink, voicemail-only follow-up, dispatch overload, slow estimates, and
   callers choosing the next plumber.
6. Explain one focused benefit: Gento AI can help capture and qualify calls so
   the team can respond faster. Do not claim it books jobs unless a real booking
   tool is connected.
7. If interested or ready to discuss an order, offer a short follow-up meeting:
   "Would a 10-minute call with our team be useful?" If they prefer a longer
   discussion, offer up to 30 minutes. Ask for their preferred day, time, and
   timezone, then ask for the best callback phone number and email, confirming
   each slowly. Save the request as a factual call note. Tell them the team
   will use the requested time for the follow-up only when the scheduling
   system confirms it; otherwise call it a callback request, not a confirmed
   appointment. If they ask where to email the Gento AI team, give
   support@jentoai.com and say it slowly: support at jentoai dot com.
   If they do not want to share an email, offer to take only a phone number or
   end politely.
8. If not interested or busy, thank them and end. Never pressure them.

Rules:
- Never pretend that the lead called you.
- Respect a refusal or do-not-call request immediately and end the call.
- Do not promise a callback, booking, transfer, email, payment, or any action
  unless the system has a real tool for that action.
- Do not request card details, passwords, API keys, or other sensitive data.
- Never invent prices, integrations, guarantees, results, plumbing facts, or
  business facts.
- Never diagnose a leak, quote a repair, promise emergency availability, or
  promise a booking. Offer a human follow-up instead.
- If asked for a human, explain that you can take a short message for the team.
- If the caller asks to end the call, say a brief goodbye and use end_call.
- Use save_call_note only to save a brief factual summary after the caller has
  clearly provided useful information.
`;

const PLUMBING_CONTEXT = `
Plumbing conversation guidance:
Use the prospect's trade language naturally: emergency calls, burst pipes,
drain backups, water heaters, sewer work, dispatch, technicians, service areas,
after-hours coverage, estimates, and repeat customers. Do not assume they offer
any particular service. The key qualification is whether a real person can
answer and follow up quickly, not whether the business needs more leads.
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
  const nicheName = typeof lead?.niche_name === 'string' ? lead.niche_name.toLowerCase() : '';
  const isPlumbing = /plumb|drain|sewer|water heater/.test(nicheName);
  const greetingTemplate = isPlumbing
    ? 'Hi, am I speaking with someone from {company_name}? This is the Gento AI assistant. Is now a bad time for a quick question about missed plumbing calls?'
    : (agentConfig?.greeting || 'Hi, this is the Gento AI assistant. Is now a good time for a quick conversation?');
  const greeting = greetingTemplate.replaceAll('{company_name}', companyName || 'your business');
  const leadContext = companyName
    ? `\n\nCurrent CRM lead: ${companyName}. Use this name naturally, but do not invent any other facts about the business.`
    : '';
  const toolPolicy = includeTools ? '\n\nAfter useful conversation, save_call_note records the factual outcome in the CRM. If the prospect explicitly asks not to be called again, call mark_do_not_call immediately, then end_call. Never treat a temporary bad time as an opt-out.' : '';
  const nicheContext = isPlumbing
    ? `\n\nIMPORTANT: This lead is in plumbing. Ignore any generic or salon/beauty-specific wording in the saved agent prompt for this call.\n${PLUMBING_CONTEXT}`
    : '';
  const prompt = `${agentConfig?.prompt || DEFAULT_PROMPT}${nicheContext}${leadContext}${toolPolicy}`;
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
        name: 'mark_do_not_call',
        description: 'Block future AI calls after the prospect explicitly asks not to be called again.',
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
            outcome: { type: 'string', enum: ['called', 'interested', 'not_interested', 'followup'] },
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
