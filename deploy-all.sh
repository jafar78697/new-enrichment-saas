#!/bin/bash
set -e

echo "======================================================"
echo " 🚀 1-Click Universal Deploy: JentoAI"
echo "======================================================"

# 1. Frontend (GitHub + Cloudflare Pages Direct Upload)
echo ""
echo "📦 [1/2] Pushing code to GitHub and Deploying Frontend to Cloudflare Pages..."
git add .
git commit -m "Auto-deploy: Update from 1-Click Script" || echo "No new changes to commit"
git push origin main

cd apps/web
pnpm build
npx wrangler pages deploy dist --project-name enrichment-web
cd ../../

# 2. Backend (rsync -> Google Cloud)
echo ""
echo "⚙️ [2/2] Deploying Backend to Google Cloud Services via rsync..."
bash deploy-to-gcp.sh

echo ""
echo "✅ All Done! Frontend is deployed to Cloudflare via Wrangler and Backend is live on Google Cloud."
echo "======================================================"
