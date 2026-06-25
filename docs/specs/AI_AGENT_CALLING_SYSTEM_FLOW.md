# AI Agent Calling System Flow

This document explains how the AI Agent cold-calling system works inside `enrichment-saas`, from lead scraping to niche assignment, auto-calling, AI conversation, and CRM updates.

## Short Summary

The system works in this order:

1. Leads are scraped or imported into `contacts`
2. Leads are attached to a `niche`
3. Selected niche leads are promoted into CRM pipeline rows inside `enrichment_results`
4. Those rows are marked `assigned_to_ai = true`
5. The outbound worker picks one assigned lead at a time
6. Twilio places the outbound call
7. Twilio asks the backend for TwiML
8. TwiML connects the live phone call to the Voice Agent WebSocket stream
9. The Voice Agent orchestrator connects the call to OpenAI Realtime
10. The AI talks to the prospect, can listen, respond, and send DTMF
11. Twilio status webhooks and post-call processing update CRM stages, notes, and meeting data

---

## 1. Main Active Parts

These are the main files that run the system:

- CRM lead queue and AI pipeline APIs:
  [apps/api/src/routes/crm.ts](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/routes/crm.ts:1)

- Niche + contact system:
  [apps/api/src/calls-module/routes/niches.routes.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/calls-module/routes/niches.routes.js:1)
  [apps/api/src/calls-module/routes/contacts.routes.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/calls-module/routes/contacts.routes.js:1)
  [apps/api/src/routes/google-maps.ts](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/routes/google-maps.ts:1)
  [apps/api/src/calls-module/routes/scraper-bridge.routes.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/calls-module/routes/scraper-bridge.routes.js:1)

- Auto-dial worker:
  [apps/api/src/workers/outbound-caller.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/workers/outbound-caller.js:1)
  [apps/api/src/workers/outbound-caller-runner.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/workers/outbound-caller-runner.js:1)

- Twilio + Voice Agent bridge:
  [apps/api/src/voice-agent/routes/twiml.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/voice-agent/routes/twiml.js:1)
  [apps/api/src/voice-agent/websocket/media-server.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/voice-agent/websocket/media-server.js:1)
  [apps/api/src/voice-agent/orchestrator/call-pipeline.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/voice-agent/orchestrator/call-pipeline.js:1)
  [apps/api/src/voice-agent/orchestrator/voice.kernel.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/voice-agent/orchestrator/voice.kernel.js:1)
  [apps/api/src/voice-agent/services/llm/openai-realtime.service.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/voice-agent/services/llm/openai-realtime.service.js:1)

- Frontend AI Agent pipeline:
  [apps/web/src/pages/AgentPipeline.tsx](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/web/src/pages/AgentPipeline.tsx:1)
  [apps/web/src/services/crmApi.ts](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/web/src/services/crmApi.ts:1)
  [apps/web/src/services/callsApi.ts](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/web/src/services/callsApi.ts:1)
  [apps/web/src/components/LiveCallMonitor.tsx](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/web/src/components/LiveCallMonitor.tsx:1)

---

## 2. Data Model Concept

There are two important lead layers in this system:

### A. `contacts`

This is the niche-level working contact table used by the calls module.

Typical source:
- Google Maps scraper
- scraper bridge
- manual contact creation/import

Important fields:
- `niche_id`
- `assigned_agent_id`
- `phone_number`
- `company`
- `email`

### B. `enrichment_results`

This is the CRM pipeline table used by the AI Agent pipeline.

When AI calling is needed, contacts are either:
- promoted from `contacts` into `enrichment_results`, or
- existing CRM leads are marked `assigned_to_ai = true`

Important fields:
- `assigned_to_ai`
- `lead_stage`
- `primary_phone`
- `last_contacted_at`
- `next_followup_at`
- `raw_data.source_contact_id`
- `raw_data.niche_id`
- `raw_data.niche_name`
- `raw_data.active_call_sid`

---

## 3. How Leads Enter The System

### Option 1: Scraper creates niche-based leads

Files:
- [apps/api/src/routes/google-maps.ts](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/routes/google-maps.ts:23)
- [apps/api/src/calls-module/routes/google-maps.routes.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/calls-module/routes/google-maps.routes.js:15)

What happens:

1. User runs Google Maps scrape with `keywords`, `location`, and often `niche_name`
2. Backend resolves or creates the `niche`
3. Scraped leads are inserted into `contacts`
4. If niche already has an assigned agent, that relationship can also be carried

### Option 2: Scraper bridge pushes leads directly into contacts

File:
- [apps/api/src/calls-module/routes/scraper-bridge.routes.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/calls-module/routes/scraper-bridge.routes.js:1)

What happens:

1. External/internal scraper sends leads with `niche_id` or `niche_name`
2. Backend resolves niche
3. Backend inserts/upserts contacts into `contacts`

So the first practical staging area is usually `contacts`.

---

## 4. How Niche Works

Files:
- [apps/api/src/calls-module/routes/niches.routes.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/calls-module/routes/niches.routes.js:1)
- [apps/web/src/pages/NicheManagement.tsx](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/web/src/pages/NicheManagement.tsx:1)

Niche is the grouping layer used to organize businesses like:
- plumbers
- real estate
- roofing
- dental

Niche stores:
- niche name
- optional assigned agent
- optional custom prompt

This is important because the AI agent behavior can later be customized per niche.

---

## 5. How Leads Reach The AI Agent

Main file:
- [apps/api/src/routes/crm.ts](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/routes/crm.ts:104)

### API used by frontend

Endpoint:
- `POST /v1/leads/queue-ai`

Frontend caller:
- [apps/web/src/pages/AgentPipeline.tsx](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/web/src/pages/AgentPipeline.tsx:142)

What this endpoint does:

1. Accepts one of:
   - `lead_ids`
   - `contact_ids`
   - `niche_id`

2. If CRM leads already exist in `enrichment_results`
   - they are marked `assigned_to_ai = true`
   - non-terminal stages are changed to `assigned`

3. If niche contacts are selected from `contacts`
   - existing matching CRM rows are updated
   - missing rows are inserted into `enrichment_results`

4. Inserted rows carry useful metadata in `raw_data`:
   - `source_contact_id`
   - `niche_id`
   - `niche_name`
   - `website`
   - `notes`

### Result

After `queue-ai`, the AI worker no longer calls `contacts` directly.
It calls `enrichment_results` rows that are:
- `assigned_to_ai = true`
- `lead_stage = 'assigned'` or `followup`

---

## 6. AI Agent Frontend Pipeline

Main file:
- [apps/web/src/pages/AgentPipeline.tsx](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/web/src/pages/AgentPipeline.tsx:1)

The page does three big jobs:

### A. Niche filtering

It loads niches and allows selecting one niche at a time.

### B. Queueing leads

It fetches contacts by niche:
- `callsApi.listContactsByNiche(nicheId)`

Then selected contacts are sent to:
- `leadsApi.queueAi(...)`

### C. Calling control

Top buttons:
- `Start Calling`
- `Stop Calling`
- `Listen Live`
- `Test Agent`

Important APIs used:
- `GET /v1/leads/ai-calling/status`
- `POST /v1/leads/ai-calling/start`
- `POST /v1/leads/ai-calling/stop`
- `GET /v1/leads/active-calls`

The frontend also shows:
- current lead
- next lead
- last call
- queue count
- current pipeline stages

---

## 7. How Auto Calling Starts

Main API:
- [apps/api/src/routes/crm.ts](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/routes/crm.ts:322)

When user clicks `Start Calling`:

1. Backend writes or updates row in `ai_calling_controls`
2. `is_running = true`

When user clicks `Stop Calling`:

1. Backend sets `is_running = false`
2. It looks for live `calling` leads
3. It asks Twilio to terminate those calls
4. It resets `lead_stage` back to `assigned`
5. It removes `raw_data.active_call_sid`

So `ai_calling_controls` is the master ON/OFF switch.

---

## 8. How The Auto Dial Worker Picks Leads

Main file:
- [apps/api/src/workers/outbound-caller.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/workers/outbound-caller.js:1)

### Startup

The dedicated PM2 worker starts:
- [apps/api/src/workers/outbound-caller-runner.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/workers/outbound-caller-runner.js:1)

That runner calls:
- `runOutboundCallerLoop()`

### Worker loop behavior

Every few seconds, the worker:

1. Reads tenants from `ai_calling_controls` where `is_running = true`
2. Recovers stale calls older than 10 minutes
3. Checks whether a tenant already has a live lead in stage `calling`
4. If not, it claims the next lead using SQL with `FOR UPDATE SKIP LOCKED`

### Which lead is selected

It selects:
- `assigned_to_ai = true`
- `lead_stage IN ('assigned', 'followup')`
- phone exists
- follow-up time is due

Order:
- `followup` first
- then `assigned`
- then oldest `created_at`

### Once claimed

The worker:

1. sets `lead_stage = 'calling'`
2. updates `last_contacted_at = NOW()`
3. calls Twilio `calls.create(...)`
4. stores returned `call.sid` into `raw_data.active_call_sid`

---

## 9. How Twilio Call Is Created

Inside outbound worker:
- [apps/api/src/workers/outbound-caller.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/workers/outbound-caller.js:66)

Twilio call settings include:

- `to`: lead phone number
- `from`: system Twilio number
- `url`: outbound TwiML route
- `statusCallback`: call status webhook
- `statusCallbackEvent`: initiated, ringing, answered, completed
- `machineDetection: 'Enable'`
- `machineDetectionTimeout: 8`

This means Twilio first dials the prospect, then asks backend what to do next.

---

## 10. How Twilio Is Connected To AI

Main file:
- [apps/api/src/voice-agent/routes/twiml.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/voice-agent/routes/twiml.js:1)

### Outbound flow

Endpoint:
- `POST /api/voice/twiml/outbound`

What it does:

1. Validates incoming Twilio request
2. Normalizes destination phone
3. Checks `AnsweredBy`

### If voicemail/fax is detected

The route:
- sets lead stage to `no_answer`
- removes `active_call_sid`
- adds note like voicemail detected
- hangs up before AI stream starts

### If human path continues

It returns TwiML:
- `<Connect><Stream ... /></Connect>`

And sends parameters:
- `contactId`
- `tenantId`

This is the bridge from Twilio call to backend media WebSocket.

---

## 11. How Live Audio Streaming Works

Main file:
- [apps/api/src/voice-agent/websocket/media-server.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/voice-agent/websocket/media-server.js:1)

Twilio Media Streams connect to:
- `/api/voice/media`

What happens:

1. Twilio opens WebSocket
2. Backend receives `connected`, `start`, `media`, `mark`, and `stop` events
3. On `start`, backend learns:
   - `streamSid`
   - `callSid`
   - `contactId`
   - `tenantId`
4. Audio chunks from Twilio are passed into the orchestrator
5. AI response audio is sent back to Twilio through the same stream

This is where the phone audio becomes programmable.

---

## 12. How OpenAI Realtime Is Used

Main files:
- [apps/api/src/voice-agent/orchestrator/call-pipeline.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/voice-agent/orchestrator/call-pipeline.js:1)
- [apps/api/src/voice-agent/orchestrator/voice.kernel.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/voice-agent/orchestrator/voice.kernel.js:1)
- [apps/api/src/voice-agent/services/llm/openai-realtime.service.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/voice-agent/services/llm/openai-realtime.service.js:1)

### Orchestrator job

The orchestrator is the main “brain wiring” layer.

It:
- starts session when Twilio stream starts
- fetches lead context
- builds AI context and prompts
- bridges inbound audio to OpenAI
- receives AI text/audio back
- sends AI audio to Twilio
- handles interruptions / barge-in
- handles tool calls like DTMF and meeting actions

### Practical meaning

So the phone call is not directly “Twilio to OpenAI”.
It is:

Twilio Phone Call
-> Twilio Media Stream
-> Backend WebSocket
-> Call Orchestrator
-> Voice Kernel
-> OpenAI Realtime
-> Voice Kernel
-> Twilio Media Stream
-> Prospect

---

## 13. How Press 1 / Press 2 Works

Important files:
- [apps/api/src/voice-agent/websocket/media-server.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/voice-agent/websocket/media-server.js:293)
- [apps/api/src/voice-agent/utils/dtmf.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/voice-agent/utils/dtmf.js:1)

This project supports in-band DTMF generation.

Meaning:
- if AI decides it should press a keypad digit
- backend generates tone audio
- tone audio is pushed back through Twilio stream

So `Press 1`, `Press 2` style flows are handled by sending actual DTMF audio/tone into the call stream.

---

## 14. How Live Listen Works

Frontend:
- [apps/web/src/components/LiveCallMonitor.tsx](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/web/src/components/LiveCallMonitor.tsx:1)

Backend socket helper:
- [apps/api/src/voice-agent/websocket/call-monitor.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/voice-agent/websocket/call-monitor.js:1)

Flow:

1. Frontend user clicks `Listen Live`
2. Frontend gets current `activeCallSid`
3. Frontend opens socket to `/call-monitor`
4. Backend subscribes that admin session to the specific `callSid`
5. Backend broadcasts:
   - live audio chunks
   - live transcript messages

This is why admins can listen to AI calls in real time.

---

## 15. How CRM Stage Updates Happen

There are two main places where stage changes happen:

### A. Worker claim stage

File:
- [apps/api/src/workers/outbound-caller.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/workers/outbound-caller.js:47)

Changes:
- `assigned` -> `calling`

### B. Twilio webhook stage updates

File:
- [apps/api/src/voice-agent/routes/twiml.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/voice-agent/routes/twiml.js:135)

Changes:
- `calling` -> `no_answer` for busy/failed/no-answer/canceled
- `calling` -> `called` on completed

### C. Orchestrator post-call logic

File:
- [apps/api/src/voice-agent/orchestrator/call-pipeline.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/voice-agent/orchestrator/call-pipeline.js:499)

This is where richer business outcomes can be stored, like:
- interested
- follow-up
- meeting scheduled
- notes
- summary

So Twilio webhook handles telephony state, while orchestrator handles conversation/business meaning.

---

## 16. How Meeting Scheduling Is Meant To Fit

The architecture already supports this direction.

Signals in code:
- orchestrator has meeting-save paths
- CRM rows can store meeting-related info in `raw_data.meeting`
- frontend reads `meeting_time` in AI pipeline row rendering

This means the system is already designed for:
- AI talks to client
- client agrees on meeting
- meeting data stored in CRM
- status changes accordingly

---

## 17. Important Tables / State Flags

### `contacts`
Raw niche leads

### `niches`
Business grouping and prompt grouping

### `enrichment_results`
CRM + AI pipeline lead rows

### `enrichment_jobs`
Tracks insertion/promotions into CRM

### `ai_calling_controls`
Per-tenant ON/OFF switch for automatic AI calling

### `raw_data.active_call_sid`
Current live Twilio call SID

### `lead_stage`
Current pipeline state:
- `assigned`
- `calling`
- `called`
- `no_answer`
- `followup`
- `interested`
- `proposal_sent`
- `closed_won`
- `closed_lost`

---

## 18. Real End-to-End Example

### Example: plumber niche

1. User scrapes plumber businesses
2. Leads go into `contacts` with niche `Plumbers`
3. User opens AI Agent page
4. User selects `Plumbers` niche
5. User selects contacts and presses assign
6. Frontend calls `POST /v1/leads/queue-ai`
7. Backend creates or updates `enrichment_results`
8. Leads become `assigned_to_ai = true`, `lead_stage = 'assigned'`
9. User presses `Start Calling`
10. Backend sets `ai_calling_controls.is_running = true`
11. Worker claims next lead and marks it `calling`
12. Worker creates Twilio call
13. Twilio hits `/api/voice/twiml/outbound`
14. Backend returns TwiML stream instructions
15. Twilio opens Media Stream socket
16. Orchestrator connects stream to OpenAI Realtime
17. AI speaks to plumber
18. If admin presses `Listen Live`, browser subscribes to the same call SID
19. When call finishes:
    - Twilio webhook updates telephony stage
    - orchestrator stores notes/summary/meeting outcome

---

## 19. Code Structure Answer: “AI agent cold calling ka code kahan hai?”

If you want to understand the system quickly, read in this order:

1. [apps/web/src/pages/AgentPipeline.tsx](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/web/src/pages/AgentPipeline.tsx:1)
2. [apps/api/src/routes/crm.ts](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/routes/crm.ts:104)
3. [apps/api/src/workers/outbound-caller.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/workers/outbound-caller.js:1)
4. [apps/api/src/voice-agent/routes/twiml.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/voice-agent/routes/twiml.js:1)
5. [apps/api/src/voice-agent/websocket/media-server.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/voice-agent/websocket/media-server.js:1)
6. [apps/api/src/voice-agent/orchestrator/call-pipeline.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/voice-agent/orchestrator/call-pipeline.js:1)
7. [apps/api/src/voice-agent/orchestrator/voice.kernel.js](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas/apps/api/src/voice-agent/orchestrator/voice.kernel.js:1)

That is the real cold-calling path.

---

## 20. Final Practical Conclusion

This AI calling system is not a separate mini project anymore.
It is built as a layered pipeline inside the main CRM:

- niche/contact intake
- CRM promotion into AI queue
- automatic worker-based dialing
- Twilio as carrier
- TwiML + Media Streams as bridge
- OpenAI Realtime as speaking/listening engine
- CRM stage + notes + meeting updates after call

So when you say:
"lead scrape hoti hai, phir niche hoti hai, phir AI agent call karta hai"

that is exactly how the code is structured.
