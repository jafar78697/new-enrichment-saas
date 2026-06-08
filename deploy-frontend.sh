#!/bin/bash
# Deploy Frontend to Cloudflare Pages
ROOT="$(cd "$(dirname "$0")" && pwd)"

# The calls backend now lives merged inside api.jentoai.pro (EC2 54.91.39.13)
# at /api/* paths. Override only if you split it out into a different host.
CALLS_URL="${CALLS_URL:-https://api.jentoai.pro}"

echo "→ Building frontend..."
echo "  API:     https://api.jentoai.pro"
echo "  MAILER:  https://mailer.jentoai.com"
echo "  CALLS:   $CALLS_URL"
cd "$ROOT/apps/web"

# Write production env for all three backends. Keep in sync with DEPLOYMENT.md.
cat > .env.production <<EOF
VITE_API_URL=https://api.jentoai.pro
VITE_MAILER_URL=https://mailer.jentoai.com
VITE_CALLS_URL=$CALLS_URL
VITE_MOCK=false
EOF

npm run build

echo "→ Deploying to Cloudflare Pages..."
npx wrangler pages deploy dist \
  --project-name enrichment-web \
  --branch main

echo ""
echo "✓ Frontend deployed!"
echo "  Add custom domain in Cloudflare Pages:"
echo "  Pages → enrichment-web → Custom domains → app.jentoai.pro"
