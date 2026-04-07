# Implementation Plan: Enrichment SaaS AWS

## Overview

Yeh implementation plan 3 IDEs ke parallel kaam ke liye 3 phases mein organize kiya gaya hai.
- **PHASE A** — Foundation: Sab IDEs ko yeh pehle chahiye (contracts, DB, queue, extractor, normalizer)
- **PHASE B** — Core parallel build: API, Web, Workers, Infra
- **PHASE C** — Support services + integration: Webhooks, Exports, SDK, Billing, CI/CD

**Languages:** TypeScript/React (IDE_1), TypeScript/Node.js (IDE_2), Python + Node.js (IDE_3)

---

## PHASE A — Foundation

> Yeh tasks sab IDEs ke liye blocking hain. Pehle complete karein.

---

- [ ] A1. `packages/contracts` — Shared TypeScript types aur schemas banana (IDE_2)
  - [ ] A1.1 Monorepo root setup karo: `pnpm-workspace.yaml`, root `package.json`, `.env.example`, `tsconfig.base.json`
    - pnpm workspaces configure karo `apps/*` aur `packages/*` ke liye
    - _Requirements: 1.1_
  - [ ]* A1.2 Property test: contracts package TypeScript type correctness verify karo
    - **Property 5: Job Item Count Invariant**
    - **Validates: Requirements 1.2, 20.1**
  - [ ] A1.3 `packages/contracts/src/enums.ts` banao
    - `JobStatus`, `EnrichmentMode`, `ConfidenceLevel`, `PlanType`, `ExportFormat` enums define karo
    - _Requirements: 1.2, 8.8_
  - [ ] A1.4 `packages/contracts/src/result/enrichment-result.ts` banao
    - `EnrichmentResult` interface: contact, social, company, signals, verified_data, inferred_data fields
    - _Requirements: 1.2, 8.1, 8.2, 8.3, 8.4, 8.5_
  - [ ] A1.5 `packages/contracts/src/api/` — API request/response types banao
    - `CreateJobRequest`, `CreateJobResponse`, `JobStatusResponse`, `JobResultsResponse`
    - `AuthSignupRequest`, `AuthLoginResponse`, `ApiKeyResponse`
    - _Requirements: 1.2, 3.1, 14.1_
  - [ ] A1.6 `packages/contracts/src/queue/` — SQS payload interfaces banao
    - `HttpJobPayload`, `BrowserJobPayload`, `WebhookJobPayload`, `ExportJobPayload`
    - Design Section 7.2–7.5 ke exact shapes use karo
    - _Requirements: 1.2, 1.4_


- [ ] A2. `packages/db` — PostgreSQL schema, migrations, aur repository helpers (IDE_2)
  - [ ] A2.1 `packages/db` setup karo: `pg` ya `postgres` driver, migration runner (e.g., `node-pg-migrate`)
    - _Requirements: 1.3_
  - [ ] A2.2 Migration 001: `tenants`, `users`, `workspaces`, `api_keys` tables banao
    - Design Section 5 ka exact SQL use karo
    - _Requirements: 2.1, 2.7_
  - [ ] A2.3 Migration 002: `usage_counters`, `enrichment_jobs`, `enrichment_job_items` tables banao
    - Saare indexes bhi include karo (`idx_job_items_job_id`, etc.)
    - _Requirements: 3.1, 12.1_
  - [ ] A2.4 Migration 003: `enrichment_results` table banao
    - Saare contact, social, company, signals, quality columns
    - `verified_data JSONB`, `inferred_data JSONB`, `raw_result JSONB`
    - _Requirements: 8.1–8.6_
  - [ ] A2.5 Migration 004: `webhook_endpoints`, `webhook_deliveries`, `exports`, `audit_logs` tables banao
    - _Requirements: 9.4, 10.4, 16.4_
  - [ ] A2.6 Repository helpers banao: `TenantRepository`, `JobRepository`, `JobItemRepository`, `ResultRepository`
    - Har query mein `tenant_id` filter mandatory ho — tenant-safe wrappers
    - _Requirements: 2.5, 16.3_
  - [ ]* A2.7 Unit tests: repository helpers ke liye test DB pe integration tests
    - Cross-tenant query isolation verify karo
    - _Requirements: 2.5, 2.6_


- [ ] A3. `packages/queue` — SQS producer/consumer helpers (IDE_2)
  - [ ] A3.1 `packages/queue/src/names.ts` banao
    - Queue URL constants: `ENR_HTTP_QUEUE`, `ENR_BROWSER_QUEUE`, `ENR_WEBHOOK_QUEUE`, `ENR_EXPORT_QUEUE`, `ENR_DLQ`
    - Pro priority queues: `ENR_HTTP_QUEUE_PRIORITY`, `ENR_BROWSER_QUEUE_PRIORITY`
    - _Requirements: 1.4, 13.7_
  - [ ] A3.2 `packages/queue/src/producer.ts` banao
    - `sendToHttpQueue()`, `sendToBrowserQueue()`, `sendToWebhookQueue()`, `sendToExportQueue()`
    - AWS SDK v3 SQS client use karo
    - _Requirements: 1.4, 3.4_
  - [ ] A3.3 `packages/queue/src/consumer.ts` banao
    - `receiveMessages()`, `deleteMessage()`, `changeVisibility()` helpers
    - Payload validation with contracts types
    - _Requirements: 1.4_
  - [ ]* A3.4 Unit tests: producer/consumer mock SQS ke saath test karo
    - _Requirements: 1.4_


- [ ] A4. `packages/domain-normalizer` — URL/domain normalization (IDE_3)
  - [ ] A4.1 `packages/domain-normalizer/normalizer/normalize.py` banao
    - `normalize(url: str) -> str` function implement karo
    - `https://`, `http://`, `www.`, trailing slash, query params strip karo
    - Punycode/IDN support (`encodings.idna`)
    - _Requirements: 4.1, 4.2_
  - [ ] A4.2 `packages/domain-normalizer/normalizer/validate.py` banao
    - `validate_domain(domain: str) -> bool` — valid domain format check
    - Invalid input par descriptive `InvalidDomainError` raise karo
    - _Requirements: 4.5_
  - [ ]* A4.3 Property test: idempotency verify karo (Hypothesis)
    - **Property 1: Domain Normalization Idempotency** — `normalize(normalize(x)) == normalize(x)`
    - `@given(st.text())`, `@settings(max_examples=500)`
    - Tag: `Feature: enrichment-saas-aws, Property 1`
    - **Validates: Requirements 4.4**
  - [ ]* A4.4 Unit tests: known URL formats test karo
    - `https://www.example.com/` → `example.com`
    - Punycode, empty string, IP address, localhost edge cases
    - _Requirements: 4.1, 4.2, 4.5, 20.2_


- [ ] A5. `packages/extractor-core` — Extraction logic migration aur refactor (IDE_3)
  - [ ] A5.1 `packages/extractor-core/extractor/emails.py` banao
    - Existing `jento-mailer/services/enrichment.py` se `_extract_emails()` refactor karo
    - Priority order: `mailto:` links → visible emails → obfuscated patterns
    - `filter_junk(emails)`: CDN, no-reply, platform emails remove karo
    - Junk domains list: `@amazonaws.com`, `@googletagmanager.com`, image filenames, etc.
    - _Requirements: 5.3, 5.7, 17.1_
  - [ ]* A5.2 Property test: junk email exclusion (Hypothesis)
    - **Property 9: Junk Email Exclusion** — known junk patterns kabhi result mein na hon
    - `@given(html_with_junk_emails())`, `@settings(max_examples=200)`
    - Tag: `Feature: enrichment-saas-aws, Property 9`
    - **Validates: Requirements 5.7**
  - [ ] A5.3 `packages/extractor-core/extractor/phones.py` banao
    - Phone regex extraction + `tel:` link parsing
    - E.164 format normalization (`phonenumbers` library)
    - _Requirements: 5.4_
  - [ ] A5.4 `packages/extractor-core/extractor/socials.py` banao
    - Social domain matching: LinkedIn company page, Facebook, Instagram, X/Twitter, YouTube, TikTok, WhatsApp, Telegram
    - LinkedIn company vs personal page distinguish karo
    - _Requirements: 5.5_
  - [ ] A5.5 `packages/extractor-core/extractor/metadata.py` banao
    - JSON-LD aur schema.org structured data parse karo
    - Meta tags, headings, page title, description extract karo
    - Company name, address, city, country, one_line_pitch
    - _Requirements: 5.6, 8.3_
  - [ ] A5.6 `packages/extractor-core/extractor/confidence.py` banao
    - `score_confidence(result) -> ConfidenceLevel` implement karo
    - `high_confidence`: primary email + phone + 3+ social links
    - `medium_confidence`: primary email OR phone + some metadata
    - `low_confidence`: only metadata, no contact info
    - _Requirements: 8.7_
  - [ ]* A5.7 Property test: confidence level validity (Hypothesis)
    - **Property 13: Confidence Level Validity** — result hamesha valid 3 values mein se ek ho
    - Tag: `Feature: enrichment-saas-aws, Property 13`
    - **Validates: Requirements 8.7**
  - [ ]* A5.8 Unit tests: HTML fixtures ke saath extraction accuracy test karo
    - Known good/bad HTML cases, junk filter, phone E.164, social detection
    - _Requirements: 20.3_


- [ ] A6. Phase A Checkpoint
  - Ensure all Phase A tests pass. `packages/contracts` types compile hon, `packages/db` migrations run hon, `packages/queue` mock tests pass hon, `packages/domain-normalizer` property tests pass hon, `packages/extractor-core` unit tests pass hon.
  - Baaki IDEs ko signal do ke foundation ready hai.

---

## PHASE B — Core Parallel Build

> Yeh tasks Phase A complete hone ke baad parallel chalein.

---

### B-IDE_2: Backend API Service

- [ ] B1. `packages/auth` — JWT aur API key authentication (IDE_2)
  - [ ] B1.1 `packages/auth/src/jwt.ts` banao
    - RS256 JWT sign/verify implement karo
    - Claims: `{ tenant_id, user_id, workspace_id, role, plan }`
    - Access token: 1 hour, refresh token: 30 days
    - AWS Secrets Manager se private key load karo
    - _Requirements: 2.2, 11.1_
  - [ ] B1.2 `packages/auth/src/api_keys.ts` banao
    - API key generate: `enr_sk_{random_32_bytes_hex}` format
    - bcrypt hash store karo — plain text kabhi nahi
    - `verifyApiKey(plain, hash)` function
    - _Requirements: 2.7, 16.1_
  - [ ] B1.3 `packages/auth/src/tenant_guard.ts` banao
    - Express/Fastify middleware: JWT ya API key se `tenant_id` extract karo
    - Requested resource ka `tenant_id` DB se fetch karke match verify karo
    - Mismatch par 403 + audit log entry
    - _Requirements: 2.3, 2.5, 2.6_
  - [ ]* B1.4 Property test: JWT claims completeness (fast-check)
    - **Property 3: JWT Claims Completeness** — valid login par JWT mein `tenant_id`, `user_id`, `role` hamesha hon
    - Tag: `Feature: enrichment-saas-aws, Property 3`
    - **Validates: Requirements 2.2**
  - [ ]* B1.5 Property test: API key hashing (fast-check)
    - **Property 4: API Key Hashing** — plain text key DB se kabhi retrieve na ho sake
    - Tag: `Feature: enrichment-saas-aws, Property 4`
    - **Validates: Requirements 16.1**


- [ ] B2. `apps/api` — REST API service core setup (IDE_2)
  - [ ] B2.1 `apps/api` project setup karo
    - Fastify ya Express, TypeScript, `packages/contracts` + `packages/db` + `packages/auth` + `packages/queue` import
    - `/health` aur `/ready` endpoints (DB + Redis ping)
    - _Requirements: 13.12_
  - [ ] B2.2 Auth routes implement karo: `POST /v1/auth/signup`, `POST /v1/auth/login`, `POST /v1/auth/refresh`
    - Signup: tenant + user + default workspace create karo
    - Login: bcrypt verify → JWT return
    - _Requirements: 2.1, 2.2_
  - [ ] B2.3 API Keys routes implement karo: `GET /v1/api-keys`, `POST /v1/api-keys`, `DELETE /v1/api-keys/:id`
    - Create par plain key sirf ek baar return karo, hash store karo
    - Audit log entry karo
    - _Requirements: 2.7, 16.4_
  - [ ] B2.4 Rate limiting middleware implement karo (Redis)
    - Per API key per minute: Starter 60, Growth 300, Pro 1000
    - `X-RateLimit-*` headers return karo
    - _Requirements: 14.6_
  - [ ] B2.5 Enrichment job creation implement karo: `POST /v1/jobs/enrich`
    - Domain_Normalizer call → dedupe → idempotency check → quota check → job create → items create → SQS push
    - Max 10,000 domains enforce karo
    - 500-item sharding implement karo
    - Pro tenant → priority queue
    - _Requirements: 3.1, 3.4, 3.8, 3.10, 3.12, 3.13_
  - [ ]* B2.6 Property test: job item count invariant (fast-check)
    - **Property 5: Job Item Count Invariant** — N unique domains → exactly N job items
    - Tag: `Feature: enrichment-saas-aws, Property 5`
    - **Validates: Requirements 3.1, 3.4**
  - [ ]* B2.7 Property test: idempotency key deduplication (fast-check)
    - **Property 6: Idempotency Key Deduplication** — same key → same job_id, no duplicate job
    - Tag: `Feature: enrichment-saas-aws, Property 6`
    - **Validates: Requirements 3.8**
  - [ ] B2.8 CSV upload implement karo: `POST /v1/jobs/enrich-csv`
    - Multipart form parse, website column detect, invalid rows drop, duplicates merge
    - _Requirements: 3.2_
  - [ ]* B2.9 Property test: CSV deduplication (fast-check)
    - **Property 16: CSV Deduplication** — duplicate domains wale CSV se job items < input rows
    - Tag: `Feature: enrichment-saas-aws, Property 16`
    - **Validates: Requirements 3.2, 4.3**
  - [ ] B2.10 Job management routes implement karo
    - `GET /v1/jobs/:job_id`, `GET /v1/jobs/:job_id/results?page&limit&filter`
    - `POST /v1/jobs/:job_id/cancel`, `POST /v1/jobs/:job_id/retry-failed`
    - `POST /v1/jobs/:job_id/export`, `GET /v1/jobs`
    - _Requirements: 3.5, 3.6, 3.7, 3.9, 10.4_
  - [ ]* B2.11 Property test: retry only failed items (fast-check)
    - **Property 7: Retry Only Failed Items** — retry-failed sirf `failed` items re-queue kare
    - Tag: `Feature: enrichment-saas-aws, Property 7`
    - **Validates: Requirements 3.7**
  - [ ] B2.12 Single domain enrichment implement karo: `POST /v1/enrich/domain`
    - Same pipeline, single domain
    - _Requirements: 14.5_
  - [ ] B2.13 Tenant isolation middleware wire karo
    - Har route par `tenant_guard` middleware apply karo
    - Cross-tenant 403 + audit log
    - _Requirements: 2.5, 2.6_
  - [ ]* B2.14 Property test: tenant isolation (fast-check)
    - **Property 2: Tenant Isolation** — koi bhi response doosre tenant ka data return na kare
    - Tag: `Feature: enrichment-saas-aws, Property 2`
    - **Validates: Requirements 2.5, 2.6**
  - [ ] B2.15 HTTP quota enforcement implement karo
    - Redis se current usage read, limit check, 402 + upgrade prompt
    - _Requirements: 12.5_
  - [ ] B2.16 `DELETE /v1/account` GDPR endpoint implement karo
    - Account deletion request initiate karo, 30-day deletion schedule
    - _Requirements: 19.7, 19.8_
  - [ ]* B2.17 Integration tests: DB + queue interactions test karo
    - Auth middleware: valid JWT, expired JWT, wrong tenant
    - Job creation: valid input, quota exceeded, too many domains
    - _Requirements: 20.4_


- [ ] B3. Phase B-IDE_2 API Checkpoint
  - Ensure all API tests pass. `/health`, `/ready`, auth routes, job creation, tenant isolation sab kaam karein.

---

### B-IDE_1: Frontend Dashboard

- [ ] B4. `packages/ui` — Shared component library (IDE_1)
  - [ ] B4.1 `packages/ui` setup karo: Vite library mode, Tailwind CSS, TypeScript
    - Design Section 13.3 ka color system `tailwind.config.ts` mein define karo
    - Space Grotesk, Manrope, JetBrains Mono fonts configure karo
    - _Requirements: 11.8_
  - [ ] B4.2 Base components banao: `Button`, `IconButton`, `Card`, `Badge`, `Modal`, `Toast`
    - Button: primary (teal), secondary, ghost, danger variants
    - Badge: status color mapping (Design Section 13.4)
    - _Requirements: 11.1_
  - [ ] B4.3 Data components banao: `DataTable`, `FilterChips`, `Drawer`, `Tabs`, `SegmentedControl`
    - DataTable: sortable, selectable, keyboard navigable
    - Drawer: right-side detail panel, focus trap
    - _Requirements: 11.7, 11.8_
  - [ ] B4.4 Enrichment-specific components banao: `StatCard`, `ProgressBar`, `UsageBar`, `EmptyState`, `InlineAlert`
    - StatCard: JetBrains Mono metric number
    - ProgressBar: animated width transition
    - UsageBar: HTTP + browser credit consumption visualization
    - _Requirements: 11.2, 11.6_
  - [ ] B4.5 Input components banao: `DomainInputBox`, `UploadDropzone`, `PricingCard`
    - DomainInputBox: multi-line paste, domain count detection
    - UploadDropzone: CSV drag-and-drop
    - _Requirements: 11.3_


- [ ] B5. `apps/web` — Dashboard SPA (IDE_1)
  - [ ] B5.1 `apps/web` setup karo: Vite, React 18, TanStack Query, React Router v6, `packages/ui` import
    - App shell layout: sidebar + topbar (Design Section 13.5)
    - Route structure: `/login`, `/signup`, `/dashboard`, `/jobs/*`, `/results/*`, `/billing`, `/api-keys`, `/settings/*`, `/integrations`
    - _Requirements: 11.1_
  - [ ] B5.2 Auth pages banao: Login (`/login`), Signup (`/signup`)
    - Login: split-screen, brand statement, form (email, password, remember me)
    - Signup: name, workspace name, email, password
    - JWT store karo, redirect on success
    - _Requirements: 2.1, 2.2_
  - [ ] B5.3 Overview Dashboard (`/dashboard`) banao
    - 6 StatCards: enriched this month, success rate, browser credits, HTTP rows used, active jobs, recent exports
    - Recent jobs table
    - Billing usage rail (HTTP + credits bars)
    - Design Section 13.6 Page 3 ka layout follow karo
    - _Requirements: 11.2_
  - [ ] B5.4 New Job page (`/jobs/new`) banao
    - Step flow: input method → domain input → mode selection → options → estimate → submit
    - Paste links, CSV upload, Google Sheet tabs
    - Mode selector cards: Fast HTTP, Smart Hybrid (recommended), Premium JS
    - Estimated cost + time display
    - Inline quota exceeded alert
    - _Requirements: 11.3, 11.4, 11.5_
  - [ ] B5.5 Jobs List page (`/jobs`) banao
    - Paginated table: Job Name, Mode, Status badge, Progress mini-bar, Created At, Actions
    - Filters: Status, Mode, Date Range
    - _Requirements: 11.1_
  - [ ] B5.6 Job Detail page (`/jobs/:id`) banao
    - Real-time progress bar (3-second polling via TanStack Query `refetchInterval`)
    - Counters: completed, failed, queued; HTTP vs Browser split
    - Error summary cards with "what to do next" guidance
    - Cancel, Retry Failed, Export buttons
    - Results preview table
    - Copy shortcuts: "Copy All Emails", "Copy All Phones", "Copy All LinkedIn"
    - `useJobProgress` hook implement karo (Design Section 13.14)
    - _Requirements: 11.6, 10.3_
  - [ ] B5.7 Results Explorer (`/results/:job_id`) banao
    - Filter rail: has email, has phone, has LinkedIn, high confidence, browser only, failed only
    - DataTable: Domain, Email, Phone, LinkedIn, Confidence, Lane
    - Row click → Detail Drawer (company identity, contact, social, signals, source URLs)
    - Export selected, copy selected emails, push to Google Sheet, resend webhook
    - _Requirements: 11.7_
  - [ ] B5.8 API error handling implement karo
    - User-friendly error messages (Design Section error messages)
    - Retry option har error state mein
    - Loading: skeleton loaders (spinners nahi)
    - Empty states: `EmptyState` component with CTA
    - _Requirements: 11.9_
  - [ ]* B5.9 Unit tests: key components ke liye
    - New Job page domain parsing, mode selection, estimate calculation
    - Job Detail polling logic
    - _Requirements: 20.1_


- [ ] B6. Phase B-IDE_1 Frontend Checkpoint
  - Ensure all UI component tests pass. Auth flow, Overview, New Job, Job Detail pages kaam karein. API mock ke saath test karo.

---

### B-IDE_3: Enrichment Workers

- [ ] B7. `apps/worker-http` — HTTP enrichment worker (IDE_3)
  - [ ] B7.1 `apps/worker-http` setup karo: Python, `requirements.txt`, `Dockerfile`
    - Dependencies: `boto3`, `requests`, `beautifulsoup4`, `phonenumbers`, `redis`
    - `packages/extractor-core` aur `packages/domain-normalizer` import karo
    - _Requirements: 5.1_
  - [ ] B7.2 `apps/worker-http/worker.py` — SQS consumer main loop banao
    - `HttpJobPayload` receive karo, `JobItem` status → `processing_http`
    - Message delete on success, visibility timeout extend on processing
    - _Requirements: 5.1, 5.8_
  - [ ] B7.3 `apps/worker-http/fetcher.py` banao
    - `requests.Session` with User-Agent rotation (minimum 10 agents pool)
    - Timeout: 30s total, 5s connect; content size cap: 5MB → `blocked` status
    - HTTPS first, HTTP fallback
    - Page discovery: `/contact`, `/about`, `/team`, `/support`, `/company`, `/careers`, footer/header links
    - DNS caching, connection pooling
    - `robots.txt` respect karo
    - _Requirements: 5.1, 5.2, 5.9, 5.15, 5.16, 18.1, 18.5, 18.7, 18.8, 18.9_
  - [ ] B7.4 Retry logic implement karo
    - Transient errors (DNS, timeout, 5xx): max 3 retries, exponential backoff (2s, 4s, 8s)
    - Permanent errors (404, SSL, invalid domain): immediate fail, no retry
    - 3 retries ke baad DLQ move
    - _Requirements: 5.11, 5.12, 5.13_
  - [ ]* B7.5 Property test: HTTP retry limit invariant (Hypothesis)
    - **Property 8: HTTP Retry Limit Invariant** — transient errors max 3 attempts, permanent errors exactly 1
    - Tag: `Feature: enrichment-saas-aws, Property 8`
    - **Validates: Requirements 5.11, 5.12**
  - [ ] B7.6 Per-domain cooldown aur circuit breaker implement karo (Redis)
    - Minimum 2 second cooldown per domain
    - 429 response → domain 10 minutes skip (Redis TTL key)
    - Circuit breaker: 3 consecutive failures → 1 hour skip
    - _Requirements: 5.10, 5.14, 18.1, 18.10_
  - [ ] B7.7 `apps/worker-http/js_detector.py` banao
    - JS-heavy heuristics: empty root div, `__NEXT_DATA__`, `__NUXT__`, `vite`, `webpack` signals
    - Low text-to-HTML ratio check
    - No emails/phones found despite 200 response
    - _Requirements: 6.1, 6.2_
  - [ ] B7.8 Smart hybrid escalation implement karo
    - `smart_hybrid` + JS-heavy → `Browser_Queue` escalate
    - `fast_http` mode → browser escalation nahi
    - `premium_js` mode → directly `Browser_Queue` (API service handle karta hai)
    - HTTP vs browser completion counters track karo
    - _Requirements: 6.3, 6.4, 6.6_
  - [ ] B7.9 Per-tenant concurrency cap implement karo (Redis)
    - Starter: 5 concurrent HTTP, Growth: 15, Pro: 30
    - Global cap: 100 simultaneous requests
    - Fair scheduling: ek heavy tenant doosron ko slow na kare
    - _Requirements: 18.2, 18.3, 18.11_
  - [ ] B7.10 Result save karo: DB update + S3 snapshot + webhook notification
    - `EnrichmentResult` DB mein save karo
    - S3 mein raw HTML snapshot (7-day TTL)
    - `JobItem` status update, job progress counter update (Redis atomic)
    - `Webhook_Queue` mein notification push
    - _Requirements: 5.8, 19.2_
  - [ ]* B7.11 Unit tests: fetcher, js_detector, retry logic
    - Mock HTTP responses ke saath test karo
    - _Requirements: 20.3_


- [ ] B8. `apps/worker-browser` — Playwright browser enrichment worker (IDE_3)
  - [ ] B8.1 `apps/worker-browser` setup karo: Node.js, TypeScript, Playwright, `packages/contracts` import
    - `Dockerfile` mein Playwright + Chromium install karo
    - _Requirements: 7.1_
  - [ ] B8.2 `apps/worker-browser/src/worker.ts` — SQS consumer banao
    - `BrowserJobPayload` receive karo
    - Pre-flight checks: Browser_Credits (Redis), per-tenant concurrency, global cap (20 max)
    - Zero credits → `insufficient_credits` status, no processing
    - _Requirements: 7.7, 7.8, 7.9, 7.13_
  - [ ]* B8.3 Property test: browser credit deduction invariant (fast-check)
    - **Property 10: Browser Credit Deduction Invariant** — successful enrichment par exactly 1 credit deduct, zero se neeche kabhi nahi
    - Tag: `Feature: enrichment-saas-aws, Property 10`
    - **Validates: Requirements 7.8, 7.9**
  - [ ] B8.4 `apps/worker-browser/src/browser_pool.ts` banao
    - Playwright chromium headless pool management
    - Images/fonts/videos block karo (performance)
    - Zombie browser detect + kill + re-queue
    - _Requirements: 7.1, 7.6, 7.12_
  - [ ] B8.5 `apps/worker-browser/src/page_navigator.ts` banao
    - Homepage render + network idle wait
    - Consent popup dismiss strategy (common patterns)
    - Routes navigate: `/contact`, `/about`, `/team`, `/company`, `/support`, `/careers`
    - 30s strict timeout per page → `browser_timeout` status, partial result save
    - _Requirements: 7.2, 7.3, 7.5_
  - [ ] B8.6 Extraction integrate karo: rendered DOM se `extractor-core` use karo
    - Python subprocess ya shared extraction logic call karo
    - `EnrichmentResult` DB mein save karo, S3 JSON blob, webhook notification
    - Browser_Credit deduct (Redis atomic `DECRBY`)
    - `usage_counters` DB update
    - _Requirements: 7.4, 7.8, 8.5_
  - [ ] B8.7 Browser retry logic implement karo
    - Transient errors: max 2 retries
    - Permanent errors (domain unreachable, SSL): immediate fail
    - _Requirements: 7.10, 7.11_
  - [ ]* B8.8 Unit tests: browser pool, page navigator, credit deduction
    - Mock Playwright ke saath test karo
    - _Requirements: 20.3_

- [ ] B9. Phase B-IDE_3 Workers Checkpoint
  - Ensure HTTP worker aur browser worker tests pass. SQS mock ke saath end-to-end flow test karo: message receive → extract → result save.


### B-IDE_2: Infrastructure (Terraform)

- [ ] B10. `infra/terraform` — AWS infrastructure as code (IDE_2)
  - [ ] B10.1 Terraform root setup karo: `main.tf`, `variables.tf`, `outputs.tf`
    - AWS provider, remote state (S3 backend), VPC, subnets, security groups
    - _Requirements: 13.1_
  - [ ] B10.2 `infra/terraform/rds.tf` banao
    - RDS PostgreSQL instance, automated daily backups, 7-day retention
    - Multi-AZ optional (V1 single AZ ok)
    - _Requirements: 13.5, 13.16_
  - [ ] B10.3 `infra/terraform/redis.tf` banao
    - ElastiCache Redis cluster, encryption at rest
    - _Requirements: 13.6_
  - [ ] B10.4 `infra/terraform/sqs.tf` banao
    - 5 queues: `enr-http-queue`, `enr-browser-queue`, `enr-webhook-queue`, `enr-export-queue`, `enr-dlq`
    - 2 priority queues: `enr-http-queue-priority`, `enr-browser-queue-priority`
    - Visibility timeouts, DLQ redrive policies (Design Section 7.1)
    - _Requirements: 13.7, 13.17_
  - [ ] B10.5 `infra/terraform/s3.tf` banao
    - Raw HTML snapshots bucket (7-day lifecycle), JSON blobs bucket, CSV exports bucket (48h lifecycle), screenshots bucket
    - SSE-S3 encryption, lifecycle policies
    - _Requirements: 13.8, 19.2, 19.3_
  - [ ] B10.6 `infra/terraform/ecs.tf` banao
    - ECS Fargate: API service, HTTP worker, Webhook worker, Export worker
    - ECS EC2 ASG: Browser worker (Playwright pool)
    - ECR repositories for all services
    - ALB + target groups + health checks
    - _Requirements: 13.2, 13.3, 13.4_
  - [ ] B10.7 CloudFront + S3 static hosting configure karo
    - React SPA ke liye S3 bucket + CloudFront distribution
    - _Requirements: 13.1_
  - [ ] B10.8 CloudWatch alarms configure karo
    - Queue depth alarms (Design Section 7.6)
    - ECS auto scaling: CPU, memory, queue depth metrics
    - AWS Budget alerts
    - Per-worker metrics: throughput, success rate, avg processing time
    - _Requirements: 13.9, 13.10, 13.11, 13.14, 13.15_
  - [ ] B10.9 AWS Secrets Manager resources configure karo
    - DB password, Redis auth, JWT keys, Stripe keys, SES credentials
    - IAM roles + policies for each service
    - _Requirements: 13.2, 16.2_
  - [ ] B10.10 Sentry integration configure karo
    - API service aur workers mein Sentry DSN environment variable inject karo
    - _Requirements: 13.13_

- [ ] B11. Phase B Infrastructure Checkpoint
  - Terraform `plan` run karo, koi errors na hon. Staging environment deploy karo.

---

## PHASE C — Support Services + Integration

---

- [ ] C1. `apps/worker-webhooks` — Webhook delivery worker (IDE_2)
  - [ ] C1.1 `apps/worker-webhooks/src/worker.ts` — SQS Webhook_Queue consumer banao
    - `WebhookJobPayload` receive karo
    - Redis dedupe check (delivery_id TTL)
    - _Requirements: 9.1, 9.6_
  - [ ] C1.2 `apps/worker-webhooks/src/delivery.ts` banao
    - HMAC-SHA256 signature generate karo: `X-Enrichment-Signature: sha256=<hex>`
    - `X-Enrichment-Timestamp` header + 5 min replay protection
    - Exponential backoff retry: max 5 attempts
    - Delivery status DB update
    - _Requirements: 9.2, 9.3_
  - [ ]* C1.3 Property test: webhook HMAC verification round-trip (fast-check)
    - **Property 11: Webhook HMAC Verification Round-Trip** — `verify(secret, body, signature) == true`
    - Tag: `Feature: enrichment-saas-aws, Property 11`
    - **Validates: Requirements 9.2, 16.5**
  - [ ]* C1.4 Property test: webhook retry limit (fast-check)
    - **Property 12: Webhook Retry Limit** — delivery attempts kabhi 5 se zyada na hon
    - Tag: `Feature: enrichment-saas-aws, Property 12`
    - **Validates: Requirements 9.3**
  - [ ] C1.5 Webhook management API routes implement karo (apps/api mein)
    - `GET /v1/webhooks`, `POST /v1/webhooks`, `DELETE /v1/webhooks/:id`
    - `GET /v1/webhooks/:id/deliveries`, `POST /v1/webhooks/:id/resend/:delivery_id`
    - Webhook delivery history dashboard mein show karo
    - _Requirements: 9.4, 9.5_


- [ ] C2. `apps/worker-exports` — CSV/JSON export worker (IDE_2)
  - [ ] C2.1 `apps/worker-exports/src/worker.ts` — SQS Export_Queue consumer banao
    - `ExportJobPayload` receive karo, export status → `processing`
    - _Requirements: 10.1_
  - [ ] C2.2 `apps/worker-exports/src/generators/` banao
    - `csv-generator.ts`: results stream karo S3 mein (>100k rows ke liye memory buffer nahi)
    - `json-generator.ts`: JSON export
    - Filters apply karo: `has_email`, `has_phone`, `confidence`
    - _Requirements: 10.1, 10.2_
  - [ ] C2.3 S3 upload + presigned URL generate karo
    - 48-hour expiry URL
    - Export status → `completed`, download URL DB mein save
    - SES notification trigger karo (export ready email)
    - _Requirements: 10.2, 10.5, 21.2_
  - [ ]* C2.4 Unit tests: CSV/JSON generation, S3 upload mock
    - Large export streaming test karo
    - _Requirements: 10.1, 10.2_

- [ ] C3. Stripe billing integration (IDE_2)
  - [ ] C3.1 Stripe billing routes implement karo (apps/api mein)
    - `GET /v1/billing/usage`, `GET /v1/billing/plan`
    - `POST /v1/billing/upgrade`, `POST /v1/billing/credits/purchase`
    - `POST /v1/stripe/webhook` (internal Stripe events handler)
    - _Requirements: 12.7, 12.9_
  - [ ] C3.2 Stripe webhook handler implement karo
    - `subscription.created` → tenant plan update, `usage_counters` initialize
    - `subscription.updated` → plan change, limits update
    - `subscription.deleted` → downgrade/suspend
    - `invoice.payment_failed` → SES billing alert email
    - `checkout.session.completed` → credit pack add
    - _Requirements: 12.7_
  - [ ] C3.3 Monthly usage counter reset implement karo
    - Billing cycle start par: `http_enrichments_used = 0`, `browser_credits_remaining = plan.browser_credits + purchased_packs`
    - _Requirements: 12.10_
  - [ ]* C3.4 Property test: usage counter reset (fast-check)
    - **Property 14: Usage Counter Reset** — billing cycle start par counters correctly reset hon
    - Tag: `Feature: enrichment-saas-aws, Property 14`
    - **Validates: Requirements 12.10**
  - [ ] C3.5 Browser credit pack purchase flow implement karo
    - 100 credits $19, 500 credits $79, 1000 credits $139
    - _Requirements: 12.9_


- [ ] C4. `packages/sdk-node` — Public Node.js SDK (IDE_2)
  - [ ] C4.1 `packages/sdk-node/src/client.ts` banao
    - `EnrichmentClient` class: constructor mein `apiKey` accept karo
    - `createJob(domains, options)`, `uploadCSV(file, options)`, `waitForCompletion(jobId)`, `fetchResults(jobId, filters)`, `resendWebhook(webhookId, deliveryId)`
    - _Requirements: 14.7_
  - [ ] C4.2 `packages/sdk-node/src/types.ts` banao
    - `packages/contracts` se types re-export karo
    - _Requirements: 14.8_
  - [ ]* C4.3 Unit tests: SDK methods mock API ke saath test karo
    - `waitForCompletion` polling logic test karo
    - _Requirements: 14.7_

- [ ] C5. `packages/ui` completion + Billing/Settings pages (IDE_1)
  - [ ] C5.1 Billing page (`/billing`) banao
    - Current plan display, HTTP usage bar, browser credits bar
    - Upgrade CTA, credit pack purchase cards
    - Recent invoices table
    - Design Section 13.6 Page 9 ka layout follow karo
    - _Requirements: 12.8_
  - [ ] C5.2 API Keys page (`/api-keys`) banao
    - Keys table: prefix display (`enr_sk_abc...xyz`), JetBrains Mono
    - Create key modal: reveal-once UX
    - Revoke action per key
    - _Requirements: 2.7_
  - [ ] C5.3 Team Settings page (`/settings/team`) banao
    - Members list with roles (owner/admin/member)
    - Invite by email
    - Workspace settings
    - _Requirements: 11.1_
  - [ ] C5.4 Integrations page (`/integrations`) banao
    - Sections: Webhooks, n8n, Google Sheets, Node SDK, API Docs
    - Setup + Docs buttons per integration
    - _Requirements: 11.1, 15.2, 15.3_
  - [ ] C5.5 Notification preferences page banao (`/settings/account`)
    - Email notifications enable/disable per event type
    - _Requirements: 21.6_


- [ ] C6. n8n + Google Sheets integration (IDE_2)
  - [ ] C6.1 n8n compatible polling endpoints verify karo
    - `GET /v1/jobs/:job_id` polling pattern already implemented hai — n8n docs mein document karo
    - Sample n8n workflow template `docs/integrations/n8n-workflow.json` mein banao
    - _Requirements: 15.1, 15.2_
  - [ ] C6.2 Google Sheets integration implement karo
    - `POST /v1/integrations/sheets/sync` endpoint banao
    - Google Sheets Apps Script connector template `docs/integrations/sheets-connector.gs` mein banao
    - Selected rows → API → completed results same sheet mein new columns mein
    - _Requirements: 15.3, 15.4, 15.5_

- [ ] C7. Email notification system (IDE_2)
  - [ ] C7.1 SES email templates banao
    - Job completion email: total enriched, success rate, export link
    - Export ready email: S3 download link (48h expiry)
    - Browser credits warning email (10% threshold)
    - Billing alert email (payment failed)
    - Unsubscribe link har email mein
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.7_
  - [ ] C7.2 SES notification triggers wire karo
    - Job completion → SES call (Export_Worker ya API service se)
    - Credits 10% → SES call (Browser_Worker se)
    - Stripe payment failed → SES call (Stripe webhook handler se)
    - _Requirements: 21.1, 21.3, 21.4, 21.5_

- [ ] C8. Data retention aur cleanup (IDE_2)
  - [ ] C8.1 S3 lifecycle policies Terraform mein configure karo
    - Raw HTML: 7 days, Export files: 48 hours
    - _Requirements: 19.2, 19.3_
  - [ ] C8.2 DB cleanup scheduled job implement karo
    - `enrichment_results` 90 days ke baad delete
    - `enrichment_jobs` 90 days ke baad delete
    - `webhook_deliveries` 30 days ke baad delete
    - `audit_logs` 1 year ke baad delete
    - _Requirements: 19.1, 19.4, 19.5, 19.6_
  - [ ] C8.3 GDPR account deletion flow complete karo
    - 30-day deletion schedule implement karo
    - Deletion confirmation email (SES)
    - _Requirements: 19.7, 19.8, 19.9_
  - [ ]* C8.4 Property test: result expiry invariant (fast-check)
    - **Property 15: Result Expiry Invariant** — 90 days se purane results koi bhi API endpoint return na kare
    - Tag: `Feature: enrichment-saas-aws, Property 15`
    - **Validates: Requirements 19.1**


- [ ] C9. Migration from jento-mailer (IDE_3 + IDE_2)
  - [ ] C9.1 SQLite → PostgreSQL migration script banao (IDE_2)
    - Enrichment-related data preserve karo
    - Rollback plan: agar PostgreSQL migration fail ho to SQLite backup se restore
    - _Requirements: 17.3, 17.4_
  - [ ] C9.2 `apps/worker-http` migration verify karo (IDE_3)
    - `jento-mailer/services/enrichment.py` ka logic `packages/extractor-core` mein fully migrate hua hai — verify karo
    - _Requirements: 17.1_
  - [ ] C9.3 `apps/worker-browser` migration verify karo (IDE_3)
    - `jento-mailer/scraper/website-intelligence.js` ka logic `apps/worker-browser` mein fully migrate hua hai — verify karo
    - _Requirements: 17.2_

- [ ] C10. OpenAPI documentation (IDE_2)
  - [ ] C10.1 OpenAPI/Swagger auto-generation configure karo
    - Fastify/Express se OpenAPI spec generate karo
    - `docs/api/openapi.yaml` mein output karo
    - _Requirements: 14.9_

- [ ] C11. CI/CD pipeline (IDE_2)
  - [ ] C11.1 GitHub Actions workflow banao: `.github/workflows/ci.yml`
    - Per PR: `pnpm install`, TypeScript typecheck, unit + property tests, coverage check (70% minimum)
    - _Requirements: 20.6, 20.7_
  - [ ] C11.2 Docker build + ECR push job banao
    - Main branch merge par: Docker images build, ECR push
    - _Requirements: 20.10_
  - [ ] C11.3 Staging deploy job banao
    - Main branch merge par: ECS staging deploy
    - _Requirements: 20.8_
  - [ ]* C11.4 End-to-end test implement karo (staging environment)
    - Complete flow: job create → HTTP_Queue → worker process → result save → webhook fire
    - _Requirements: 20.5_

- [ ] C12. Final Checkpoint — Ensure all tests pass
  - Sab packages aur services ke tests pass hon. Coverage 70%+ ho. Staging environment pe end-to-end flow verify karo. User ko questions hon to poochho.

---

## Notes

- Tasks marked with `*` optional hain — MVP ke liye skip kar sakte hain
- Har task specific requirements se traceable hai
- Phase A complete hone ke baad hi Phase B shuru karo
- Phase B ke andar IDE_1, IDE_2, IDE_3 parallel kaam kar sakte hain
- Property tests `hypothesis` (Python) aur `fast-check` (TypeScript) use karein
- Minimum 100 iterations per property test
- Tag format: `Feature: enrichment-saas-aws, Property {N}: {property_text}`
