# P1 consolidated remaining fixes — updated source review

Date: 5 October 2026. Updated after the attachment `e90f0fbd-e23c-4f95-8828-99a79734eae0/Pasted text.txt`.

Source root: `/home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas`. Reviewed current uncommitted source on top of `5ef25171`. This document replaces the previous current-status checklist in this same file.

## Decision and review boundary

P1 is still incomplete. Migration registration, snapshot preference and the basic Save/Publish revision flow are now present. The claimed outcome row lock and explicit End action are absent from the final source. Remaining integration requirements were not all implemented.

This is static source review. No application source edits, tests, builds, migrations, deployments, production queries or calls were performed by this reviewer. The attachment lists commands and reports builds; it supplies no database read-back or runtime scenario results. Do not infer verified live behavior from those claims. This document does not authorize deployment or starting campaigns.

## Changes verified in final source — retain these

- Deployment migration list now includes 034 and 035. The local runner now discovers SQL files, including those migrations.
- Migration 034 no longer duplicates the existing hash column. Migration 035 declares a positive revision default.
- Session context now prefers `COALESCE(acs.compiled_script_prompt, sv.compiled_prompt)`; the previously unconditional version override is fixed.
- PUT and Publish now reject missing/mismatched expected draft identity and revision when an existing draft is found.
- Frontend Publish passes locally captured PUT/Create response IDs and revisions, fixing the React closure issue; it continues to consume the replacement draft response.
- Schema declarations for offer/duration, strict authored-speech checks, objection attempt policy and structured PUT validation remain.
- Array serialization now actually creates questions/cases from edited text. It is no longer display-only, although it is not lossless or properly validated.
- Settings scope and undefined Fastify defects remain fixed. Initialization failure now uses the recognized `bridge-error` reason, and KeepAlive starts only when sendSettings reports success.
- Existing tenant checks, parent transaction locking and refusal-path graph restrictions remain. Preserve them.

## 1. P1 — outcome transition fix did not reach the SQL

**Location:** `apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js:367–447`.

The final query still reads prior outcome through an unlocked `session_check` and preserves any prior Not Interested / Do Not Call / Follow-up for every incoming result. There is no claimed `FOR UPDATE` in this query and no new transition hierarchy.

The response was changed to read `rows[0]?.actual_outcome`, but the SELECT returns only `saved` and `followup_task_created`. It does not return `actual_outcome`; the response therefore still falls back to the requested outcome.

Remaining concrete inconsistencies:

- Follow-up → Do Not Call: session/stage stay Follow-up; opt-out becomes true, schedule is cleared, raw outcome says Do Not Call.
- Follow-up → Not Interested: final outcome stays Follow-up but its schedule is cleared.
- Not Interested → Follow-up: session keeps rejection while lead receives a new future schedule.
- Interested → generic Called: confirmed interest can still be overwritten.
- Follow-up → Called plus email: task can be created with the incoming null follow-up time instead of the prior confirmed schedule.
- Follow-up → opt-out plus email: task guard can still authorize a task because retained final outcome is Follow-up.
- Repeated/concurrent tool calls can use stale prior state, append duplicate notes, and report an outcome different from the saved one.

**Required fix:** Implement the transition policy in the actual executed SQL/service under a row lock, with Do Not Call taking priority and remaining sticky. Explicit rejection may supersede Follow-up. Generic completion must preserve confirmed interest and scheduling. Calculate accepted outcome and effective schedule once; use them for session, lead stage, raw metadata, task eligibility and tool response. Return those values from SQL. Preserve factual contact details independently. Check effective lead opt-out before creating tasks. Make repeated accepted requests idempotent.

**Acceptance evidence:** For all transitions above, show stored session outcome, stage, opt-out, schedule, raw outcome, tasks and returned tool result. Include repeated and concurrent requests. They must agree.

## 2. P1 — cleanup bypasses outcome/task protections entirely

**Location:** same bridge, `cleanup()`, lines 728–769.

Even after the tool path is fixed, cleanup contains a second email-derived mutation:

`WHEN outcome IN ('not_interested', 'called') OR outcome IS NULL THEN 'interested'`.

This can convert an explicit rejection into Interested merely because an email occurred in the transcript. The adjacent email task INSERT has no effective outcome or opt-out eligibility guard; its only restriction is duplicate-task lookup. Thus a Do Not Call session can still acquire an email follow-up task.

**Required fix:** Route cleanup/fallback/email extraction through the same outcome and task eligibility policy as live tools. Store email as a fact; do not upgrade intent solely from extraction. Do not schedule outreach for rejected or opted-out leads. Preserve a valid prior schedule. Apply latest-session protection to every lead-level mutation/task authorization, rather than only the final lead-stage UPDATE, so an old finalizer cannot overwrite newer contact data or create outdated tasks.

Review transcript classification in the same pass. `classifyFromTranscript()` still includes “recorded/monitored for quality/training” in its IVR patterns at line 130. The agreed rule is to wait through recording notices/hold and distinguish explicit keypad menus from subsequent human conversation. A recording notice must not, by itself, classify an otherwise human call as IVR/No Answer.

**Acceptance evidence:** Rejection plus spoken email remains rejected after cleanup; opt-out plus email creates no outreach task; old cleanup arriving after a newer session cannot change the newer result/contact facts; recording notice → real human → rejection remains a human Not Interested result.

## 3. P1 — migration runner hides failure and replays unsafe files

**Files:** `apps/api/run-migration.js:24–42`; `deploy-to-gcp.sh:105–118`.

Registration is now fixed. Execution safety is not:

- Local runner logs “Migration failed” in its outer catch without rethrowing or setting a nonzero exit code. A failed migration can appear successful to the invoking shell.
- Both runners interpret a duplicate table/object/column error as proof the whole file was already applied. That is not proof that later statements exist.
- Local runner now replays every SQL file without an applied-version ledger. For example 030 begins with plain CREATE TABLE; an existing first table triggers the whole-file skip, leaving any missing later tables/indexes/columns unverified.

**Required fix:** Use an explicit applied-migration ledger and appropriate transaction/locking policy for these SQL files; record success only after the full migration completes. Fail the command nonzero on errors. Do not replace schema verification with broad duplicate-error skipping. Handle known partially applied legacy schemas deliberately, without pretending a first-object duplicate validates the file. Keep 034/035 registered in both intended entry points.

**Acceptance evidence:** Migration result and column read-back from the stated database; session prompt/revision insert/read; intentional failure returns nonzero; supported replay/upgrade succeeds without hiding incomplete schema. Nothing in the attachment establishes that these checks have passed.

## 4. P1 — explicit End action still absent; patch script can silently do nothing

**File:** `apps/api/src/services/multi-calling/script-compiler.ts:204–208`.

The action switch still ends with Goodbye and has no `case 'end'`. The End title helper at line 46 is not an action. Global ending instructions exist, but do not satisfy the claimed explicit graph End semantics.

`patch_compiler_end2.py` looks for an old Goodbye block that says `Say: "${text}"`. The actual compiler Goodbye block says `Conclude the conversation politely` and already contains a hangup instruction. The pattern does not match, and the script prints success regardless.

The outcome patch also uses unchecked string replacement. Successful patch-process exit is not proof that its large replacement reached the final SQL.

**Required fix:** Add the explicit End action in the actual switch, preserving accepted result-save → short goodbye where appropriate → hangup and silent machine termination. Assert expected replacement counts if patch scripts are used; inspect the final diff and executable code after patching.

**Acceptance evidence:** Actual action case plus compiled direct-to-End route; runtime ends once, and failed result-save is not falsely acknowledged. No need to redesign machine detection for this fix.

## 5. P1 — array parser now edits data, but silently invents or loses content

**File:** `apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx:464–478`.

The serializer now reparses edited text into arrays, which fixes the previous stale-array issue. Remaining defects:

- A malformed objection line without a response receives the invented answer “Please handle this objection.” Missing intent gets an invented label. Validate/Publish then see plausible nonempty fields rather than the user's syntax error.
- Existing question IDs are discarded when rebuilding rows.
- The newline format is not lossless for responses/questions containing embedded newlines, although the schema permits them. A no-op Save can split one entry into multiple entries.
- Empty/whitespace handling happens after some filtering, so a whitespace-only question row can reach schema validation as empty text rather than being handled at the editor.
- Old `data.text` is preferred during loading even if canonical arrays carry different content; legacy representation conflicts need an explicit migration choice.

**Required fix:** Prefer typed rows with stable question identity and complete response text. If retaining a multiline grammar, define escaping/format/parse rules, reject missing intent/response without fabricating text, and display precise node/field errors. Ensure no-op Save is lossless and arrays are the canonical representation.

**Acceptance evidence:** Existing IDs/multiline content survive load → no-op Save → reload; edit/add/remove changes runtime content exactly; malformed pipe syntax cannot publish and shows a controlled field error.

## 6. P1/P2 — remaining Create/Save/Publish and settings UI gaps

**Files:** `apps/api/src/routes/multi-calling.ts:457`; `apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx:287,386,580–637,742–750`.

The revision and closure defects are now fixed; keep those changes. Remaining earlier requirements:

- POST Create still executes bare `ScriptSchema.parse(definition)` without the structured 400 mapping now used by PUT. This path can fall through to the generic error handler.
- A newly created parent ID remains only a local variable until Publish succeeds. On Publish failure the route stays “new”, so retry creates another parent.
- Save and Publish buttons disable only themselves; there is no shared mutation guard. Clicking Save while Publish is pending still produces competing writes.
- Settings are initialized/loaded, but inspected builder has no editing controls for persona, offer, duration, tone or objection policy. Merely declaring the schema does not expose these features to the user.
- Expected revision checks compare values but do not have a typed request contract. Validate UUID/integer inputs deliberately; preserve the conflict checks.

**Required fix:** Structured Create errors; persist a created parent before publication; one shared operation guard; retain local edits on conflicts; actual settings/niche controls and resolved prompt preview. Preserve successful local response revisions and replacement-draft state.

**Acceptance evidence:** Invalid Create gives structured 400; failed new Publish retries the same parent; overlapping actions are prevented; settings survive Save/reload/version/snapshot/runtime resolution with correct units and values.

## 7. P1 — teardown helper still releases lane occupancy before hangup completes

**Locations:** bridge `closePhoneCall():213–238`, Settings catch near 940, cleanup near 662; worker `multi-lane-outbound-caller.js:90–94`.

Recognized failure reason and KeepAlive gating are now fixed. The underlying helper still writes `ended_at` before requesting provider hangup. Worker treats `ended_at IS NULL` as lane occupancy. If provider teardown is delayed/fails, a subsequent tick can consider the lane free while the old provider call persists.

The Settings catch passes `lastError`, but `closePhoneCall` does not accept/store that field. Original settings failure detail is logged but not persisted by the newly claimed diagnostic path. The catch starts asynchronous hangup then immediately closes Deepgram, which can race another disconnect-triggered hangup/cleanup.

**Required fix:** Separate ending request from confirmed completion; persist original diagnostics; make teardown/finalization single-owner and idempotent; keep lane busy until the documented provider-terminal/verified recovery condition is met. Use one terminal lifecycle policy for manual End, machine End, initialization failure, provider callback and cleanup. Do not merely move the same early-ended_at write between helpers.

**Acceptance evidence:** Delayed/failed provider hangup never permits a second live call in that lane; original error stored; no duplicate cleanup; Stop/End cannot be followed by a ghost next call.

## 8. Retained integration checks to finish in the same pass

These are unchanged requirements from the prior handoff, not new product features:

- Normalize UI/saved legacy handles consistently; distinguish Wrong Owner from actual Refusal.
- Scheduling paths must actually collect confirmed future date/time/timezone, not just expose collection flags.
- Worker still reads agent config from the previously fetched lane before locking current script pointer (lines 273–286). Capture lane agent/config/script coherently, enforce tenant/readiness, and fail on missing required compiled configuration.
- Worker takes FOR SHARE and later FOR UPDATE on lane. Define consistent lock ordering with Publish/configuration/Stop and cover upgrade/concurrent-start races.
- Start/dial and publication must return truthful activation/readiness feedback.
- Bound graph/array input and compiled/resolved prompts; keep Validate/Publish on one canonical validation contract.

## One-pass completion evidence

Fix sections 1–8 together while preserving the verified changes. Inspect final source, not just patch-script logs. Supply an evidence record covering transitions AND cleanup, migrations/failure exit, direct End, array round-trip, Create/Publish retry, settings controls, teardown occupancy and snapshot consistency.

Identify the source revision and environment used. Clearly label anything not exercised as unverified. Builds remain useful but cannot establish database semantics, JavaScript initialization, provider lifecycle or browser state behavior. Do not deploy or start calls merely because this review exists.
