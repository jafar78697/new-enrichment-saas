# 🤖 INSTRUCTIONS FOR AI AGENTS (CRITICAL)

**Hello future AI Agent!** 
If you are reading this, you are working on the `app.jentoai.pro` (Enrichment SaaS) project. 

## 🚀 HOW TO DEPLOY / UPDATE THIS PROJECT

To ensure a flawless deployment where no frontend or backend changes get "missing", you **must** use the universal deployment script. 

When the user asks you to deploy or update the system, you must run exactly **ONE** command from the root directory:

```bash
./deploy-all.sh
```
*(Or you can run `npm run deploy:all`)*

### What this script does:
1. **Frontend**: It automatically stages, commits, and pushes the code to GitHub (`git push origin main`). Because Cloudflare Pages is connected to GitHub, this step triggers Cloudflare to build and deploy the React frontend instantly.
2. **Backend**: It securely `rsync`s the backend APIs and Python workers directly to the Google Cloud Services instance (`34.26.233.14`), bypassing GitHub.
3. **Restart**: It restarts the PM2 processes (`enrichment-api` and `enrichment-worker`) on the server automatically.

**CRITICAL RULE:** Never try to deploy the frontend or backend separately. Always use `./deploy-all.sh` to guarantee both Cloudflare and Google Cloud are perfectly synced in a single step!
