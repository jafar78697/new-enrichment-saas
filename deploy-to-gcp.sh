#!/bin/bash
# ═══════════════════════════════════════════════════════
#  Deploy Enrichment SaaS API to AWS EC2 via Rsync
#  (Bypasses GitHub completely for instant, private updates)
# ═══════════════════════════════════════════════════════
set -e

EC2_IP="13.61.8.100"
EC2_USER="ubuntu"
PEM_KEY="$HOME/Downloads/aws-enrichment-key.pem"
APP_DIR="/home/ubuntu/enrichment-saas"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Deploying to EC2: $EC2_IP via rsync"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Ensure target directory exists
ssh -i "$PEM_KEY" -o StrictHostKeyChecking=no "$EC2_USER@$EC2_IP" "mkdir -p $APP_DIR"
echo "→ Building frontend locally before syncing..."
cd apps/web
pnpm run build
cd ../..

cd apps/voice-web
pnpm run build
cd ../..

echo "→ Syncing local files directly to server (skipping node_modules, .git, etc.)..."
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.next' \
  --exclude '.venv' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude '*.sqlite' \
  --exclude '*.sqlite-shm' \
  --exclude '*.sqlite-wal' \
  --exclude '*.pem' \
  --exclude 'infra' \
  -e "ssh -i \"$PEM_KEY\" -o StrictHostKeyChecking=no" \
  ./ "$EC2_USER@$EC2_IP:$APP_DIR/"

echo "→ Copying production .env specifically..."
scp -i "$PEM_KEY" -o StrictHostKeyChecking=no \
  "apps/api/.env.production" \
  "$EC2_USER@$EC2_IP:$APP_DIR/apps/api/.env"

echo "→ Running remote setup and restarting API..."
ssh -i "$PEM_KEY" -o StrictHostKeyChecking=no "$EC2_USER@$EC2_IP" << 'ENDSSH'
set -e

cd /home/ubuntu/enrichment-saas

  cat >> ~/enrichment-saas/apps/api/.env << 'EOF'
PUBLIC_BASE_URL="https://api.jentoai.pro"
EOF

echo "→ Installing dependencies..."
CI=true pnpm install --no-frozen-lockfile

echo "→ Setting up Python Worker..."
sudo apt-get update && sudo apt-get install -y python3-pip python3-venv libpq-dev python3-dev gcc libxml2-dev libxslt1-dev chromium-browser
cd /home/ubuntu/enrichment-saas/apps/worker-http
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
export PYO3_USE_ABI3_FORWARD_COMPATIBILITY=1
.venv/bin/pip install -r requirements.txt

echo "→ Restarting API and Worker with PM2..."
cd /home/ubuntu/enrichment-saas/apps/api
pm2 delete enrichment-api 2>/dev/null || true
pm2 start "npx tsx src/index.ts" \
  --name enrichment-api \
  --env production \
  --restart-delay 3000 \
  --max-restarts 10

pm2 delete browser-enrichment 2>/dev/null || true
pm2 start "node src/calls-module/scripts/browser-enrichment.js" \
  --name browser-enrichment \
  --env production \
  --restart-delay 5000 \
  --max-restarts 10

cd /home/ubuntu/enrichment-saas/apps/worker-http
pm2 delete enrichment-worker 2>/dev/null || true
pm2 start main.py \
  --interpreter .venv/bin/python \
  --name enrichment-worker \
  -i 3 \
  --env production \
  --restart-delay 3000 \
  --max-restarts 10

pm2 save

echo ""
echo "✓ Backend and Worker deployed successfully!"
echo "  PM2 status: pm2 status"
ENDSSH
