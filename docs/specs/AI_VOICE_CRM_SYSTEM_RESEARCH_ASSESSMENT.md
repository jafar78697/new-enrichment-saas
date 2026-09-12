# AI Voice CRM System Research Assessment

Date: 2026-08-21

## Executive Verdict

Yes, we can build this system, but the current repository is not production-ready as a fully automated outbound AI calling platform.

The CRM, lead enrichment, niche assignment, queueing, outbound-call worker, and voice-agent building blocks are already present. The core product idea is technically feasible: scrape or import local-business leads, assign them to niches/agents, queue them for AI outreach, place outbound calls through SignalWire/Twilio-compatible APIs, stream call audio to a realtime voice agent, update CRM stages, and schedule meetings.

The biggest issue is not feasibility. The biggest issue is consistency and compliance:

- The docs say the voice path connects to OpenAI Realtime, but the active TwiML route currently converts `openai_realtime` to `deepgram_voice_agent`.
- The OpenAI Realtime bridge exists, but it is not the route currently used by outbound calls.
- The voice agent is force-enabled in code even when `VOICE_AGENT_ENABLED=false`.
- The system needs serious consent, DNC, audit, opt-out, recording-disclosure, and call-window controls before outbound AI cold calling in the US.
- The codebase has duplicated/parallel concepts: `contacts`, `enrichment_results`, `voice_call_sessions`, `ai_call_sessions`, Twilio naming, SignalWire implementation, OpenAI path, and Deepgram path.

Recommended direction: ship a constrained MVP first using the Deepgram-SignalWire path that is already wired, while refactoring the OpenAI Realtime path behind a clean provider interface. Do not launch broad cold outbound AI calling until compliance controls are built.

## What The System Is Trying To Be

The target product is a local-business outreach CRM with AI voice calling:

1. Manager searches Google Maps/Places for businesses by niche and location.
2. Leads enter the CRM as `contacts`.
3. Leads are grouped by `niches`.
4. Employees see only assigned niches/leads.
5. Selected leads are promoted into `enrichment_results`.
6. AI calling is toggled per tenant.
7. Worker claims one callable lead at a time.
8. SignalWire places the outbound call.
9. SignalWire requests TwiML/cXML from the backend.
10. Backend connects the call to a WebSocket media stream.
11. Voice agent listens, talks, handles interruptions, presses keypad digits, and books meetings.
12. Post-call processing writes stage, transcript, summary, notes, and meeting data back to CRM.

That flow is commercially reasonable and technically buildable.

## Current Repo Evidence

### Working / Mostly Present

- Lead and CRM flow exists in `contacts`, `niches`, and `enrichment_results`.
- AI queueing exists through CRM APIs.
- Outbound worker exists and uses SignalWire Compatibility API.
- Worker validates critical production config before claiming leads.
- Realtime media WebSocket server exists at `/api/voice/media`.
- Deepgram-SignalWire bridge exists at `/api/voice/signalwire/deepgram-stream`.
- OpenAI Realtime session client exists.
- Tool calling exists for `book_meeting`, `press_keypad`, and `end_call`.
- Post-call processing and live call monitor concepts exist.

### Important Code Findings

1. Outbound worker is designed correctly at a high level.

   `apps/api/src/workers/outbound-caller.js` checks for SignalWire credentials, `SIGNALWIRE_PHONE_NUMBER`, `PUBLIC_BASE_URL`, and public HTTPS before claiming leads. It then selects one lead per tenant, marks it `calling`, creates a SignalWire call, and stores `active_call_sid`.

2. OpenAI Realtime is implemented but not actually selected by the live outbound route.

   `apps/api/src/voice-agent/services/llm/openai-realtime.service.js` opens `wss://api.openai.com/v1/realtime`, sends `session.update`, maps tools, streams `g711_ulaw`/`g711_alaw`/`pcm16` audio, handles server VAD, tool calls, audio deltas, transcripts, and usage.

3. The active TwiML route forces OpenAI leads to Deepgram.

   In `apps/api/src/voice-agent/routes/twiml.js`, the provider selection does this:

   ```js
   provider = rows[0].ai_agent_provider === 'openai_realtime'
     ? 'deepgram_voice_agent'
     : rows[0].ai_agent_provider || 'deepgram_voice_agent';
   ```

   So even if the CRM row says `openai_realtime`, the call is routed to Deepgram.

4. CRM update logic also rewrites OpenAI provider selection.

   In `apps/api/src/routes/crm.ts`, `openai_realtime` is normalized to `deepgram_voice_agent` when creating/updating CRM AI rows. That makes the existing product effectively Deepgram-first right now.

5. `VOICE_AGENT_ENABLED` is unsafe for production toggling.

   `apps/api/src/voice-agent/config/env.js` validates `VOICE_AGENT_ENABLED`, but then exports `VOICE_AGENT_ENABLED = true` unconditionally. That is fine for testing, but bad for production feature control.

6. The local docs are partially out of sync.

   `docs/specs/AI_AGENT_CALLING_SYSTEM_FLOW.md` says the main flow reaches OpenAI Realtime, but current routing sends live outbound calls to Deepgram unless code is changed.

## Research Findings

### OpenAI Realtime

Official OpenAI documentation says realtime sessions are intended for live audio that needs low latency. It identifies realtime voice-agent sessions on `/v1/realtime` as the right pattern when the model should respond, call tools, and manage conversation state. It also lists `gpt-realtime-2.1` as the current low-latency voice-agent model in the docs page reviewed.

Implication for this system:

- OpenAI Realtime is a valid architecture for the voice-agent layer.
- The repo's WebSocket approach is directionally correct.
- The model default `gpt-realtime-mini` should be reviewed against the current model catalog before production because official docs currently point developers toward `gpt-realtime-2.1` for low-latency voice agents.

Source: https://developers.openai.com/api/docs/guides/realtime

### Twilio / SignalWire Media Streaming

Twilio Media Streams support near-real-time raw call audio over WebSockets. Twilio also supports bidirectional streams via `<Connect><Stream>`, where the app can send audio back into the call. Twilio requires media sent back over the WebSocket to be base64 encoded `audio/x-mulaw` at 8000 Hz and supports `clear` messages to interrupt buffered audio.

SignalWire's Compatibility API has a similar `<Stream>` concept for sending base64 audio frames from a running call to a WebSocket. SignalWire REST stream creation requires `wss`; insecure `ws` is not supported.

Implication for this system:

- The architecture of `SignalWire call -> backend WebSocket -> voice agent -> audio back to call` is valid.
- Using `g711_ulaw`/PCMU 8 kHz is appropriate for telephony.
- Barge-in should use a `clear` equivalent and response cancellation together.
- Production must use public HTTPS/WSS.

Sources:

- https://www.twilio.com/docs/voice/media-streams
- https://www.twilio.com/docs/voice/media-streams/websocket-messages
- https://signalwire.com/docs/compatibility-api/cxml/reference/voice/stream
- https://signalwire.com/docs/compatibility-api/rest/streams/create-stream

### Deepgram Voice Agent

Deepgram's Voice Agent API is explicitly designed as a single WebSocket pipeline for listening, thinking, and speaking. Deepgram documentation also shows Twilio streaming integration and says `<Connect>` is required for bidirectional communication from the agent back to Twilio.

Implication for this system:

- The current Deepgram-first implementation is a reasonable MVP route because it reduces orchestration complexity.
- Deepgram may be simpler operationally than a custom OpenAI Realtime bridge if the goal is to ship fast.
- OpenAI Realtime remains useful if we want tighter model/tool behavior control and direct OpenAI audio reasoning.

Sources:

- https://developers.deepgram.com/docs/voice-agent
- https://developers.deepgram.com/docs/configure-voice-agent
- https://developers.deepgram.com/docs/twilio-and-deepgram-voice-agent

### Google Places Lead Source

Google Places Text Search returns places based on a text query like "pizza in New York" and supports field masks. Google states Text Search has no default returned fields if a field mask is omitted, and field masks help avoid unnecessary data and billing. Places usage requires billing enabled, and requests are billed by SKU based on selected fields.

Implication for this system:

- Google Places is a valid lead source.
- We should use strict field masks for only the fields needed: display name, address, phone, website, location, business status, and place id as appropriate.
- We need duplicate protection and cost guardrails because broad search can get expensive and repeated identical requests are not guaranteed to return perfectly consistent lists.

Sources:

- https://developers.google.com/maps/documentation/places/web-service/text-search
- https://developers.google.com/maps/documentation/places/web-service/usage-and-billing

### US AI Calling / TCPA Risk

The FCC's February 2024 public release says calls made with AI-generated voices are treated as "artificial" under the TCPA, and telemarketers must obtain prior express written consent before robocalling consumers. This is a major blocker for generic cold outbound AI calling in the US.

Implication for this system:

- Building the technology is feasible.
- Running it as automated AI cold calling to US consumers without consent is legally dangerous.
- Even B2B local-business calling needs legal review because many business numbers are mobile or residential-linked, consent rules can apply, state mini-TCPA laws may be stricter, and call recording/disclosure laws vary by state.

Minimum compliance controls before launch:

- Consent source per lead.
- DNC suppression list.
- Opt-out phrase detection and permanent suppression.
- Business-hour and timezone enforcement.
- Recording disclosure and per-state recording policy.
- AI disclosure policy.
- Call frequency caps.
- Manual review/audit log.
- Caller identity and callback number.
- Retention policy for transcripts/audio.

Source: https://docs.fcc.gov/public/attachments/DOC-400393A1.pdf

## Is The System Good?

### Product Idea

Good, but high-risk. The combination of niche-based CRM, lead enrichment, and voice automation is valuable. The strongest version is not "spray cold calls"; it is "controlled AI-assisted follow-up for leads with consent, inbound calls, missed-call recovery, appointment setting, and warm lead reactivation."

### Architecture

Promising, but too tangled right now.

Good choices:

- Postgres as system of record.
- Separate contact layer and AI pipeline layer.
- Per-tenant AI calling controls.
- `FOR UPDATE SKIP LOCKED` lead claiming.
- SignalWire/Twilio-compatible media streaming.
- Realtime voice provider abstraction is emerging.
- CRM tool calls and meeting persistence are already started.

Weak choices / cleanup needed:

- Provider selection is confusing and currently suppresses OpenAI.
- Feature flag is hard-coded on.
- Database has overlapping call-session tables.
- Docs and code disagree.
- Some comments still say Twilio while implementation uses SignalWire.
- No complete compliance gate before placing AI outbound calls.
- No strong test suite around the most dangerous flows: call claiming, provider routing, opt-out, and webhook state transitions.

### Technical Feasibility

Buildable.

MVP feasibility: high.

Production feasibility: medium, because compliance, telephony edge cases, latency, provider cost, and observability need focused work.

### Business Feasibility

Strongest use cases:

- Inbound AI receptionist.
- Missed-call follow-up.
- Appointment confirmation.
- Re-engagement of opted-in leads.
- Human-supervised dialing where AI drafts/assists, not fully autonomous cold calls.
- Niche-specific appointment setting with clear consent.

Weakest/risky use case:

- Fully autonomous AI cold calling scraped Google Maps phone numbers in the US.

## Recommended Architecture

### Provider Interface

Create one clean provider contract:

```ts
type VoiceProvider = 'deepgram_voice_agent' | 'openai_realtime';

interface VoiceSession {
  writeAudio(base64Audio: string): void;
  triggerResponse(text?: string): void;
  submitToolResult(callId: string, result: string): void;
  cancelResponse(): void;
  clearBuffer(): void;
  close(): void;
}
```

Then route SignalWire streams to either:

- Deepgram bridge, for fast MVP.
- OpenAI Realtime bridge, for direct OpenAI model control.

Do not silently rewrite `openai_realtime` to Deepgram. If OpenAI is disabled, fail clearly or show it unavailable in the UI.

### Lead State Model

Keep:

- `contacts`: raw CRM/niche leads.
- `enrichment_results`: AI pipeline leads.

But standardize AI-specific fields:

- `assigned_to_ai`
- `ai_agent_provider`
- `lead_stage`
- `next_followup_at`
- `last_contacted_at`
- `raw_data.source_contact_id`
- `raw_data.active_call_sid`

Avoid creating new session tables unless the table has a clear owner. Pick one:

- `ai_call_sessions` for provider/call lifecycle, or
- `voice_call_sessions` for transcript/analytics.

If both are needed, define the relationship explicitly.

### Compliance Gate

Before the worker can claim a lead, require:

- `consent_status IN ('express_written', 'existing_business_relationship', 'manual_approved')`
- `dnc_status != 'blocked'`
- `opted_out_at IS NULL`
- phone normalized and classified
- local call time allowed
- per-lead and per-tenant daily cap not exceeded

The worker should not rely only on `assigned_to_ai=true`.

## Build Plan

### Phase 1: Stabilize Current Deepgram MVP

Goal: one reliable call from CRM lead to AI conversation to CRM update.

Tasks:

- Fix `VOICE_AGENT_ENABLED` to respect env.
- Rename Twilio/SignalWire comments and logs so operators know which provider is active.
- Add migration for all current voice tables used by code.
- Verify `/api/voice/twiml/outbound` creates a valid SignalWire stream.
- Add integration test for worker lead claim and reset on failure.
- Add call status webhook tests.
- Add opt-out phrase path that immediately suppresses future calls.
- Add public HTTPS/WSS deployment checklist.

### Phase 2: Provider Abstraction

Goal: selectable `deepgram_voice_agent` or `openai_realtime` per agent/tenant.

Tasks:

- Stop rewriting `openai_realtime` in `crm.ts` and `twiml.js`.
- Add provider availability checks in backend.
- Add UI provider selection only when credentials are present.
- Route OpenAI provider calls to `/api/voice/media`.
- Route Deepgram provider calls to `/api/voice/signalwire/deepgram-stream`.
- Add automated provider-routing tests.

### Phase 3: OpenAI Realtime Production Hardening

Goal: OpenAI calls are stable, observable, and interruptible.

Tasks:

- Confirm current OpenAI model names before deploy.
- Validate current Realtime event schema against official docs.
- Add reconnection/cleanup behavior.
- Add audio format tests for PCMU/g711_ulaw.
- Add backpressure metrics.
- Add response cancellation on barge-in.
- Add tool-call timeout and retry behavior.
- Add transcript and usage persistence.

### Phase 4: Compliance And Launch Controls

Goal: prevent accidental illegal or abusive outbound campaigns.

Tasks:

- Add consent fields and consent upload/import flow.
- Add DNC suppression list.
- Add opt-out detection and permanent suppression.
- Add calling windows by lead timezone.
- Add call caps per lead, tenant, and number.
- Add required caller disclosure prompt.
- Add recording disclosure policy.
- Add audit logs for who started campaigns.
- Add emergency global stop.

### Phase 5: Scale And Quality

Goal: operate multiple tenants and campaigns safely.

Tasks:

- Add queue/concurrency controls.
- Add number reputation monitoring.
- Add retry/backoff policy by outcome.
- Add dashboard for answer rate, opt-outs, meetings, cost per booked meeting.
- Add prompt A/B testing per niche.
- Add human handoff/live takeover.
- Add post-call evaluation and manager QA.

## Estimated Buildability

### MVP

Can build: yes.

Estimated work: 1-2 focused weeks if the goal is a controlled internal demo using the already-wired Deepgram path.

### Production Beta

Can build: yes.

Estimated work: 4-8 weeks, depending on how serious the compliance and monitoring requirements are.

### Full Commercial Outbound AI Platform

Can build: yes, but only with legal/compliance review and careful operational controls.

Estimated work: 2-4 months for a responsible version.

## Go / No-Go Recommendation

Go for:

- Inbound AI receptionist.
- Missed-call callback.
- Opted-in appointment setting.
- Warm CRM follow-up.
- Internal demo and controlled pilots.

Do not go yet for:

- Autonomous cold calls to scraped phone numbers.
- High-volume campaigns.
- Production launch without consent and DNC controls.
- Selling this as a compliance-safe AI cold-calling product without counsel review.

## Final Recommendation

Build it, but narrow the first release.

The current system is a strong prototype foundation. It is not junk; it has real architecture inside it. But it needs a cleanup pass before we trust it with live customers and real phone numbers.

The most practical next step is:

1. Make the Deepgram route production-stable.
2. Add provider abstraction.
3. Re-enable OpenAI Realtime as a real selectable provider.
4. Build compliance gates before broad outbound.
5. Test the whole path with one niche, one tenant, one number, and a small opted-in lead set.

If we follow that sequence, yes, this system can be built.
