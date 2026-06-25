# AGENTS.md

Purpose: help coding agents solve tasks in this repo with minimal token and credit usage.

## First Read

Read files in this order only:

1. `AGENTS.md`
2. `README.md`
3. `AI_GUIDE.md` only if the task touches deployment, EC2, PM2, database, or multi-service behavior

Do not start by scanning the whole repo.

## Repo Map

- `apps/web/`: main CRM frontend in React + Vite
- `apps/api/`: main backend and AI calling logic
- `apps/api/src/calls-module/`: CRM, contacts, campaigns, Twilio-related APIs
- `apps/api/src/voice-agent/`: OpenAI/Twilio voice agent orchestration
- `apps/api/src/routes/`: modern TypeScript API routes used by CRM frontend
- `apps/worker-http/`: Python scraping worker
- `docs/archive/`: old debugging history, usually not needed
- `old_data/`: legacy files, usually not needed

## Task Routing

If the task is about:

- CRM UI or `app.jentoai.pro`: start in `apps/web/src/pages/` and `apps/web/src/components/`
- AI Agent pipeline UI: start in `apps/web/src/pages/AgentPipeline.tsx`
- Lead APIs / pipeline stages: start in `apps/api/src/routes/crm.ts`
- Niche assignment / contacts / campaigns: start in `apps/api/src/calls-module/routes/`
- Voice calling, Twilio, realtime audio, live listen: start in `apps/api/src/voice-agent/`
- Auto-dial queue / assigned leads calling: start in `apps/api/src/workers/outbound-caller.js`
- Deployment or production debugging: read `AI_GUIDE.md` before changing anything

## Token-Saving Rules

- Prefer `rg` to locate files before opening anything
- Open only the exact file you plan to edit plus one related dependency
- Avoid reading `docs/archive/`, `old_data/`, `dist/`, `.wrangler/`, `node_modules/`, logs, and generated `.js.map` files unless the task explicitly needs them
- Ignore compiled JS and `.d.ts` files when matching TypeScript sources exist
- Do not inspect `pnpm-lock.yaml` unless dependency changes are required

## Source Of Truth

- Prefer `.ts` and `.tsx` over compiled `.js`
- Prefer files under `apps/api/src/routes/` over older duplicated route implementations unless the running path clearly uses the older module
- For voice agent behavior, prefer files under `apps/api/src/voice-agent/`

## Fast Paths

- Frontend build: `cd apps/web && npm run build`
- API type check: `cd apps/api && npm run build`
- Full deploy: `./deploy-all.sh`

## Avoid

- Full-repo reads
- Archive docs first
- Editing both old and new implementations unless necessary
- Touching generated files just because they are dirty
