# Enrichment SaaS - Comprehensive System Architecture & Implementation Design

This document details the complete, granular architecture of the Enrichment SaaS platform. It serves as a technical blueprint for the current state of the implementation, covering the cloud infrastructure, the polyglot monorepo structure, data flows, and microservices orchestration.

---

## 1. High-Level Architecture Overview

The Enrichment SaaS platform is a scalable, cloud-native (Google Cloud-based) B2B lead generation and intelligence system. It handles bulk website enrichment through decoupled microservices communicating via Amazon SQS and Redis, persisting to PostgreSQL.

**Core Technical Stack:**
- **Frontend:** React + Vite + TypeScript (hosted via CloudFront/S3 or rendered on Google Cloud VM).
- **API Gateway/Backend:** Node.js + Express + TypeScript (`apps/api`).
- **Data Stores:** PostgreSQL (Primary DB) and Redis (Caching, Rate Limiting, Circuit Breakers).
- **Message Broker:** Amazon SQS (`HTTP_Queue`, `Browser_Queue`, `Webhook_Queue`).
- **Workers:** Polyglot architecture featuring Python (for HTTP enrichment) and Node.js (for browser rendering, webhooks, and exports).

---

## 2. Detailed Monorepo Structure

The project utilizes a strict monorepo structure separating frontend, API, workers, and shared packages.

### `apps/` (Microservices & Applications)
- **`apps/api` (Node.js/TypeScript):** 
  - The core API orchestrator.
  - **CRM/Calls Module:** Contains routes (`contacts.routes.js`, `niches.routes.js`, `scraper-bridge.routes.js`) for the SaaS UI to manage niches and agents.
  - **Database Migration:** Contains `scripts/migrate-sqlite-to-pg.js` which successfully migrated the early SQLite database (`cold-calling.sqlite`) to PostgreSQL. The DB interface `db/index.js` now wraps `@enrichment-saas/db` using a `pg` connection pool.
  - **Job Orchestration:** Pushes new domains to SQS queues for the workers to process.
- **`apps/worker-http` (Python):** 
  - The core data extraction engine consuming from `SQS_HTTP_QUEUE_URL`.
  - Uses `asyncio`, `httpx`, and `BeautifulSoup` to perform high-speed, headless HTTP scraping.
  - Implements intelligent link discovery (scanning `/contact`, `/about`, `/team`, etc. up to 15 sub-pages).
  - Uses a rotating list of User-Agents and Proxies (`proxies.py`) to avoid IP bans.
  - Integrates Redis for cooldown periods and circuit breakers (triggering after 3 failures with a 1-hour TTL).
- **`apps/web` (React/TypeScript):** 
  - The user interface for both Managers and Employees.
  - Features Niche management, Twilio softphone integration (`DialerPopup.tsx`), Lead viewing, and triggering Google Maps API scrapes.
- **`apps/worker-browser` (Node.js/Playwright):** 
  - Intended for JavaScript-heavy/SPA websites. (Currently bypassed by `worker-http` in `smart_hybrid` mode if the browser worker isn't deployed).

### `packages/` (Shared Business Logic)
- **`packages/extractor-core` (Python):**
  - Modular extraction scripts: `emails.py`, `phones.py`, `socials.py`, `metadata.py`, `intelligence.py`, `technographics.py`.
  - Uses heuristics to detect CMS (Shopify, WordPress), determine confidence scores, and generate 1-line pitches.
- **`packages/domain-normalizer` (Python):**
  - Standardizes raw user input into clean, deduped domain names.
- **`packages/db` (TypeScript):**
  - The centralized PostgreSQL connection logic (`createPool`) shared across Node.js services.

---

## 3. Advanced Implementation Details

### A. Dual-Sync Pipeline (Worker to CRM)
When `worker-http/main.py` finishes enriching a domain, it performs a **Dual-Sync**:
1. **Generic Enrichment Save:** Saves the raw JSON, tech stack, and social data into the `enrichment_results` table.
2. **CRM Contact Sync:** Directly updates the PostgreSQL `contacts` table (`sync_to_contacts_pg` function) using `ILIKE` matching. This ensures that the moment a lead is enriched, its phone number, email, and confidence score are instantly visible on the Employee's Twilio dashboard in the UI.

### B. Redis Circuit Breakers & Rate Limiting
To prevent infinite loops and Google Cloud NAT Gateway bloat on dead websites, `worker-http` uses Redis:
- **`rate_limit:{domain}`:** Set for 600s if a `429 Too Many Requests` is hit.
- **`cb_count:{domain}`:** Increments on fetch failures.
- **`cb:{domain}`:** Triggered after 3 failures (`CIRCUIT_BREAKER_FAILURES`), ignoring the domain entirely for 1 hour.

### C. Niche & Employee Access Control Architecture
- **Niches:** Managers create "Niches" (e.g., "Plumbers NY") and assign them an `assigned_agent_id`.
- **Scraper Bridge:** Frontend scrapes Google Places API (for baseline URLs/Phones) -> Calls `/api/scraper-bridge/push-leads` -> Backend auto-generates the Niche ID and inserts all leads.
- **Strict Isolation:** `contacts.routes.js` dynamically filters the `contacts` table based on the logged-in JWT user. Employees CANNOT query leads belonging to a niche assigned to someone else.

### D. Twilio Telephony System
- Number pooling is managed in `employees.routes.js`. 
- `DialerPopup.tsx` utilizes Twilio Device SDK.
- The system enforces call recording automatically via backend webhook configuration (`twilio.routes.js`), saving the audio logs to the database for manager QA.

---

## 4. End-to-End Orchestration Flow

1. **Lead Generation:** Manager queries "Beauty Salons in NYC" via UI. Backend hits Google Places API, extracts URLs.
2. **CRM Push:** Leads are inserted into Postgres `contacts` table under a specific Niche.
3. **Enrichment Enqueue:** API enqueues the domain to SQS `HTTP_Queue` for deep data extraction.
4. **Processing (`worker-http`):** Python worker pulls from SQS, checks Redis circuit breaker, uses proxy, fetches HTML.
5. **Extraction:** Passes HTML to `extractor-core`. Discovers internal links. Re-fetches sub-pages for emails/phones.
6. **Data Sync:** Worker saves results to `enrichment_results` and updates the `contacts` table with the newly found email/socials.
7. **Execution:** Employee logs into the React frontend, views their isolated Niche, sees the highly enriched lead, and clicks "Call" to dial via Twilio.

---

## 5. Areas for Future Improvement & Review
- **Browser Worker Deployment:** The `worker-http` currently detects JS-heavy sites via heuristics (`__NEXT_DATA__`, `vite`, `react-root`), but bypasses escalating to `SQS_BROWSER_QUEUE_URL`. The Playwright Node.js worker needs full integration.
- **Production Authentication:** Migrating the mock/manager bootstrap login to secure JWT-based authentication in `auth.routes.js`.
- **Database Scalability:** As the PostgreSQL DB grows with HTML snapshots and JSON blobs, partitioning strategy for `enrichment_results` and offloading raw HTML to S3 will be required.

---

## 6. Google Cloud Platform (GCP) Deployment Strategy
Although the current document and environment variables mention Google Cloud (like SQS, S3, ECS), this entire architecture **can absolutely be deployed on Google Cloud Platform (GCP)** with minimal code changes. The polyglot microservices and PostgreSQL database are fully platform-agnostic.

Here is how the current Google Cloud services map directly to GCP equivalents:

| Component / Function | Current Google Cloud Service | Google Cloud (GCP) Equivalent | Required Changes |
| :--- | :--- | :--- | :--- |
| **Message Queues (Workers)** | Amazon SQS (`boto3`) | **Google Cloud Pub/Sub** | Replace `boto3` SQS polling in `worker-http/main.py` with the `google-cloud-pubsub` Python library. |
| **Container Hosting (API & Workers)** | Google Cloud ECS Fargate | **Cloud Run** or **GKE** | Deploy the Node.js API and Python workers as dockerized Cloud Run services. Cloud Run is perfect for auto-scaling HTTP workers. |
| **Relational Database** | Amazon RDS PostgreSQL | **Cloud SQL for PostgreSQL** | No code changes required. Just update the `DATABASE_URL` environment variable. |
| **Caching & Circuit Breakers** | Amazon ElastiCache (Redis) | **Memorystore for Redis** | No code changes required. Update the `REDIS_URL`. |
| **Object Storage (HTML/JSON Blobs)** | Amazon S3 | **Cloud Storage (GCS)** | Use `google-cloud-storage` instead of S3 APIs for saving raw HTML snapshots. |
| **Load Balancing & CDN** | ALB + CloudFront | **Cloud Load Balancing + Cloud CDN** | Handled purely via GCP networking/infrastructure. |
| **Email Notifications** | Amazon SES | **SendGrid / Mailgun via GCP** | GCP partners with third-party providers for transactional emails. Change SMTP/API credentials. |

To run this on Google Cloud, the main codebase refactoring needed is swapping out the **Amazon SQS (`boto3`) logic** with **Google Cloud Pub/Sub** logic for task orchestration between the API and the Python/Node.js workers. The rest of the Node.js and Python code runs perfectly as Docker containers on GCP.
