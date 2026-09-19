#!/bin/bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "-> Building JentoAI calling SaaS frontend..."
cd "$ROOT/apps/calling-saas"

npm run build

echo "-> Deploying to Cloudflare Pages project: jentocalling"
npx wrangler pages deploy dist \
  --project-name jentocalling \
  --branch main

echo ""
echo "Calling SaaS deployed."
echo "Expected custom domain: https://voicecalling.space"
