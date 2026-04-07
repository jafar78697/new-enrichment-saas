# Design Document — Enrichment SaaS AWS

## Overview

Yeh document **Enrichment SaaS** platform ka technical design hai — ek cloud-based, multi-tenant website enrichment service jo AWS par deploy hogi.

**Core Promise:** "Website links ya CSV do — hum bulk me companies ki websites ko enrich karke aapko usable contact aur business data dein."

Platform do enrichment lanes chalayega:
- **HTTP Lane** — fast, cheap, static/WordPress websites ke liye (Python workers)
- **Browser Lane** — premium, Playwright-based, JS-heavy/SPA sites ke liye (Node.js workers)

Existing `jento-mailer/services/enrichment.py` aur `jento-mailer/scraper/website-intelligence.js` ka logic is platform me migrate aur refactor hoga.

---

## 1. High-Level Architecture Diagram

```text
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  Dashboard   │  │  Public API  │  │  n8n/Sheets  │              │
│  │  (React SPA) │  │  (REST/SDK)  │  │  Connector   │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
└─────────┼─────────────────┼─────────────────┼────────────────────── ┘
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CLOUDFRONT + ALB LAYER                            │
│  CloudFront (S3 static) ──────── Application Load Balancer          │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    API SERVICE (ECS Fargate)                         │
│  apps/api — TypeScript/Node.js                                       │
│  Auth │ Job Orchestration │ Billing │ Webhooks Config │ Exports      │
└──────┬──────────────────────────────────────────────────────────────┘
       │
       ├──────────────────────────────────────────────────────────────┐
       │                                                              │
       ▼                                                              ▼
┌──────────────────┐                                    ┌────────────────────┐
│   SQS Queues     │                                    │  RDS PostgreSQL    │
│                  │                                    │  (Multi-tenant DB) │
│  HTTP_Queue      │                                    └────────────────────┘
│  Browser_Queue   │
│  Webhook_Queue   │                                    ┌────────────────────┐
│  Export_Queue    │                                    │  ElastiCache Redis │
│  DLQ             │                                    │  (Cache/Locks)     │
└──────┬───────────┘                                    └────────────────────┘
       │
       ├─────────────────────────────────────────────────────────────┐
       │                                                             │
       ▼                                                             ▼
┌──────────────────────────┐                    ┌────────────────────────────┐
│  HTTP Worker             │                    │  Browser Worker            │
│  (ECS Fargate)           │                    │  (ECS EC2 Autoscaling)     │
│  apps/worker-http        │                    │  apps/worker-browser       │
│  Python + extractor-core │                    │  Node.js + Playwright      │
└──────────────────────────┘                    └────────────────────────────┘
       │                                                             │
       └─────────────────────┬───────────────────────────────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │  Result Pipeline             │
              │  RDS PostgreSQL (results)    │
              │  S3 (raw HTML, JSON blobs)   │
              └──────────────┬───────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
       Webhook Worker   Export Worker   SES Emails
       (ECS Fargate)    (ECS Fargate)
```

---

## 2. AWS Services aur Unka Role

| AWS Service | Role | Details |
|-------------|------|---------|
| **CloudFront** | CDN + Static hosting | React SPA serve kare, S3 origin |
| **S3** | Object storage | Raw HTML snapshots (7d), JSON blobs, CSV exports (48h), screenshots |
| **ALB** | Load balancer | API service ke aage, health checks, SSL termination |
| **ECS Fargate** | Container compute | API service, HTTP worker, Webhook worker, Export worker |
| **ECS EC2 ASG** | Browser compute | Browser worker — Playwright pool ke liye EC2 cheaper hai |
| **RDS PostgreSQL** | Primary database | Multi-tenant tables, automated daily backups, 7-day retention |
| **ElastiCache Redis** | Cache + coordination | Rate limiting, job locks, progress counters, webhook dedupe |
| **SQS** | Message queues | HTTP_Queue, Browser_Queue, Webhook_Queue, Export_Queue, DLQ |
| **Secrets Manager** | Secret storage | DB passwords, Stripe keys, JWT secrets, SES credentials |
| **SES** | Transactional email | Job completion, export ready, credit warning, billing alerts |
| **CloudWatch** | Observability | Logs, metrics, alarms, queue depth monitoring |
| **Sentry** | Error tracking | Application-level errors in API + workers |
| **Stripe** | Billing | Subscription plans, browser credit packs, payment webhooks |
| **ECR** | Container registry | Docker images for all services |
| **Terraform (infra/)** | IaC | Sab AWS resources code se manage hon |

### SLA Targets
- API uptime: 99.5% monthly
- HTTP enrichment avg: < 15 seconds/domain
- Browser enrichment avg: < 45 seconds/domain

### V1 Disaster Recovery
- RPO: 24 hours (daily RDS automated backups)
- RTO: 4 hours (manual restore from latest snapshot)
- Cross-region: V2 me add hoga

---

## 3. Monorepo Folder Structure with IDE Ownership

```text
enrichment-saas/                          ← Root monorepo
├── apps/
│   ├── web/                              ← IDE_1 owns (TypeScript/React)
│   │   ├── src/
│   │   │   ├── pages/                    # Overview, Jobs, Results, Billing, etc.
│   │   │   ├── components/
│   │   │   └── services/                 # API client calls
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   ├── api/                              ← IDE_2 owns (TypeScript/Node.js)
│   │   ├── src/
│   │   │   ├── routes/                   # REST endpoints
│   │   │   ├── middleware/               # Auth, rate limit, tenant check
│   │   │   ├── services/                 # Job orchestration, billing
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── worker-http/                      ← IDE_3 owns (Python)
│   │   ├── worker.py                     # SQS consumer main loop
│   │   ├── fetcher.py                    # HTTP fetch + page discovery
│   │   ├── js_detector.py                # JS-heavy heuristics
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   │
│   ├── worker-browser/                   ← IDE_3 owns (Node.js/Playwright)
│   │   ├── src/
│   │   │   ├── worker.ts                 # SQS consumer
│   │   │   ├── browser_pool.ts           # Playwright pool management
│   │   │   └── page_navigator.ts         # Route navigation logic
│   │   └── package.json
│   │
│   ├── worker-webhooks/                  ← IDE_2 owns (TypeScript/Node.js)
│   │   ├── src/
│   │   │   ├── worker.ts
│   │   │   └── delivery.ts               # HMAC signing + retry logic
│   │   └── package.json
│   │
│   └── worker-exports/                   ← IDE_2 owns (TypeScript/Node.js)
│       ├── src/
│       │   ├── worker.ts
│       │   └── generators/               # CSV, JSON generators
│       └── package.json
│
├── packages/
│   ├── contracts/                        ← IDE_2 owns (TypeScript)
│   │   └── src/
│   │       ├── api/                      # Request/response schemas
│   │       ├── queue/                    # SQS payload shapes
│   │       ├── result/                   # EnrichmentResult type
│   │       └── enums.ts                  # Status enums, plan types
│   │
│   ├── db/                               ← IDE_2 owns (TypeScript + SQL)
│   │   └── src/
│   │       ├── migrations/               # SQL migration files
│   │       ├── schema/                   # Table definitions
│   │       └── repositories/             # Query helpers per table
│   │
│   ├── auth/                             ← IDE_2 owns (TypeScript)
│   │   └── src/
│   │       ├── jwt.ts                    # Sign/verify JWT
│   │       ├── api_keys.ts               # Hash/verify API keys
│   │       └── tenant_guard.ts           # Middleware helper
│   │
│   ├── queue/                            ← IDE_2 owns (TypeScript)
│   │   └── src/
│   │       ├── names.ts                  # Queue URL constants
│   │       ├── producer.ts               # SQS send helpers
│   │       └── consumer.ts               # SQS receive/delete helpers
│   │
│   ├── extractor-core/                   ← IDE_3 owns (Python)
│   │   ├── extractor/
│   │   │   ├── emails.py                 # Email extraction + junk filter
│   │   │   ├── phones.py                 # Phone extraction + E.164 normalize
│   │   │   ├── socials.py                # Social link detection
│   │   │   ├── metadata.py               # JSON-LD, meta tags, headings
│   │   │   └── confidence.py             # Confidence scoring
│   │   └── tests/
│   │
│   ├── domain-normalizer/                ← IDE_3 owns (Python)
│   │   ├── normalizer/
│   │   │   ├── normalize.py              # Core normalization logic
│   │   │   └── validate.py               # Domain validation
│   │   └── tests/
│   │
│   ├── ui/                               ← IDE_1 owns (TypeScript/React)
│   │   └── src/
│   │       ├── Button, Card, Table, etc. # Shared UI components
│   │       └── index.ts
│   │
│   └── sdk-node/                         ← IDE_2 owns (TypeScript)
│       └── src/
│           ├── client.ts                 # EnrichmentClient class
│           └── types.ts                  # Re-exported from contracts
│
├── infra/                                ← IDE_2 owns (Terraform/HCL)
│   ├── terraform/
│   │   ├── main.tf
│   │   ├── ecs.tf
│   │   ├── rds.tf
│   │   ├── sqs.tf
│   │   ├── s3.tf
│   │   ├── redis.tf
│   │   └── variables.tf
│   └── aws/
│       └── iam_policies/
│
├── docs/
│   ├── api/                              # OpenAPI spec
│   ├── architecture/
│   └── runbooks/
│
├── pnpm-workspace.yaml
├── package.json
└── .env.example
```

### IDE Ownership Matrix

| Folder | Owner IDE | Language |
|--------|-----------|----------|
| `apps/web` | IDE_1 | TypeScript/React |
| `packages/ui` | IDE_1 | TypeScript/React |
| `apps/api` | IDE_2 | TypeScript/Node.js |
| `apps/worker-webhooks` | IDE_2 | TypeScript/Node.js |
| `apps/worker-exports` | IDE_2 | TypeScript/Node.js |
| `packages/contracts` | IDE_2 | TypeScript |
| `packages/db` | IDE_2 | TypeScript + SQL |
| `packages/auth` | IDE_2 | TypeScript |
| `packages/queue` | IDE_2 | TypeScript |
| `packages/sdk-node` | IDE_2 | TypeScript |
| `infra/` | IDE_2 | Terraform/HCL |
| `apps/worker-http` | IDE_3 | Python |
| `apps/worker-browser` | IDE_3 | Node.js/Playwright |
| `packages/extractor-core` | IDE_3 | Python |
| `packages/domain-normalizer` | IDE_3 | Python |

**Golden Rule:** `1 folder = 1 owner IDE`. Koi bhi IDE apne assigned folder ke bahar edit nahi karega.

---

## 4. Data Flow Diagrams

### 4.1 HTTP Enrichment Flow

```text
User/API Client
     │
     │  POST /v1/jobs/enrich
     │  { domains: [...], mode: "fast_http" }
     ▼
┌─────────────────────────────────────────────────────┐
│  API Service (apps/api)                              │
│                                                      │
│  1. JWT/API key validate                             │
│  2. Tenant isolation check                           │
│  3. Usage limit check (HTTP quota)                   │
│  4. Domain_Normalizer call → dedupe + normalize      │
│  5. EnrichmentJob record create (DB)                 │
│  6. JobItems create (DB) — one per domain            │
│  7. SQS HTTP_Queue me messages push                  │
│  8. job_id return to client                          │
└─────────────────────────────────────────────────────┘
     │
     │  SQS HTTP_Queue message
     ▼
┌─────────────────────────────────────────────────────┐
│  HTTP Worker (apps/worker-http)                      │
│                                                      │
│  1. SQS se message receive                           │
│  2. JobItem status → processing_http                 │
│  3. Homepage fetch (requests + BeautifulSoup)        │
│  4. Page discovery: /contact, /about, /team, etc.    │
│  5. extractor-core: emails, phones, socials, meta    │
│  6. JSON-LD / schema.org parse                       │
│  7. Junk email filter                                │
│  8. JS detection heuristics run                      │
│     │                                                │
│     ├── JS-heavy + smart_hybrid mode?                │
│     │   └── Browser_Queue me escalate                │
│     │                                                │
│     └── HTTP result sufficient?                      │
│         └── EnrichmentResult DB me save              │
│             JobItem status → completed               │
│             S3 me raw HTML snapshot save             │
│             Webhook_Queue me notification push       │
└─────────────────────────────────────────────────────┘
     │
     │  (on completion)
     ▼
┌─────────────────────────────────────────────────────┐
│  Webhook Worker (apps/worker-webhooks)               │
│  Export Worker (apps/worker-exports)                 │
│  SES Email notification                              │
└─────────────────────────────────────────────────────┘
```

### 4.2 Browser Enrichment Flow

```text
HTTP Worker ya API (premium_js mode)
     │
     │  SQS Browser_Queue message
     │  { job_item_id, domain, tenant_id, mode }
     ▼
┌─────────────────────────────────────────────────────┐
│  Browser Worker (apps/worker-browser)                │
│                                                      │
│  1. SQS se message receive                           │
│  2. Tenant Browser_Credits check (Redis)             │
│     └── Zero credits? → insufficient_credits status  │
│  3. Per-tenant concurrency quota check               │
│     └── Starter: 2, Growth: 5, Pro: 10              │
│  4. Global cap check (max 20 simultaneous)           │
│  5. Playwright headless browser launch               │
│  6. Images/fonts/videos block (performance)          │
│  7. Homepage render + DOM wait                       │
│  8. Consent popup dismiss strategy                   │
│  9. Routes navigate: /contact, /about, /team,        │
│     /company, /support, /careers                     │
│  10. extractor-core se extraction (rendered DOM)     │
│  11. Browser_Credit deduct (Redis atomic decrement)  │
│  12. EnrichmentResult DB me save                     │
│  13. JobItem status → completed                      │
│  14. S3 me JSON blob save                            │
│  15. Webhook_Queue me notification push              │
│  16. Browser instance cleanup                        │
└─────────────────────────────────────────────────────┘
```

### 4.3 Retry aur Failure Flow

```text
HTTP Worker — Transient Error (DNS, timeout, 5xx)
     │
     ├── Attempt 1 fail → wait 2s → retry
     ├── Attempt 2 fail → wait 4s → retry
     ├── Attempt 3 fail → wait 8s → retry
     └── Attempt 4 fail → DLQ me move, status: failed

HTTP Worker — Permanent Error (invalid domain, 404, SSL)
     └── Immediately → status: failed, no retry

Browser Worker — Transient Error
     ├── Attempt 1 fail → retry
     ├── Attempt 2 fail → retry
     └── Attempt 3 fail → status: browser_timeout / failed

Domain 429 Response
     └── Domain ko 10 minutes ke liye skip (Redis TTL key)

Circuit Breaker
     └── 3 consecutive failures → domain 1 hour skip
```

---

## 5. Database Schema (PostgreSQL)

Saari tables me `tenant_id` hoga — multi-tenant isolation ke liye.

```sql
-- ─────────────────────────────────────────────────────
-- TENANTS & USERS
-- ─────────────────────────────────────────────────────

CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'starter',  -- starter | growth | pro
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ  -- soft delete for GDPR
);

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member',  -- owner | admin | member
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workspaces (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  key_hash      TEXT UNIQUE NOT NULL,  -- bcrypt hash, plain text kabhi store nahi
  key_prefix    TEXT NOT NULL,         -- display ke liye e.g. "enr_sk_abc..."
  name          TEXT,
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────
-- USAGE & BILLING
-- ─────────────────────────────────────────────────────

CREATE TABLE usage_counters (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  billing_period_start  DATE NOT NULL,
  http_enrichments_used INT NOT NULL DEFAULT 0,
  browser_credits_used  INT NOT NULL DEFAULT 0,
  browser_credits_remaining INT NOT NULL DEFAULT 0,
  http_limit            INT NOT NULL,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, billing_period_start)
);

-- ─────────────────────────────────────────────────────
-- ENRICHMENT JOBS
-- ─────────────────────────────────────────────────────

CREATE TABLE enrichment_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  workspace_id    UUID REFERENCES workspaces(id),
  created_by      UUID REFERENCES users(id),
  source_type     TEXT NOT NULL,  -- paste | csv | api | sheets
  mode            TEXT NOT NULL,  -- fast_http | smart_hybrid | premium_js
  status          TEXT NOT NULL DEFAULT 'queued',
  -- queued | running | completed | partial | cancelled | failed
  total_items     INT NOT NULL DEFAULT 0,
  completed_items INT NOT NULL DEFAULT 0,
  failed_items    INT NOT NULL DEFAULT 0,
  partial_items   INT NOT NULL DEFAULT 0,
  http_completed  INT NOT NULL DEFAULT 0,
  browser_completed INT NOT NULL DEFAULT 0,
  idempotency_key TEXT UNIQUE,
  webhook_url     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ  -- 90 days retention
);

CREATE TABLE enrichment_job_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              UUID NOT NULL REFERENCES enrichment_jobs(id),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  raw_input           TEXT NOT NULL,
  normalized_domain   TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'queued',
  -- queued | processing_http | processing_browser | completed
  -- partial | failed | blocked | browser_timeout | insufficient_credits
  http_attempts       INT NOT NULL DEFAULT 0,
  browser_attempts    INT NOT NULL DEFAULT 0,
  last_error          TEXT,
  shard_index         INT,  -- 500-item shard number
  queued_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at          TIMESTAMPTZ,
  finished_at         TIMESTAMPTZ
);

-- ─────────────────────────────────────────────────────
-- ENRICHMENT RESULTS
-- ─────────────────────────────────────────────────────

CREATE TABLE enrichment_results (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_item_id         UUID NOT NULL REFERENCES enrichment_job_items(id),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  domain              TEXT NOT NULL,

  -- Contact fields
  primary_email       TEXT,
  additional_emails   TEXT[],
  primary_phone       TEXT,  -- E.164 format
  additional_phones   TEXT[],
  contact_page_url    TEXT,
  contact_form_url    TEXT,

  -- Social fields
  linkedin_url        TEXT,
  facebook_url        TEXT,
  instagram_url       TEXT,
  twitter_url         TEXT,
  youtube_url         TEXT,
  tiktok_url          TEXT,
  whatsapp_link       TEXT,
  telegram_link       TEXT,

  -- Company intelligence
  company_name        TEXT,
  brand_name          TEXT,
  page_title          TEXT,
  meta_description    TEXT,
  one_line_pitch      TEXT,
  long_summary        TEXT,
  services_list       TEXT[],
  products_list       TEXT[],
  industry_guess      TEXT,
  target_audience     TEXT,
  language            TEXT,
  address             TEXT,
  city                TEXT,
  country             TEXT,
  about_page_url      TEXT,
  careers_page_url    TEXT,
  support_page_url    TEXT,

  -- Technical signals
  cms_guess           TEXT,
  framework_guess     TEXT,
  ecommerce_signal    BOOLEAN DEFAULT false,
  saas_signal         BOOLEAN DEFAULT false,
  booking_signal      BOOLEAN DEFAULT false,
  analytics_hints     TEXT[],
  cta_type            TEXT,

  -- Quality
  confidence_level    TEXT NOT NULL DEFAULT 'low_confidence',
  -- high_confidence | medium_confidence | low_confidence
  enrichment_lane     TEXT,  -- http | browser
  verified_data       JSONB,  -- verified_public_data
  inferred_data       JSONB,  -- inferred_data
  raw_result          JSONB,  -- full extraction output

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at          TIMESTAMPTZ  -- 90 days
);

-- ─────────────────────────────────────────────────────
-- WEBHOOKS
-- ─────────────────────────────────────────────────────

CREATE TABLE webhook_endpoints (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  url         TEXT NOT NULL,
  secret      TEXT NOT NULL,  -- HMAC signing secret (encrypted at rest)
  events      TEXT[],         -- job.completed | item.completed | export.ready
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE webhook_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id     UUID NOT NULL REFERENCES webhook_endpoints(id),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  event_type      TEXT NOT NULL,
  payload         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | delivered | failed
  attempts        INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ  -- 30 days
);

-- ─────────────────────────────────────────────────────
-- EXPORTS
-- ─────────────────────────────────────────────────────

CREATE TABLE exports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  job_id      UUID REFERENCES enrichment_jobs(id),
  format      TEXT NOT NULL,  -- csv | json
  status      TEXT NOT NULL DEFAULT 'pending',
  s3_key      TEXT,
  download_url TEXT,
  url_expires_at TIMESTAMPTZ,  -- 48 hours
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────
-- AUDIT LOGS
-- ─────────────────────────────────────────────────────

CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  user_id     UUID REFERENCES users(id),
  action      TEXT NOT NULL,  -- api_key.created | plan.changed | export.downloaded
  resource    TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ  -- 1 year
);

-- ─────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────

CREATE INDEX idx_job_items_job_id ON enrichment_job_items(job_id);
CREATE INDEX idx_job_items_tenant_status ON enrichment_job_items(tenant_id, status);
CREATE INDEX idx_results_tenant_domain ON enrichment_results(tenant_id, domain);
CREATE INDEX idx_results_job_item ON enrichment_results(job_item_id);
CREATE INDEX idx_jobs_tenant_status ON enrichment_jobs(tenant_id, status);
CREATE INDEX idx_webhook_deliveries_endpoint ON webhook_deliveries(endpoint_id, status);
```

---

## 6. API Design (Key Endpoints)

Base URL: `https://api.enrichment-saas.com/v1`

Auth: `Authorization: Bearer <jwt_token>` ya `X-API-Key: <api_key>`

### 6.1 Authentication

```
POST /v1/auth/signup
POST /v1/auth/login
POST /v1/auth/refresh
DELETE /v1/account          ← GDPR account deletion
```

### 6.2 API Keys

```
GET    /v1/api-keys
POST   /v1/api-keys         { name: "Production Key" }
DELETE /v1/api-keys/:id
```

### 6.3 Enrichment Jobs

```
POST /v1/jobs/enrich
Request:
{
  "domains": ["example.com", "company.io"],
  "mode": "smart_hybrid",          // fast_http | smart_hybrid | premium_js
  "webhook_url": "https://...",
  "options": {
    "dedupe": true,
    "only_missing_fields": false
  },
  "idempotency_key": "uuid-here"
}
Response: { "job_id": "uuid", "total_items": 2, "status": "queued" }

POST /v1/jobs/enrich-csv
Content-Type: multipart/form-data
Body: file=<csv>, mode=smart_hybrid

GET  /v1/jobs/:job_id
Response: {
  "id": "uuid",
  "status": "running",
  "total_items": 100,
  "completed_items": 45,
  "failed_items": 3,
  "http_completed": 40,
  "browser_completed": 5,
  "created_at": "...",
  "estimated_completion": "..."
}

GET  /v1/jobs/:job_id/results?page=1&limit=50&filter=has_email
POST /v1/jobs/:job_id/cancel
POST /v1/jobs/:job_id/retry-failed
POST /v1/jobs/:job_id/export    { "format": "csv" }
GET  /v1/jobs                   ← paginated jobs list
```

### 6.4 Single Domain Enrichment

```
POST /v1/enrich/domain
Request: { "domain": "example.com", "mode": "smart_hybrid" }
Response: { "job_id": "uuid" }   ← async, same pipeline
```

### 6.5 Webhooks

```
GET    /v1/webhooks
POST   /v1/webhooks    { "url": "...", "events": ["job.completed"], "secret": "..." }
DELETE /v1/webhooks/:id
GET    /v1/webhooks/:id/deliveries
POST   /v1/webhooks/:id/resend/:delivery_id
```

### 6.6 Billing

```
GET  /v1/billing/usage          ← current month usage
GET  /v1/billing/plan
POST /v1/billing/upgrade        { "plan": "growth" }
POST /v1/billing/credits/purchase  { "pack": "100" }
POST /v1/stripe/webhook         ← Stripe events (internal)
```

### 6.7 Integrations

```
POST /v1/integrations/sheets/sync
```

### 6.8 Health

```
GET /health    ← ALB health check
GET /ready     ← readiness probe (DB + Redis check)
```

### Response Format

```json
{
  "data": { ... },
  "meta": { "page": 1, "total": 500, "limit": 50 },
  "error": null
}
```

Error response:
```json
{
  "data": null,
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "Monthly HTTP enrichment limit reached. Please upgrade your plan.",
    "details": { "limit": 5000, "used": 5000 }
  }
}
```

### Rate Limiting

| Plan | Requests/minute |
|------|----------------|
| Starter | 60 |
| Growth | 300 |
| Pro | 1000 |

Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## 7. Queue Design (SQS Queues aur Payloads)

### 7.1 Queue Overview

| Queue Name | Consumer | Visibility Timeout | Max Receives | DLQ |
|------------|----------|--------------------|--------------|-----|
| `enr-http-queue` | worker-http | 60s | 3 | `enr-dlq` |
| `enr-browser-queue` | worker-browser | 120s | 2 | `enr-dlq` |
| `enr-webhook-queue` | worker-webhooks | 30s | 5 | `enr-dlq` |
| `enr-export-queue` | worker-exports | 300s | 2 | `enr-dlq` |
| `enr-dlq` | Manual review | — | — | — |

Pro tenants ke liye separate high-priority queues:
- `enr-http-queue-priority`
- `enr-browser-queue-priority`

### 7.2 HTTP Queue Payload

```typescript
// packages/contracts/src/queue/http-job.ts
interface HttpJobPayload {
  job_item_id: string;
  job_id: string;
  tenant_id: string;
  domain: string;
  mode: "fast_http" | "smart_hybrid";
  attempt: number;
  enqueued_at: string;  // ISO timestamp
}
```

### 7.3 Browser Queue Payload

```typescript
// packages/contracts/src/queue/browser-job.ts
interface BrowserJobPayload {
  job_item_id: string;
  job_id: string;
  tenant_id: string;
  domain: string;
  escalated_from_http: boolean;
  attempt: number;
  enqueued_at: string;
}
```

### 7.4 Webhook Queue Payload

```typescript
// packages/contracts/src/queue/webhook-job.ts
interface WebhookJobPayload {
  delivery_id: string;
  endpoint_id: string;
  tenant_id: string;
  event_type: "job.completed" | "item.completed" | "export.ready";
  payload: Record<string, unknown>;
  attempt: number;
}
```

### 7.5 Export Queue Payload

```typescript
// packages/contracts/src/queue/export-job.ts
interface ExportJobPayload {
  export_id: string;
  job_id: string;
  tenant_id: string;
  format: "csv" | "json";
  filters?: {
    has_email?: boolean;
    has_phone?: boolean;
    confidence?: string;
  };
}
```

### 7.6 Queue Depth Alarms (CloudWatch)

| Queue | Alarm Threshold | Action |
|-------|----------------|--------|
| HTTP Queue depth | > 1000 messages | Scale out HTTP workers |
| Browser Queue depth | > 100 messages | Scale out browser workers |
| DLQ depth | > 10 messages | Alert on-call |

---

## 8. Enrichment Pipeline Design (Step by Step)

### Phase 1: Input Processing (API Service)

```
Step 1: Domain Normalization
  - domain-normalizer package call
  - https://, http://, www., trailing slash remove
  - punycode/IDN convert
  - invalid domains drop (descriptive error)

Step 2: Deduplication
  - normalized domains me se duplicates remove
  - user ko count batao: "3 duplicates removed"

Step 3: Job Creation
  - EnrichmentJob record create (DB)
  - idempotency key check
  - usage quota check (HTTP limit)

Step 4: Sharding
  - 500-item shards me tod do
  - har shard ke liye JobItems create

Step 5: Queue Push
  - fast_http/smart_hybrid → HTTP_Queue
  - premium_js → Browser_Queue directly
  - Pro tenant → priority queue
```

### Phase 2: HTTP Enrichment (worker-http)

```
Step 1: Message Receive
  - SQS se HttpJobPayload receive
  - JobItem status → processing_http

Step 2: Homepage Fetch
  - requests.Session with User-Agent rotation
  - timeout: 30s total, 5s connect
  - content size cap: 5MB
  - HTTPS first, HTTP fallback

Step 3: Page Discovery
  - /contact, /about, /team, /support, /company, /careers
  - footer/header internal links scan
  - sitemap.xml check (optional)

Step 4: Extraction (extractor-core)
  - emails: mailto: links → visible emails → obfuscated patterns
  - phones: tel: links → regex → E.164 normalize
  - socials: domain matching (linkedin.com/company, etc.)
  - metadata: JSON-LD, schema.org, meta tags, headings
  - junk filter: CDN, no-reply, platform emails remove

Step 5: JS Detection
  - empty root div check
  - __NEXT_DATA__, __NUXT__, vite, webpack signals
  - low text-to-HTML ratio
  - no emails/phones found despite 200 response

Step 6: Decision
  - smart_hybrid + JS-heavy → Browser_Queue escalate
  - fast_http → result finalize regardless
  - sufficient data → completed
  - partial data → partial status

Step 7: Save
  - EnrichmentResult DB me save
  - S3 me raw HTML snapshot (7-day TTL)
  - JobItem status update
  - Job progress counter update (Redis atomic)
  - Webhook_Queue me notification push
```

### Phase 3: Browser Enrichment (worker-browser)

```
Step 1: Pre-flight Checks
  - Browser_Credits check (Redis)
  - Per-tenant concurrency check
  - Global cap check (20 max)

Step 2: Browser Launch
  - Playwright chromium headless
  - Images/fonts/videos block
  - Strict timeout: 30s per page

Step 3: Navigation
  - Homepage render + network idle wait
  - Consent popup dismiss (common patterns)
  - /contact, /about, /team, /company, /support, /careers

Step 4: Extraction
  - extractor-core se same extraction logic
  - Rendered DOM se — JS-loaded content bhi milega

Step 5: Credit Deduction
  - Redis atomic decrement (DECRBY tenant:credits:uuid 1)
  - usage_counters DB update

Step 6: Save
  - EnrichmentResult DB me save
  - S3 me JSON blob
  - Browser instance cleanup
  - Webhook notification
```

### Phase 4: Post-Processing

```
Confidence Scoring:
  - high_confidence: primary email + phone + 3+ social links
  - medium_confidence: primary email OR phone + some metadata
  - low_confidence: only metadata, no contact info

Verified vs Inferred separation:
  - verified_data: directly found on page (mailto:, tel:, visible text)
  - inferred_data: guessed/derived (industry guess, audience hints)
```

---

## 9. Dashboard Pages aur UX Flow

### 9.1 Page Structure

```
/                     → redirect to /dashboard
/login                → Login page
/signup               → Signup page
/dashboard            → Overview (main landing)
/jobs/new             → New Enrichment Job
/jobs                 → Jobs List
/jobs/:id             → Job Detail + Progress
/results/:job_id      → Results Explorer
/integrations         → n8n, Google Sheets, SDK docs
/billing              → Plan, Usage, Credits
/api-keys             → API Key management
/settings/team        → Team members, roles
/settings/account     → Profile, notifications, delete account
```

### 9.2 Overview Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│  Enrichment SaaS                          [New Job] [Profile]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ Enriched     │ │ Success Rate │ │ Browser      │            │
│  │ This Month   │ │              │ │ Credits Left │            │
│  │   4,231      │ │    87.3%     │ │     342      │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
│                                                                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ HTTP Rows    │ │ Active Jobs  │ │ Recent       │            │
│  │ Used         │ │              │ │ Exports      │            │
│  │  4,231/5,000 │ │      2       │ │      3       │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
│                                                                  │
│  Recent Jobs                                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Job Name        │ Status    │ Progress │ Created         │   │
│  │ leads-jan.csv   │ Running   │ 45/100   │ 2 hours ago     │   │
│  │ tech-companies  │ Completed │ 200/200  │ Yesterday       │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 9.3 New Job Page

```
┌─────────────────────────────────────────────────────────────────┐
│  New Enrichment Job                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Input Method:  [Paste Links]  [Upload CSV]  [Google Sheet]     │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ example.com                                              │   │
│  │ company.io                                               │   │
│  │ startup.co                                               │   │
│  │ ...                                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│  3 domains detected • 0 duplicates removed                       │
│                                                                  │
│  Enrichment Mode:                                                │
│  ○ Fast HTTP      — Static sites, fast, cheap                   │
│  ● Smart Hybrid   — Recommended: HTTP first, JS fallback        │
│  ○ Premium JS     — All sites via browser (uses credits)        │
│                                                                  │
│  Options:                                                        │
│  ☑ Deduplicate domains                                          │
│  ☐ Only enrich missing fields                                   │
│  ☐ Send webhook on completion                                   │
│                                                                  │
│  Estimated Cost: ~0 browser credits + 3 HTTP rows               │
│  Estimated Time: ~1 minute                                       │
│                                                                  │
│                              [Start Enrichment →]               │
└─────────────────────────────────────────────────────────────────┘
```

### 9.4 Job Detail Page

```
┌─────────────────────────────────────────────────────────────────┐
│  Job: leads-jan.csv                    [Cancel] [Retry Failed]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Status: Running                                                 │
│  ████████████████████░░░░░░░░░░░░░░░░  45%                     │
│  45 completed • 3 failed • 52 queued                            │
│                                                                  │
│  HTTP: 40 ✓   Browser: 5 ✓   Failed: 3 ✗                       │
│                                                                  │
│  Top Errors:                                                     │
│  • DNS failure: 2 domains                                        │
│  • Timeout: 1 domain                                             │
│                                                                  │
│  [Export CSV] [Copy All Emails] [Copy All Phones] [Copy LinkedIn]│
│                                                                  │
│  Results Preview:                                                │
│  ┌──────────────┬──────────────┬──────────┬──────────────────┐ │
│  │ Domain       │ Email        │ Phone    │ Confidence       │ │
│  │ example.com  │ info@...     │ +1-555.. │ ● High           │ │
│  │ company.io   │ hello@...    │ —        │ ● Medium         │ │
│  └──────────────┴──────────────┴──────────┴──────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 9.5 Results Explorer

Filters sidebar:
- Has email ☐
- Has phone ☐
- Has LinkedIn ☐
- High confidence only ☐
- Browser enriched only ☐
- Failed only ☐

Actions:
- Export selected (CSV/JSON)
- Copy selected emails
- Push to Google Sheet
- Resend to webhook

---

## 10. Billing aur Usage Tracking Design

### 10.1 Subscription Plans

| Feature | Starter | Growth | Pro |
|---------|---------|--------|-----|
| HTTP enrichments/month | 5,000 | 25,000 | 100,000 |
| Browser Credits/month | 100 | 500 | 2,000 |
| Workspaces | 1 | 3 | Unlimited |
| Webhooks | ✗ | ✓ | ✓ |
| Google Sheets sync | ✗ | ✓ | ✓ |
| Priority queue | ✗ | ✗ | ✓ |
| Team seats | 1 | 5 | Unlimited |
| HTTP concurrency | 5 | 15 | 30 |
| Browser concurrency | 2 | 5 | 10 |

### 10.2 Browser Credit Packs (Add-on)

| Pack | Credits | Price |
|------|---------|-------|
| Starter Pack | 100 credits | $19 |
| Growth Pack | 500 credits | $79 |
| Pro Pack | 1,000 credits | $139 |

### 10.3 Billing Flow

```
Stripe Subscription Create
     │
     ▼
Stripe Webhook → POST /v1/stripe/webhook
     │
     ├── subscription.created → tenant plan update, usage_counters initialize
     ├── subscription.updated → plan change, limits update
     ├── subscription.deleted → downgrade to free/suspended
     ├── invoice.payment_failed → billing alert email (SES)
     └── checkout.session.completed → credit pack add to usage_counters

Monthly Reset (billing cycle start):
     └── usage_counters: http_enrichments_used = 0, browser_credits_used = 0
         browser_credits_remaining = plan.browser_credits + purchased_packs
```

### 10.4 Usage Tracking (Redis + DB)

```
Real-time counters (Redis):
  - enr:usage:http:{tenant_id}:{billing_period}  → HTTP enrichments used
  - enr:credits:{tenant_id}                       → Browser credits remaining (atomic)
  - enr:ratelimit:{api_key}:{minute}              → Rate limit counter

Persistent (DB):
  - usage_counters table → billing period me total usage
  - Stripe webhooks se sync hota hai
```

### 10.5 Quota Enforcement

```
HTTP Quota Check (API Service, before job creation):
  1. Redis se current usage read
  2. job.total_items + current_usage > plan.http_limit?
  3. Yes → 402 Payment Required + upgrade prompt
  4. No → job create karo

Browser Credit Check (Browser Worker, before processing):
  1. Redis DECRBY enr:credits:{tenant_id} 1
  2. Result < 0? → INCRBY back (rollback), insufficient_credits status
  3. Result >= 0? → process karo, DB me usage_counters update
```

### 10.6 Billing Dashboard Page

```
Current Plan: Growth
Billing Period: Jan 1 – Jan 31, 2025

HTTP Enrichments:
████████████████░░░░░░░░  12,450 / 25,000 used

Browser Credits:
████░░░░░░░░░░░░░░░░░░░░  87 / 500 used  (413 remaining)

[Upgrade to Pro]  [Buy Credit Pack]

Recent Invoices:
Jan 2025  $49.00  Paid ✓
Dec 2024  $49.00  Paid ✓
```

---

## 11. Security Design

### 11.1 Authentication

```
JWT Tokens:
  - Algorithm: RS256 (asymmetric)
  - Expiry: 1 hour (access token), 30 days (refresh token)
  - Claims: { tenant_id, user_id, workspace_id, role, plan }
  - Secret: AWS Secrets Manager me store

API Keys:
  - Format: enr_sk_{random_32_bytes_hex}
  - Storage: bcrypt hash only — plain text kabhi DB me nahi
  - Display: sirf prefix show karo (enr_sk_abc...xyz)
  - Scope: tenant-scoped, workspace-scoped optional
```

### 11.2 Tenant Isolation

```
Every DB query MUST include tenant_id filter:
  SELECT * FROM enrichment_results
  WHERE tenant_id = $1 AND id = $2

Middleware (packages/auth/tenant_guard.ts):
  1. JWT/API key se tenant_id extract
  2. Requested resource ka tenant_id DB se fetch
  3. Match nahi? → 403 Forbidden + audit log entry
  4. Match? → request proceed
```

### 11.3 Secrets Management

```
AWS Secrets Manager:
  - DB password
  - Redis auth token
  - JWT signing keys (RS256 private key)
  - Stripe secret key + webhook secret
  - SES SMTP credentials

Environment Variables (non-sensitive):
  - Queue URLs
  - S3 bucket names
  - Service endpoints
```

### 11.4 Webhook Security

```
HMAC-SHA256 Signature:
  - Secret: per-endpoint random secret (encrypted in DB)
  - Header: X-Enrichment-Signature: sha256=<hex_digest>
  - Payload: raw request body
  - Verification: HMAC(secret, body) == signature
  - Replay protection: X-Enrichment-Timestamp header + 5 min window
```

### 11.5 Data Security

```
At Rest:
  - RDS: AWS managed encryption (AES-256)
  - S3: SSE-S3 encryption
  - Redis: encryption at rest enabled

In Transit:
  - All endpoints: HTTPS/TLS 1.2+
  - Internal services: VPC private subnets
  - SQS: HTTPS only

Data Scope:
  - Sirf public web data extract hoga
  - Login-required pages: nahi
  - Private profiles: nahi
  - robots.txt: respect kiya jayega
```

### 11.6 Audit Logging

```
Logged Events:
  - api_key.created / api_key.revoked
  - plan.changed
  - export.downloaded
  - account.deletion_requested
  - cross_tenant_access_attempt (403 events)
  - webhook.secret_rotated

Retention: 1 year
Storage: audit_logs table (DB)
```

---

## 12. Per-IDE Implementation Guide

### IDE_1: Frontend (apps/web + packages/ui)

**Stack:** TypeScript, React 18, Vite, TanStack Query, React Router v6

**Kya banana hai:**

1. `packages/ui` — Shared component library
   - Button, Card, Badge, Table, Modal, Toast, ProgressBar
   - Tailwind CSS base
   - Storybook optional

2. `apps/web` — Dashboard SPA
   - Auth pages: Login, Signup
   - Overview dashboard (stats cards, recent jobs)
   - New Job page (paste/CSV/Sheets input, mode selector, cost estimate)
   - Jobs List page (paginated, status filters)
   - Job Detail page (real-time progress via polling, retry/cancel buttons)
   - Results Explorer (filters sidebar, copy shortcuts, export buttons)
   - Billing page (usage bars, plan info, upgrade CTA)
   - API Keys page (create/revoke)
   - Team Settings page
   - Integrations page (n8n docs, SDK docs, Sheets connector)

**API Integration:**
- `packages/contracts` se TypeScript types import karo
- TanStack Query se API calls manage karo
- Job progress: 3-second polling (no WebSocket needed in V1)
- Error states: user-friendly messages + retry buttons

**Deploy:**
- `npm run build` → S3 bucket
- CloudFront distribution se serve

**IDE_1 ko kya nahi karna:**
- Backend logic nahi
- DB queries nahi
- Queue operations nahi

---

### IDE_2: Backend (apps/api + packages/* + infra/)

**Stack:** TypeScript/Node.js, Express/Fastify, Prisma/pg, AWS SDK v3

**Kya banana hai:**

1. `packages/contracts` — PEHLE BANAO (foundation)
   - API request/response types
   - Queue payload interfaces
   - EnrichmentResult type
   - Status enums

2. `packages/db` — PEHLE BANAO
   - SQL migrations (Section 5 ka schema)
   - Repository helpers per table
   - Tenant-safe query wrappers

3. `packages/auth`
   - JWT sign/verify (RS256)
   - API key hash/verify (bcrypt)
   - Tenant guard middleware

4. `packages/queue`
   - SQS queue URL constants
   - Producer: `sendToHttpQueue()`, `sendToBrowserQueue()`, etc.
   - Consumer: `receiveMessages()`, `deleteMessage()`

5. `apps/api`
   - All REST endpoints (Section 6)
   - Job orchestration service
   - Stripe webhook handler
   - Usage quota enforcement
   - Rate limiting (Redis)

6. `apps/worker-webhooks`
   - SQS Webhook_Queue consumer
   - HMAC-SHA256 signature generation
   - Exponential backoff retry (max 5)
   - Redis dedupe check

7. `apps/worker-exports`
   - SQS Export_Queue consumer
   - CSV/JSON generation
   - S3 upload + presigned URL generation
   - SES notification trigger

8. `packages/sdk-node`
   - `EnrichmentClient` class
   - `createJob()`, `uploadCSV()`, `waitForCompletion()`, `fetchResults()`
   - TypeScript types from contracts

9. `infra/terraform/`
   - ECS services, RDS, SQS, S3, Redis, CloudFront, ALB
   - IAM roles, security groups
   - CloudWatch alarms
   - S3 lifecycle policies

**IDE_2 ko kya nahi karna:**
- React components nahi
- Python extraction logic nahi
- Playwright code nahi

---

### IDE_3: Enrichment (apps/worker-http + apps/worker-browser + packages/extractor-core + packages/domain-normalizer)

**Stack:** Python (worker-http, extractor-core, domain-normalizer), Node.js/Playwright (worker-browser)

**Kya banana hai:**

1. `packages/domain-normalizer` — PEHLE BANAO
   - `normalize(url) → canonical_domain`
   - Protocol strip, www strip, trailing slash, query params
   - Punycode/IDN support
   - Invalid domain validation
   - Idempotency guarantee: `normalize(normalize(x)) == normalize(x)`

2. `packages/extractor-core` — PEHLE BANAO
   - `emails.py`: Existing `_extract_emails()` refactor + junk filter
   - `phones.py`: Phone regex + E.164 normalization
   - `socials.py`: Social domain matching
   - `metadata.py`: JSON-LD, schema.org, meta tags, headings
   - `confidence.py`: high/medium/low scoring logic
   - Unit tests with HTML fixtures

3. `apps/worker-http`
   - Existing `_http_loop()` ko SQS-based consumer me refactor
   - `fetcher.py`: requests.Session + User-Agent rotation + page discovery
   - `js_detector.py`: JS-heavy heuristics
   - SQS message receive → process → result save → SQS delete
   - Per-domain cooldown (Redis)
   - Circuit breaker (Redis)
   - Retry logic (max 3, exponential backoff)
   - Content size cap (5MB)
   - robots.txt respect

4. `apps/worker-browser`
   - Existing `website-intelligence.js` ko SQS consumer me refactor
   - Playwright browser pool management
   - Per-tenant concurrency enforcement (Redis)
   - Global cap enforcement (20 max)
   - Route navigation: /contact, /about, /team, /company, /support, /careers
   - Consent popup dismiss
   - Images/fonts/videos block
   - extractor-core se extraction (Python subprocess ya shared logic)
   - Browser_Credit deduction (Redis atomic)
   - Zombie browser cleanup

**Migration from jento-mailer:**
- `services/enrichment.py` → `packages/extractor-core` + `apps/worker-http`
- `scraper/website-intelligence.js` → `apps/worker-browser`
- SQLite data → PostgreSQL migration script

**IDE_3 ko kya nahi karna:**
- REST API endpoints nahi
- React components nahi
- Stripe/billing logic nahi
- DB schema changes nahi (IDE_2 se request karo)

---

## Components and Interfaces

### Key Package Interfaces

```typescript
// packages/contracts/src/result/enrichment-result.ts
interface EnrichmentResult {
  id: string;
  domain: string;
  confidence_level: "high_confidence" | "medium_confidence" | "low_confidence";
  enrichment_lane: "http" | "browser";
  contact: {
    primary_email: string | null;
    additional_emails: string[];
    primary_phone: string | null;  // E.164
    additional_phones: string[];
    contact_page_url: string | null;
    contact_form_url: string | null;
  };
  social: {
    linkedin_url: string | null;
    facebook_url: string | null;
    instagram_url: string | null;
    twitter_url: string | null;
    youtube_url: string | null;
    tiktok_url: string | null;
    whatsapp_link: string | null;
    telegram_link: string | null;
  };
  company: {
    name: string | null;
    brand_name: string | null;
    page_title: string | null;
    meta_description: string | null;
    one_line_pitch: string | null;
    long_summary: string | null;
    services_list: string[];
    industry_guess: string | null;
    language: string | null;
    country: string | null;
  };
  signals: {
    cms_guess: string | null;
    framework_guess: string | null;
    ecommerce_signal: boolean;
    saas_signal: boolean;
    booking_signal: boolean;
    cta_type: string | null;
  };
  verified_data: Record<string, unknown>;
  inferred_data: Record<string, unknown>;
}
```

```python
# packages/extractor-core/extractor/emails.py
def extract_emails(html: str) -> list[str]:
    """Priority: mailto: links → visible emails → obfuscated patterns"""
    ...

def filter_junk(emails: list[str]) -> list[str]:
    """Remove CDN, no-reply, platform, image filename emails"""
    ...
```

```python
# packages/domain-normalizer/normalizer/normalize.py
def normalize(url: str) -> str:
    """
    Idempotent: normalize(normalize(x)) == normalize(x)
    Strips: https://, http://, www., trailing slash, query params
    Converts: punycode/IDN to normalized form
    """
    ...
```

---

## Data Models

Poora PostgreSQL schema Section 5 me detail me diya gaya hai. Key relationships:

```
Tenant (1) ──── (N) Users
Tenant (1) ──── (N) Workspaces
Tenant (1) ──── (N) ApiKeys
Tenant (1) ──── (N) EnrichmentJobs
EnrichmentJob (1) ──── (N) EnrichmentJobItems
EnrichmentJobItem (1) ──── (1) EnrichmentResult
Tenant (1) ──── (1) UsageCounters (per billing period)
Tenant (1) ──── (N) WebhookEndpoints
WebhookEndpoint (1) ──── (N) WebhookDeliveries
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Domain Normalization Idempotency

*For any* URL string input, applying normalization twice should produce the same result as applying it once: `normalize(normalize(x)) == normalize(x)`

**Validates: Requirements 4.4**

---

### Property 2: Tenant Isolation

*For any* API request with a valid JWT/API key, the response should only contain data belonging to the requesting tenant — cross-tenant data should never be returned.

**Validates: Requirements 2.5, 2.6**

---

### Property 3: JWT Claims Completeness

*For any* successful login with valid credentials, the returned JWT should contain `tenant_id`, `user_id`, and `role` claims, and decoding it with the correct secret should produce the original claims.

**Validates: Requirements 2.2**

---

### Property 4: API Key Hashing

*For any* API key created through the system, the plain text key should not be retrievable from the database — only the hash should be stored, and verification should work via hash comparison.

**Validates: Requirements 16.1**

---

### Property 5: Job Item Count Invariant

*For any* enrichment job created with N valid (post-deduplication) domains, exactly N `enrichment_job_items` records should be created in the database.

**Validates: Requirements 3.1, 3.4**

---

### Property 6: Idempotency Key Deduplication

*For any* two job creation requests with the same idempotency key, the second request should return the same job_id as the first without creating a new job record.

**Validates: Requirements 3.8**

---

### Property 7: Retry Only Failed Items

*For any* enrichment job, calling retry-failed should only re-queue items with `failed` status — items with `completed` or `partial` status should remain unchanged.

**Validates: Requirements 3.7**

---

### Property 8: HTTP Retry Limit Invariant

*For any* domain that encounters transient errors, the total number of HTTP fetch attempts should never exceed 3. For permanent errors (404, SSL, invalid domain), the attempt count should be exactly 1.

**Validates: Requirements 5.11, 5.12**

---

### Property 9: Junk Email Exclusion

*For any* HTML page containing known junk email patterns (CDN URLs, no-reply addresses, platform emails like @amazonaws.com, @googletagmanager.com), none of those emails should appear in the extraction result.

**Validates: Requirements 5.7**

---

### Property 10: Browser Credit Deduction Invariant

*For any* successful browser enrichment, the tenant's browser credit counter should decrease by exactly 1. The counter should never go below 0 — zero-credit tenants should receive `insufficient_credits` status.

**Validates: Requirements 7.8, 7.9**

---

### Property 11: Webhook HMAC Verification Round-Trip

*For any* webhook delivery, the HMAC-SHA256 signature generated with the endpoint secret should be verifiable by the recipient using the same secret: `verify(secret, body, signature) == true`.

**Validates: Requirements 9.2, 16.5**

---

### Property 12: Webhook Retry Limit

*For any* failed webhook delivery, the total number of delivery attempts should never exceed 5.

**Validates: Requirements 9.3**

---

### Property 13: Confidence Level Validity

*For any* enrichment result stored in the database, the `confidence_level` field should always be one of exactly three valid values: `high_confidence`, `medium_confidence`, or `low_confidence`.

**Validates: Requirements 8.7**

---

### Property 14: Usage Counter Reset

*For any* tenant at the start of a new billing cycle, the `http_enrichments_used` counter should be 0 and `browser_credits_remaining` should equal the plan's monthly allocation plus any purchased packs.

**Validates: Requirements 12.10**

---

### Property 15: Result Expiry Invariant

*For any* enrichment result older than 90 days, it should not be returned by any API endpoint — the system should treat it as deleted.

**Validates: Requirements 19.1**

---

### Property 16: CSV Deduplication

*For any* CSV input containing duplicate domains (after normalization), the number of job items created should be strictly less than the number of input rows containing duplicates.

**Validates: Requirements 3.2, 4.3**

---

## Error Handling

### API Service Errors

| Scenario | HTTP Status | Error Code |
|----------|-------------|------------|
| Invalid/expired JWT | 401 | `UNAUTHORIZED` |
| Cross-tenant access | 403 | `FORBIDDEN` |
| Resource not found | 404 | `NOT_FOUND` |
| HTTP quota exceeded | 402 | `QUOTA_EXCEEDED` |
| Job > 10,000 domains | 422 | `JOB_TOO_LARGE` |
| Invalid domain format | 422 | `INVALID_DOMAIN` |
| Duplicate idempotency key | 200 | (existing job return) |
| Rate limit exceeded | 429 | `RATE_LIMITED` |
| Internal server error | 500 | `INTERNAL_ERROR` |

### Worker Error Handling

```
HTTP Worker:
  - Transient (DNS, timeout, 5xx): max 3 retries, exponential backoff
  - Permanent (404, SSL, invalid): immediate fail, no retry
  - Content > 5MB: skip, status = blocked
  - 429 response: domain skip 10 minutes (Redis TTL)
  - Circuit breaker: 3 consecutive failures → 1 hour skip

Browser Worker:
  - Zero credits: insufficient_credits status, no processing
  - Timeout (30s): browser_timeout status, partial result save
  - Transient: max 2 retries
  - Permanent: immediate fail
  - Zombie browser: kill + re-queue

Webhook Worker:
  - Delivery fail: max 5 retries, exponential backoff
  - Duplicate delivery: Redis dedupe check (delivery_id TTL)

Export Worker:
  - S3 upload fail: retry 3 times
  - Large export (>100k rows): stream to S3, don't buffer in memory
```

### User-Visible Error Messages

```
"Domain invalid" — invalid domain format
"Website not reachable" — DNS failure, timeout
"Public contact data not found" — enrichment returned no data
"Browser render timed out" — JS rendering exceeded 30s
"Blocked by target website" — WAF/bot detection
"Insufficient browser credits" — zero credits
"Monthly limit reached" — HTTP quota exceeded
```

---

## Testing Strategy

### Dual Testing Approach

Unit tests aur property-based tests dono zaroori hain — yeh complementary hain:
- Unit tests: specific examples, edge cases, error conditions
- Property tests: universal properties across all inputs

### Property-Based Testing Library

| Language | Library |
|----------|---------|
| Python | `hypothesis` |
| TypeScript | `fast-check` |

Minimum 100 iterations per property test.

Tag format: `Feature: enrichment-saas-aws, Property {N}: {property_text}`

### Unit Tests

**packages/domain-normalizer:**
- Known URL formats: `https://www.example.com/` → `example.com`
- Punycode: `münchen.de` → normalized form
- Invalid inputs: empty string, IP address, localhost

**packages/extractor-core:**
- Email extraction from HTML fixtures (known good/bad cases)
- Junk email filter: CDN, no-reply, platform emails
- Phone E.164 normalization: various country formats
- Social link detection: LinkedIn company vs personal

**apps/api:**
- Integration tests: DB + queue interactions
- Auth middleware: valid JWT, expired JWT, wrong tenant
- Job creation: valid input, quota exceeded, too many domains
- Idempotency: same key twice returns same job

**End-to-End Test:**
- Complete flow: job create → HTTP_Queue → worker process → result save → webhook fire
- Staging environment me run hoga

### Property Tests

```python
# packages/domain-normalizer — Property 1
# Feature: enrichment-saas-aws, Property 1: Domain Normalization Idempotency
@given(st.text())
@settings(max_examples=500)
def test_normalize_idempotent(url):
    try:
        result = normalize(url)
        assert normalize(result) == result
    except InvalidDomainError:
        pass  # invalid inputs are fine to reject

# packages/extractor-core — Property 9
# Feature: enrichment-saas-aws, Property 9: Junk Email Exclusion
@given(html_with_junk_emails())
@settings(max_examples=200)
def test_junk_emails_excluded(html):
    emails = extract_emails(html)
    for email in emails:
        domain = email.split("@")[1]
        assert domain not in JUNK_DOMAINS
```

```typescript
// apps/api — Property 5: Job Item Count Invariant
// Feature: enrichment-saas-aws, Property 5: Job Item Count Invariant
fc.assert(
  fc.asyncProperty(
    fc.array(fc.domain(), { minLength: 1, maxLength: 100 }),
    async (domains) => {
      const uniqueDomains = [...new Set(domains.map(normalize))];
      const job = await createJob({ domains, mode: "fast_http" });
      const items = await getJobItems(job.id);
      return items.length === uniqueDomains.length;
    }
  ),
  { numRuns: 100 }
);

// apps/api — Property 6: Idempotency
// Feature: enrichment-saas-aws, Property 6: Idempotency Key Deduplication
fc.assert(
  fc.asyncProperty(
    fc.uuid(),
    fc.array(fc.domain(), { minLength: 1 }),
    async (idempotencyKey, domains) => {
      const job1 = await createJob({ domains, idempotency_key: idempotencyKey });
      const job2 = await createJob({ domains, idempotency_key: idempotencyKey });
      return job1.id === job2.id;
    }
  ),
  { numRuns: 100 }
);
```

### CI/CD Pipeline

```yaml
# GitHub Actions — per PR
jobs:
  test:
    - pnpm install
    - pnpm run typecheck          # TypeScript type check
    - pnpm run test --coverage    # Unit + property tests
    - fail if coverage < 70%

  build:
    - Docker images build
    - ECR push (main branch only)

  deploy-staging:
    - ECS staging deploy (main branch only)
    - E2E tests run against staging
```

### Load Testing Target

- 100 concurrent HTTP enrichment jobs without queue backup
- Documented in `docs/runbooks/load-test-results.md`

---

## 13. Frontend Design Specification (IDE_1)

Yeh section `saasfrontend.md` se derive kiya gaya hai aur IDE_1 ke liye complete frontend implementation guide hai.

---

### 13.1 Visual Theme aur Design Direction

**Feel:** "Clean intelligence workspace" — premium but not flashy, calm, bright, fast, analytics-grade trust.

**Avoid:**
- Generic blue dashboard templates
- Purple gradients
- Over-dark UI
- Crowded cards
- Heavy glassmorphism

---

### 13.2 Typography

| Use | Font | Fallback |
|-----|------|---------|
| Headings | `Space Grotesk` | Strong geometric grotesk |
| Body | `Manrope` | Soft readable sans |
| Metrics / API keys / tables | `JetBrains Mono` | Any monospace |

---

### 13.3 Color System (White-Based)

| Token | Color | Use |
|-------|-------|-----|
| `bg.canvas` | `#F6F7F2` | App background — slightly warm white |
| `bg.surface` | `#FFFFFF` | Cards, drawers, tables |
| `bg.subtle` | `#EEF2EA` | Muted panels, filters, input groups |
| `text.primary` | `#14202B` | Main headings and core text |
| `text.secondary` | `#52606D` | Supporting text |
| `text.muted` | `#7B8794` | Metadata and placeholders |
| `border.soft` | `#D8E1D7` | Card borders |
| `border.strong` | `#BCC8BB` | Active separators |
| `brand.primary` | `#0F766E` | Primary CTA, links, key accents (deep teal) |
| `brand.primaryHover` | `#115E59` | Primary hover |
| `brand.secondary` | `#0F4C81` | Secondary accent, charts (navy) |
| `accent.signal` | `#F59E0B` | Warnings, usage attention (amber) |
| `success` | `#15803D` | Completed, healthy |
| `danger` | `#DC2626` | Failed, destructive |
| `info` | `#2563EB` | Info badges and highlights |

**Gradient (hero panels / empty states):**
```css
linear-gradient(135deg, #F6F7F2 0%, #FFFFFF 42%, #EAF6F3 100%)
```

---

### 13.4 Status Badge Mapping

| Status | Badge Color |
|--------|------------|
| `queued` | Neutral gray |
| `processing_http` | Blue |
| `processing_browser` | Teal |
| `completed` | Green |
| `partial` | Amber |
| `failed` | Red |
| `blocked` | Gray-red |
| `browser_timeout` | Orange |
| `insufficient_credits` | Amber-red |

---

### 13.5 App Shell Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  TOP BAR: [Page Title] [Search] [Workspace] [Usage Chip] [Profile]  │
├──────────────┬──────────────────────────────────────────────────────┤
│              │                                                       │
│   SIDEBAR    │              MAIN CONTENT                            │
│   (fixed)    │              (wide, breathable)                      │
│              │                                                       │
│  ● Overview  │                                                       │
│  ● New Job   │                                                       │
│  ● Jobs      │                                                       │
│  ● Results   │                                                       │
│  ● Integrat. │                                                       │
│  ● Billing   │                                                       │
│  ● API Keys  │                                                       │
│  ● Team      │                                                       │
│              │                                                       │
└──────────────┴──────────────────────────────────────────────────────┘
```

**Sidebar style:**
- White/near-white surface
- Active item: teal left accent bar
- Icon + label pairs
- Subtle counters for active jobs or alerts

---

### 13.6 Page-by-Page Design Spec

#### Page 1: Login (`/login`)

- Split-screen ya centered auth card
- Left: brand statement + abstract network/grid illustration (pale teal lines)
- Right: login form
- Heading: "Sign in to Enrichment SaaS"
- Subcopy: "Track jobs, enrich domains, and export verified company data."
- Fields: email, password, remember me, forgot password
- Primary CTA button (teal)

#### Page 2: Signup (`/signup`)

- Fields: name, workspace/company name, email, password
- Support block: Starter/Growth/Pro summary
- Trust microcopy: "No outreach tools. Pure enrichment workflow."

#### Page 3: Overview Dashboard (`/dashboard`)

```
┌─────────────────────────────────────────────────────────────────────┐
│  HERO STRIP                                                          │
│  "Your enrichment pipeline is moving"                               │
│  "Monitor active jobs, usage, and result quality from one place."   │
│                                          [+ New Enrichment Job]     │
├──────────────────────────────────────────────────────────────────── ┤
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                │
│  │ Enriched     │ │ Success Rate │ │ Browser      │                │
│  │ This Month   │ │              │ │ Credits Left │                │
│  │   4,231      │ │    87.3%     │ │     342      │                │
│  └──────────────┘ └──────────────┘ └──────────────┘                │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                │
│  │ HTTP Rows    │ │ Active Jobs  │ │ Recent       │                │
│  │ Used         │ │              │ │ Exports      │                │
│  │  4,231/5,000 │ │      2       │ │      3       │                │
│  └──────────────┘ └──────────────┘ └──────────────┘                │
│                                                                      │
│  Recent Jobs Table                    │  Billing Usage Rail         │
│  ─────────────────────────────────    │  ─────────────────────      │
│  Job Name  │ Status │ Progress        │  HTTP: ████░░ 4.2k/5k       │
│  leads.csv │ Running│ 45/100          │  Credits: ██░░ 158/500      │
└─────────────────────────────────────────────────────────────────────┘
```

**Card style:** White cards, very thin borders, large metric number in JetBrains Mono, small trend/helper text below.

#### Page 4: New Enrichment Job (`/jobs/new`)

Step-by-step flow:

```
Step 1: Input Method
  [Paste Links]  [Upload CSV]  [Connect Google Sheet]

Step 2: Domain Input
  ┌─────────────────────────────────────────────────┐
  │ example.com                                      │
  │ company.io                                       │
  │ startup.co                                       │
  └─────────────────────────────────────────────────┘
  "3 domains detected • 0 duplicates removed"
  [▼ 2 invalid domains] (expandable tray)

Step 3: Mode Selection (cards)
  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
  │ Fast HTTP        │ │ ★ Smart Hybrid   │ │ Premium JS       │
  │ Static sites,    │ │ Recommended.     │ │ Browser render   │
  │ low-cost bulk    │ │ HTTP first,      │ │ for JS-heavy     │
  │ runs.            │ │ JS fallback.     │ │ sites.           │
  │ ~0 credits       │ │ ~few credits     │ │ ~1 credit/domain │
  └──────────────────┘ └──────────────────┘ └──────────────────┘

Step 4: Options
  ☑ Deduplicate domains
  ☐ Only enrich missing fields
  ☐ Send webhook on completion

Step 5: Estimate
  Estimated Cost: ~0 browser credits + 3 HTTP rows
  Estimated Time: ~1 minute
  [Inline upgrade alert if quota exceeded]

Step 6: Submit
  [Start Enrichment →]  (teal primary button)
```

#### Page 5: Jobs List (`/jobs`)

Table columns: Job Name | Created By | Mode | Status | Progress | Success Rate | Created At | Actions

Filters: Status | Mode | Date Range

Visual: White table, sticky filter row, status badges, progress mini-bars.

#### Page 6: Job Detail (`/jobs/:id`)

```
TOP: [Job Title] [Mode Badge] [Created Date] [Total Domains]
     [Cancel] [Retry Failed] [Export]

MIDDLE:
  ████████████████████░░░░░░░░░░░░░░░░  45%
  45 completed • 3 failed • 52 queued
  HTTP: 40 ✓   Browser: 5 ✓   Failed: 3 ✗

  Error Summary Cards:
  ┌─────────────────────────────────────────────────────────┐
  │ 3 domains failed due to timeout.                        │
  │ Retry failed items or export current results.           │
  └─────────────────────────────────────────────────────────┘

BOTTOM:
  Results Preview Table
  [Export CSV] [Copy All Emails] [Copy All Phones] [Copy LinkedIn]
```

**Key UX:** Failure ko sirf red text me mat dikhao — error summary compact cards me show karo with "what to do next" guidance.

#### Page 7: Results Explorer (`/results/:job_id`)

```
┌──────────────┬──────────────────────────────────────────────────────┐
│ FILTER RAIL  │  TOP ACTION BAR: [Export Selected] [Copy] [Webhook]  │
│              ├──────────────────────────────────────────────────────┤
│ ☐ Has Email  │  Domain │ Email │ Phone │ LinkedIn │ Confidence │ Lane│
│ ☐ Has Phone  │  ─────────────────────────────────────────────────── │
│ ☐ LinkedIn   │  ex.com │ info@ │ +1... │ /company │ ● High     │ HTTP│
│ ☐ High Conf  │  co.io  │ hi@.. │  —   │    —     │ ● Medium   │ Brow│
│ ☐ Browser    │                                                       │
│ ☐ Failed     │  [Click row → Detail Drawer opens on right]          │
└──────────────┴──────────────────────────────────────────────────────┘
```

**Detail Drawer:** Company identity, contact data, social links, technical signals, source URLs, confidence scores.

**Feel:** Powerful, clean, spreadsheet-like but beautiful.

#### Page 8: Integrations (`/integrations`)

Sections: Webhooks | n8n | Google Sheets | Node SDK | API Docs

Cards: What it does | Who it's for | [Setup] [Docs] buttons

#### Page 9: Billing and Usage (`/billing`)

```
Current Plan: Growth  [Upgrade to Pro]

HTTP Enrichments:
████████████████░░░░░░░░  12,450 / 25,000 used

Browser Credits:
████░░░░░░░░░░░░░░░░░░░░  87 / 500 used  (413 remaining)

[Buy Credit Pack]  → 100 credits $19 | 500 credits $79 | 1000 credits $139

Recent Invoices:
Jan 2025  $49.00  Paid ✓
Dec 2024  $49.00  Paid ✓
```

**Style:** Active plan me teal ring/subtle glow, purchased credit packs alag card me.

#### Page 10: API Keys (`/api-keys`)

- Keys table with prefix display (e.g., `enr_sk_abc...xyz`)
- Create key modal
- Reveal-once UX: "You will only see this secret once."
- Key displayed in JetBrains Mono block
- Revoke action per key

#### Page 11: Team Settings (`/settings/team`)

- Members list with roles (owner/admin/member)
- Invite by email
- Workspace settings
- Simple admin page — clarity over decoration

---

### 13.7 Shared Component Library (`packages/ui`)

Required components:

| Component | Purpose |
|-----------|---------|
| `Button` | Primary, secondary, ghost, danger variants |
| `IconButton` | Icon-only actions |
| `Card` | White surface with thin border |
| `Badge` | Status badges with color mapping |
| `Tabs` | Page-level tab navigation |
| `SegmentedControl` | Mode selector (Fast HTTP / Smart Hybrid / Premium JS) |
| `DataTable` | Dense, sortable, selectable table |
| `FilterChips` | Filter rail chips |
| `Drawer` | Right-side detail panel |
| `Modal` | Centered overlay |
| `Toast` | Success/error notifications |
| `ProgressBar` | Animated width transition |
| `EmptyState` | Title + body + CTA for empty pages |
| `InlineAlert` | Quota warnings, error messages |
| `UsageBar` | HTTP/credits usage visualization |
| `StatCard` | KPI card with mono metric number |
| `DomainInputBox` | Multi-line domain paste input |
| `UploadDropzone` | CSV drag-and-drop upload |
| `PricingCard` | Plan comparison cards |

---

### 13.8 State Design Rules

Har major page ke liye yeh states defined hon:

| State | Description |
|-------|-------------|
| `loading` | Skeleton loaders, not spinners |
| `empty` | EmptyState component with CTA |
| `success` | Data rendered normally |
| `partial` | Partial data with explanation |
| `error` | InlineAlert with retry option |
| `permission_restricted` | 403 state with upgrade/contact prompt |

**Empty State Example (Overview):**
- Title: "No enrichment jobs yet"
- Body: "Start your first job with pasted domains, a CSV, or a Google Sheet."
- CTA: "Create New Job"

**Limit Reached State:**
- `"You are about to exceed your monthly HTTP limit. Upgrade to continue this run."`

---

### 13.9 Motion and Interaction

| Element | Animation |
|---------|-----------|
| Page load | 120–180ms fade + lift |
| Cards | Stagger reveal |
| Progress bars | Smooth width transition |
| Drawer open | Soft spring feel |
| Hover states | Crisp, not floaty |

**Avoid:** Excessive parallax, bouncing charts, heavy glassmorphism.

---

### 13.10 Responsive Strategy

| Breakpoint | Behavior |
|------------|---------|
| Desktop | Sidebar persistent, tables full width, filter side rail |
| Tablet | Sidebar collapsible, filter rail in drawer, cards 2-column max |
| Mobile (V1) | Functional but not primary target — tables collapse to cards |

---

### 13.11 Accessibility Requirements

- Body text contrast: AA level minimum
- Primary buttons on white: high contrast
- Status colors: labels bhi hon, sirf color par rely mat karo
- Tables: keyboard navigable
- Modals: focus trap
- Progress bars: accessible `aria-label` attributes

---

### 13.12 Content Tone

**Use:** enriched, queued, processing, completed, partial, credits remaining

**Avoid:** magic, explosive growth, killer leads

---

### 13.13 Charts and Data Visualization

| Chart Type | Use |
|------------|-----|
| Usage bars | HTTP + browser credit consumption |
| Line chart | Daily processed domains trend |
| Stacked bar | HTTP vs Browser completion split |
| Donut | Success vs failed vs partial |

**Chart styling:** Thin grid lines, white background, teal primary data, navy secondary, amber for warnings only.

---

### 13.14 Job Progress Polling Strategy

V1 me WebSocket nahi — 3-second polling:

```typescript
// apps/web/src/hooks/useJobProgress.ts
const { data } = useQuery({
  queryKey: ['job', jobId],
  queryFn: () => api.getJob(jobId),
  refetchInterval: (data) =>
    data?.status === 'running' ? 3000 : false,
});
```

---

### 13.15 IDE_1 Build Order

1. `packages/ui` — component library pehle banao (Button, Card, Badge, StatCard, ProgressBar, DataTable)
2. Auth pages (Login, Signup)
3. Overview Dashboard
4. New Job page (most important conversion page)
5. Jobs List
6. Job Detail
7. Results Explorer
8. Billing page
9. API Keys page
10. Integrations page
11. Team Settings
