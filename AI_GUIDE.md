# AI Agent Guide - Enrichment SaaS

> [!IMPORTANT]
> **READ THIS BEFORE MAKING ANY CHANGES**
> This repository is a complex, multi-service application with strict deployment, database, and backend architectures. Follow these rules to avoid breaking the production system.

## 1. Project Architecture
The repository uses a monorepo-style structure inside `apps/` with a shared PostgreSQL database.
- **`apps/web/`**: Frontend React application (TypeScript, Vite).
- **`apps/api/`**: Main Express Node.js backend. The core logic is in `src/calls-module/`.
- **`apps/worker-http/`**: Python worker (FastAPI/SQLAlchemy) that processes high-speed HTTP scraping for leads.
- **`apps/worker-browser/` (or `browser-enrichment` script)**: Node.js worker using Puppeteer for sites with Cloudflare protection.

## 2. Server & Deployment
- **Target Server**: AWS EC2 Instance at `13.61.8.100`.
- **SSH Key**: The user's local machine uses `~/Downloads/aws-enrichment-key.pem` to SSH into `ubuntu@13.61.8.100`.
- **Process Manager**: All backend services are managed by **PM2** on the EC2 server.
    - `enrichment-api` (Express backend, 1 instance)
    - `enrichment-worker` (Python HTTP worker, 3 instances)
    - `browser-enrichment` (Node.js Puppeteer worker, 1 instance)
- **Deployment Script**: Always use `./deploy-to-gcp.sh` from the project root. This script builds the frontend locally, rsyncs the entire directory to EC2, and automatically restarts the PM2 processes. **Do not use other deploy scripts unless explicitly instructed.**
- **Hotfixes**: For urgent backend fixes, you can `rsync` individual files to `ubuntu@13.61.8.100:/home/ubuntu/enrichment-saas/...` and then run `ssh ubuntu@13.61.8.100 "pm2 restart enrichment-api"` to apply the fix instantly without a full rebuild.

## 3. Database Constraints
- **Type**: PostgreSQL
- **Connection String**: `postgresql://enrichment_user:enrichment_pass_2024@127.0.0.1:5432/enrichment_db` (Internal to EC2).
- **CRITICAL RULES**:
  - Never introduce `ALTER TABLE` or any DDL commands inside scheduled intervals (e.g., `setInterval`). This will cause `AccessExclusiveLock` database gridlocks.
  - Endpoints fetching large lists (like `GET /api/contacts`) must either have strict `LIMIT`s or use highly optimized queries (e.g., `LEFT JOIN LATERAL`) instead of correlated subqueries.
  - When querying the DB manually for debugging, use `ssh` to run `psql` directly on the EC2 machine.

## 4. Known Bugs & Historical Gotchas
- **Python Version Mismatch**: The EC2 server runs Python 3.14. `SQLAlchemy 2.0.30` or higher MUST be used. Older versions (like 2.0.28) will crash on `__firstlineno__` missing attributes in Python 3.14.
- **Scraper Fallback Loop**: The scraping system is a "Smart Hybrid". Leads start at `HTTP` (handled by Python). If they hit Cloudflare blocks (403), they are marked as `needs_browser` and get picked up by the Node.js Headless Browser worker. *Do not assume the scraper is broken if leads appear in the Browser Queue; this is intentional fallback behavior.*
- **Rate Limits & IP Bans**: Google Maps scraping uses specific proxies or is subject to rate limiting. If the API completely hangs, check `pm2 logs enrichment-api` for IMAP or Scraper timeouts.

## 5. Development Workflow
1. Read the code locally on the user's machine to understand logic.
2. Make changes locally.
3. If it's a minor backend fix: `rsync` the specific file and restart PM2.
4. If it's a major change or frontend change: Run `./deploy-to-gcp.sh`.
5. Check PM2 logs on the server to verify the change: `pm2 logs <service-name> --lines 50`.

---
*Created by AI for AI. Keep this guide updated as the architecture evolves.*
