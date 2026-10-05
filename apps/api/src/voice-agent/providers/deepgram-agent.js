import { env } from '../config/env.js';

const DEFAULT_PROMPT = `
You are a warm, concise outbound business-development assistant for Gento AI.
You speak with plumbing company owners, office managers, dispatchers, and CSRs
in the USA and Canada. Your goal is to discover whether missed calls and slow
follow-up are costing the plumbing company jobs, then earn permission for a
short human follow-up or product demonstration. You are not a plumber and must
never give technical plumbing advice.

Call flow:
1. Engage the prospect using the specific opening instructions provided for their niche or context.
2. Ask one question at a time: how calls are handled while technicians are on
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
8. If they say "no" or are not interested, try to briefly overcome the objection once by highlighting the time they could save. If they firmly decline again, thank them and end. Never pressure them.

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
Plumbing sales script — follow this order. This instruction has priority over
any conflicting generic or saved agent prompt:

1. Open with exactly: "Hi, this is David with Jento AI. Quick question—how do you handle calls when your team's out on jobs?" Wait for their response.
2. When they answer, briefly acknowledge their process. If they say they use an answering service or receptionist, point out that you help handle *overflow* and *after-hours* calls at a fraction of the cost. Then ask if they would be open to a quick 10-minute meeting this week to see how it works. Wait for their answer.
3. If they say yes or show interest, ask for their email address first so you can send them the meeting link. After getting the email, collect their preferred day, time, timezone, and callback number one item at a time. Describe it as a callback request until the scheduling system confirms it. If they ask where to email the Jento AI team, say: support at jento ai dot com.
4. If they say they are not the right person or not the owner:
   a. Ask: "No problem — could I leave a quick message for the person who
      handles incoming calls?"
   b. If they can take a message, dictate: "Please tell them David from Jento
      AI called about missed-call recovery for plumbing businesses. My
      callback number is on the caller ID."
   c. Ask for the right person's name, direct number, or best time to reach
      them. Save everything in a call note.
   d. If they offer to transfer you, say "That would be great, thank you" and
      wait for the transfer.
5. If they decline, try once: "Totally understand. Just curious — are you
   losing any calls when your crew is on the road? That is the one thing we
   solve." If they decline again, thank them warmly and end. Never push past
   two clear refusals.
6. If they ask what it does, explain briefly: "It is an AI receptionist that
   answers your business line 24/7, qualifies the caller, collects their info,
   and sends it to your team by text or email so they can call back when
   free." Do NOT quote a specific dollar price on the first call. If they ask
   about cost, say: "It depends on your setup — our team can walk you through
   the options in a quick 10-minute call."
7. If they give an email or ask for info to be sent, confirm the address
   slowly, save it immediately with outcome interested, and say: "Perfect, I
   will pass that along to the team."

Speak in short, natural sentences. One to two sentences maximum per turn.
NEVER say "I have a great offer for you" or "I have an offer."
NEVER say "Is now a bad time?" Do not give a long pitch in the opening line.
NEVER mention a specific dollar price on the first call.
Never pretend that the lead called you. Never give technical plumbing advice.
Speak at one consistent, brisk professional-call pace. Keep punctuation simple,
do not stretch words, and do not insert long dramatic pauses. Ask only one
question, then stop and listen. Never start the next thought while the prospect
is still speaking.
If the prospect gives a longer explanation, stay silent until their turn is
confirmed complete. After a completed thought, a single short acknowledgement
such as "Got it" is allowed before the next question. Never produce "uh-huh",
"yes", or other backchannel audio while the prospect is still speaking.

CRM outcome rules:
- Use interested only when a real person clearly wants the offer or demo but no
  exact callback time was agreed.
- Use followup only after the person confirms an exact future date, time, and
  timezone. Pass that value to save_call_note as ISO 8601 with a UTC offset.
- Use not_interested only after a real person clearly declines. A busy person,
  IVR, voicemail, silence, or dropped call is not "not interested".
- Save the factual outcome before calling end_call. Never invent missing contact
  details or a follow-up time.
`;

function buildListenProvider(agentConfig) {
  const listenModel = env.DEEPGRAM_AGENT_LISTEN_MODEL || 'flux-general-en';
  const isFluxModel = listenModel.startsWith('flux-');
  const listenProvider = {
    type: 'deepgram',
    model: listenModel,
  };

  if (isFluxModel) {
    listenProvider.version = 'v2';
    listenProvider.eot_threshold = agentConfig?.listen_eot_threshold ?? 0.70; // Faster initial response
    // We intentionally omit eager_eot_threshold to avoid premature "first-word" interruptions.
    listenProvider.eot_timeout_ms = agentConfig?.listen_eot_timeout_ms ?? 900; // Faster initial timeout
  } else {
    listenProvider.smart_format = true;
  }

  return listenProvider;
}

function buildAgentCore(agentConfig, { includeTools = false, lead = null, compiledScriptPrompt = null, laneId = null, scriptVersionId = null } = {}) {
  const companyName = typeof lead?.company_name === 'string' ? lead.company_name.trim().slice(0, 160) : '';
  const nicheName = typeof lead?.niche_name === 'string' ? lead.niche_name.toLowerCase() : '';
  const isPlumbing = /plumb|drain|sewer|water heater/.test(nicheName);
  const greetingTemplate = isPlumbing
    ? 'Hi, am I speaking with the owner of {company_name}?'
    : (agentConfig?.greeting || 'Hi, this is the Jento AI assistant. Is now a good time for a quick conversation?');
  const greeting = greetingTemplate.replaceAll('{company_name}', companyName || 'your business');
  const leadContext = companyName
    ? `\n\nCurrent CRM lead: ${companyName}. Use this name naturally, but do not invent any other facts about the business.`
    : '';
  const runtimeContext = `\n\nCurrent UTC date and time for resolving explicit callback requests: ${new Date().toISOString()}. Always preserve the prospect's stated timezone.`;
  const toolPolicy = includeTools ? `\n\nCRITICAL TOOL-CALL RULES (READ CAREFULLY):
1. You MUST call save_call_note IMMEDIATELY when the prospect's intent becomes clear. Do NOT wait until the end of the call. Prospects often hang up within seconds of expressing their decision, so you will lose the data if you delay.
2. REJECTION: Use not_interested only when the prospect clearly rejects the offer. Polite dismissals such as "I'm not, but thank you", "not at this time, thank you", "no thanks", or "we're all set" are clear rejections after the offer. A "no" to the owner question, a busy person, an IVR, voicemail, silence, or a dropped call is NOT a rejection. On a clear offer refusal, IMMEDIATELY call save_call_note with outcome="not_interested" FIRST, then say a brief goodbye and call end_call.
3. INTEREST: As soon as the prospect asks questions about the product, says "tell me more", "sounds interesting", "how much", or shows positive engagement, IMMEDIATELY call save_call_note with outcome="interested" and continue the conversation. You can update the note again later if more details emerge.
4. DO NOT CALL: If they say "remove me", "don't ever call again", "take me off your list", IMMEDIATELY call mark_do_not_call, then end_call.
5. FOLLOW-UP: Only use outcome="followup" when an exact future date, time, AND timezone are confirmed. Pass the value as ISO 8601 with UTC offset.
6. NEVER invent missing contact details or a follow-up time. Never treat a temporary bad time as an opt-out.
7. If the call is going well and you are about to say goodbye, call save_call_note BEFORE your goodbye sentence.
8. EMAIL HANDOFF: If a real person gives an email address or asks for details to be sent there, repeat the address slowly for confirmation, then IMMEDIATELY call save_call_note with outcome="interested" and the confirmed email. Say only that the address is saved for the team to follow up. Never claim that you personally sent an email.
In the "note" field, write exactly one clear line summarizing what the prospect said and what to do next.` : '';
  const nicheContext = isPlumbing
    ? `\n\nIMPORTANT: This lead is in plumbing. Ignore any generic or salon/beauty-specific wording in the saved agent prompt for this call.\n${PLUMBING_CONTEXT}`
    : '';
  const greetingInstruction = `\n\nIMPORTANT GREETING RULES:\nWhen a real person answers with any normal greeting — "Hello", "Good morning", the company name, "Speaking", "Yes", or "How can I help you?" — respond IMMEDIATELY with your opening question. Do NOT wait or stay silent. Speed is critical — the first 3 seconds after they finish speaking determine whether they hang up.\nIf you hear a keypad menu such as "press 1", "press 2", or "choose an option", say nothing. The server will classify it as IVR and end the call.\nIf you hear "please hold", "stay on the line", "we are connecting you", "this call may be recorded", or "recorded for quality assurance", do NOT end the call. Call wait_for_human and stay silent until a real human speaks.\nIf you hear voicemail instructions such as "leave a message" or "after the tone", say nothing. The server will classify it as voicemail and end the call.\nThe current company is ${companyName || 'the company in the current CRM lead'}. Never use a company name remembered from an earlier call. Do not repeat your opener if you already said it. Never interrupt the prospect. Always listen to their full sentence before replying.`;
  
  const replaceTemplateVars = (text, data) => {
    if (!text || typeof text !== 'string') return text;
    return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, varName) => {
      const key = varName.trim().toLowerCase();
      if (key === 'company' || key === 'company_name') return data.company_name || data.company || companyName || 'your company';
      if (key === 'first_name') return data.first_name || 'there';
      if (key === 'last_name') return data.last_name || '';
      if (key === 'name' || key === 'prospect_name') return data.prospect_name || data.name || data.first_name || 'there';
      if (key === 'niche_name') return data.niche_name || data.industry || 'your industry';
      if (key === 'agent_name') return data.agent_name || agentConfig?.name || 'our representative';
      if (key === 'offer_name') return data.offer_name || 'our service';
      if (key === 'meeting_length') return data.meeting_length || '15 minutes';
      if (key === 'current_date') return data.current_date || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      if (key === 'title') return data.title || 'team member';
      if (key === 'industry') return data.industry || data.niche_name || 'your industry';
      if (key === 'phone') return data.phone || data.primary_phone || '';
      if (key === 'city') return data.city || '';
      if (key === 'state') return data.state || '';
      if (key === 'website') return data.website || data.domain || '';
      if (key === 'email') return data.email || data.primary_email || '';
      if (key === 'notes') return data.notes || '';
      return match;
    });
  };

  const rawBaseContent = compiledScriptPrompt || agentConfig?.prompt || DEFAULT_PROMPT;
  const baseContent = replaceTemplateVars(rawBaseContent, lead || {});
  const prompt = compiledScriptPrompt 
    ? `${baseContent}${leadContext}${runtimeContext}${toolPolicy}`
    : `${baseContent}${nicheContext}${leadContext}${runtimeContext}${toolPolicy}${greetingInstruction}`;

  const primaryModel = env.DEEPGRAM_AGENT_MODEL || 'gpt-4o-mini';
  const fallbackModel = env.DEEPGRAM_AGENT_FALLBACK_MODEL || 'gpt-4.1-mini';
  const thinkProviders = [primaryModel, fallbackModel]
    .filter((model, index, models) => model && models.indexOf(model) === index)
    .map((model) => ({
      provider: { type: 'open_ai', model },
      prompt,
    }));

  if (includeTools) {
    const functions = [
      {
        name: 'wait_for_human',
        description: 'Call this function and say absolutely nothing else if you hear an automated machine, IVR, or recording.',
        parameters: { type: 'object', properties: {} }
      },
      {
        name: 'end_call',
        description: 'End this active phone call after a polite goodbye.',
        parameters: {
          type: 'object',
          properties: { reason: { type: 'string' } },
          required: ['reason'],
        },
        defer_until_eot: true,
      },
      {
        name: 'mark_do_not_call',
        description: 'Block future AI calls after the prospect explicitly asks not to be called again.',
        parameters: {
          type: 'object',
          properties: { reason: { type: 'string' } },
          required: ['reason'],
        },
        defer_until_eot: true,
      },
      {
        name: 'save_call_note',
        description: 'Save the verified call outcome and factual CRM summary. For followup, exact future date/time and timezone are required. Whenever the prospect states an email, include the confirmed address.',
        parameters: {
          type: 'object',
          properties: {
            outcome: { type: 'string', enum: ['called', 'interested', 'not_interested', 'followup'] },
            note: { type: 'string' },
            followup_at: {
              type: 'string',
              description: 'Required for followup only. Exact ISO 8601 date/time with UTC offset, for example 2026-10-02T15:00:00-04:00.',
            },
            followup_timezone: {
              type: 'string',
              description: 'Required for followup only. Prospect-confirmed timezone, for example America/New_York.',
            },
            contact_name: { type: 'string', description: 'Name stated by the prospect, when provided.' },
            callback_phone: { type: 'string', description: 'Callback phone stated or confirmed by the prospect, when provided.' },
            email: { type: 'string', description: 'Confirmed prospect email. Convert spoken “at” and “dot” into a normal email address. Required whenever the prospect gives an email.' },
          },
          required: ['outcome', 'note'],
        },
        defer_until_eot: true,
      },
    ];
    thinkProviders.forEach((provider) => {
      provider.functions = functions;
    });
  }

  const voice = agentConfig?.voice || env.DEEPGRAM_AGENT_VOICE || 'aura-orion-en';
  const supportsSpeedControl = voice.startsWith('flux-') || voice.startsWith('aura-2-');

  return {
    language: agentConfig?.language || 'en',
    // Removed automatic greeting so the agent waits for the prospect to speak first (AMD behavior).
    listen: { provider: buildListenProvider(agentConfig) },
    think: thinkProviders.length === 1 ? thinkProviders[0] : thinkProviders,
    speak: {
      provider: {
        type: 'deepgram',
        version: voice.startsWith('flux-') ? 'v2' : 'v1',
        model: voice,
        ...(supportsSpeedControl ? { speed: agentConfig?.speech_speed ?? env.DEEPGRAM_AGENT_SPEAK_SPEED } : {}),
      },
    },
  };
}

export function buildDeepgramSettings(_lead, agentConfig, extras = {}) {
  return {
    type: 'Settings',
    audio: {
      input: { encoding: 'mulaw', sample_rate: 8000 },
      output: { encoding: 'mulaw', sample_rate: 8000, container: 'none' },
    },
    agent: buildAgentCore(agentConfig, { 
      includeTools: true, 
      lead: _lead,
      compiledScriptPrompt: extras.compiledScriptPrompt,
      laneId: extras.laneId,
      scriptVersionId: extras.scriptVersionId
    }),
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
