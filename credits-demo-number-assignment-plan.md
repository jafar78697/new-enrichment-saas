# Credits, One-Time Demo and Number Assignment: Implementation Plan

Date: 2026-09-13
Status: Plan first. Application code, production database and deployments have not been changed during this review.

## Scope and Evidence

Reviewed the current local implementation, including the other agent's uncommitted changes, and the supplied voicecalling.space screenshots. Local code findings are confirmed below; the currently deployed revision, production balances and provider configuration have not been independently verified. Do not assume local and production revisions match.

Repository: `/home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas`.
Source paths below are relative to this repository.

### Confirmed Problems

1. **Demo duration and entry points disagree.** `apps/api/src/routes/phone-numbers.ts:195` implements `/v1/demo-pool/request` with a 15-minute assignment. `/v1/phone-numbers/demo-assign` at line 272 assigns for one hour. The browser dashboard uses the latter. SignalWire token creation also allocates a fresh 15-minute assignment when none is active (`apps/api/src/calls-module/routes/signalwire.routes.js:392`).
2. **Trial consumption depends on a reusable number row.** Pool cleanup and release clear the previous tenant and expiration. The start and token paths can then allocate again. The current check is not a durable one-time entitlement. The one-hour start route also lacks an unconditional demo-only rejection.
3. **The screenshot's call blocker is an application rule.** `signalwire.routes.js:220` requires `users.contact_phone`, then restricts demo destinations to that same number. Calling a Lead List business is therefore rejected even after entering a profile phone. This code checks presence, not evidence of OTP verification. It does not establish that SignalWire itself failed.
4. **Maps usage has inconsistent accounting.** `apps/api/src/routes/google-maps.ts:437` records all returned leads as `credits_used`, but settlement at line 443 uses Google results plus half the cached results, rounded up. Existing contacts can still be included in the charged result count. This differs from the UI promise that only saved leads consume credits.
5. **The sidebar can display stale credits.** `apps/calling-saas/src/App.tsx:34` fetches balances when the user changes, not after a scrape or a wallet mutation. Zero credits are hidden by the `available > 0` rendering condition.
6. **Wallet safety depends on callers supplying a transaction.** `apps/api/src/services/wallet.service.ts` has multi-statement credit/debit/reserve/settle operations and optional clients. Calls without a transaction can leave balances and ledger entries inconsistent on failure or concurrent requests. Maps success already uses a transaction; its release-on-error path does not supply one. Production discrepancies need reconciliation before attributing any amount to this risk.
7. **Reassignment is incomplete.** `apps/api/src/routes/admin-customers.ts:618` locks the number and changes its tenant, but does not update the corresponding agent caller-ID mapping. The inventory query at line 677 treats all numbers owned by the admin tenant as unassigned, without excluding active agent use. Concurrent assignments of different numbers can also race the target's capacity check.
8. **Billing quantities are labels, not editable inputs.** `apps/calling-saas/src/pages/Billing.tsx` renders quantities as spans and range sliders. Leads change in 3,000 increments. Pricing rounds to whole dollars, and transaction-history labels confuse calling cents, members, dollars and Maps credits.

## Product Rules

### Requested Rules

- Demo lasts exactly 900 seconds and is available once, not once per browser, login or number allocation.
- Start Demo, refresh, token renewal, logout/login and pool release must never reset the trial.
- Assign already-purchased numbers without buying them again.
- Billing has editable quantities with clear minus/plus buttons and no sliders.
- All application messages remain English.

### Proposed Defaults to Confirm Before Changing Commercial Behavior

- Interpret 15 minutes as elapsed time from successful explicit Start Demo, not 15 accumulated talk minutes. Do not start the clock during signup or SDK initialization.
- Preserve the existing three-call/two-keyword limits inside the 15-minute window unless explicitly changed. A preflight or microphone failure should not consume a call. Track provider-submitted attempts separately from connected calls to keep the free trial bounded.
- Recommended Maps unit: one credit per newly saved, usable, unique lead in that customer's account. A business without a website qualifies; show `No website`. Failed jobs, duplicates already delivered to that tenant and unusable results consume no lead credits. Cached results new to that tenant cost the same as fresh results. This intentionally replaces the current hidden half-price cache formula and must be approved/documented before rollout.
- Preserve the advertised $20 per seat/month and $4 per 3,000 leads unless changed. Proposed arbitrary-quantity pricing uses integer cents: `round(leads * 400 / 3000)`. Thus 4,000 leads cost $5.33 and 5,000 cost $6.67. Confirm proportional pricing versus fixed packs before activation.
- Separate paid subscription access, demo allowances, Maps credits and internal telephony costs. Do not make a funded trial depend on a customer buying calling-wallet credit. Do not promise unlimited provider spending through an unlimited-calling label without an approved usage policy.
- Demo destination policy needs an explicit choice: keep genuinely verified own-number testing with a working verification flow, or allow restricted US/Canada prospect demos after verification/admin approval. The current own-number-only rule cannot satisfy Lead List calling. Do not silently remove the abuse control.

## Implementation Sequence

### 1. Establish the Production Baseline

- Identify the actual Pages project, API origin, running backend revision and database for voicecalling.space. Documentation contains older hosts; verify rather than deploy to an assumed host.
- Capture scoped diffs and confirm which migrations 019-021 are applied. Inspect schemas using read-only queries and take a restorable backup before migrations.
- Reconcile affected accounts: available/reserved wallets, ledger totals, held reservations, Maps jobs/results/contacts, trial usage, agent mappings and provider-owned phone numbers.
- Record discrepancies by tenant and reference ID. Never invent a refund or reset everyone's trial based on screenshots.

### 2. Make Wallet Operations Atomic

- Standardize a transaction wrapper: reuse the caller's transaction when present; otherwise begin/commit/rollback on one checked-out database client.
- Validate finite, safe integer amounts, positive mutations and nonnegative settlement values. Reject over-settlement rather than silently clamp it.
- Lock the wallet row before mutation; enforce sufficient available/reserved balances and nonnegative database constraints.
- Make idempotency database-enforced and scoped to tenant, unit and operation/reference. Repeated identical requests return the original outcome; conflicting payloads with the same key return an error.
- Make balance mutation, reservation state and ledger entries commit together. Include holds/releases consistently enough to reconcile available and reserved balances.
- Make settlement/release mutually exclusive and repeat-safe. Introduce a recovery process for abandoned holds, checking job/provider state before refunding.
- Admin top-ups and payment approvals use the same service with audit actor, reason and reference; approval retries cannot credit twice.

### 3. Repair Maps Metering and Visible Balances

- Persist a job-level request key and pricing-rule version. Reserve a validated maximum before invoking the provider; clamp requested result limits to purchased/demo entitlement.
- Normalize phone identities consistently and establish tenant-scoped deduplication. Audit and merge existing duplicates carefully before adding a uniqueness constraint; retain notes and call history. Preserve distinct businesses where a shared phone alone is insufficient identity.
- Use actual inserted/delivered rows, not pre-insert counts, for the approved charge rule. Commit contacts, job result counters and settlement together.
- Record separate found/new/existing/unusable counts and the exact settled credits. API response, job history and wallet ledger must agree.
- A stable delivery identity should prevent deleting and reimporting a previously delivered lead from charging again unintentionally.
- Publish wallet updates after reserve, settle, release and admin mutations through shared frontend state. Revalidate on navigation/focus and after job completion; show zero and distinguish available from reserved.
- Show the charge summary, including refunds and duplicates, alongside the saved Lead List link. Never claim a lead was saved before the transaction commits.

### 4. Build a Durable One-Time Demo

- Introduce a durable trial record unique to the customer account, separate from the reusable pool lease: status, started_at, expires_at, consumed_at, usage counters and audit data. Employees share the customer's trial rather than receiving new ones.
- Maintain identity-level trial claims for verified signup identities where appropriate. Document that one-account enforcement alone cannot stop a person creating entirely new identities; use verified identity checks and rate limits rather than relying on browser storage.
- One start service owns all start routes. Lock the tenant/trial row, reject non-demo/ineligible accounts, allocate an available owned line, then set the immutable 900-second window in the same transaction.
- Repeated/concurrent starts return the same active trial. Exhausted trials return `DEMO_ALREADY_USED`; pool-full responses do not consume eligibility.
- Token routes only retrieve an eligible current assignment. They must not create a trial. Pool cleanup/release must never delete trial history or reset entitlement.
- Use server time in all call gates and API responses. Dashboard refresh and new tabs show the same countdown. Expiry changes the CTA to `Upgrade Account`.
- Backfill existing evidence of trial usage before enabling the new rule. Accounts whose history was erased require an explicit migration policy, not an automatic fresh demo.

### 5. Make Demo Calling Work End to End

- Resolve the destination policy above and implement a complete setup flow. If verification is required, record verification evidence and present a direct action before the dialer opens; entering contact_phone is not verification.
- Verify caller-ID selection from the active demo lease, agent identity, provider credentials/scopes, browser token, microphone permission and webhook origin independently.
- Enforce trial eligibility at token/call authorization and the provider-facing execution path. Do not rely only on browser disabled buttons or a long-lived token.
- Use a single call-attempt ID and an in-flight guard. Distinguish preparing, ringing, connected, ended and failed. A rejected call shows an actionable English error, not a successful wrap-up.
- Limit the active call to the remaining trial window using the actual SDK/cXML provider mechanism after verifying support. Ring timeout is not a talk-duration limit. Add server recovery/termination handling for expired in-flight calls.
- Authenticate provider callbacks and deduplicate/out-of-order-harden status updates. Release demo lines only after active legs are finished, with a drain/reconciliation step before another tenant can use them.
- Test with an owned/consenting destination, never arbitrary businesses from the screenshots.

### 6. Repair Purchased-Number Inventory and Assignment

- Separate provider ownership, inventory availability, customer assignment, employee assignment and demo-pool use. Do not equate admin ownership with availability.
- Reconcile provider SID/E.164 number/status with local records read-only first. Flag uncertain/missing records for review rather than purchasing replacements.
- Assignment locks the source number and target tenant capacity, validates target status and number eligibility, and updates number ownership plus agent caller-ID references atomically.
- Clear obsolete mappings from the old owner and prevent duplicate active assignment. Preserve ownership/assignment history and call history.
- Verify inbound routing and outbound caller-ID selection after assignment. Model provider-side updates as retryable operations; do not claim a provider mutation is rolled back merely because the SQL transaction rolled back.
- Provide separate `Assign Existing Number` and `Purchase New Number` actions. Display assigned customer/employee, availability, errors and limits accurately.
- Repeated assignment requests are idempotent. Reassignment never adds a purchase/setup debit unless a separately approved fee policy requires it.

### 7. Replace Billing Sliders

- Remove both range controls and inaccurate scale labels.
- Use prominent, fixed-size minus/input/plus controls. Seats step by 1; proposed leads step by 1,000 while accepting any valid supported integer, including 4,000 and 5,000.
- Allow an empty draft while typing; validate on blur/checkout, not by resetting each keystroke. Reject negative, fractional, invalid and over-limit values with clear English errors.
- Prevent accidental mouse-wheel changes; support keyboard operation, labels and visible focus. Disable buttons at configured limits. Confirm whether zero-seat Maps-only purchases are supported.
- Calculate/display money in cents and mirror validation/pricing on the API. Persist the quoted quantities/version for manual payment approval so later pricing edits or repeated approvals cannot change the delivered entitlement.
- Keep the selected quantity, order summary, WhatsApp request and approved credit grant consistent. Fix ledger unit labels.

## Verification Gates

- Concurrent starts from multiple tabs produce one trial and one lease. At second 901, refresh, token renewal, release and another Start cannot grant access. Trial history survives pool reassignment.
- A full pool does not consume a trial. A crash between allocation and commit does not orphan an assignment. Existing expired accounts do not receive a migration reset accidentally.
- An authorized demo user can place a controlled test call; rejected setup does not consume allowance. Expired users cannot call via direct API, stale token or a second browser.
- Two simultaneous jobs cannot overspend the wallet. Duplicate requests, retries, duplicate callbacks and crash recovery cannot double-debit or double-refund.
- Under the proposed lead rule: 10 new usable leads cost 10; repeated same-tenant delivery costs zero; mixed fresh/cached/no-website results obey the same rule. Job counters and final balance agree after reload.
- A failed Maps save leaves no partial debit or phantom completed result. Recovery releases a genuinely abandoned hold exactly once.
- Assign an existing number and verify customer visibility, employee caller ID and controlled inbound/outbound routing. Competing assignments cannot exceed capacity or steal another customer's number.
- Enter 4,000/5,000 leads directly; test paste, empty input, invalid numbers, bounds, plus/minus and mobile layout. Quote totals and ledger units match the approved policy.
- Run focused PostgreSQL integration tests, API typecheck, frontend build and browser checks. Existing unrelated failures must be documented separately; do not hide failures with scripts that always exit successfully.

## Rollout and Recovery

Deploy additive schema changes first, then tested backend behavior, then frontend. Preserve old data and other-agent changes. Use a feature flag for the new trial and pricing rules; an emergency disable must block new trial starts rather than restore the old repeatable-start path. Record deployment revisions and migration results.

Use ledger-backed compensating entries for confirmed historical discrepancies, never destructive balance rewrites. Keep trial-consumption records during rollback. Frontend-only Pages deployment cannot repair API/database behavior.

## Research Basis

- PostgreSQL row locks last until transaction end, supporting the requirement that reads, balance mutations and ledger entries share one transaction: [Explicit Locking](https://www.postgresql.org/docs/17/explicit-locking.html).
- SignalWire documents E.164 PSTN addressing, Voice scope and initiated/ringing/answered/completed callbacks. Its ring timeout is explicitly a wait-for-answer timeout, not the whole-call demo clock: [Create a Call](https://signalwire.com/docs/compatibility-api/rest/calls/create-a-call).

These references inform the plan; they do not prove the deployed application's credentials, schema or routing are correct. Production reconciliation and controlled integration tests remain implementation prerequisites.
