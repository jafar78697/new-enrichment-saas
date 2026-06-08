# Unified SaaS Deployment — app.jentoai.pro

This frontend is the single operator surface for:

- **Funnel Intelligence** (`/funnel`) — data from `mailer.jentoai.com/api/funnel/*`
- **Messaging** (`/messaging`) — data from `mailer.jentoai.com/api/inbox/*`
- **Call Center** (`/calls`) — data from `calls.jentoai.com/api/{agents,contacts,calls}`
- **Team & Permissions** (`/settings/team`) — localStorage (pending backend)
- **Enrichment** (existing) — `api.jentoai.pro/v1/*`

## Required environment variables

`apps/web/.env.production`:

```
VITE_API_URL=https://api.jentoai.pro           # enrichment FastAPI
VITE_MAILER_URL=https://mailer.jentoai.com     # Flask mailer (funnel + inbox)
VITE_CALLS_URL=https://calls.jentoai.com       # Node call-system backend
VITE_MOCK=false
```

## Backend CORS checklist

| Backend                         | Must allow origin        | File                                                  |
| ------------------------------- | ------------------------ | ----------------------------------------------------- |
| `mailer.jentoai.com` (Flask)    | `https://app.jentoai.pro` | `jento-mailer/app.py` — uses `flask_cors.CORS(app)` (all origins by default) |
| `calls.jentoai.com` (Express)   | `https://app.jentoai.pro` | `call system/backend/.env` — set `ALLOWED_ORIGINS=https://app.jentoai.pro,...` |
| `api.jentoai.pro` (FastAPI)     | `https://app.jentoai.pro` | Already configured by `VITE_API_URL`                  |

## Cloudflare Tunnel

`~/.cloudflared/config.yml`:

```yaml
tunnel: ed678d5c-814d-4b12-b6ba-0c4312f6e71b
credentials-file: /home/.../<uuid>.json
ingress:
  - hostname: calls.jentoai.com
    service: http://localhost:3000
  - hostname: mailer.jentoai.com
    service: http://localhost:5000
  - service: http_status:404
```

## Build & deploy

```bash
cd .kiro/specs/enrichment-saas-aws/apps/web
npx vite build                # outputs dist/
# then ship dist/ via existing deploy-frontend.sh
```

## Verifying live endpoints

```bash
curl -sI -H "Origin: https://app.jentoai.pro" https://mailer.jentoai.com/api/funnel/stats
curl -sI -H "Origin: https://app.jentoai.pro" https://mailer.jentoai.com/api/inbox
curl -sI -H "Origin: https://app.jentoai.pro" https://calls.jentoai.com/api/agents
```

All three should return `HTTP/2 200` with `access-control-allow-origin: https://app.jentoai.pro`.

## Restart procedures

- **Mailer (Flask, port 5000):** `cd jento-mailer && python app.py`
- **Call system (Express, port 3000):** `cd "call system/backend" && npm start`
- **Cloudflared:** `cloudflared tunnel --config ~/.cloudflared/config.yml run`

## Next backend work (not shipped)

1. Wire `apps/api` FastAPI `/v1/team` endpoints so `TeamSettings.tsx` hits real data instead of `localStorage`.
2. Add JWT bearer auth to mailer/calls routes; share the same `enr_token` from `useAuth`.
3. Server-Sent Events for Messaging real-time new-reply notifications.
