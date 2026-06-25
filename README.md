# Enrichment SaaS Monorepo

Welcome to the Enrichment SaaS platform.

> [!IMPORTANT]  
> **If you are an AI assistant or a new developer**, first read [AGENTS.md](./AGENTS.md). Then read [AI_GUIDE.md](./AI_GUIDE.md) only if the task touches deployment, EC2, PM2, database, or multi-service behavior.

## Overview
This repository contains:
- `apps/web/`: React frontend
- `apps/api/`: Express Node.js backend
- `apps/worker-http/`: Python worker for web scraping
- `apps/worker-browser/`: Node.js headless browser fallback worker

## Documentation
- Coding agent quick map: [AGENTS.md](./AGENTS.md)
- Technical Guide: [AI_GUIDE.md](./AI_GUIDE.md)
- Old Status Logs & Bug Fixes: [docs/archive/](./docs/archive/)
- Initial Design Specs: [docs/specs/](./docs/specs/)
