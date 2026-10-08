# P1 consolidated remaining fixes — latest source review

Date: 5 October 2026.

Reviewed the latest supplied Round 3 implementation transcript against current local source in `/home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas`, including uncommitted changes on top of `5ef25171`. This document supersedes the current-status findings in the earlier Round 3 review. Earlier design requirements still apply.

## Decision and evidence limits

P1 is not complete. Several real fixes are present, but some claimed fixes are absent from the final source, and the new outcome protection causes contradictory results.

This reviewer inspected source only. No application source was edited; no tests, builds, database mutations, deployments or calls were run. The attachment lists build and migration commands but provides no runtime scenario results. Live VM/schema/audio behavior is not independently verified. Do not treat this review as authorization to deploy or start calls.

## Fixes now present — retain these

- Settings construction, provider inspection and logging are now in the same guarded scope. The previous successful-path `settings` ReferenceError is fixed.
- The failure handler no longer references an undefined `fastify` object.
- Migration 034 now adds only the missing prompt column with `IF NOT EXISTS`; it no longer duplicates the hash column from 030. Migration 035 declares a positive revision default.
- Publish returns the replacement draft ID/revision, and frontend now consumes that response. Create returns its first draft identity.
- `offerName` and `meetingDuration` are declared in the settings schema, and objection attempt limits are included in the compiler policy.
- Backend speech validation no longer accepts a title as authored dialogue.
- Objection display uses `intent` and `response` rather than the incorrect `trigger` field.
- End nodes are included in the step output. Their explicit action is still missing, as described below.
- PUT schema errors are mapped to structured 400 responses.
- The unconditional email-to-Interested upgrade was removed. A task guard was added; its interaction with preserved outcomes still needs correction.
- Keep the existing tenant checks, transaction locks, normalized compilation edges and refusal-path restrictions.

## 1. P1 — new migrations are not registered in the deployment path

**Files:** `deploy-to-gcp.sh:75`, `apps/api/run-migration.js`, `apps/api/src/db/migrations/034_call_session_compiled_script.sql`, `035_script_version_revision.sql`.

The deployment migration array still ends at 033. The claimed registration of 034/035 is absent. The transcript creates `patch_deploy.py` but does not show it being executed. The old `run-migration.js` command uses inline schema setup; it does not load the two new files. Successful execution of that command would not establish that these columns exist.

**Required fix:** Register both migrations in the actual migration entry point, preserve ordering and error propagation, and verify the required columns through that path before starting consumers. Do not mask a missing schema with duplicate-column catch-and-continue behavior. Commit the intended migration files with the source change.

**Related snapshot defect:** `loadSessionContext()` in `deepgram-signalwire-bridge.js:254–269` selects `acs.*` and then `sv.compiled_prompt AS compiled_script_prompt`. Once the new session column exists, the duplicate result key can replace the captured session prompt with the joined version prompt. Use one unambiguous output field, preferring the stored session snapshot and falling back only for legacy rows. Keep prompt/hash/version consistent.

**Evidence to supply:** Actual registered migration list, migration result, column definitions, session insert/read-back and matching prompt/hash/version. State which database was used; do not substitute build success.

## 2. P1 — Publish revision protection is absent, and frontend sends stale values

**Files:** `apps/api/src/routes/multi-calling.ts:343,523,556`, `apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx:564`.

The final Publish route does not read or compare `expectedDraftId` / `expectedRevision` at all. It publishes whichever draft it retrieves under the lock. This contradicts the latest implementation claim and permits another tab's intervening Save to be published without this caller reviewing it.

Frontend PUT/Create responses call `setDraftId` / `setDraftRevision`, but the immediately following Publish request reads the old values captured by `handlePublish`. React state setters do not update that closure. This is hidden while the backend ignores those fields; adding the missing backend guard alone will cause normal Publish requests to conflict.

PUT also makes its expected-value checks optional through truthiness. Missing/zero values bypass the intended revision protection.

**Fix together:**

1. Require valid expected draft identity and positive integer revision for existing draft mutations and publication. Reject malformed input cleanly and stale values with 409.
2. Check the locked draft's identity/revision before compiling or publishing. Retain tenant checks and parent locking.
3. Hold the authoritative PUT/Create response values in local variables and use those exact variables in the next Publish request.
4. Continue consuming the replacement draft identity/revision returned by Publish.
5. Persist the newly created parent identity before attempting Publish. A failed new-script Publish must retry that parent, not create a duplicate.
6. Use one Save/Publish mutation guard so overlapping button actions cannot race each other. Preserve local edits on conflict.

**Also restore Create validation:** POST Create currently executes bare `ScriptSchema.parse(definition)` before its transaction try/catch (`multi-calling.ts:457`). The structured Create schema-error mapping from the prior review is absent in the final source. Use the same controlled 400 issue contract as PUT/Validate/Publish.

**Evidence to supply:** Save → Publish → edit → Save → Publish; two-tab intervening Save; missing/stale revisions; new-script failed Publish retry; invalid Create. Show response IDs/revisions and stored definition/version.

## 3. P1 — outcome protection blocks opt-out and makes CRM fields disagree

**File:** `apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js:367–447` (`save_call_note`).

The new CASE preserves any previous `not_interested`, `do_not_call` or `followup` for every incoming outcome. This is too broad: an existing Follow-up can never become Not Interested or Do Not Call. Meanwhile other fields still use the requested `$1` outcome rather than `s.final_outcome`.

Concrete paths implied by the current SQL:

- Previous Follow-up → incoming Do Not Call: session outcome/lead stage remain Follow-up, opt-out flag becomes true, schedule is cleared, and raw AI outcome says Do Not Call. Different parts of the same record disagree.
- Previous Follow-up → incoming Not Interested: Follow-up remains the final outcome but its schedule is cleared.
- Previous Not Interested → incoming Follow-up: final rejection is retained while a future `next_followup_at` is written.
- Previous Interested → generic Called: Interested is not in the protected set and can be erased.
- Previous Follow-up → generic Called plus email: task condition accepts the email while final outcome remains Follow-up, but task due time uses the incoming follow-up timestamp, which can be null instead of the existing schedule.
- Previous Follow-up → incoming opt-out plus email: final outcome remains Follow-up, so the task guard can still permit an email task despite the new opt-out flag.
- The tool response reports the requested outcome/time, not the actual retained database outcome/time.

The initial `session_check` is an unlocked read. Concurrent tool calls can base their decisions on stale prior state. The new check should not be described as idempotent or fully race-safe.

**Required design:** Use an explicit outcome transition policy under a session row lock, with Do Not Call taking priority and remaining sticky. Generic completion must not erase confirmed intent or a scheduled follow-up. A new explicit rejection must be able to supersede a previous Follow-up. Compute the accepted outcome/schedule once and use it for session, lead stage, raw metadata, notes, task creation and tool response. Preserve existing confirmed schedule when no new accepted schedule is provided.

Store factual email/name/phone independently from interest classification. Check the effective lead opt-out as well as final outcome before authorizing tasks; an email address alone must not authorize outreach. Handle repeated accepted tool calls without duplicate tasks or misleading responses.

**Evidence to supply:** Each path above, repeated and concurrent calls, and read-back of session outcome, lead stage, raw outcome, opt-out flag, schedule, tasks and returned tool result. All must agree with the accepted transition.

## 4. P1 — question/objection array editing is still display-only

**File:** `apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx:398,463,907`; `apps/api/src/services/multi-calling/script-compiler.ts:138–152`.

The loader now displays `Intent | Response`, but the editor updates only `data.text`, and the serializer spreads the old `data.questions` / `data.cases` arrays back into the payload. There is no implemented parser that converts edits into those canonical arrays. The compiler prefers existing nonempty arrays, so visible edits can be saved while old questions/answers continue to run.

**Required fix:** Implement actual typed question rows and objection intent/response pairs, or a documented lossless format with real parse/format functions. Update canonical arrays on edits/add/delete; do not leave stale arrays overriding the visible text. Preserve question identity where applicable and surface invalid formatting as field errors. Migrate specialized-only legacy fields explicitly.

**Evidence to supply:** Load existing arrays → edit/add/remove → Save → reload → compiled preview with the exact new content, including objection response text. Invalid format must produce a controlled error.

## 5. P1 — End is rendered but its explicit action is still absent

**File:** `apps/api/src/services/multi-calling/script-compiler.ts:120,204–208`.

Removing End from the skip clause includes its heading. The action switch still contains no `case 'end'`; the only inspected local explicit `end_call` instruction is in Goodbye. An End title plus generic “Conclude call” transition is not the explicit End instruction claimed in the attachment.

**Required fix:** Add End semantics explicitly, with result-save → accepted tool response → brief goodbye where appropriate → hangup. Preserve silent machine termination and the existing voicemail/IVR detector's ownership of machine outcomes. Do not force dialogue into machine termination paths.

**Evidence to supply:** Compiled direct-to-End route contains the hangup instruction, and the runtime completes exactly once. Confirm that rejected result-save does not falsely announce success.

## 6. P1 — initialization failure cleanup has inconsistent reason and timing

**File:** `apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js:706,800,940–971`.

The previous undefined-variable defects are fixed, but the replacement catch writes `hangup_reason = 'technical_failure'`. Existing technical-error classification recognizes `deepgram-error`, `deepgram-disconnected` and `bridge-error`, not this new reason. Depending on subsequent close-event ordering, the reason/state can be replaced or classified inconsistently.

The database update and provider hangup run independently without being awaited. `ended_at` can become visible before provider teardown is confirmed. A worker relying on ended_at for lane availability may then begin another call while the previous provider call is still active. The open handler also starts KeepAlive after `sendSettings()` returns from a failed initialization.

**Required fix:** Use a single existing teardown/finalization path with a recognized technical reason and preserved original diagnostics. Have initialization report success/failure; start KeepAlive only after successful Settings. Distinguish teardown requested from provider-confirmed completion, prevent duplicate cleanup, and release lane occupancy only according to the defined terminal policy. Cover both open and Welcome initialization paths.

**Evidence to supply:** Forced initialization failure produces one technical result, no extra ReferenceError, no active provider call left behind, no timer started after failure, and no premature overlapping next call.

## 7. Carryover integration checks — close these in the same pass

These are retained requirements from the earlier consolidated handoff, not new product features:

- Settings schema support is now present, but the inspected builder still has no edit controls for those settings. Provide usable persona/offer/duration/settings controls and a resolved preview; demonstrate save/reload/runtime values.
- Normalize saved and UI handles as well as compiler handles. Review legacy negative branches explicitly so Wrong Owner does not become Refusal by accident.
- Date/time collection flags and declined-edge checks are improvements, but define which accepted paths actually guarantee confirmed date, time and timezone. Runtime remains the authority for valid future scheduling.
- Capture intended lane agent/config and script/version consistently. The worker's agent config was read before its lane/script snapshot; preserve a coherent snapshot and fail cleanly on missing required configuration.
- Confirm lock ordering for configuration changes, Publish, snapshotting and Stop; avoid lock-upgrade races. Start/dial must use valid compiled readiness and truthful affected-lane activation feedback.
- Bound graph/array input and compiled/resolved prompt, and keep Validate/Publish on the same canonical normalization/error contract.

## Single-pass delivery contract

Close sections 1–6 and the retained checks in section 7 together. Preserve the fixes already present. Compare the final diff after any checkout/repatch step; the pasted transcript includes a route checkout, and the final file does not contain several earlier claimed changes.

Provide a compact evidence report tied to each scenario above, with the actual source revision and environment used. Builds are useful but do not exercise JavaScript initialization, database migration/transition behavior, browser state closures or provider teardown. Mark anything not exercised as unverified. No deployment or campaign start is authorized by this review document.
