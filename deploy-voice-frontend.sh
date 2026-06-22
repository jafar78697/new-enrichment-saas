#!/bin/bash
# ═══════════════════════════════════════════════════════
#  Deploy Voice AI Dashboard to Cloudflare Pages
#  Domain: voice.jentoai.pro
# ═══════════════════════════════════════════════════════
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

API_URL="${API_URL:-https://api.jentoai.pro}"

echo "→ Building Voice Agent Dashboard..."
echo "  API:  $API_URL"
echo "  Site: voice.jentoai.pro"

cd "$ROOT/apps/voice-web"

# Write production env
cat > .env.production <<EOF
VITE_API_URL=$API_URL
VITE_WS_URL=$(echo "$API_URL" | sed 's/^http/wss/')
VITE_APP_NAME=Jento AI Voice Platform
EOF

# Install and build
pnpm install --silent
pnpm run build

echo ""
echo "→ Deploying to Cloudflare Pages..."
npx wrangler pages deploy dist \
  --project-name voice-agent-web \
  --branch main

echo ""
echo "✓ Voice Dashboard deployed!"
echo "  Add custom domain in Cloudflare Pages dashboard:"
echo "  Pages → voice-agent-web → Custom domains → voice.jentoai.pro"
echo ""
echo "  After DNS is configured, the dashboard will be at:"
echo "  https://voice.jentoai.pro"
