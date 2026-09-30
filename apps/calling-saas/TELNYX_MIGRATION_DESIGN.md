# Jento Calling — Telnyx migration design

## Goal

Replace SignalWire as the telephony provider while preserving Jento's existing multi-tenant product model: authentication, organizations, team access, leads, wallet, billing, call history and the browser dialer UX.

The migration is not a frontend-only SDK swap. Jento remains the policy and billing source of truth; Telnyx supplies WebRTC/PSTN, phone numbers, recordings and (later) SMS.

## Migration boundary: there are three calling products

The current codebase uses SignalWire in three distinct paths. They must be migrated separately, behind the same provider interface, rather than being treated as one SDK replacement.

| Path | Existing implementation | Telnyx target | Release |
| --- | --- | --- | --- |
| Human browser dialer | `src/hooks/useWebRTCDevice.ts` + `calls-module/routes/signalwire.routes.js` | Telnyx WebRTC SDK with a server-issued login token | Phase 1 |
| Numbers, inbound routing and call records | `routes/phone-numbers.ts`, `signalwire.routes.js`, `call-events.service.js` | Telnyx numbers, SIP connection/routing and verified webhooks | Phase 2 |
| AI campaign calls and bidirectional audio | `workers/outbound-caller.js`, `routes/crm.ts`, `voice-agent/websocket/media-server.js` | Separate Telnyx Voice API / media-stream proof of concept | Later, after human calling is stable |

The AI path must not be silently converted as part of the browser-dialer release. It currently relies on SignalWire Compatibility API/TwiML callbacks and SignalWire Media Streams; it needs a dedicated Telnyx media/control spike with end-to-end audio, DTMF, interruption, recording and post-call tests.

## Current application facts

- This repository is a React/Vite frontend.
- `src/hooks/useWebRTCDevice.ts` imports `@signalwire/js` and creates the current browser phone.
- `src/services/callsApi.ts` calls the deployed API at `https://api.jentoai.pro/api`.
- The application already has organizations/tenants, agents, phone numbers, wallets, call authorization/settlement, call logs, recordings and team-access UI.
- The sibling `../api` application contains the backend: a Fastify host mounts the Express calls module, including `calls-module/routes/signalwire.routes.js`, number routes, migrations, wallet reservations and webhook handling.

## Target architecture

```text
React/Vite browser                   Jento backend                         Telnyx
──────────────────                  ─────────────                         ──────
Dialer + CRM                         Auth and tenant policy                SIP Connection + WebRTC
short-lived login token  <─────────  Creates Telnyx WebRTC login token     PSTN voice
WebRTC media            ───────────────────────────────────────────────>  Number inventory
Call state UI                        Caller-ID ownership                   Messaging profiles
                                   Wallet reservation / settlement          10DLC resources
                                   Audit + database                         Event webhooks
                                   Webhook verifier          <────────────  Voice/SMS events
```

Media must flow directly between browser and Telnyx. API keys, wallet checks, caller-ID authorization, billing, number ordering and webhooks must remain server-side.

## Provider configuration

Create and configure these resources before application code is enabled:

1. Telnyx API key in the backend's secret store only. It must never appear in Vite environment variables or browser code.
2. A Telnyx SIP Connection with WebRTC enabled.
3. A webhook/routing application for voice events and inbound call routing.
4. A Messaging Profile with an inbound webhook. Do not attach it to external customer numbers until SMS compliance is complete.
5. A public HTTPS endpoint: `POST /v1/webhooks/telnyx`.
6. Signature verification using Telnyx's Ed25519 webhook headers, plus a durable event-deduplication store.

## Voice: outbound browser-call design

### 1. Register browser device

The frontend requests `GET /v1/telephony/token`. The backend verifies the Jento JWT and returns only:

```json
{
  "provider": "telnyx",
  "loginToken": "short-lived Telnyx WebRTC token",
  "callerId": "+1...",
  "agentId": "...",
  "expiresAt": "..."
}
```

The frontend initializes `@telnyx/webrtc` (`TelnyxRTC`) with `loginToken`, listens for readiness and call notifications, and attaches a remote audio element. It never receives a Telnyx account API key or reusable SIP password.

### 2. Authorize before dialing

Before `TelnyxRTC.newCall()` the browser calls:

`POST /v1/telephony/authorize-outbound`

The backend must verify all of the following:

- user is an active member of the organization;
- agent has `can_call` permission;
- caller ID is active and assigned to this organization/agent;
- destination is valid E.164 and does not match a local DNC block;
- organization has balance and has not exceeded call/seat/number limits;
- destination country and plan are allowed;
- no active call is already open for this agent.

On approval it creates an idempotent `call_intent`, reserves the maximum allowed wallet amount, and returns the approved destination, caller ID, `trackedCallId` and maximum duration. The request should carry an idempotency key so a double click cannot reserve twice.

### 3. Link the provider call

After the browser creates the Telnyx call, it posts the provider call ID to:

`POST /v1/telephony/calls/started`

The backend links the provider call to `call_intent` and records initial metadata. Browser state is used for immediate UI changes only.

### 4. Close only from authoritative provider events

Telnyx webhooks update call lifecycle, duration, recording and cost. The worker settles the reservation exactly once after terminal state. The existing browser-side `settleOutboundCall` timer must be changed to visual telemetry only; it cannot be the billing authority.

## Inbound voice design

1. A Telnyx number receives an inbound call.
2. Telnyx posts a verified event to Jento.
3. Jento resolves `phone_numbers.e164` to `organization_id`.
4. Routing policy selects assigned agent, ring group or voicemail.
5. Jento sends/returns the provider instruction and writes the call event.
6. Assigned browser agent receives the TelnyxRTC incoming-call notification and can answer/reject.

Phase 1 may omit inbound calls if the product goal is outbound calling. The database and number model should still reserve the routing fields now.

## Number management

Keep the existing Jento endpoints, but proxy Telnyx through the backend:

- `GET /v1/phone-numbers/search`: calls Telnyx available-number search with country/area code/features, returns current price/capabilities to Jento UI.
- `POST /v1/phone-numbers/purchase`: validates organization plan and wallet, creates the order server-side, attaches the voice connection, persists the local number, then optionally assigns an agent.
- `POST /v1/phone-numbers/:id/assign`: assigns one organization number to an agent or shared team pool.
- `POST /v1/phone-numbers/:id/release`: admin-only, explicit confirmation, with local state retained for audit.

Never trust `phone_number` alone for ownership. Every number record must contain `organization_id`, provider number ID, E.164 value, capabilities, voice connection ID, messaging profile ID, status and assigned agent ID.

## SMS and 10DLC: a separate locked product

Voice is enabled independently. SMS starts as `locked` for every external organization.

```text
voice enabled
  → customer pays SMS activation
  → customer submits legal business + campaign + opt-in evidence
  → Telnyx Brand pending
  → Telnyx Campaign pending
  → approved and number attached to Messaging Profile
  → SMS enabled
```

Each external business has its own Telnyx 10DLC brand/campaign. Jento's master Telnyx account is not a way to put unrelated businesses under one brand.

The SMS sender must check an immutable consent ledger and opt-out state for every outbound send. A `STOP` inbound message immediately sets `sms_opted_out=true` and blocks all future sends to that phone number.

## Required database additions

```text
telephony_provider_settings
  organization_id, provider, connection_id, messaging_profile_id, enabled

phone_numbers
  id, organization_id, provider_number_id, e164, status, capabilities,
  voice_connection_id, messaging_profile_id, assigned_agent_id

call_intents
  id, organization_id, agent_id, contact_id, caller_number_id, destination,
  reservation_id, idempotency_key, provider_call_id, state, expires_at

call_events
  id, call_id, provider_event_id, type, occurred_at, payload_reference

recordings
  id, call_id, provider_recording_id, status, secure_url, duration_seconds

telnyx_brands
  organization_id, provider_brand_id, legal_name, entity_type, status, failure_reason

telnyx_campaigns
  organization_id, provider_campaign_id, brand_id, use_case, status, failure_reason

sms_consents
  organization_id, contact_id, e164, method, disclosure_version,
  evidence_reference, agent_id, granted_at, revoked_at

sms_messages
  organization_id, conversation_id, provider_message_id, direction, status,
  from_e164, to_e164, body_reference, sent_at, delivered_at, error_code

webhook_events
  provider, provider_event_id UNIQUE, received_at, verified_at, type,
  payload_reference, processing_state
```

Every new table must include `organization_id` and queries must scope by it.

## Webhook processing

`POST /v1/webhooks/telnyx` must:

1. retain the raw request body;
2. validate Telnyx Ed25519 signature and timestamp;
3. atomically insert the provider event ID; duplicates return success without repeating work;
4. persist the event before expensive processing;
5. enqueue projection/notifications/recording fetches;
6. return HTTP 2xx quickly;
7. update WebSocket/SSE clients only after the transaction succeeds.

Events to handle initially:

- voice: initiated, ringing, answered, hangup, recording saved;
- messaging: sent, finalized/delivered/failed, received;
- 10DLC: brand and campaign status updates.

## Frontend change plan

1. Replace `@signalwire/js` with `@telnyx/webrtc`.
2. Rewrite `src/hooks/useWebRTCDevice.ts` as a provider-neutral adapter preserving current UI states: `offline`, `registering`, `ready`, `error`, and `idle`, `dialing`, `ringing`, `incoming`, `connected`, `ended`.
3. Keep `DialerPopup.tsx`, leads, call history and Team Access unchanged as far as possible.
4. Update `callsApi.getToken()` response from SignalWire `projectId/token` to Telnyx `loginToken`.
5. Add a number status/capability model instead of hard-coded `$1.50/mo` and “active.”
6. Do not migrate transfer, provider recording controls or live transcription until baseline outbound calls and webhooks have passed a pilot; expose these behind feature flags.

## Backend replacement map

Create a provider-neutral `telephony` service boundary in `../api`; route handlers and database consumers should depend on it, not on a SignalWire SDK.

| Current backend component | Change |
| --- | --- |
| `calls-module/config/signalwire.js` | Replace with `telephony/telnyx.client.js`, `telephony/provider.js`, and a provider configuration resolver. The Telnyx API key belongs only in server secret configuration. |
| `calls-module/routes/signalwire.routes.js` | Split into provider-neutral `telephony.routes.js`, a Telnyx token endpoint, and a Telnyx webhook endpoint. Keep request/response contracts that the frontend already consumes where possible. |
| `routes/phone-numbers.ts` and admin number routes | Swap SignalWire search/purchase calls for Telnyx V2 phone-number inventory/order calls. Persist returned capability and price data rather than hard-coding `$1.50/mo`. |
| `calls-module/services/call-events.service.js` | Add a Telnyx event translator that maps Telnyx events to existing `calls`/Socket.IO projections; preserve raw provider events separately. |
| `calls-module/routes/calls.routes.js` | Keep Jento authorization checks. Replace SignalWire recording/transfer calls only after Telnyx-specific command behavior is validated against browser-originated calls. |
| `src/db/migrations/021_agents_table.sql` and direct SQL references | Add provider-neutral columns or a dedicated number-assignment table; do not add more `signalwire_*` columns. Migrate reads progressively. |
| `workers/outbound-caller.js`, `routes/crm.ts`, `voice-agent/*` | Leave on SignalWire until an isolated Telnyx AI-call proof of concept passes. Then switch through `telephony_provider` feature flags. |

## Database migration strategy

Do not rename/drop live SignalWire columns in the first migration. Add neutral columns and backfill first:

1. Add `telephony_provider` to `tenants`, defaulting to `signalwire`.
2. Add `provider`, `provider_number_id`, `voice_connection_id`, `messaging_profile_id` and `assigned_agent_id` to a normalized number-assignment model.
3. Add `provider_call_id`, `provider_call_control_id` (nullable), `provider_metadata` and an immutable `webhook_events` table.
4. Backfill current `signalwire_phone_number`/`signalwire_phone_sid` into the neutral model without changing live reads.
5. Deploy code that reads the neutral model first and falls back to legacy SignalWire fields during pilot.
6. Only after every active tenant is cut over and history is exported/retained should legacy references be retired in a separately approved migration.

All schema changes must be delivered as a numbered migration in `../api/src/db/migrations`, applied in staging first and verified with the production deployment's migration process.

## Rollout plan

| Phase | Work | Gate |
| --- | --- | --- |
| 0 | Telnyx account/configuration, secrets, webhook verifier, provider feature flag | no customer traffic |
| 1 | outbound Telnyx WebRTC adapter + server authorization/settlement | internal 10–15 agents |
| 2 | number search, purchase, caller-ID assignment and inbound routing | selected pilot tenant |
| 3 | SMS compliance onboarding, consent, inbox and opt-out enforcement | paid opt-in SMS tenants only |
| 4 | usage reconciliation, metrics, automated alerts, SignalWire read-only fallback | broad rollout |
| 5 | after stable usage and export validation, remove SignalWire credentials and dependencies | full cutover |

During the rollout, use `telephony_provider` per organization. Existing SignalWire history remains readable. New calls must use exactly one provider; never dual-dial a contact. Capture the existing number-to-tenant-to-agent mapping before any porting/reassignment.

## Implementation prerequisites

Before code changes, confirm:

1. Is the initial release voice-only for US/Canada, with SMS disabled for external customers?
2. Are agent caller IDs dedicated or shared by an organization?
3. Do existing SignalWire numbers need porting, or will Telnyx numbers be newly purchased?
4. Which repository/branch deployment path should be used for the sibling `../api` backend and its database migrations?

## Sources

- Telnyx JavaScript WebRTC SDK: https://developers.telnyx.com/development/webrtc/js-sdk/quickstart/index
- Telnyx number search: https://developers.telnyx.com/docs/numbers/phone-numbers/number-search/
- Telnyx 10DLC Brand API: https://developers.telnyx.com/api-reference/brands/get-brand
- Telnyx webhook signature guidance: https://developers.telnyx.com/llms.txt
