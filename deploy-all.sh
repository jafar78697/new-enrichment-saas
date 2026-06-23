#!/bin/bash
set -e

echo "======================================================"
echo " 🚀 1-Click Universal Deploy: JentoAI"
echo "======================================================"

# 1. Frontends (GitHub + Cloudflare Pages Direct Upload)
echo ""
echo "📦 [1/2] Pushing code to GitHub and Deploying Frontends to Cloudflare Pages..."
git add .
git commit -m "Auto-deploy: Update from 1-Click Script" || echo "No new changes to commit"
git push origin main

cd apps/web
pnpm build
npx wrangler pages deploy dist --project-name enrichment-web
cd ../../

API_URL="${API_URL:-https://api.jentoai.pro}" bash deploy-voice-frontend.sh

# 2. Backend (rsync -> AWS EC2)
echo ""
echo "⚙️ [2/2] Deploying Backend to AWS EC2 via rsync..."
bash deploy-to-gcp.sh

echo ""
echo "✅ All Done! Frontends are deployed to Cloudflare via Wrangler and Backend is live on AWS EC2."
echo "======================================================"
