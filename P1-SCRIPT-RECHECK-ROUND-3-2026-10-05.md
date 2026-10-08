# P1 recheck, round 3 — remaining integration defects

Date: 5 October 2026. Reviewed current uncommitted local source on top of commit `5ef25171`, including newly added migrations 034/035, against the latest supplied implementation transcript.

## Verdict and scope

Do not mark P1 complete yet. Several targeted fixes are now present, but new voice initialization errors and an invalid migration remain. This document consolidates the remaining work for one coding pass.

No application edits, executable tests, builds, migrations, deployments, production queries or calls were performed by this reviewing agent. Statements below are static source findings. Build success reported in the attachment does not establish runtime or migration acceptance. The implementing agent reports a migration credentials issue; actual live migration state remains unverified.

## Improvements verified in source

- Shared resolver import and full compiled greeting policy remain present.
- Compiler uses normalized edges.
- Refusal traversal now includes Send Information and Follow-up, closing the previously reported positive-action node bypass.
- CTA scheduling checks both date/time flags and inspects the outgoing edge when traversing backwards; declined/refusal edges no longer directly qualify as collection.
- Frontend serializer no longer copies a node title into ordinary spoken text.
- Save now checks a supplied revision and increments/returns the stored revision under the existing parent transaction lock.
- Publish now returns the next draft ID, although frontend consumption is still missing.
- Worker reads the current script-version pointer with FOR SHARE before its session snapshot, and uses script settings for spoken persona.
- Migration files for prompt snapshot and revision have been added, but the snapshot migration is not valid against the existing migration chain.
- Create now maps schema errors to a structured 400. PUT has not received that same change.

Keep these improvements. Do not revert earlier tenant/transaction/publication fixes.

## 1. P0 — successful Settings initialization now throws an out-of-scope variable error

**Location:** [bridge:908](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js:908>) and [bridge:941](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js:941>).

`const settings` is declared inside the new try block. After that block, logging reads `settings.agent` outside its lexical scope. On the successful path, Settings is sent and settingsSent becomes true, then `ReferenceError: settings is not defined` is thrown. The WebSocket open handler calls this synchronously without an encompassing catch. This can disrupt the call or process depending on runtime exception handling; it is not a volume problem.

**Fix:** Keep settings construction, sending and inspection/logging inside the same guarded scope, or declare a correctly scoped binding and guard every subsequent use. Have sendSettings report success/failure and start KeepAlive only on success; do not continue after failure. Guard both open and Welcome-triggered initialization paths.

**Acceptance:** Successful Settings creation/sending completes all subsequent logging without an exception and runs once. Simulated initialization failure uses controlled cleanup. Exercise this JavaScript path through the actual deployed loader; TypeScript build alone does not cover it.

## 2. P1 — the new failure handler references an undefined Fastify object

**Location:** [bridge:922](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js:922>).

The bridge receives `httpServer`; it imports `query`, RestClient and has existing session/provider hangup helpers. It has no `fastify` binding. The catch calls `fastify.db.query` and `fastify.signalwire`, so initialization failure itself throws a second ReferenceError before its intended database update/hangup.

**Fix:** Use the existing imported database query/updateSession mechanism and closePhoneCall/createSignalWireClient path. Preserve original failure details, classify as technical error using a reason understood by the finalizer (for example the existing bridge-error path), and close/finalize once. Do not introduce an unrelated container/client inside this catch. Ensure cleanup reaches ended_at/queue/lane state so the next call does not see a ghost session.

**Acceptance:** Forced settings failure writes technical diagnostics, completes the provider call/stream and finalizes the session without fastify errors, duplicate cleanup or a falsely classified sales result.

## 3. P1 blocker — migration 034 re-adds an existing column; migration entry point omits new files

**Location:** [034](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/api/src/db/migrations/034_call_session_compiled_script.sql>), [030:133](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/api/src/db/migrations/030_multi_ai_calling.sql:133>), [deployment migration list](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/deploy-to-gcp.sh:75>).

034 currently adds compiled_script_prompt and script_compiled_hash in one ALTER TABLE. 030 already adds script_compiled_hash. 034 uses no IF NOT EXISTS: on a schema with 030 applied, the duplicate hash column fails the entire ALTER statement, leaving the prompt field absent. The script hash type already is TEXT; the new VARCHAR declaration should not be used to recreate it.

The deployment's explicit file list ends at 033. `apps/api/run-migration.js`, which was invoked in the pasted log, is an older inline schema setup and does not load 034/035 at all. Fixing credentials for that command would still not apply these files. The deployment runner also skips duplicate-column errors at whole-file level; that must not conceal a partially missing schema.

**Fix together:**

- Add only the missing prompt column through a new correct tracked migration; do not recreate the existing hash. Use safe per-column IF NOT EXISTS/checks where the actual runner replays migrations.
- Make the revision migration safe for the intended migration execution model, and enforce a positive revision value.
- Wire both migrations into the actual deployment/migration entry point. Obtain migration and column-existence evidence before restarting consumers; do not rely on the old run-migration.js script.
- [Bridge context:269](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js:269>) still selects acs.* then sv.compiled_prompt under the same snapshot field name. Select explicit fields and COALESCE(session snapshot, version prompt) with one unambiguous output name. Otherwise the new stored snapshot is overwritten in the query result.

**Acceptance:** Apply through existing schema → corrected 034 → 035, then read back columns and exercise session INSERT/read. Replay follows the documented model without masking failures. Snapshot prompt/hash come from the same captured version.

## 4. P1 — Publish returns new draft ID, but frontend still ignores it; publication revision unchecked

**Location:** [frontend:592](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx:592>), [Publish response:633](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/api/src/routes/multi-calling.ts:633>).

The PUT response updates frontend state to the draft being published. Publish returns a replacement draft ID, but the frontend still executes bare `await api.post(.../publish)` and never consumes that response. New draft revision defaults to 1, while frontend retains the old incremented revision. Thus next Save still conflicts.

Publish checks neither expected ID nor expected revision. A different tab can Save after this tab's pre-Publish Save, and publication can compile that other tab's definition. PUT checks expectedRevision only when truthy, permitting missing/zero values to bypass the check. Existing locks serialize writes, but do not confirm the caller's reviewed revision.

**Fix:** Return nextDraft ID and revision together, consume both after Publish. Require valid expected ID/revision on Save and Publish, returning 409 for mismatch. Use the local authoritative PUT response variables in the immediately following Publish request, since React setState is asynchronous. Keep the parent lock. Return first draft identity/revision on Create; retain newly created parent ID before Publish so a failure retries the same script. Use one shared mutation guard for Save/Publish, preserving local edits on conflicts.

**Acceptance:** Same-page Save → Publish → edit → Save → Publish succeeds. Two-tab interleaving cannot silently publish unreviewed content. Missing/stale revision does not bypass protection. Failed new publication retries the same parent.

## 5. P1 — claimed array editors are not implemented, and objection loading uses the wrong field

**Location:** [frontend:398](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx:398>), [schema:57](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/api/src/services/multi-calling/script-schema.ts:57>).

Questions are copied into a text display on load, but editor onChange and serializer do not parse edits back into questions. Compiler still prefers the old questions array. Objection load reads c.trigger; schema/compiler use intent and response. The loader neither displays nor round-trips valid responses. Generic text editing still does not update cases.

**Fix:** Prefer actual typed question rows and objection intent/response pairs. If keeping a multiline format, define a lossless documented grammar that represents both intent and response, implement parse/format in shared helpers, show parse errors and preserve IDs where relevant. Edit canonical arrays; do not silently keep an array that overrides visible edited text. Do not use trigger where the schema contract is intent. Also migrate specialized-only node text explicitly rather than presenting blank content while compiling old fields.

**Acceptance:** Load valid questions/cases → edit/add/remove → Save → reload → compile, with exact new content and no lost response. Invalid format gives a controlled field error.

## 6. P1/P2 — blank speech still passes backend validation; offer/duration settings are absent

Frontend title-to-speech copying is now removed. Validator still treats data.text || data.label as speech content at [validator:242](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/api/src/services/multi-calling/script-validator.ts:242>). A titled opening/offer with blank speech can therefore pass Publish while compiler produces empty speech.

Worker now reads settings.offerName/meetingDuration. [ScriptSettingsSchema](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/api/src/services/multi-calling/script-schema.ts:76>) still declares neither field. Ordinary Zod object parsing strips unknown keys, so normal Save cannot preserve those settings. Persona override is present; offer/duration still normally fall back to generic values. There are still no inspected UI controls for these settings/niche, and maxObjectionAttempts is not applied in compiled policy.

**Fix:** Use a shared canonical content contract, require authored speech at Publish, allow incomplete Draft Save. Declare typed offer/duration settings with agreed units, editor controls, serialization and runtime resolution; preserve actual persona override. Apply supported behavior settings to the effective prompt. Show the compiled/resolved preview so the user sees what will be said.

**Acceptance:** Nonempty title plus empty speech cannot publish. Actual configured offer/duration survive save/reload/version/snapshot/resolution and match the agent's spoken values.

## 7. P1 — End action claim absent; runtime result transition and task protections remain pending

[Compiler:119](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/api/src/services/multi-calling/script-compiler.ts:119>) still skips end nodes, and the action switch still has no end case. A title helper's End label is not an End tool instruction. Global hangup guidance exists, but explicit End semantics claimed in the transcript are not present.

Graph refusal-side-effect bans are now improved. Runtime still updates session outcome on every accepted save_call_note and can overwrite a verified Follow-up/Not Interested with Called. Tool policy still treats an email handoff as Interested. Follow-up task SQL permits any supplied email regardless of rejection/DNC. These prior handoff requirements have not been changed by the new graph check.

**Fix:** Define End actions explicitly, preserve correct human result-save → successful response → short goodbye → hangup and silent machine termination. Keep machine detection owned by existing detector/finalizer. Add documented runtime outcome-transition/idempotency rules; DNC remains sticky, generic completion does not erase known intent/schedule, email alone does not upgrade rejection or authorize an outreach task. Persist factual contact details independently.

**Acceptance:** Direct valid route to End terminates. Verified result survives later completion. Email plus rejection/DNC does not create unauthorized follow-up tasks. Hold/recording continues waiting; machine cases retain accurate results.

## 8. Remaining integration details to include in the same pass

- PUT still calls ScriptSchema.parse without the structured Create/Validate/Publish error mapping. Complete consistent 400 issue responses.
- Normalize saved/UI handles, not just compilation; legacy meanings should receive explicit migration review. Changing legacy negative to refusal fixes one prior alias problem but can change old factual-no routes. Distinguish wrong owner from actual rejection.
- Scheduling outgoing-edge inspection improves declined handling. Define which accepted/default paths actually guarantee date/time/timezone, instead of assuming every nonnegative traversal of a collector completes collection.
- Worker now captures the script pointer under a lock, but agent config is read before that lane snapshot. Capture the intended lane agent/config consistently and fail on missing valid script/agent data rather than falling back to stale lane values/null prompt.
- Use appropriate one-time locking order when snapshotting. FOR SHARE then later FOR UPDATE should not create lock-upgrade conflicts with concurrent configuration updates; document/verify this alongside Publish/Stop.
- Return truthful affected-lane activation feedback and validate actual compiled readiness at Start/dial.
- Bound graph/array input and final compiled/resolved prompt; share validation normalization instead of conflicting field-size heuristics.

## One-pass implementation and evidence checklist

1. Fix Settings lexical scope and existing-helper error cleanup; execute success and failure initialization paths.
2. Fix migration conflict, register migrations, validate schema/session snapshot retrieval.
3. Consume Publish next draft identity/revision; require Save/Publish revision; fix retry identity and operation guard.
4. Implement actual canonical array/speech/settings editors and schema contracts.
5. Implement End action, runtime result/task protection and remaining structured errors/handle/snapshot checks.
6. Provide actual outcomes for initialization, migrations, two-tab revision, repeated same-page Save/Publish, failed Publish retry, blank speech, questions/objections edit round-trip, configured offer/duration, refusal/DNC/task protection and direct End termination.

The original acceptance list remains applicable. Builds may be part of verification, but are not substitutes for the JavaScript, SQL, concurrency and runtime scenarios above. Do not deploy or start calls on behalf of this review; obtain deployment authorization separately if needed under the current session constraints.
