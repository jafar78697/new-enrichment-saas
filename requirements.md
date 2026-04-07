# Requirements Document — Enrichment SaaS AWS

## Introduction

Yeh document ek cloud-based, multi-tenant **website enrichment SaaS** ka requirements specification hai.

Platform ka naam: **Enrichment SaaS**

Core promise: "Website links ya CSV do — hum bulk me companies ki websites ko enrich karke aapko usable contact aur business data dein."

### Scope — Kya Hai Is SaaS Mein

- Website enrichment — HTTP (simple/static sites) aur Browser/JS (JavaScript-heavy SPAs)
- Bulk async enrichment jobs via AWS queues
- Multi-tenant dashboard, API keys, billing
- Export (CSV/JSON), webhooks, n8n/Google Sheets integration

### Scope — Kya NAHI Hai Is SaaS Mein

- Google Maps scraper ya koi bhi lead scraping tool
- Email outreach system (campaigns, Gmail SMTP/IMAP, follow-ups)
- Email warmup system
- AI email generation
- Inbox management

System do enrichment lanes chalayega:
- **HTTP Lane** — fast, cheap, static/WordPress websites ke liye
- **Browser Lane** — premium, Playwright-based, JS-heavy/SPA sites ke liye

Platform multi-tenant hoga jahan har user ka apna dashboard, apna data, apni API keys, aur apna billing hoga. 2-3 IDEs parallel kaam kar sakein is liye monorepo structure use hogi jahan har IDE ka clearly defined folder ownership hoga.

---

## Glossary

- **System**: Poora Enrichment SaaS platform
- **API_Service**: Backend REST API aur control plane (ECS Fargate) — TypeScript/Node.js
- **HTTP_Worker**: Fast HTTP enrichment worker service — Python
- **Browser_Worker**: Playwright-based premium enrichment worker service — Node.js
- **Webhook_Worker**: Webhook delivery worker service — TypeScript/Node.js
- **Export_Worker**: CSV/JSON export job worker service — TypeScript/Node.js
- **Dashboard**: React-based frontend web application — TypeScript/React
- **Tenant**: Ek registered organization ya user account
- **Workspace**: Tenant ke andar ek team unit
- **Enrichment_Job**: Ek bulk enrichment request jo multiple domains process kare
- **Job_Item**: Ek single domain/website jo kisi Enrichment_Job ka hissa ho
- **Enrichment_Result**: Ek Job_Item ka final extracted output
- **HTTP_Queue**: SQS queue jo HTTP enrichment jobs hold kare
- **Browser_Queue**: SQS queue jo browser enrichment jobs hold kare
- **Webhook_Queue**: SQS queue jo webhook delivery jobs hold kare
- **Export_Queue**: SQS queue jo export jobs hold kare
- **DLQ**: Dead Letter Queue — permanently failed items ke liye
- **DB**: Amazon RDS PostgreSQL database
- **Cache**: Amazon ElastiCache Redis
- **Storage**: Amazon S3 object storage
- **Extractor**: Shared extraction logic package (`packages/extractor-core`)
- **Domain_Normalizer**: URL/domain cleanup aur canonicalization package (`packages/domain-normalizer`)
- **Contracts**: Shared TypeScript types, API schemas, aur queue payload shapes (`packages/contracts`)
- **Auth_Service**: JWT-based authentication aur tenant isolation helpers (`packages/auth`)
- **SDK**: Public Node.js client library (`packages/sdk-node`)
- **Stripe**: Payment aur subscription billing provider
- **Browser_Credit**: Ek premium unit jo ek single domain ke browser enrichment ke liye consume hota hai
- **IDE_1**: Frontend IDE — `apps/web` + `packages/ui`
- **IDE_2**: Backend IDE — `apps/api` + `packages/auth` + `packages/contracts` + `packages/db` + `packages/queue` + `packages/sdk-node` + `apps/worker-webhooks` + `apps/worker-exports` + `infra/`
- **IDE_3**: Enrichment IDE — `apps/worker-http` + `apps/worker-browser` + `packages/extractor-core` + `packages/domain-normalizer`

### Language Stack (Per Service)

| Service | Language | Reason |
|---------|----------|--------|
| `apps/api` | TypeScript (Node.js) | Fast REST API, type safety |
| `apps/web` | TypeScript (React + Vite) | Frontend SPA |
| `apps/worker-http` | Python | requests + BeautifulSoup — existing codebase se migrate |
| `apps/worker-browser` | Node.js (Playwright) | Browser automation Node me best hai |
| `apps/worker-webhooks` | TypeScript (Node.js) | Lightweight queue consumer |
| `apps/worker-exports` | TypeScript (Node.js) | S3 + CSV generation |
| `packages/contracts` | TypeScript | Shared types — sab services use karein |
| `packages/extractor-core` | Python | Existing enrichment.py se refactor |
| `packages/domain-normalizer` | Python | HTTP worker ke saath use hoga |
| `infra/` | Terraform (HCL) | AWS infrastructure as code |

---

## Monorepo Structure aur IDE Ownership

```text
enrichment-saas/
├── apps/
│   ├── web/                  ← IDE_1 owns
│   ├── api/                  ← IDE_2 owns
│   ├── worker-http/          ← IDE_3 owns
│   ├── worker-browser/       ← IDE_3 owns
│   ├── worker-webhooks/      ← IDE_2 owns
│   └── worker-exports/       ← IDE_2 owns
├── packages/
│   ├── contracts/            ← IDE_2 owns (shared foundation)
│   ├── db/                   ← IDE_2 owns
│   ├── auth/                 ← IDE_2 owns
│   ├── queue/                ← IDE_2 owns
│   ├── extractor-core/       ← IDE_3 owns
│   ├── domain-normalizer/    ← IDE_3 owns
│   ├── ui/                   ← IDE_1 owns
│   └── sdk-node/             ← IDE_2 owns
├── infra/
│   ├── terraform/            ← IDE_2 owns
│   └── aws/                  ← IDE_2 owns
└── docs/
```

**Golden Rule**: `1 folder = 1 owner IDE`. Koi bhi IDE apne assigned folder ke bahar edit nahi karega.

---

## Requirements

---

### Requirement 1: Monorepo Foundation aur Shared Contracts

**User Story:** As a developer, I want shared contracts, DB schema, aur queue payloads pehle freeze karna, so that multiple IDEs parallel kaam kar sakein bina merge conflicts ke.

**IDE Ownership: IDE_2**

#### Acceptance Criteria

1. THE System SHALL ek pnpm monorepo structure provide kare jisme `apps/`, `packages/`, `infra/`, aur `docs/` folders hon.
2. THE Contracts package SHALL TypeScript types define kare jo API request/response schemas, queue payload shapes, result schema, aur shared enums cover karein.
3. THE DB package SHALL PostgreSQL schema, migrations, aur repository helpers contain kare.
4. THE Queue package SHALL SQS queue names, producer helpers, aur consumer payload validation contain kare.
5. WHEN koi IDE shared contracts change karna chahe, THEN THE System SHALL require kare ke change `packages/contracts` me ho aur baaki IDEs ko notify kiya jaye.
6. THE Contracts package SHALL version-tagged releases use kare taake breaking changes track ho sakein.

---

### Requirement 2: Multi-Tenant Authentication aur Authorization

**User Story:** As a SaaS user, I want apna alag account banana aur login karna, so that mera data aur settings doosron se isolated rahe.

**IDE Ownership: IDE_2**

#### Acceptance Criteria

1. WHEN ek naya user sign up kare, THE Auth_Service SHALL ek unique Tenant record create kare aur ek default Workspace assign kare.
2. WHEN ek user login kare valid credentials ke saath, THE Auth_Service SHALL ek signed JWT token return kare jisme `tenant_id` aur `workspace_id` claims hon.
3. IF ek request invalid ya expired JWT token ke saath aaye, THEN THE API_Service SHALL 401 Unauthorized response return kare.
4. THE Auth_Service SHALL role-based access control enforce kare jisme teen roles hon: `owner`, `admin`, aur `member`.
5. WHILE ek user kisi bhi API endpoint access kare, THE API_Service SHALL verify kare ke requested resource us user ke `tenant_id` se match karta ho.
6. IF ek user doosre tenant ka data access karne ki koshish kare, THEN THE API_Service SHALL 403 Forbidden return kare aur audit log me entry kare.
7. THE Auth_Service SHALL API keys support kare jo tenant-scoped hon aur dashboard se generate/revoke ho sakein.

---

### Requirement 3: Enrichment Job Creation aur Management

**User Story:** As a user, I want website links ya CSV upload karke bulk enrichment job start, pause, cancel, aur manage karna, so that main apni lead list ko automatically enrich kar sakoon aur job par full control rakha sakoon.

**IDE Ownership: IDE_2 (API) + IDE_1 (Dashboard UI)**

#### Acceptance Criteria

1. WHEN ek user `POST /v1/jobs/enrich` call kare valid domain list ke saath, THE API_Service SHALL ek Enrichment_Job record create kare aur job ID return kare.
2. WHEN ek user CSV file upload kare `POST /v1/jobs/enrich-csv` par, THE API_Service SHALL CSV parse kare, website column detect kare, invalid rows drop kare, aur duplicate domains merge kare.
3. THE API_Service SHALL teen enrichment modes support kare: `fast_http`, `smart_hybrid`, aur `premium_js`.
4. WHEN ek Enrichment_Job create ho, THE API_Service SHALL har domain ke liye ek Job_Item record create kare aur appropriate SQS queue me message push kare.
5. THE API_Service SHALL `GET /v1/jobs/{job_id}` endpoint provide kare jo job status, progress counters, aur error summary return kare.
6. THE API_Service SHALL `GET /v1/jobs/{job_id}/results` endpoint provide kare jo paginated results return kare.
7. WHEN ek user `POST /v1/jobs/{job_id}/retry-failed` call kare, THE API_Service SHALL sirf failed Job_Items ko re-queue kare.
8. THE API_Service SHALL idempotency key support kare taake duplicate job creation prevent ho.
9. WHEN ek user `POST /v1/jobs/{job_id}/cancel` call kare, THE API_Service SHALL job ko `cancelled` mark kare aur remaining queued Job_Items ko SQS se remove kare.
10. THE API_Service SHALL ek Enrichment_Job me maximum 10,000 domains allow kare; is se bada input reject kare aur clear error message return kare.
11. WHEN ek job 10,000 se zyada domains contain kare, THE API_Service SHALL user ko multiple smaller jobs create karne ki guidance de.
12. THE System SHALL large jobs ko internally 500-item shards me process kare taake progress tracking aur partial retries easy hon.
13. THE API_Service SHALL Pro plan ke liye priority queue support kare jahan Pro tenant ke jobs standard tenant ke jobs se pehle process hon.

---

### Requirement 4: Domain Normalization aur Deduplication

**User Story:** As a user, I want ke system automatically URLs clean kare aur duplicates remove kare, so that main same domain ko baar baar enrich karne ke liye pay na karoon.

**IDE Ownership: IDE_3**

#### Acceptance Criteria

1. WHEN ek domain input receive ho, THE Domain_Normalizer SHALL `https://`, `http://`, `www.`, trailing slashes, aur query parameters remove karke canonical domain produce kare.
2. THE Domain_Normalizer SHALL punycode/internationalized domains ko normalized form me convert kare.
3. WHEN ek Enrichment_Job me duplicate domains hon, THE API_Service SHALL Domain_Normalizer use karke duplicates merge kare aur user ko count bataye.
4. FOR ALL valid domain inputs, THE Domain_Normalizer SHALL normalize(normalize(domain)) == normalize(domain) property satisfy kare (idempotent normalization).
5. IF ek input string valid domain format me na ho, THEN THE Domain_Normalizer SHALL ek descriptive error return kare.

---

### Requirement 5: Fast HTTP Enrichment Lane

**User Story:** As a user, I want ke static websites fast aur cheaply enrich hon, so that main bulk lead lists affordable price par process kar sakoon.

**IDE Ownership: IDE_3**

#### Acceptance Criteria

1. WHEN HTTP_Worker ek Job_Item receive kare HTTP_Queue se, THE HTTP_Worker SHALL target website ka homepage fetch kare aur HTML parse kare.
2. THE HTTP_Worker SHALL automatically yeh pages discover aur fetch kare: `/contact`, `/about`, `/team`, `/support`, `/company`, `/careers`, aur footer/header me discovered internal links.
3. THE Extractor SHALL HTML se emails extract kare in priority order: `mailto:` links, visible public emails, obfuscated email patterns.
4. THE Extractor SHALL HTML se phone numbers extract kare aur `tel:` links parse kare. Phone numbers E.164 format me normalize kiye jayein.
5. THE Extractor SHALL social media links extract kare: LinkedIn company page, Facebook, Instagram, X/Twitter, YouTube, TikTok, WhatsApp, Telegram.
6. THE Extractor SHALL JSON-LD aur schema.org structured data parse kare company name, address, aur description ke liye.
7. THE Extractor SHALL junk emails filter kare jo image filenames, CDN URLs, no-reply addresses, ya platform/vendor emails hon.
8. WHEN HTTP enrichment complete ho, THE HTTP_Worker SHALL Enrichment_Result DB me save kare aur Job_Item status update kare.
9. IF target website 30 seconds me respond na kare, THEN THE HTTP_Worker SHALL Job_Item ko `failed` mark kare aur error reason save kare.
10. THE HTTP_Worker SHALL per-domain cooldown minimum 2 seconds enforce kare taake IP banning se bacha ja sake.
11. THE HTTP_Worker SHALL transient errors (DNS failure, timeout, 5xx) par maximum 3 retries kare exponential backoff ke saath (2s, 4s, 8s).
12. THE HTTP_Worker SHALL permanent errors (invalid domain, 404, SSL failure) par retry nahi karega aur immediately `failed` mark karega.
13. WHEN ek domain 3 retries ke baad bhi fail ho, THE HTTP_Worker SHALL Job_Item ko DLQ me move kare.
14. THE HTTP_Worker SHALL circuit breaker pattern implement kare: agar ek domain 3 consecutive failures de to us domain ko 1 hour ke liye skip kare.
15. THE HTTP_Worker SHALL response content size 5MB se zyada hone par processing skip kare aur `blocked` status set kare.
16. THE HTTP_Worker SHALL User-Agent rotation use kare common browser user agents ke pool se.

---

### Requirement 6: JS Detection aur Smart Hybrid Mode

**User Story:** As a user, I want ke system automatically detect kare ke koi website JS-heavy hai, so that sirf zaroorat par premium browser lane use ho aur cost control me rahe.

**IDE Ownership: IDE_3**

#### Acceptance Criteria

1. WHEN HTTP enrichment complete ho aur result incomplete ho, THE HTTP_Worker SHALL JS detection heuristics run kare.
2. THE HTTP_Worker SHALL website ko JS-heavy classify kare WHEN in me se koi bhi condition true ho: initial HTML me bohat kam readable text ho, root div empty ho, `__NEXT_DATA__` ya `__NUXT__` ya `vite` ya `webpack` signs milin, ya emails/phones HTTP pass me na milin.
3. WHERE `smart_hybrid` mode selected ho, WHEN JS-heavy site detect ho, THE HTTP_Worker SHALL Job_Item ko Browser_Queue me escalate kare.
4. WHERE `fast_http` mode selected ho, THE HTTP_Worker SHALL browser escalation nahi karega chahe JS signals milin.
5. WHERE `premium_js` mode selected ho, THE HTTP_Worker SHALL har domain ko directly Browser_Queue me bheje bina HTTP pass ke.
6. THE System SHALL track kare ke kitne domains HTTP se complete hue aur kitne browser lane me gaye.

---

### Requirement 7: Premium Browser Enrichment Lane

**User Story:** As a user, I want ke JS-heavy websites bhi properly enrich hon, so that main React/Next.js/SPA-based company websites se bhi contact data nikal sakoon.

**IDE Ownership: IDE_3**

#### Acceptance Criteria

1. WHEN Browser_Worker ek Job_Item receive kare Browser_Queue se, THE Browser_Worker SHALL Playwright headless browser launch kare aur target website render kare.
2. THE Browser_Worker SHALL yeh pages navigate kare: `/contact`, `/about`, `/team`, `/company`, `/support`, `/careers`.
3. THE Browser_Worker SHALL basic consent popup dismiss karne ki strategy use kare.
4. THE Browser_Worker SHALL rendered DOM se emails, phones, aur social links extract kare Extractor package use karke.
5. IF browser render 30 seconds me complete na ho, THEN THE Browser_Worker SHALL Job_Item ko `browser_timeout` status de aur result partial save kare.
6. THE Browser_Worker SHALL images, fonts, aur videos block kare taake rendering fast ho.
7. THE Browser_Worker SHALL per-tenant concurrency quota enforce kare: Starter 2 concurrent, Growth 5 concurrent, Pro 10 concurrent.
8. THE Browser_Worker SHALL ek Browser_Credit deduct kare Tenant ke usage counter se har successful browser enrichment par.
9. IF Tenant ke Browser_Credits zero hon, THEN THE Browser_Worker SHALL Job_Item ko `insufficient_credits` status de aur queue se nahi process kare.
10. THE Browser_Worker SHALL transient browser errors par maximum 2 retries kare.
11. THE Browser_Worker SHALL permanent browser failures (domain unreachable, SSL error) par retry nahi karega.
12. WHEN Browser_Worker crash ho ya zombie browser detect ho, THE Browser_Worker SHALL browser process kill kare aur Job_Item ko re-queue kare.
13. THE Browser_Worker SHALL global concurrency cap 20 simultaneous browser instances enforce kare across all tenants.

---

### Requirement 8: Enrichment Result Data Model

**User Story:** As a user, I want ke enrichment results structured aur complete hon, so that main directly sales outreach ke liye use kar sakoon.

**IDE Ownership: IDE_2 (DB schema) + IDE_3 (extraction logic)**

#### Acceptance Criteria

1. THE System SHALL har Enrichment_Result me yeh contact fields store kare: primary email, additional emails list, primary phone (E.164), additional phones list, contact page URL, contact form URL.
2. THE System SHALL har Enrichment_Result me yeh social fields store kare: LinkedIn company page, Facebook, Instagram, X/Twitter, YouTube, TikTok, WhatsApp link, Telegram link.
3. THE System SHALL har Enrichment_Result me yeh company intelligence fields store kare: company name, brand name, page title, meta description, short summary (one_line_pitch), long summary, services list, products list, industry guess, target audience hints, language, address, city, country, about page URL, careers page URL, support page URL.
4. THE System SHALL har Enrichment_Result me yeh technical signals store kare: CMS guess, frontend framework guess, ecommerce signal, SaaS signal, booking signal, analytics/pixel hints, cta_type.
5. THE System SHALL har field ke saath confidence score aur extraction source URL store kare.
6. THE System SHALL verified_public_data aur inferred_data ko alag JSON columns me store kare taake mixing na ho.
7. THE System SHALL Enrichment_Result ka overall confidence level store kare: `high_confidence`, `medium_confidence`, ya `low_confidence`.
8. THE System SHALL Job_Item status track kare in values me: `queued`, `processing_http`, `processing_browser`, `completed`, `partial`, `failed`, `blocked`, `browser_timeout`, `insufficient_credits`.
9. THE System SHALL same domain ke results ko cross-tenant cache nahi karega — har tenant ka data isolated rahega.
10. THE System SHALL ek domain ke liye cached result 7 din tak valid mane aur us ke baad re-enrichment allow kare.

#### Out of Scope (V1)
- WhatsApp number extraction (link extraction in scope, number parsing out of scope)
- AI-generated summaries (deterministic extraction only in V1)

---

### Requirement 9: Webhook Delivery System

**User Story:** As an automation user, I want ke enrichment complete hone par mujhe webhook notification mile, so that main apne n8n ya custom workflow me automatically next steps trigger kar sakoon.

**IDE Ownership: IDE_2**

#### Acceptance Criteria

1. WHEN ek Enrichment_Job complete ho ya ek Job_Item complete ho, THE Webhook_Worker SHALL configured webhook URL par POST request bheje.
2. THE Webhook_Worker SHALL webhook payload me HMAC-SHA256 signature include kare taake authenticity verify ho sake.
3. IF webhook delivery fail ho, THEN THE Webhook_Worker SHALL exponential backoff ke saath maximum 5 retries kare.
4. THE API_Service SHALL `POST /v1/webhooks` endpoint provide kare jahan user webhook URL aur events configure kar sake.
5. THE API_Service SHALL webhook delivery history aur status dashboard me show kare.
6. THE Webhook_Worker SHALL Redis use kare duplicate webhook delivery prevent karne ke liye.

---

### Requirement 10: Export System

**User Story:** As a user, I want enrichment results CSV ya JSON me export karna, so that main data apne CRM ya spreadsheet me import kar sakoon.

**IDE Ownership: IDE_2**

#### Acceptance Criteria

1. WHEN ek user export request kare, THE Export_Worker SHALL Export_Queue se job receive kare aur CSV ya JSON file generate kare.
2. THE Export_Worker SHALL generated file S3 me store kare aur user ko time-limited download URL provide kare.
3. THE Dashboard SHALL copy shortcuts provide kare: "copy all emails", "copy all phones", "copy all LinkedIn URLs".
4. THE API_Service SHALL `POST /v1/jobs/{job_id}/export` endpoint provide kare jo export format accept kare aur export job queue kare.
5. WHEN export complete ho, THE System SHALL user ko dashboard notification aur optionally email bheje.

---

### Requirement 11: Dashboard — Frontend Web Application

**User Story:** As a user, I want ek clear aur fast dashboard, so that main 10 seconds me samajh sakoon ke kya karna hai aur apne enrichment jobs manage kar sakoon.

**IDE Ownership: IDE_1**

#### Acceptance Criteria

1. THE Dashboard SHALL yeh main pages provide kare: Overview, New Enrichment Job, Jobs List, Job Detail, Results Explorer, Integrations, Billing & Usage, API Keys, Team Settings.
2. THE Dashboard SHALL Overview page par yeh cards show kare: total enriched this month, success rate, browser credits remaining, HTTP rows used, active jobs, recent exports.
3. THE Dashboard SHALL New Job page par teen input methods provide kare: paste links, upload CSV, connect Google Sheet.
4. THE Dashboard SHALL New Job page par mode selector show kare: Fast HTTP, Smart Hybrid, Premium JS.
5. THE Dashboard SHALL New Job page par estimated cost aur estimated time show kare before job start.
6. THE Dashboard SHALL Job Detail page par real-time progress bar show kare jo queued/processing/completed counters update kare.
7. THE Dashboard SHALL Results Explorer me filters provide kare: has email, has phone, has LinkedIn, high confidence, browser enriched only, failed only.
8. THE Dashboard SHALL responsive design use kare jo desktop aur tablet par properly kaam kare.
9. WHEN API call fail ho, THE Dashboard SHALL user-friendly error message show kare aur retry option provide kare.

---

### Requirement 12: Stripe Billing aur Usage Tracking

**User Story:** As a SaaS operator, I want Stripe-based subscription billing aur usage tracking, so that platform se earning ho sake aur users apna usage dekh sakein.

**IDE Ownership: IDE_2**

#### Acceptance Criteria

1. THE System SHALL teen subscription plans support kare: Starter, Growth, aur Pro.
2. THE Starter plan SHALL include kare: 100 Browser_Credits/month, 5,000 HTTP enrichments/month, 1 workspace. (1 Browser_Credit = 1 domain ka full browser enrichment)
3. THE Growth plan SHALL include kare: 500 Browser_Credits/month, 25,000 HTTP enrichments/month, webhooks, Google Sheets sync.
4. THE Pro plan SHALL include kare: 2,000 Browser_Credits/month, 100,000 HTTP enrichments/month, priority queue, team seats.
5. WHEN ek user monthly HTTP enrichment limit exceed kare, THE API_Service SHALL new job creation reject kare aur upgrade prompt show kare.
6. WHEN ek user Browser_Credits zero hon, THE Browser_Worker SHALL browser enrichment process nahi karega aur user ko notify karega.
7. THE System SHALL Stripe webhooks handle kare subscription create, update, cancel, aur payment failure events ke liye.
8. THE Dashboard SHALL Billing page par current plan, usage this month, aur Browser_Credits remaining show kare.
9. THE System SHALL additional Browser_Credit packs purchase karne ka option provide kare Stripe ke through (e.g., 100 credits, 500 credits, 1000 credits).
10. THE System SHALL monthly usage counters reset kare billing cycle ke start par.

---

### Requirement 13: AWS Infrastructure aur Observability

**User Story:** As a developer, I want platform AWS par properly deploy ho aur production-grade monitoring ho, so that yeh reliable scale kare aur issues quickly detect hon.

**IDE Ownership: IDE_2 (infra folder)**

#### Acceptance Criteria

1. THE System SHALL React Dashboard ko S3 static hosting + CloudFront CDN par deploy kare.
2. THE API_Service SHALL ECS Fargate par run kare Application Load Balancer ke peeche.
3. THE HTTP_Worker aur Webhook_Worker aur Export_Worker SHALL ECS Fargate par run karein.
4. THE Browser_Worker SHALL ECS EC2 autoscaling group par run kare Playwright browser pool ke liye.
5. THE System SHALL Amazon RDS PostgreSQL use kare primary database ke liye, automated daily backups ke saath 7-day retention.
6. THE System SHALL Amazon ElastiCache Redis use kare rate limiting, job locks, progress counters, aur webhook dedupe ke liye.
7. THE System SHALL Amazon SQS use kare in queues ke liye: HTTP_Queue, Browser_Queue, Webhook_Queue, Export_Queue, aur ek DLQ.
8. THE System SHALL Amazon S3 use kare raw HTML snapshots, extracted JSON blobs, CSV exports, aur optional screenshots ke liye.
9. THE System SHALL CloudWatch logs aur metrics use kare observability ke liye.
10. THE System SHALL queue depth alarms configure kare jo alert karein jab queue backlog threshold exceed ho.
11. THE API_Service SHALL ECS auto scaling configure kare CPU, memory, aur queue depth metrics ke basis par.
12. THE API_Service SHALL `/health` aur `/ready` endpoints expose kare jo load balancer health checks ke liye use hon.
13. THE System SHALL Sentry error tracking integrate kare API_Service aur workers me application-level errors capture karne ke liye.
14. THE System SHALL per-worker CloudWatch metrics publish kare: enrichment throughput (domains/minute), success rate, average processing time.
15. THE System SHALL AWS Budget alerts configure kare jo notify karein jab monthly spend threshold exceed ho.
16. THE System SHALL RDS automated snapshots configure kare aur ek manual restore procedure document kare.
17. THE System SHALL SQS message visibility timeout aur DLQ redrive policy configure kare taake permanently failed messages track hon.

#### SLA Targets
- API_Service uptime: 99.5% monthly
- HTTP enrichment average processing time: < 15 seconds per domain
- Browser enrichment average processing time: < 45 seconds per domain

#### V1 Disaster Recovery Targets (Single Region)
- RPO (Recovery Point Objective): 24 hours — daily RDS automated backups sufficient hain
- RTO (Recovery Time Objective): 4 hours — manual restore from latest RDS snapshot
- Cross-region replication: V1 out of scope; V2 me add kiya jayega
- S3 data: versioning disabled in V1, standard durability (99.999999999%) kafi hai

---

### Requirement 14: Public API aur Node.js SDK

**User Story:** As a developer, I want ek clean REST API aur Node.js SDK, so that main apne automation workflows me enrichment platform easily integrate kar sakoon.

**IDE Ownership: IDE_2**

#### Acceptance Criteria

1. THE API_Service SHALL `POST /v1/jobs/enrich` endpoint provide kare jo domain list, mode, webhook URL, aur options accept kare.
2. THE API_Service SHALL `POST /v1/jobs/enrich-csv` endpoint provide kare CSV upload ke liye.
3. THE API_Service SHALL `GET /v1/jobs/{job_id}` endpoint provide kare job status ke liye.
4. THE API_Service SHALL `GET /v1/jobs/{job_id}/results` endpoint provide kare paginated results ke liye.
5. THE API_Service SHALL `POST /v1/enrich/domain` endpoint provide kare single domain enrichment ke liye.
6. THE API_Service SHALL rate limiting enforce kare per API key per minute.
7. THE SDK SHALL yeh methods provide kare: `createJob()`, `uploadCSV()`, `waitForCompletion()`, `fetchResults()`, `resendWebhook()`.
8. THE SDK SHALL TypeScript types export kare jo `packages/contracts` se derive hon.
9. THE API_Service SHALL OpenAPI/Swagger documentation auto-generate kare.

---

### Requirement 15: n8n aur Google Sheets Integration

**User Story:** As an automation user, I want n8n aur Google Sheets ke through enrichment platform use karna, so that main bina custom code ke apne workflows me enrichment add kar sakoon.

**IDE Ownership: IDE_2**

#### Acceptance Criteria

1. THE System SHALL n8n ke liye HTTP Request node compatible REST API provide kare jo `wait for completion` aur `poll job status` patterns support kare.
2. THE System SHALL n8n integration ke liye sample workflow templates provide kare docs me.
3. THE System SHALL Google Sheets ke liye Apps Script-based connector template provide kare.
4. WHEN Google Sheets connector run ho, THE System SHALL selected rows ko API par bheje aur completed results same sheet me new columns me likhe.
5. THE API_Service SHALL Google Sheets OAuth integration ke liye `POST /v1/integrations/sheets/sync` endpoint provide kare.

---

### Requirement 16: Security aur Data Quality

**User Story:** As a SaaS operator, I want platform secure aur compliant ho, so that user data safe rahe aur platform abuse se protected rahe.

**IDE Ownership: IDE_2**

#### Acceptance Criteria

1. THE System SHALL API keys ko hashed form me store kare, plain text me nahi.
2. THE System SHALL saare sensitive secrets ko encrypted environment variables ya AWS Secrets Manager me store kare.
3. THE System SHALL har API request par tenant isolation verify kare.
4. THE System SHALL audit logs maintain kare jo sensitive operations record karein: API key creation/deletion, plan changes, data exports.
5. THE System SHALL webhook signatures HMAC-SHA256 se generate kare taake clients authenticity verify kar sakein.
6. THE System SHALL sirf public web data extract kare aur login-required ya private profile scraping nahi karega.
7. THE Extractor SHALL verified_public_data aur inferred_data ko clearly separate rakhe aur kabhi mix nahi karega.

---

### Requirement 17: Enrichment Core Migration from Jento Mailer

**User Story:** As the project owner, I want existing enrichment logic ko naye SaaS platform me migrate karna, so that existing extraction code reuse ho aur kaam duplicate na ho.

**IDE Ownership: IDE_3 (enrichment migration) + IDE_2 (DB migration)**

#### Acceptance Criteria

1. THE System SHALL existing Python-based HTTP enrichment logic (`services/enrichment.py`) ko `packages/extractor-core` me refactor kare.
2. THE System SHALL existing Playwright-based JS enrichment logic (`scraper/website-intelligence.js`) ko `apps/worker-browser` me refactor kare.
3. THE System SHALL SQLite se PostgreSQL migration kare enrichment-related data preserve karte hue.
4. THE System SHALL migration ke liye ek rollback plan maintain kare: agar PostgreSQL migration fail ho to SQLite backup se restore kiya ja sake.

#### Explicitly Out of Scope (Not Migrated)
- Google Maps scraper (`scraper/keyword-based-scraper.spec.js`) — is SaaS me nahi aayega
- Email campaign system (campaigns, prospects, Gmail SMTP/IMAP) — is SaaS me nahi aayega
- Email warmup system — is SaaS me nahi aayega
- AI email generation (Groq/OpenRouter) — is SaaS me nahi aayega
- Inbox management — is SaaS me nahi aayega

---

### Requirement 18: Rate Limiting aur Anti-Blocking Controls

**User Story:** As a platform operator, I want ke enrichment workers responsibly aur safely websites fetch karein, so that IP banning se bacha ja sake aur platform reliable rahe.

**IDE Ownership: IDE_3**

#### Acceptance Criteria

1. THE HTTP_Worker SHALL per-domain minimum 2 second cooldown enforce kare consecutive requests ke beech.
2. THE HTTP_Worker SHALL per-tenant concurrency cap enforce kare: Starter 5 concurrent HTTP jobs, Growth 15, Pro 30.
3. THE HTTP_Worker SHALL global HTTP concurrency cap 100 simultaneous requests enforce kare across all tenants.
4. THE Browser_Worker SHALL global browser concurrency cap 20 simultaneous browser instances enforce kare.
5. THE HTTP_Worker SHALL User-Agent rotation use kare minimum 10 different browser user agents ke pool se.
6. THE HTTP_Worker SHALL response content size 5MB se zyada hone par processing skip kare.
7. THE HTTP_Worker SHALL DNS caching use kare same domain ke multiple page requests ke liye.
8. THE HTTP_Worker SHALL connection pooling use kare HTTP client me throughput improve karne ke liye.
9. THE System SHALL `robots.txt` ko respect kare — disallowed paths fetch nahi karega.
10. IF ek domain 429 (Too Many Requests) response de, THEN THE HTTP_Worker SHALL us domain ko minimum 10 minutes ke liye skip kare.
11. THE System SHALL per-tenant fair scheduling enforce kare taake ek heavy tenant doosre tenants ko slow na kare.

---

### Requirement 19: Data Retention, Cleanup, aur GDPR Compliance

**User Story:** As a SaaS operator, I want ke data retention policies clearly defined hon aur user data deletion properly handle ho, so that storage costs control me rahe aur compliance requirements meet hon.

**IDE Ownership: IDE_2**

#### Acceptance Criteria

1. THE System SHALL Enrichment_Results 90 days tak store kare; us ke baad automatically delete kare.
2. THE System SHALL raw HTML snapshots S3 me 7 days tak store kare; us ke baad automatically delete kare (S3 lifecycle policy).
3. THE System SHALL export files S3 me 48 hours tak store kare; download URL us ke baad expire ho jaye.
4. THE System SHALL audit logs 1 year tak store kare.
5. THE System SHALL webhook delivery history 30 days tak store kare.
6. THE System SHALL completed/failed Enrichment_Job records 90 days tak store kare.
7. WHEN ek Tenant apna account delete kare, THE System SHALL us tenant ka saara data 30 days ke andar permanently delete kare (GDPR right to erasure).
8. THE API_Service SHALL `DELETE /v1/account` endpoint provide kare jo account deletion request initiate kare.
9. THE System SHALL data deletion confirmation email bheje tenant ko jab deletion complete ho.
10. THE System SHALL S3 lifecycle policies use kare automatic cleanup ke liye — manual cron jobs nahi.

---

### Requirement 20: Testing Strategy aur CI/CD

**User Story:** As a developer, I want ke har package aur service ke tests hon aur CI/CD pipeline automated ho, so that code quality maintain ho aur deployments safe hon.

**IDE Ownership: IDE_2 (CI/CD pipeline) + IDE_1/IDE_3 (package tests)**

#### Acceptance Criteria

1. THE Contracts package SHALL unit tests include kare jo TypeScript type correctness verify karein.
2. THE Domain_Normalizer package SHALL property-based tests include kare jo idempotency aur edge cases verify karein (e.g., 100+ different URL formats).
3. THE Extractor package SHALL unit tests include kare jo email, phone, aur social extraction accuracy verify karein against known HTML fixtures.
4. THE API_Service SHALL integration tests include kare jo database aur queue interactions test karein.
5. THE System SHALL end-to-end test include kare jo ek complete enrichment job flow verify kare: job create → queue → worker process → result save → webhook fire.
6. THE System SHALL GitHub Actions (ya equivalent CI) pipeline configure kare jo har PR par tests run kare.
7. THE CI pipeline SHALL fail kare agar test coverage 70% se kam ho kisi bhi package me.
8. THE System SHALL staging environment maintain kare jo production se alag ho aur deploy se pehle test kiya ja sake.
9. THE System SHALL load test results document kare: minimum 100 concurrent HTTP enrichment jobs handle karne chahiye bina queue backup ke.
10. THE CI pipeline SHALL Docker images build kare aur ECR me push kare har successful main branch merge par.

---

### Requirement 21: Email Notification System

**User Story:** As a user, I want ke important events par mujhe email notifications milein, so that main dashboard continuously check kiye bina apne jobs ka status jaan sakoon.

**IDE Ownership: IDE_2**

#### Acceptance Criteria

1. WHEN ek Enrichment_Job complete ho, THE System SHALL tenant ke registered email par completion notification bheje jisme total enriched, success rate, aur export link ho.
2. WHEN ek export file ready ho, THE System SHALL user ko email bheje jisme S3 download link ho (48 hour expiry ke saath).
3. WHEN ek Tenant ke Browser_Credits 10% se kam reh jayein, THE System SHALL warning email bheje.
4. WHEN ek Stripe payment fail ho, THE System SHALL billing alert email bheje.
5. THE System SHALL Amazon SES use kare transactional emails ke liye.
6. THE Dashboard SHALL notification preferences page provide kare jahan user email notifications enable/disable kar sake per event type.
7. THE System SHALL unsubscribe link include kare har notification email me.

