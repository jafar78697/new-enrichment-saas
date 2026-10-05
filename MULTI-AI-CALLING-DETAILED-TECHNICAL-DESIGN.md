# Multi AI Calling + Visual Script Builder

## Detailed Technical Design and Coding-Agent Handoff

**Project:** Jento Enrichment SaaS  
**Status:** Implementation-ready design  
**Target:** 8 SignalWire numbers, 4 independent calling lanes, 4 niches, 4 AI agents  
**Primary UI:** `/multi-ai-calling`  
**Feature flag:** `ENABLE_MULTI_AI_CALLING=true`

---

## 1. Purpose

This document is the implementation contract for the coding agent. It replaces a high-level plan with exact product behavior, data structures, APIs, runtime rules, file boundaries, state transitions, validation rules, failure behavior, and rollout steps.

The required product is:

- Eight SignalWire numbers divided into four exclusive pairs.
- Four independent AI calling lanes.
- One niche, one AI agent, one published script, one lead queue, and two caller IDs per lane.
- One active call per lane, therefore a maximum of four simultaneous calls.
- The two numbers inside a lane rotate A, B, A, B across call attempts.
- A fifth active niche cannot be assigned until a lane is freed.
- Scripts are created using a visual, node-based builder similar to n8n.
- The visual builder stores structured JSON. Users do not edit the protected system prompt.
- Every call is pinned to the exact script version, agent, niche, lane, and caller ID used for that call.
- The browser controls and monitors campaigns. Calls continue server-side if the browser closes.

### Important concurrency decision

Two numbers in a pair do **not** mean two simultaneous calls from the same lane. A lane makes one call at a time and alternates its two caller IDs. Four lanes therefore produce at most four simultaneous calls. Supporting eight simultaneous calls would be a separate future design.

---

## 2. Existing System Findings

The implementation must extend the current system instead of layering four calls on top of the single-call code.

### Current backend constraints

1. `apps/api/src/workers/outbound-caller.js`
   - Reads all caller IDs from the global `SIGNALWIRE_PHONE_NUMBER` environment variable.
   - Acquires one tenant-wide outbound lock.
   - Refuses to dial when any active call exists for the tenant.
   - Calculates rotation using the tenant's total attempted-lead count.
   - Reads one tenant-wide `ai_calling_controls` record.

2. `apps/api/src/routes/crm.ts`
   - Stores a single `is_running` flag per tenant.
   - Returns one `activeCallSid`.
   - Starts and stops the whole tenant dialer rather than an individual lane.

3. `apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js`
   - Tracks active calls in a global `activeStreamSids` set.
   - Uses one global concurrency cap.
   - Loads an agent and niche from the current call but has no lane or script-version identity.

4. `apps/api/src/voice-agent/providers/deepgram-agent.js`
   - Contains a large plumbing-specific prompt in application code.
   - Appends saved agent text, niche rules, tool rules, and greeting rules into one prompt.
   - Does not receive an immutable published script version.

5. `apps/api/src/voice-agent/websocket/call-monitor.js`
   - A browser socket subscribes to one call room.
   - Subscribing to another call leaves the previous room.

6. `apps/web/src/pages/AgentPipeline.tsx`
   - Models one running campaign, one active call SID, and one live monitor popup.

7. Existing database objects
   - `niches.id` is an integer.
   - `ai_agent_configs.id` is a UUID.
   - `phone_numbers.id` is a UUID.
   - `ai_call_sessions.id` is a UUID.
   - `ai_calling_controls` is tenant-wide.

### Required conclusion

Do not implement this feature by only setting `AI_MAX_ACTIVE_CALLS=4`. That would allow wrong-number rotation, queue collision, mixed prompts, and incorrect monitoring. Multi-agent calling requires first-class lane records and per-lane locks.

### 2.1 Existing feature reuse map

The new system must preserve and reuse the working parts below. The coding agent should refactor shared behavior into services where necessary instead of writing a second, conflicting version.

| Existing behavior | Current source | Required multi-lane treatment |
|---|---|---|
| SignalWire outbound dial | `apps/api/src/workers/outbound-caller.js` | Reuse provider client and callback pattern. Replace tenant lock/global number CSV with lane lock and DB number pair. |
| Manual/start/stop API behavior | `apps/api/src/routes/crm.ts` | Keep legacy routes for old page. Add isolated `/v1/multi-calling/*` routes. Never make the new route toggle the old tenant-wide controller. |
| Deepgram settings | `apps/api/src/voice-agent/providers/deepgram-agent.js` | Preserve audio formats, listen provider, tool schemas, voice selection, and protected rules. Replace hard-coded plumbing sales copy with the published script compiler output. |
| SignalWire/Deepgram media bridge | `apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js` | Reuse audio forwarding, transcript handling, tool execution, timers, cleanup, and fallback outcome logic. Add lane/script/number identity to each isolated context. |
| First-answer classification | `apps/api/src/voice-agent/detection/call-state-detector.js` | Keep as the canonical deterministic machine detector. Do not create separate per-niche voicemail regexes. |
| Call session persistence | `apps/api/src/voice-agent/services/ai-call-session.service.js` | Extend create/end methods with lane, queue item, number, and script-version snapshot. |
| Post-call analysis | `apps/api/src/voice-agent/services/post-call/processor.js` | Use only as fallback when no authoritative live outcome exists. It must never overwrite DNC, explicit interest/rejection, voicemail, or IVR. |
| TwiML and status callbacks | `apps/api/src/voice-agent/routes/twiml.js` | Resolve an opaque session ID, then load tenant/lane/lead/agent/script/number from DB. Use shared idempotent finalization. |
| Live audio/transcript | `apps/api/src/voice-agent/websocket/call-monitor.js` | Change single-room subscription to up to four authorized rooms; preserve audio conversion and event shapes. |
| Existing calling page | `apps/web/src/pages/AgentPipeline.tsx` | Leave available for legacy mode. Reuse outcome badge rules and live-monitor presentation where helpful. Do not add four-lane state into this already single-call page. |
| Existing live monitor | `apps/web/src/components/LiveCallMonitor.tsx` | Extract reusable transcript/audio primitives. New MultiCallMonitor owns four lane feeds and one selected audio lane. |
| Niche records | `apps/api/src/calls-module/routes/niches.routes.js` and `niches` table | Use the existing tenant niche ID. A lane references this ID; do not create another niche table. |
| Scraper niche selection | `apps/web/src/pages/GoogleMapScraper.tsx` | Preserve `Save to Niche`. New leads saved under that niche become eligible for the matching lane queue. |
| Niche-to-AI queue import | `POST /v1/leads/queue-ai` in `apps/api/src/routes/crm.ts` | Extract reusable contact-to-enrichment conversion. New lane queue API calls the extracted service with `laneId` and `nicheId`. |
| Purchased numbers | `phone_numbers` table and `apps/api/src/routes/phone-numbers.ts` | This table becomes the source of truth for lane pairs. Do not hard-code the eight values in source or store them only in environment CSV. |
| Number management UI | `apps/web/src/pages/SignalWireNumbers.tsx` | Reuse number display concepts. Show lane assignment and health in Multi AI Calling. |

### 2.2 Current voice speed and timing that must be preserved deliberately

Current code defaults are defined in `apps/api/src/voice-agent/config/env.js`:

- `DEEPGRAM_AGENT_SPEAK_SPEED`: default `1.05`, allowed range `0.5` to `1.5`.
- `DEEPGRAM_AGENT_VOICE`: code default `aura-orion-en`.
- `AI_MAX_SECONDS_PER_CALL`: default `180` seconds.
- `AI_MAX_ACTIVE_CALLS`: current default `1` and must not become `4` until lane isolation is complete.
- The current Flux listen configuration in `deepgram-agent.js` uses `eot_threshold = 0.70` and `eot_timeout_ms = 900` for faster first-turn response.

Important implementation detail: current code sends the `speed` field only when the voice model name starts with `flux-` or `aura-2-`. Therefore a configured value of `1.05` can be silently ineffective for a voice model that does not support provider speed control. The new UI must show both:

- Configured speed.
- Effective speed status: `Applied by provider` or `Provider default; selected voice has no speed control`.

Do not globally change speed during the multi-lane work. The production-effective value must be loaded from environment/agent configuration and shown in the assignment review. Add these optional columns to `ai_agent_configs`:

- `speech_speed NUMERIC(3,2) NOT NULL DEFAULT 1.05 CHECK (speech_speed BETWEEN 0.50 AND 1.50)`.
- `listen_eot_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.70`.
- `listen_eot_timeout_ms INTEGER NOT NULL DEFAULT 900`.

Each lane uses its assigned agent's voice settings. Changing Agent 2 must not alter Agents 1, 3, or 4. Active calls keep the voice/speed snapshot captured at call creation.

### 2.3 Existing intelligent call behavior that must remain protected

The new visual script controls sales content. It must not delete or duplicate the intelligence already implemented around the conversation.

#### Human greeting and turn-taking

- A normal human greeting such as Hello, company name, Speaking, Yes, or How can I help you should allow the configured Opening block to run.
- The agent asks one question and waits.
- It must not answer while the prospect is still speaking.
- End-of-turn settings remain server/agent configuration, not editable free text in a niche script.

#### IVR behavior

Canonical source: `apps/api/src/voice-agent/detection/call-state-detector.js`.

- `press 1`, `press two`, `dial your extension`, `main menu`, or choose/select options => `IVR_OR_MENU`.
- IVR is terminal for this cold-calling campaign and the server ends the call.
- Bare hold language is not IVR.

#### Hold/transfer/recording announcement behavior

These phrases mean a human may be connected next:

- `please hold`
- `hold please`
- `stay on the line`
- `please wait while we connect/transfer`
- `recorded for quality`
- `is being recorded`

They remain `TRANSFER_OR_AD` with action `wait`. The AI stays silent and waits for the real human. The script builder must not let a user redefine these phrases as voicemail or IVR.

#### Voicemail behavior

Voicemail patterns in `call-state-detector.js` include leave-a-message language, after-the-tone/beep language, reached-the-mailbox language, forwarded-to-voice-messaging language, and unavailable-person greetings. When confidently detected:

1. Set `first_answer_type = 'VOICEMAIL'`.
2. Set call outcome to `voicemail`.
3. End the provider call through the shared finalizer.
4. Map the CRM stage to `no_answer` while preserving `raw_data.ai_outcome = 'voicemail'` so the UI's Voicemail filter remains separate.

A real receptionist offering to take a message is human and must not be classified as voicemail. The current detector's human-message exception must be retained before voicemail matching.

#### Screening behavior

Requests such as state your name/reason are `SCREENING`. The agent may identify itself briefly and wait. Screening is not voicemail.

### 2.4 One canonical outcome precedence

The existing code has live tool outcomes, deterministic machine detection, transcript fallback, and post-call analysis. The new finalizer must use one precedence order so they cannot overwrite one another:

1. **DNC:** explicit remove-me/do-not-call tool. Highest priority and irreversible.
2. **Explicit live-human outcome:** confirmed interested, not interested, or exact follow-up saved by `save_call_note`.
3. **Deterministic machine outcome:** voicemail or IVR from the canonical call-state detector, only when no authoritative human outcome exists.
4. **Deterministic transcript fallback:** clear rejection, interest, callback, gatekeeper, silence, or short hangup rules already present in the bridge.
5. **Post-call model fallback:** only if the previous four sources leave outcome unknown.
6. **Called/completed:** last resort when conversation occurred but no stronger disposition is supported.

No lower-priority source may overwrite a higher-priority result.

### 2.5 Outcome-to-CRM mapping

Preserve the current pipeline and filter behavior:

| Canonical outcome | `enrichment_results.lead_stage` | Required metadata/action |
|---|---|---|
| `voicemail` | `no_answer` | `raw_data.ai_outcome = 'voicemail'`; UI shows Voicemail. |
| `no_answer` | `no_answer` | `raw_data.ai_outcome = 'no_answer'`. |
| IVR/menu | `no_answer` | `first_answer_type = 'IVR_OR_MENU'`; UI shows IVR Menu. |
| `interested` | `interested` | Save AI source, note, contact/email if confirmed. |
| `not_interested` | `closed_lost` | UI label remains Not Interested; do not schedule retry. |
| `followup` | `followup` | Exact `next_followup_at`, timezone, and open follow-up task. |
| `do_not_call` | `closed_lost` | Set `do_not_call = true`; never enqueue again. |
| `called` | `called` | Only when no stronger outcome is supported. |

The UI should display AI-produced results using the existing AI-result visual treatment. The new system should not restore the removed manual-result popup as part of multi-agent calling.

### 2.6 Existing number inventory integration

The coding agent must not guess or embed the eight E.164 numbers in the MD or source code.

Source of truth:

1. `phone_numbers` rows for the authenticated tenant with `provider = 'signalwire'` and `status = 'active'`.
2. Existing `GET /v1/phone-numbers` API for tenant-visible numbers.
3. SignalWire provider API only for reconciliation and health, not as the normal lane-assignment store.

Migration requirement:

- Reconcile the eight purchased SignalWire numbers against `phone_numbers` before enabling lane assignment.
- If a purchased number is visible in the SignalWire account but missing locally, import its E.164 value, provider SID, and capabilities through an admin-only reconciliation command/endpoint.
- The assignment wizard operates on `phone_numbers.id`, not raw strings.
- After pairing, Number 1/2 belong exclusively to Lane 1, Number 3/4 to Lane 2, and so on according to the user's saved assignment. Do not depend on provider list ordering.

### 2.7 Scraper niche to lane queue flow

The existing flow already lets Google Maps Scraper save results to a niche. Preserve that exact niche identity end to end:

```text
Scraper keyword run
  -> Save to Niche (`niches.id`)
  -> contacts.niche_id
  -> contact/enrichment conversion
  -> enrichment lead with durable niche_id
  -> matching ai_calling_lane.niche_id
  -> ai_call_queue_items.lane_id
  -> outcome returns to the same CRM lead
```

Add a real nullable `niche_id INTEGER REFERENCES niches(id)` column to `enrichment_results`. Backfill it from `raw_data->>'niche_id'` where valid. Keep the raw-data copy temporarily for backward compatibility, but new code must query the real column.

Lane assignment options:

- `queueExistingEligibleLeads`: default true in the review step.
- `autoQueueNewNicheLeads`: default true.

When a niche is assigned to a lane:

1. Count eligible existing contacts and enrichment leads.
2. Show the count before saving.
3. On save, insert queue items idempotently for eligible leads when the checkbox is enabled.
4. Any later scraper lead saved to that niche is automatically added to the lane queue when `autoQueueNewNicheLeads` is true.
5. If the lane is Paused, the lead stays queued.
6. If the lane is Running and idle, the worker may claim it.

Eligibility rules:

- Same tenant and same `niche_id` as the lane.
- Valid North American phone after normalization.
- `do_not_call = false`.
- Not already active/terminal in another lane queue.
- Stage is new/enriched/assigned, or follow-up whose time is due.
- Not a duplicate destination already processed under the configured retry policy.

The existing conversion logic inside `POST /v1/leads/queue-ai` should be extracted into a shared service rather than copied. The shared service must accept `tenantId`, `nicheId`, `agentConfigId`, and `laneId` and must persist both agent and lane assignment.

---

## 3. Product Terminology

- **Lane:** One independently controllable AI calling campaign slot.
- **Agent slot:** Fixed visible label `Agent 1` through `Agent 4`.
- **Phone pair:** Two active SignalWire caller IDs exclusively assigned to one lane.
- **Script:** Logical script owned by a tenant and normally associated with a niche.
- **Script version:** Immutable published JSON and its compiled prompt.
- **Draft:** Editable script version that never affects live calls.
- **Published version:** Version used by new calls after publication.
- **Queue item:** One lead waiting for one lane to call it.
- **Drain:** Stop taking new leads, allow the active call to finish, then pause.
- **Protected policy:** Server-owned calling behavior that a user script cannot remove.

---

## 4. User Experience Design

### 4.1 Sidebar and route

Add one sidebar item after `AI Calling`:

- Label: `Multi AI Calling`
- Route: `/multi-ai-calling`
- Required module permission: `ai_calling`
- Owner/admin/manager can configure and run lanes.
- Read-only staff may view lane status if existing access policy allows it.

Required frontend changes:

- `apps/web/src/App.tsx`: register the route.
- `apps/web/src/components/Layout.tsx`: add the navigation item and permission mapping.
- Create `apps/web/src/pages/MultiAICalling.tsx`.

### 4.2 Page structure

The page contains these sections in order:

1. Header
   - Title: `Multi AI Calling`
   - Summary: `4 agents · 8 numbers · up to 4 live calls`
   - Global actions: `Start Ready Lanes`, `Pause All`, `Refresh`
   - Summary counters: Running, Live Calls, Queued Leads, Errors

2. Lane grid
   - Four fixed cards: Agent 1, Agent 2, Agent 3, Agent 4.
   - Desktop: two cards per row.
   - Narrow screens: one card per row.

3. Recent lane activity
   - Filter by lane, niche, number, result, and date.
   - Show call SID, company, phone, caller ID, script version, result, duration, and transcript link.

### 4.3 Empty lane card

An empty card displays:

- Agent slot name.
- Status `Not configured`.
- Empty niche.
- Empty phone pair.
- Button `Configure Agent`.

Pressing `Configure Agent` opens the assignment wizard.

### 4.4 Configured lane card

Each configured lane card displays:

- Slot: `Agent 1` to `Agent 4`.
- Lane name, defaulting to the niche name.
- Niche name.
- AI agent name and voice.
- Number A and Number B.
- Next caller ID indicator.
- Published script name and version.
- Queue count.
- Current lead and active call duration.
- Last call result.
- Last heartbeat.
- Health badge: Draft, Ready, Running, Live, Draining, Paused, Error.
- Actions: Start, Pause, Drain, Edit, Open Script, View Calls.

### 4.5 Lane assignment wizard

Use a four-step drawer or modal. Do not save partial assignments.

#### Step 1: Select niche

- Load active niches belonging to the current tenant.
- Disable a niche already assigned to another active lane.
- Show lead count for each niche.
- Allow `Create niche` through the existing niche flow.

#### Step 2: Select agent and phone pair

- Default agent slot is the card that opened the wizard.
- Choose one active outbound `ai_agent_configs` record or create one.
- Show active, unassigned SignalWire numbers from `phone_numbers`.
- Require exactly two unique numbers.
- Display number health and last use.
- Reject numbers already assigned to another configured lane.

#### Step 3: Create or select script

Choices:

- Start from niche template.
- Clone an existing script.
- Build from blank protected skeleton.

Open the visual Script Builder inside the wizard or in a full-screen editor.

#### Step 4: Review and save

Review:

- Slot and lane name.
- Niche.
- Agent and voice.
- Phone A and B.
- Script name and version.
- Queued-lead count.

`Save Lane` performs one database transaction. Saving does not start calling. The user explicitly presses Start.

### 4.6 Capacity behavior

When all four lanes are configured, any `Assign Niche` action must fail with HTTP 409 and:

```json
{
  "code": "LANE_CAPACITY_REACHED",
  "message": "All 4 AI agents are assigned. Pause and remove one lane before assigning another niche."
}
```

Pausing a lane does not free it. The user must choose `Remove Assignment`, which is allowed only when no live call exists. Existing call history remains.

### 4.7 Start, Pause, Drain, and Stop semantics

- **Start:** Lane may claim new queue items.
- **Pause:** Prevents new claims immediately. It does not hang up the current call.
- **Drain:** Same as Pause for new claims, status remains Draining until active call ends, then becomes Paused.
- **End Current Call:** Explicitly ends only the selected live call.
- **Remove Assignment:** Requires Paused and no active call. Releases the two numbers and removes active niche/agent/script links. It does not delete history.
- **Pause All:** Changes all running lanes to Paused. Existing calls continue unless the user separately ends them.

---

## 5. Visual Script Builder Design

### 5.1 Product decision

The editor should look and behave like a simplified n8n workflow editor, but it must not expose unrestricted code or arbitrary JavaScript expressions.

Use a three-pane layout:

```text
+----------------------+-----------------------------------+----------------------+
| Element palette      | Script canvas                     | Block settings       |
|                      |                                   |                      |
| Opening              | [Start - locked]                  | Selected: Offer      |
| Offer                |        |                          | Text: ...            |
| Questions            | [Opening]                         | Max sentences: 2     |
| Objections           |        |                          | Wait for reply: Yes  |
| Pricing              | [Offer]                           |                      |
| Meeting CTA          |        |                          | Validation           |
| Follow-up            | [Qualifying questions]            | Ready                |
| Send information     |        |                          |                      |
| Outcome action       | [Objection router] -> [CTA]       |                      |
| Additional rules     |        |                          |                      |
| Goodbye              | [Outcome] -> [Goodbye]            |                      |
|                      |        |                          |                      |
|                      | [End - locked]                    |                      |
+----------------------+-----------------------------------+----------------------+
```

Recommended UI library: `@xyflow/react` because this is a connected node graph rather than only a sortable list. Implement palette-to-canvas dragging with Pointer Events so it also behaves correctly on touch devices. Add the dependency only in `apps/web/package.json`.

### 5.2 Builder interaction

1. User clicks or drags an element from the left palette.
2. A configured node appears on the canvas.
3. The node auto-connects after the currently selected node unless the user drops on a connection.
4. Clicking a node opens its form in the right inspector.
5. Edges show the conversation order.
6. Conditional blocks expose named output handles.
7. Invalid connections are refused immediately.
8. Draft changes auto-save after 800 ms of inactivity.
9. `Validate` displays errors on nodes and in a validation panel.
10. `Preview Prompt` shows the generated read-only prompt.
11. `Publish` creates a new immutable version.

### 5.3 Protected nodes

The blank template always includes locked Start and End nodes. The following policies are server-owned and do not appear as removable canvas nodes:

- Wait until a real person finishes speaking.
- `Press 1`, `press 2`, or keypad menu means IVR.
- `Please hold`, transfer language, and recorded-for-quality language means wait for a human.
- Voicemail greeting and after-the-tone language means voicemail.
- Explicit do-not-call request invokes the DNC tool.
- Outcome and transcript must be saved.
- Previous lead/company context must never leak into the next call.
- Tool calls that mutate CRM state must wait for confirmed end-of-turn.

The user script supplies sales content. It cannot override these protected rules.

### 5.4 Supported editable block types

#### A. Opening

Purpose: first spoken line after a human greeting.

Fields:

- `text`: required, maximum 220 characters.
- `waitForReply`: always true in version 1.
- `ownerCheck`: none, ask owner, or ask decision maker.
- `fallbackIfNotOwner`: optional short line.

Rules:

- Exactly one Opening block is required.
- It must be the first editable block after Start.
- It must ask at most one question.
- The compiler rejects paragraphs and multiple consecutive questions.

#### B. Offer

Purpose: one short explanation of the business value.

Fields:

- `text`: required, maximum 280 characters.
- `waitForReply`: boolean, default true.
- `onlyAfterPermission`: boolean.

Rules:

- Maximum one primary Offer block in version 1.
- One or two spoken sentences maximum.

#### C. Qualifying Questions

Purpose: collect information one question at a time.

Fields per question:

- `id`.
- `text`.
- `required`.
- `captureKey`: optional allowlisted key.
- `skipIfKnown`.

Allowlisted capture keys:

- `current_call_handling`
- `missed_call_problem`
- `after_hours_process`
- `decision_maker`
- `business_size`
- `preferred_callback_time`

Rules:

- One to five questions.
- The agent asks the next question only after the prospect answers.
- A question is skipped when its captured value already exists in session context.

#### D. Objection Router

Purpose: match a prospect's intent to one approved short response.

Supported intent keys:

- `not_interested_soft`
- `not_interested_firm`
- `already_have_receptionist`
- `already_have_answering_service`
- `too_expensive`
- `send_information`
- `busy_call_later`
- `not_decision_maker`
- `asks_how_it_works`
- `asks_price`

Each case contains:

- `intent`.
- `response` of at most 240 characters.
- `outputKey`, which must match one outgoing edge's `sourceHandle`.
- `maxUses`, default 1.

Rules:

- The `edges` array is the only routing source of truth; node data must not store target node IDs.
- Firm refusal must route to an Outcome Action configured as Not Interested, then Goodbye.
- The same objection response cannot be used repeatedly.
- Unknown objections use the `default` output handle.

#### E. Pricing

Purpose: answer price questions only when the user wants pricing in this niche.

Fields:

- `mode`: `exact`, `starting_at`, `range`, or `meeting_only`.
- `currency`.
- `amount` or `minimum` and `maximum`.
- `spokenText`.
- `onlyWhenAsked`, default true.

The UI hides irrelevant fields according to `mode`.

#### F. Meeting CTA

Purpose: ask for a meeting or callback.

Fields:

- `text`.
- `meetingLengthMinutes`, default 10.
- `collectEmail`.
- `collectDate`.
- `collectTime`.
- `collectTimezone`.
- `collectCallbackNumber`.

Named output handles:

- `interested`
- `followup_requested`
- `declined`

Rules:

- Follow-up is saved only after exact date, time, and timezone are confirmed.
- Email must be repeated back and confirmed before saving.
- The agent must not claim a meeting is booked unless a scheduling function confirms it.

#### G. Follow-up

Purpose: define behavior when the prospect asks to be called later.

Fields:

- `askDateText`.
- `askTimeText`.
- `askTimezoneText`.
- `confirmationText`.

This block invokes the existing CRM note/result tool with an ISO 8601 timestamp and timezone.

#### H. Send Information

Purpose: capture an email when the prospect asks for information.

Fields:

- `askEmailText`.
- `confirmEmailText`.
- `closingText`.

The tool saves the confirmed email. The agent says it will pass the request to the team and does not falsely claim an email was already sent.

#### I. Additional Instructions

Purpose: niche-specific behavioral guidance that is not normally spoken verbatim.

Fields:

- `instructions`: maximum 1,500 characters.
- `priority`: normal or high.

Rejected content:

- Attempts to disable DNC, voicemail, IVR, tenant isolation, result saving, or tool safety.
- Markdown formatting intended to be read aloud.
- Instructions to invent facts.

#### J. Outcome Action

Purpose: save an authoritative human-conversation disposition before the call ends or moves forward.

Fields:

- `outcome`: `interested`, `not_interested`, or `followup`.
- `noteTemplate`: short factual note template.

Rules:

- This is a system-action node; it does not speak.
- `followup` is valid only after the Follow-up block collected exact date, time, and timezone.
- Voicemail, IVR, no-answer, and DNC are not user-selectable Outcome Action values. Protected server detection owns them.
- The compiler emits an explicit `save_call_note` tool instruction for this branch. The existing bridge tool handler performs and confirms the database write before the agent is allowed to finish the Goodbye/End path.

#### K. Goodbye

Purpose: final spoken sentence before ending a human conversation.

Fields:

- `interestedText`.
- `notInterestedText`.
- `followupText`.
- `genericText`.

The server saves the outcome before allowing `end_call`.

### 5.5 Allowed template variables

Only these placeholders may be used:

```text
{{company_name}}
{{prospect_name}}
{{niche_name}}
{{agent_name}}
{{offer_name}}
{{meeting_length}}
{{current_date}}
```

Do not support arbitrary JavaScript or n8n expressions. Unknown variables are publish errors. Missing optional values resolve to a safe phrase or empty string according to a server-owned variable definition.

### 5.6 Script JSON contract

The canvas is persisted as JSONB. Example:

```json
{
  "schemaVersion": 1,
  "name": "Plumbing missed-call offer",
  "nicheId": 14,
  "settings": {
    "agentDisplayName": "David",
    "tone": "confident_concise",
    "maxSentencesPerTurn": 2,
    "maxObjectionAttempts": 1
  },
  "nodes": [
    {
      "id": "start",
      "type": "start",
      "locked": true,
      "position": { "x": 420, "y": 40 },
      "data": {}
    },
    {
      "id": "opening_1",
      "type": "opening",
      "position": { "x": 420, "y": 150 },
      "data": {
        "text": "Hi, this is David with Jento AI. Quick question—how do you handle calls when your team is out on jobs?",
        "waitForReply": true,
        "ownerCheck": "none"
      }
    },
    {
      "id": "offer_1",
      "type": "offer",
      "position": { "x": 420, "y": 280 },
      "data": {
        "text": "We help plumbing teams answer overflow and after-hours calls, collect the customer's details, and send the job information to the team.",
        "waitForReply": true,
        "onlyAfterPermission": false
      }
    },
    {
      "id": "questions_1",
      "type": "qualifying_questions",
      "position": { "x": 420, "y": 410 },
      "data": {
        "questions": [
          {
            "id": "q1",
            "text": "What happens today when nobody can answer the phone?",
            "required": true,
            "captureKey": "current_call_handling",
            "skipIfKnown": true
          }
        ]
      }
    },
    {
      "id": "objections_1",
      "type": "objection_router",
      "position": { "x": 420, "y": 560 },
      "data": {
        "cases": [
          {
            "intent": "already_have_receptionist",
            "response": "That makes sense. We can cover overflow and after-hours calls when your receptionist is unavailable.",
            "outputKey": "continue",
            "maxUses": 1
          },
          {
            "intent": "not_interested_firm",
            "response": "Understood. Thanks for your time.",
            "outputKey": "firm_no",
            "maxUses": 1
          }
        ],
        "defaultOutputKey": "default"
      }
    },
    {
      "id": "cta_1",
      "type": "meeting_cta",
      "position": { "x": 420, "y": 720 },
      "data": {
        "text": "Would you be open to a quick ten-minute call this week to see how it would work for your business?",
        "meetingLengthMinutes": 10,
        "collectEmail": true,
        "collectDate": true,
        "collectTime": true,
        "collectTimezone": true,
        "collectCallbackNumber": false
      }
    },
    {
      "id": "followup_1",
      "type": "followup",
      "position": { "x": 420, "y": 860 },
      "data": {
        "askDateText": "Which day would work best for a quick callback?",
        "askTimeText": "What time works for you?",
        "askTimezoneText": "Which time zone should we use?",
        "confirmationText": "Perfect. I have the callback time confirmed."
      }
    },
    {
      "id": "outcome_interested",
      "type": "outcome_action",
      "position": { "x": 120, "y": 1010 },
      "data": {
        "outcome": "interested",
        "noteTemplate": "Prospect showed clear interest and requested next-step information."
      }
    },
    {
      "id": "outcome_followup",
      "type": "outcome_action",
      "position": { "x": 420, "y": 1010 },
      "data": {
        "outcome": "followup",
        "noteTemplate": "Prospect requested a callback at the confirmed date, time, and timezone."
      }
    },
    {
      "id": "outcome_not_interested",
      "type": "outcome_action",
      "position": { "x": 720, "y": 1010 },
      "data": {
        "outcome": "not_interested",
        "noteTemplate": "Prospect clearly declined the offer."
      }
    },
    {
      "id": "goodbye_1",
      "type": "goodbye",
      "position": { "x": 420, "y": 1160 },
      "data": {
        "interestedText": "Great, thank you. Our team will follow up with the details.",
        "notInterestedText": "Understood. Thanks for your time.",
        "followupText": "Perfect. We will call you at the confirmed time.",
        "genericText": "Thanks for your time."
      }
    },
    {
      "id": "end",
      "type": "end",
      "locked": true,
      "position": { "x": 420, "y": 1300 },
      "data": {}
    }
  ],
  "edges": [
    { "id": "e1", "source": "start", "target": "opening_1", "kind": "default" },
    { "id": "e2", "source": "opening_1", "target": "offer_1", "kind": "default" },
    { "id": "e3", "source": "offer_1", "target": "questions_1", "kind": "default" },
    { "id": "e4", "source": "questions_1", "target": "objections_1", "kind": "default" },
    { "id": "e5", "source": "objections_1", "sourceHandle": "continue", "target": "cta_1", "kind": "condition" },
    { "id": "e6", "source": "objections_1", "sourceHandle": "default", "target": "cta_1", "kind": "condition" },
    { "id": "e7", "source": "objections_1", "sourceHandle": "firm_no", "target": "outcome_not_interested", "kind": "condition" },
    { "id": "e8", "source": "cta_1", "sourceHandle": "interested", "target": "outcome_interested", "kind": "condition" },
    { "id": "e9", "source": "cta_1", "sourceHandle": "followup_requested", "target": "followup_1", "kind": "condition" },
    { "id": "e10", "source": "cta_1", "sourceHandle": "declined", "target": "outcome_not_interested", "kind": "condition" },
    { "id": "e11", "source": "followup_1", "target": "outcome_followup", "kind": "default" },
    { "id": "e12", "source": "outcome_interested", "target": "goodbye_1", "kind": "default" },
    { "id": "e13", "source": "outcome_followup", "target": "goodbye_1", "kind": "default" },
    { "id": "e14", "source": "outcome_not_interested", "target": "goodbye_1", "kind": "default" },
    { "id": "e15", "source": "goodbye_1", "target": "end", "kind": "default" }
  ]
}
```

### 5.7 Graph validation rules

Publishing must fail when any rule fails:

- Exactly one Start and one End.
- Exactly one Opening.
- Every node is reachable from Start.
- Every nonterminal path can reach End.
- No orphan nodes.
- No cycles in version 1.
- Every conditional output has a target.
- Firm refusal has a path through Outcome Action: Not Interested and then End.
- Meeting CTA has a path that collects required follow-up data.
- Text length limits pass.
- Template variables are allowlisted.
- No empty required text.
- Maximum 25 editable nodes.
- Maximum compiled prompt size is 18,000 characters, leaving room for protected and lead context.

Use Zod on the server because `zod` already exists in `apps/api/package.json`. The frontend may mirror validation for immediate feedback, but server validation is authoritative.

### 5.8 Draft, validate, preview, publish

- Editing creates or updates one Draft version.
- Auto-save updates only the Draft JSON.
- Validate returns structured errors `{ nodeId, field, code, message }`.
- Preview compiles a prompt but does not publish it.
- Publish validates again, compiles, hashes, and creates an immutable Published version.
- An active call keeps its original `script_version_id` even if a new version is published during the call.
- New calls use the lane's newly published version.
- Previous published versions are retained for audit and rollback.

### 5.9 Prompt compiler

Do not send the raw JSON to Deepgram. Create a deterministic server-side compiler:

```text
Script JSON
  -> schema validation
  -> graph validation
  -> text normalization
  -> template-variable validation
  -> ordered conversation instructions
  -> protected policy merge
  -> Deepgram prompt
  -> SHA-256 compiled hash
```

Compiled prompt sections, in order:

1. Protected voice-output rules.
2. Identity and success condition.
3. Current lead context.
4. Opening.
5. Offer.
6. Qualifying sequence.
7. Objection mapping.
8. Pricing behavior.
9. CTA/follow-up behavior.
10. Outcome and tool rules.
11. IVR, hold, voicemail, and DNC protected rules.

The compiler must produce plain conversational text instructions. Spoken turns should remain one or two sentences. Reliability-critical behavior remains server-enforced rather than relying only on prompt wording.

### 5.10 Version 1 execution model

The visual graph is an authoring and validation model. Version 1 does not implement a second real-time workflow engine that advances one server node after every spoken turn. Instead:

1. The compiler walks the validated graph from Start.
2. Default edges become ordered conversation phases.
3. Conditional `sourceHandle` edges become explicit intent-to-branch instructions.
4. Qualifying blocks become one-question-at-a-time instructions.
5. Outcome Action nodes become explicit calls to the protected `save_call_note` tool.
6. Goodbye nodes compile after a successful outcome tool instruction.
7. The whole compact compiled prompt is pinned to the call session at call creation.
8. The existing Deepgram bridge executes protected tools and writes authoritative results.

There is no `advance_script` client tool and no per-block `UpdatePrompt` request in version 1. This avoids extra latency, speculative transition calls, and prompt-update races during four concurrent conversations. The graph still has real semantics because the compiler rejects broken paths and deterministically converts every edge into prompt instructions.

A future version may add a server-owned node runtime, but it must be a separate migration and must not change the version 1 JSON meaning silently.

---

## 6. Database Design

Create migration:

`apps/api/src/db/migrations/030_multi_ai_calling.sql`

### 6.1 `ai_calling_lanes`

```sql
CREATE TABLE ai_calling_lanes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slot_number SMALLINT NOT NULL CHECK (slot_number BETWEEN 1 AND 4),
  name TEXT NOT NULL,
  niche_id INTEGER REFERENCES niches(id) ON DELETE SET NULL,
  agent_config_id UUID REFERENCES ai_agent_configs(id) ON DELETE SET NULL,
  active_script_version_id UUID,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','ready','running','draining','paused','error')),
  max_concurrent_calls SMALLINT NOT NULL DEFAULT 1 CHECK (max_concurrent_calls = 1),
  rotation_cursor SMALLINT NOT NULL DEFAULT 0 CHECK (rotation_cursor IN (0,1)),
  cooldown_seconds SMALLINT NOT NULL DEFAULT 4 CHECK (cooldown_seconds BETWEEN 0 AND 60),
  next_dial_after TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ,
  last_error TEXT,
  config_version INTEGER NOT NULL DEFAULT 1,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slot_number)
);
```

Partial unique indexes:

- One configured lane per niche and tenant.
- One configured lane per AI agent and tenant.
- These constraints apply while niche/agent is non-null.

```sql
CREATE UNIQUE INDEX ai_calling_lanes_active_niche_uq
  ON ai_calling_lanes (tenant_id, niche_id)
  WHERE niche_id IS NOT NULL;

CREATE UNIQUE INDEX ai_calling_lanes_active_agent_uq
  ON ai_calling_lanes (tenant_id, agent_config_id)
  WHERE agent_config_id IS NOT NULL;

CREATE INDEX ai_calling_lanes_worker_idx
  ON ai_calling_lanes (status, next_dial_after)
  WHERE status IN ('running', 'draining');
```

### 6.2 `ai_calling_lane_numbers`

```sql
CREATE TABLE ai_calling_lane_numbers (
  lane_id UUID NOT NULL REFERENCES ai_calling_lanes(id) ON DELETE CASCADE,
  phone_number_id UUID NOT NULL REFERENCES phone_numbers(id) ON DELETE RESTRICT,
  position SMALLINT NOT NULL CHECK (position IN (0,1)),
  enabled BOOLEAN NOT NULL DEFAULT true,
  health_status TEXT NOT NULL DEFAULT 'healthy'
    CHECK (health_status IN ('healthy','cooldown','disabled','error')),
  cooldown_until TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  answered_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  last_error TEXT,
  PRIMARY KEY (lane_id, phone_number_id),
  UNIQUE (lane_id, position),
  UNIQUE (phone_number_id)
);
```

The last unique constraint makes an active phone number exclusive to one lane. If future history requires keeping released rows, replace it with a partial unique index using an `assigned_at/released_at` model.

### 6.3 `ai_calling_scripts`

```sql
CREATE TABLE ai_calling_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  niche_id INTEGER REFERENCES niches(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 6.4 `ai_calling_script_versions`

```sql
CREATE TABLE ai_calling_script_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES ai_calling_scripts(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','published','archived')),
  schema_version INTEGER NOT NULL DEFAULT 1,
  definition JSONB NOT NULL,
  compiled_prompt TEXT,
  compiled_hash TEXT,
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  UNIQUE (script_id, version)
);

CREATE UNIQUE INDEX ai_calling_script_versions_one_draft_uq
  ON ai_calling_script_versions (script_id)
  WHERE status = 'draft';
```

After this table exists, add the foreign key from `ai_calling_lanes.active_script_version_id` to `ai_calling_script_versions(id)`:

```sql
ALTER TABLE ai_calling_lanes
  ADD CONSTRAINT ai_calling_lanes_active_script_version_fk
  FOREIGN KEY (active_script_version_id)
  REFERENCES ai_calling_script_versions(id)
  ON DELETE SET NULL;
```

### 6.5 `ai_call_queue_items`

```sql
CREATE TABLE ai_call_queue_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lane_id UUID NOT NULL REFERENCES ai_calling_lanes(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES enrichment_results(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued','claimed','dialing','ringing','streaming','completed','failed','cancelled')),
  priority INTEGER NOT NULL DEFAULT 100,
  attempt_number INTEGER NOT NULL DEFAULT 0,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  claim_token UUID,
  caller_phone_number_id UUID REFERENCES phone_numbers(id) ON DELETE SET NULL,
  session_id UUID REFERENCES ai_call_sessions(id) ON DELETE SET NULL,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX ai_call_queue_items_active_lead_uq
  ON ai_call_queue_items (tenant_id, lead_id)
  WHERE state IN ('queued','claimed','dialing','ringing','streaming');

CREATE INDEX ai_call_queue_items_claim_idx
  ON ai_call_queue_items (lane_id, priority, scheduled_at, created_at)
  WHERE state = 'queued';
```

The partial unique index prevents the same lead from existing in active states more than once per tenant.

### 6.6 `ai_call_lane_events`

Use an append-only event table for debugging:

- `id` bigserial.
- `tenant_id`.
- `lane_id`.
- `session_id` nullable.
- `queue_item_id` nullable.
- `event_type`.
- `payload` JSONB.
- `created_at`.

Event examples: `lane_started`, `lead_claimed`, `dial_requested`, `call_ringing`, `stream_started`, `outcome_saved`, `call_ended`, `lane_paused`, `provider_error`.

### 6.7 Extend `ai_call_sessions`

Add:

- `lane_id UUID`.
- `queue_item_id UUID`.
- `phone_number_id UUID`.
- `script_version_id UUID`.
- `script_compiled_hash TEXT`.
- `provider_request_id TEXT`.

These fields are immutable after the call starts, except provider request ID if it becomes known later.

### 6.8 Extend existing agent and lead records

Extend `ai_agent_configs`:

```sql
ALTER TABLE ai_agent_configs
  ADD COLUMN IF NOT EXISTS speech_speed NUMERIC(3,2) NOT NULL DEFAULT 1.05,
  ADD COLUMN IF NOT EXISTS listen_eot_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.70,
  ADD COLUMN IF NOT EXISTS listen_eot_timeout_ms INTEGER NOT NULL DEFAULT 900;
```

Add checks for the documented safe ranges. The provider must record whether the selected voice actually supports speed control.

Extend `enrichment_results`:

```sql
ALTER TABLE enrichment_results
  ADD COLUMN IF NOT EXISTS niche_id INTEGER REFERENCES niches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_calling_lane_id UUID REFERENCES ai_calling_lanes(id) ON DELETE SET NULL;
```

Backfill `niche_id` from valid legacy `raw_data.niche_id`. New scraper/contact conversion writes both the proper column and the temporary legacy JSON value until all old reads are migrated.

---

## 7. Backend API Contract

Create `apps/api/src/routes/multi-calling.ts` and register it in `apps/api/src/index.ts`.

All queries must include `tenant_id`. Configuration endpoints require owner/admin/manager.

### 7.1 Lane endpoints

- `GET /v1/multi-calling/lanes`
  - Returns exactly four slots, including empty slots.
  - Includes niche, agent, number pair, script version, health, queue counts, active call, and last result.

- `POST /v1/multi-calling/lanes/:slot/assign`
  - Body: `nicheId`, `agentConfigId`, `phoneNumberIds[2]`, `scriptVersionId`, optional `name`.
  - Performs all conflict checks and saves in one transaction.

- `PATCH /v1/multi-calling/lanes/:laneId`
  - Edits name, agent, phone pair, script, voice, or cooldown while paused.
  - Return 409 if a live call exists.

- `POST /v1/multi-calling/lanes/:laneId/start`
  - Requires Ready or Paused and a valid published script.

- `POST /v1/multi-calling/lanes/:laneId/pause`
  - Prevents new claims immediately.

- `POST /v1/multi-calling/lanes/:laneId/drain`
  - Prevents new claims and changes to Paused when the live call ends.

- `DELETE /v1/multi-calling/lanes/:laneId/assignment`
  - Requires no active call and Paused/Draft/Error state.

- `POST /v1/multi-calling/start-ready`
  - Starts all Ready or Paused configured lanes.

- `POST /v1/multi-calling/pause-all`
  - Pauses all lanes without ending active calls.

### 7.2 Number endpoints

- `GET /v1/multi-calling/available-numbers`
  - Returns active SignalWire numbers with assignment and health.
  - The assignment wizard only enables unassigned healthy numbers.

### 7.3 Script endpoints

- `GET /v1/multi-calling/scripts?nicheId=`
- `POST /v1/multi-calling/scripts`
- `GET /v1/multi-calling/scripts/:scriptId`
- `PUT /v1/multi-calling/scripts/:scriptId/draft`
- `POST /v1/multi-calling/scripts/:scriptId/validate`
- `POST /v1/multi-calling/scripts/:scriptId/preview`
- `POST /v1/multi-calling/scripts/:scriptId/publish`
- `POST /v1/multi-calling/scripts/:scriptId/clone`
- `POST /v1/multi-calling/scripts/:scriptId/rollback/:version`

Draft writes use optimistic concurrency:

```json
{
  "definition": {},
  "expectedVersion": 7
}
```

If another browser has changed the draft, return 409 `SCRIPT_VERSION_CONFLICT` instead of overwriting it.

### 7.4 Queue endpoints

- `POST /v1/multi-calling/lanes/:laneId/queue`
  - Body may contain `leadIds` or `nicheId` plus filters.
  - Enforces that every lead belongs to the lane's niche.

- `GET /v1/multi-calling/lanes/:laneId/queue`
- `DELETE /v1/multi-calling/lanes/:laneId/queue/:queueItemId`
- `POST /v1/multi-calling/lanes/:laneId/retry/:queueItemId`

### 7.5 Status response shape

```json
{
  "lane": {
    "id": "uuid",
    "slotNumber": 1,
    "status": "running",
    "niche": { "id": 14, "name": "Plumbing" },
    "agent": { "id": "uuid", "name": "Plumbing Agent", "voice": "aura-orion-en" },
    "numbers": [
      { "id": "uuid", "phoneNumber": "+13292064366", "position": 0, "health": "healthy" },
      { "id": "uuid", "phoneNumber": "+13292064399", "position": 1, "health": "healthy" }
    ],
    "nextNumberPosition": 1,
    "script": { "id": "uuid", "name": "Plumbing missed-call offer", "version": 3 },
    "queue": { "queued": 77, "failed": 2 },
    "activeCall": {
      "callSid": "...",
      "leadId": "uuid",
      "companyName": "Example Plumbing",
      "startedAt": "2026-10-03T12:00:00Z"
    },
    "lastResult": { "outcome": "voicemail", "endedAt": "..." }
  }
}
```

---

## 8. Backend Service Boundaries

Create these modules:

```text
apps/api/src/services/multi-calling/
  lane-service.ts
  lane-number-service.ts
  queue-service.ts
  script-schema.ts
  script-validator.ts
  script-compiler.ts
  script-version-service.ts
  lane-status-service.ts
  lane-event-service.ts
  multi-calling-errors.ts
```

Responsibilities:

- `lane-service`: transactions, assignment conflicts, state transitions.
- `lane-number-service`: exclusive pair allocation, health, rotation cursor.
- `queue-service`: queue creation, atomic claim, completion, retry scheduling.
- `script-schema`: Zod definitions for every node and edge.
- `script-validator`: graph and policy validation.
- `script-compiler`: deterministic prompt generation.
- `script-version-service`: draft/publish/rollback and hashes.
- `lane-status-service`: aggregate query for the four cards.
- `lane-event-service`: structured append-only events.

Do not add multi-calling logic directly to the already large `crm.ts` file.

---

## 9. Worker and Concurrency Design

Create `apps/api/src/workers/multi-lane-outbound-caller.js`. The old worker remains behind the old feature flag during rollout. Never allow old and new workers to claim the same lead.

### 9.1 Worker tick

Every two seconds:

1. Select lanes with `status = 'running'` and `next_dial_after <= NOW()`.
2. Process lanes independently.
3. Acquire a PostgreSQL advisory lock derived from tenant ID and lane ID.
4. Reload lane state inside the lock.
5. Check that this lane has no active call/session.
6. Claim exactly one queue item using `FOR UPDATE SKIP LOCKED`.
7. Select the healthy phone at `rotation_cursor`.
8. Create the immutable call-session snapshot.
9. Create the SignalWire outbound call.
10. Save call SID and queue state.
11. Advance `rotation_cursor` only after SignalWire accepts the dial request.
12. Release the advisory lock.

### 9.2 Atomic queue claim pseudocode

```sql
WITH candidate AS (
  SELECT id
  FROM ai_call_queue_items
  WHERE tenant_id = $1
    AND lane_id = $2
    AND state = 'queued'
    AND scheduled_at <= NOW()
  ORDER BY priority ASC, scheduled_at ASC, created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE ai_call_queue_items q
SET state = 'claimed',
    claimed_at = NOW(),
    claim_token = gen_random_uuid(),
    attempt_number = attempt_number + 1,
    updated_at = NOW()
FROM candidate
WHERE q.id = candidate.id
RETURNING q.*;
```

### 9.3 Active-call rule

An active call is scoped by `lane_id`, not tenant. A lane is busy if it has a session without `ended_at` and a nonterminal call state. Another lane in the same tenant may continue.

### 9.4 Number rotation

For each lane:

1. Read `rotation_cursor`, initially 0.
2. Attempt position 0 or 1.
3. If selected number is disabled/error or still cooling down, try the other number.
4. If neither number is healthy, set lane Error and do not claim a lead.
5. After SignalWire accepts the dial, set cursor to `1 - current_position`.
6. Persist caller number on queue item, call session, lead call metadata, and event log.

Do not derive rotation from a count query. Counts can race under parallel workers.

### 9.5 Between-call timing

- One active call per lane.
- Default lane cooldown: four seconds after terminal completion.
- Add a global dial-start semaphore so two lanes do not send SignalWire create requests in the same millisecond.
- Default global stagger: one second between new outbound dial requests.
- Cooldown is technical pacing, not the removed daily-call or calls-per-minute product limit.

### 9.6 Finalization rule

The next call cannot start until all conditions are true:

- SignalWire status is terminal or the server has safely timed out the provider call.
- `ai_call_sessions.ended_at` is populated.
- Queue item is terminal.
- Lead result/update transaction has committed.
- Live monitor received a final result event.
- Lane `next_dial_after` has passed.

Use one idempotent `finalizeLaneCall()` service from provider callback, bridge shutdown, timeout recovery, and manual end. It must tolerate being called more than once.

---

## 10. SignalWire Integration

### 10.1 Credentials and numbers

- SignalWire project credentials remain environment secrets.
- Caller IDs come from the `phone_numbers` table, not `SIGNALWIRE_PHONE_NUMBER` CSV.
- Validate `provider = 'signalwire'`, `status = 'active'`, and outbound voice capability.
- Normalize all numbers to E.164 before use.

### 10.2 Outbound call metadata

Before calling SignalWire, create the call session and queue snapshot. The TwiML URL should identify the session using an opaque UUID:

```text
/api/voice/twiml/outbound?sessionId=<uuid>
```

The server resolves tenant, lane, lead, agent, script version, and caller ID from the database. Do not trust tenant or lead identity directly from unsigned query parameters.

### 10.3 Callback handling

Status callbacks update:

- Queue item state.
- Call session state.
- Lane event stream.
- Lead call metadata.
- Live browser status.

Callbacks must be idempotent and reject invalid provider signatures according to the existing SignalWire compatibility validation strategy.

### 10.4 Provider capacity preflight

Before enabling all four lanes in production:

- Confirm the actual SignalWire account's outbound concurrency and call-per-second allowance.
- Confirm all eight caller IDs belong to the intended account.
- Confirm the public HTTPS callback URL points to VM `34.27.29.88` through the production domain/proxy.
- Run one dial per number and save its provider SID/result.

---

## 11. Deepgram Voice Agent Integration

### 11.1 One isolated session per call

Every live call gets:

- One SignalWire media stream.
- One Deepgram Voice Agent WebSocket.
- One transcript collection.
- One lead context.
- One immutable script-version snapshot.
- One agent voice.

Never share conversation history, prompt state, timers, or company name between calls.

### 11.2 Provider changes

Change `buildDeepgramSettings()` so it accepts:

```js
{
  lead,
  agentConfig,
  compiledScriptPrompt,
  scriptVersionId,
  laneId,
  callSessionId
}
```

Remove plumbing sales copy from the provider as the primary source of script content. Keep protected voice and tool policies in code. A temporary backward-compatible plumbing fallback may remain only while old single-agent calling is enabled.

### 11.3 Prompt size and speaking behavior

- Compile short voice-ready instructions.
- One or two sentences per turn.
- Ask one question, then listen.
- Avoid markdown in spoken output.
- Keep reliability-critical silence, tool gating, DNC, and provider cleanup in server code.

### 11.4 Tools

Retain existing protected tools:

- `wait_for_human`
- `save_call_note`
- `mark_do_not_call`
- `end_call`

Use `defer_until_eot: true` for CRM mutations and call-ending tools. The script builder controls when a tool should be used through validated CTA/outcome blocks; users do not edit raw function schemas.

### 11.5 Global concurrency cap

Set the server cap to at least four only after lane isolation is complete. The bridge should reject calls above the configured global cap without affecting existing calls. Log lane ID and call SID with every bridge event.

---

## 12. Browser Monitoring Design

### 12.1 Socket subscription

Change the call monitor from one subscribed call to a set of calls:

- Event `subscribe_calls` accepts up to four call SIDs.
- Socket joins each authorized `call_<sid>` room.
- Subscribing to a new call must not automatically leave the other three.
- Event `unsubscribe_call` removes one room.
- Tenant authorization is checked for every SID.

### 12.2 Audio behavior

Four simultaneous audio streams must not all play together.

- Show transcripts and activity for all four lanes.
- User selects one lane as `Listen Live`.
- Browser buffers or discards audio for unselected lanes according to memory limits, but continues receiving transcripts/status.
- Switching selected lane clears the previous lane's pending audio buffer.
- Closing the monitor does not stop the call.

### 12.3 UI components

Create:

```text
apps/web/src/components/multi-calling/
  LaneCard.tsx
  LaneAssignmentWizard.tsx
  LaneNumberPair.tsx
  LaneControls.tsx
  MultiCallMonitor.tsx
  LaneTranscriptPanel.tsx
  LaneHealthBadge.tsx
  RecentLaneCalls.tsx

apps/web/src/components/script-builder/
  ScriptBuilder.tsx
  ElementPalette.tsx
  ScriptCanvas.tsx
  BlockInspector.tsx
  ValidationPanel.tsx
  PromptPreview.tsx
  nodes/OpeningNode.tsx
  nodes/OfferNode.tsx
  nodes/QuestionsNode.tsx
  nodes/ObjectionRouterNode.tsx
  nodes/PricingNode.tsx
  nodes/MeetingCtaNode.tsx
  nodes/FollowupNode.tsx
  nodes/SendInformationNode.tsx
  nodes/AdditionalInstructionsNode.tsx
  nodes/GoodbyeNode.tsx
```

Create API client and types:

```text
apps/web/src/services/multiCallingApi.ts
apps/web/src/types/multi-calling.ts
apps/web/src/hooks/useMultiCallMonitor.ts
apps/web/src/hooks/useScriptDraft.ts
```

---

## 13. Error Handling

### Lane-level errors

- Number pair unavailable: lane becomes Error; other lanes continue.
- No published script: Start returns 409.
- Queue empty: lane remains Running but Idle, unless product decision later auto-pauses it.
- SignalWire create fails: queue item returns to queued with bounded backoff or becomes failed after retry policy.
- Deepgram connect fails: terminate provider call, finalize session as failed, cool down lane.
- Worker restart: stale claimed items are recovered by lease expiry.

### Retry policy

- Never immediate-redial the same destination.
- Provider setup failure: exponential backoff on queue item, for example 1, 5, and 15 minutes, maximum three attempts.
- Busy/no-answer/voicemail follow the campaign retry policy configured later; do not automatically retry in the same run unless explicitly configured.
- DNC and firm not-interested are terminal.

### Idempotency

- Lane assignment uses a request idempotency key.
- Publish uses draft version and compiled hash.
- SignalWire callback processing stores provider event identity where available.
- Finalization uses a row lock and no-ops when already terminal.

---

## 14. Observability and Records

Every structured log line should include when available:

- `tenantId`
- `laneId`
- `slotNumber`
- `queueItemId`
- `sessionId`
- `callSid`
- `leadId`
- `phoneNumberId`
- `scriptVersionId`
- `event`
- `durationMs`
- `errorCode`

Required lane metrics:

- Queue depth.
- Active calls.
- Dial attempts.
- Ringing, answered, voicemail, IVR, no-answer, interested, not-interested, follow-up.
- Provider errors.
- Average first-response latency.
- Average call duration.
- Number health by caller ID.
- Results by script version.

Persist full STT/agent transcript in `ai_call_sessions.transcript`. Show a call-detail link from lane history. Script version and compiled hash make each conversation reproducible.

---

## 15. Security and Tenant Isolation

- Every query includes authenticated `tenant_id`.
- Never accept tenant ID from the request body.
- Verify that niche, agent, phone numbers, script, queue leads, and session all belong to the same tenant.
- Only owner/admin/manager may assign lanes, publish scripts, or start/pause campaigns.
- Do not expose SignalWire tokens, Deepgram keys, or compiled protected policies to editable browser fields.
- Prompt preview may display compiled sales instructions but should label protected rules read-only.
- Audit lane assignment, script publication, start, pause, drain, manual end, and removal.

---

## 16. Compatibility and Migration

### Feature flags

- Existing page: `ENABLE_AI_OUTBOUND_CALLER`.
- New worker/page: `ENABLE_MULTI_AI_CALLING`.

During rollout, a tenant must use one worker mode only. Add a server guard that refuses to start the new lanes while the old tenant-wide controller is running, and refuses to start the old controller while any lane is Running or Draining.

### Initial data migration

Do not automatically split live production configuration into four lanes.

Provide an owner-only migration action:

1. Create four empty slots.
2. Import the existing outbound agent into Agent 1.
3. Select its niche.
4. Select two numbers from the database.
5. Convert the saved prompt into a draft script or start from a new template.
6. Publish and start only after review.

### Rollback

- Pause all new lanes.
- Allow live calls to finish or end them explicitly.
- Disable `ENABLE_MULTI_AI_CALLING`.
- Re-enable old worker only after there are no active new-lane sessions.
- Keep new tables and history; rollback does not drop data.

---

## 17. Implementation Sequence

### Phase 0: Safety snapshot

- Record current production environment names, PM2 process, DB migration head, SignalWire number list, and active worker flags.
- Add feature flag with default false.
- Confirm old single-agent flow still starts and stops normally.

### Phase 1: Database and domain types

- Add migration 030.
- Add backend Zod domain schemas.
- Add frontend TypeScript contracts.
- Add four empty slots on first list request or an explicit initialization transaction.

Exit condition: four empty lane records can be listed without affecting old calling.

### Phase 2: Script Builder backend

- Implement node schemas.
- Implement graph validator.
- Implement compiler and canonical JSON hash.
- Implement draft, validate, preview, publish, clone, and rollback APIs.
- Seed a protected plumbing template.

Exit condition: a JSON script can be published and produces the same compiled hash for the same canonical definition.

### Phase 3: Script Builder frontend

- Add `@xyflow/react`.
- Build palette, custom nodes, inspector, edges, autosave, validation, and preview.
- Build assignment wizard integration.

Exit condition: an owner can build, validate, publish, reload, and clone a script without editing raw JSON.

### Phase 4: Lane configuration APIs and UI

- Implement assignment transaction and capacity conflicts.
- Implement number exclusivity and lane cards.
- Implement Start, Pause, Drain, Remove Assignment.

Exit condition: four unique niches and eight unique numbers can be assigned; fifth niche and duplicate number are blocked.

### Phase 5: Multi-lane worker

- Implement per-lane lock, queue, rotation cursor, immutable session snapshot, cooldown, and finalizer.
- Keep it disabled in production.

Exit condition: local/staging calls from two lanes cannot claim the same lead or number.

### Phase 6: Voice bridge and monitoring

- Load compiled script by session version.
- Support four isolated Deepgram connections.
- Add multi-room browser subscription.
- Show four transcripts and one selected audio stream.

Exit condition: four calls show correct company, agent, script, and caller ID without cross-call leakage.

### Phase 7: Controlled production rollout

1. One lane, one call at a time.
2. One lane for a full small batch.
3. Two lanes concurrently.
4. Four lanes concurrently.

At each step verify callbacks, finalization, transcripts, outcomes, number rotation, and next-call timing before increasing concurrency.

---

## 18. Verification Checklist

### Assignment

- Four lane slots always exist.
- A niche cannot be active in two lanes.
- An agent cannot be active in two lanes.
- A phone number cannot be active in two lanes.
- Exactly two numbers are required.
- A fifth niche returns the defined 409 error.

### Script Builder

- Palette click adds a node.
- Drag/drop adds it at the intended point.
- Invalid edges are rejected.
- Draft reloads after browser refresh.
- Publish rejects orphan nodes, unknown variables, cycles, and missing Opening.
- Published version cannot be edited.
- New publication does not alter active calls.
- Prompt preview matches the stored compiled hash.

### Calling

- Lane 1 alternates only its A/B pair.
- Lane 2 never uses Lane 1 numbers.
- Four lanes can have one active call each.
- One lane failure does not pause the others.
- Pause blocks new calls but does not hang up current call.
- Drain becomes Paused after finalization.
- Removing an assignment is blocked during a live call.
- Browser closure does not stop server calls.

### Data integrity

- Every session has lane, number, script version, agent, niche/lead, and queue item identity.
- Every terminal call has `ended_at`, duration, transcript, and outcome or explicit failure reason.
- Finalization can run twice without duplicate side effects.
- Worker restart does not duplicate the active destination call.

### Monitoring

- All four transcripts update independently.
- Only selected lane audio plays.
- Switching audio clears the prior buffer.
- Final result is attached to the correct lane and lead.

---

## 19. Coding Rules for the Implementing Agent

1. Do not modify production prompt behavior globally while building the data model.
2. Do not enable four-call concurrency before lane isolation is complete.
3. Do not use the old global environment phone list for lane rotation.
4. Do not put new route logic into `crm.ts`; use the new route and services.
5. Do not let the browser execute campaign calls.
6. Do not allow raw JavaScript expressions in script JSON.
7. Do not allow user blocks to override protected policies.
8. Do not mutate published script versions.
9. Do not start a new lane call until the previous lane call is fully finalized.
10. Do not deploy all four lanes at once; follow the controlled rollout.

---

## 20. Exact Existing-File Change Matrix

This is the starting checklist for the coding agent.

### Files to modify

#### `apps/api/src/index.ts`

- Register the new `multi-calling.ts` Fastify route.
- Start the new worker only when its feature flag is true.
- Keep the existing voice-agent Express and Socket.IO mounts.

#### `apps/api/src/routes/crm.ts`

- Do not add the new lane endpoints here.
- Extract the reusable niche/contact-to-enrichment queue logic from `/v1/leads/queue-ai` into a service.
- Keep legacy endpoints working.
- Add a mutual-exclusion check between legacy tenant calling and new running lanes.

#### `apps/api/src/routes/google-maps.ts`

- Ensure scraper-created enrichment rows receive the actual `niche_id` when a niche is selected.
- After a successful save, invoke an idempotent auto-queue hook for a configured lane when enabled.
- Scraper failure must not create queue items.

#### `apps/api/src/routes/phone-numbers.ts`

- Reuse the list endpoint as the number source.
- Add lane assignment/health information to the manager response or provide it through the new available-numbers endpoint.
- Add an admin-only reconciliation operation if the eight SignalWire numbers are not all represented locally.

#### `apps/api/src/workers/outbound-caller.js`

- Keep as the legacy worker.
- Extract small provider/helper functions only when shared safely.
- Do not retrofit the tenant-wide loop into a four-lane loop in place.

#### `apps/api/src/voice-agent/providers/deepgram-agent.js`

- Preserve listen/audio/speak provider construction and protected tools.
- Accept compiled script prompt and immutable call snapshot.
- Use `agentConfig.speech_speed` with environment fallback.
- Send speed only for a supporting model and report whether it is effective.
- Move plumbing sales copy into a seed script template; keep temporary fallback only for legacy mode.

#### `apps/api/src/voice-agent/detection/call-state-detector.js`

- Preserve current human-message exception, screening, voicemail, IVR, hold/transfer, and recording-announcement ordering.
- Do not treat `please hold` or `recorded for quality` as terminal.
- Expose classification through a shared service API if necessary, but retain one canonical implementation.

#### `apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js`

- Add `laneId`, `queueItemId`, `phoneNumberId`, `scriptVersionId`, and compiled hash to call context.
- Load prompt from the pinned session version.
- Keep separate timers and transcript arrays per context.
- Replace scattered terminal updates with `finalizeLaneCall()`.
- Enforce the outcome precedence from section 2.4.
- Broadcast lane identity with live status/transcript events.

#### `apps/api/src/voice-agent/routes/twiml.js`

- Accept opaque `sessionId` for new-lane calls.
- Resolve all call identities from DB.
- Preserve legacy parameter handling behind legacy mode.
- Route terminal callbacks into the idempotent finalizer.

#### `apps/api/src/voice-agent/services/ai-call-session.service.js`

- Extend create/update/end calls with new immutable identity fields.
- Provide one transaction-safe finalization method or delegate to the lane finalizer.

#### `apps/api/src/voice-agent/services/post-call/processor.js`

- Add a guard: do nothing when an authoritative outcome/source already exists.
- It may fill summary/analytics, but cannot downgrade or overwrite explicit outcomes.

#### `apps/api/src/voice-agent/websocket/call-monitor.js`

- Replace single `socket.data.callSid` with a set of up to four authorized SIDs.
- Add `subscribe_calls` while keeping `subscribe_call` temporarily for legacy UI.
- Include `laneId` in new events.
- Preserve PCM conversion.

#### `apps/web/src/App.tsx`

- Add lazy/imported route `/multi-ai-calling`.

#### `apps/web/src/components/Layout.tsx`

- Add `Multi AI Calling` nav item.
- Include it in the existing `ai_calling` permission filter.

#### `apps/web/src/pages/GoogleMapScraper.tsx`

- Preserve current Save to Niche interaction.
- Optionally display `This niche is connected to Agent N` after lane assignment data is available.
- Do not make scraper UI responsible for starting calls.

#### `apps/web/src/pages/AgentPipeline.tsx`

- Keep legacy behavior.
- Reuse/extract pure outcome badge helpers if required.
- Do not convert its single `activeCallSid` state into an array; the new page owns multi-call state.

### Files to create

- Migration `apps/api/src/db/migrations/030_multi_ai_calling.sql`.
- Backend route `apps/api/src/routes/multi-calling.ts`.
- Backend service directory listed in section 8.
- Worker `apps/api/src/workers/multi-lane-outbound-caller.js`.
- Frontend page, components, service, hooks, and types listed in section 12.3.
- Seed/template definition such as `apps/api/src/services/multi-calling/templates/plumbing-missed-call-v1.json`.

### Existing behavior that must not regress

- Current single-agent page still works while legacy mode is selected.
- Manual Call Now still creates one valid call and correct monitor popup.
- AI voice is audible to the prospect.
- Live monitor can hear both AI and prospect for the selected call.
- Normal human greetings receive the opening.
- Please-hold/recorded-for-quality waits for a human.
- Press-number menus end as IVR.
- Voicemail ends and is labeled Voicemail.
- Explicit rejection becomes Not Interested.
- Explicit interest becomes Interested.
- Exact callback becomes Follow-up with date/time/timezone and a task.
- DNC prevents all future lane queueing.
- Transcript and result remain tied to the correct company and call.

---

## 21. Final Implementation Decision

The correct solution is a four-lane calling platform with a structured visual script builder and a deterministic server compiler. The JSON graph is the editable source, the published script version is the audit snapshot, and the compiled prompt is what Deepgram receives. SignalWire caller IDs, queue claims, active-call checks, and browser monitoring are isolated by lane.

This design gives the user the requested n8n-style experience without making critical telephony behavior dependent on an unrestricted visual graph or a single oversized editable prompt.
