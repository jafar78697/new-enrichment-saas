#!/bin/bash
# ═══════════════════════════════════════════════════════
#  Deploy Enrichment SaaS API to AWS EC2 via Rsync
#  (Bypasses GitHub completely for instant, private updates)
# ═══════════════════════════════════════════════════════
set -e

GCP_IP="34.27.29.88"
GCP_USER="jafar-tayyar-siddiqi"
PEM_KEY="$HOME/.ssh/google_compute_engine"
APP_DIR="/home/jafar-tayyar-siddiqi/enrichment-saas"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Deploying to Google Cloud VM: $GCP_IP via rsync"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Ensure target directory exists
ssh -i "$PEM_KEY" -o StrictHostKeyChecking=no "$GCP_USER@$GCP_IP" "mkdir -p $APP_DIR"
echo "→ Building frontend locally before syncing..."
cd apps/web
pnpm run build
cd ../..

cd apps/voice-web
pnpm run build
cd ../..

cd apps/calling-saas
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
  ./ "$GCP_USER@$GCP_IP:$APP_DIR/"

echo "→ Copying production .env specifically..."
scp -i "$PEM_KEY" -o StrictHostKeyChecking=no \
  "apps/api/.env.production" \
  "$GCP_USER@$GCP_IP:$APP_DIR/apps/api/.env"

echo "→ Running remote setup and restarting API..."
ssh -i "$PEM_KEY" -o StrictHostKeyChecking=no "$GCP_USER@$GCP_IP" << 'ENDSSH'
set -e

cd /home/jafar-tayyar-siddiqi/enrichment-saas

  cat >> /home/jafar-tayyar-siddiqi/enrichment-saas/apps/api/.env << 'EOF'
PUBLIC_BASE_URL="https://api.jentoai.pro"
EOF

echo "→ Installing dependencies..."
CI=true pnpm install --no-frozen-lockfile --ignore-scripts
pnpm rebuild || true

echo "→ Applying SaaS billing/access migrations..."
cd /home/jafar-tayyar-siddiqi/enrichment-saas/apps/api
node << 'NODE'
const fs = require('fs');
const path = require('path');
const pg = require('pg');
require('dotenv').config({ path: '.env' });

const migrations = [
  '012_saas_and_phone_numbers.sql',
  '013_saas_tenant_schema.sql',
  '014_wallets_payments_metering.sql',
  '015_calls_module_tenant_isolation.sql',
  '016_calling_subscription_enforcement.sql',
  '017_contacts_follow_up.sql',
  '018_customer_team_access.sql',
  '019_global_lead_cache.sql',
  '020_demo_number_pool.sql',
  '021_agents_table.sql',
  '022_durable_demo_trials.sql',
  '023_call_recording_entitlement.sql',
  '024_customer_employee_access.sql',
  '025_employee_permissions.sql',
  '026_admin_bulk_provisioning.sql',
  '027_call_destination_cooldown.sql',
  '028_launch_readiness.sql'
];

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (const migration of migrations) {
      const file = path.resolve('src/db/migrations', migration);
      const sql = fs.readFileSync(file, 'utf8');
      console.log(`   applying ${migration}`);
      await pool.query(sql);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
NODE

echo "→ Setting up Python Worker..."
cd /home/jafar-tayyar-siddiqi/enrichment-saas/apps/worker-http
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
export PYO3_USE_ABI3_FORWARD_COMPATIBILITY=1
.venv/bin/pip install -r requirements.txt

echo "→ Restarting API and Worker with PM2..."
cd /home/jafar-tayyar-siddiqi/enrichment-saas/apps/api
pm2 delete enrichment-api 2>/dev/null || true
pm2 start "npx tsx src/index.ts" \
  --name enrichment-api \
  --env production \
  --restart-delay 3000 \
  --max-restarts 10

pm2 delete ai-outbound-caller 2>/dev/null || true
pm2 start "node src/workers/outbound-caller-runner.js" \
  --name ai-outbound-caller \
  --env production \
  --restart-delay 3000 \
  --max-restarts 20

pm2 delete browser-enrichment 2>/dev/null || true
pm2 start "node src/calls-module/scripts/browser-enrichment.js" \
  --name browser-enrichment \
  --env production \
  --restart-delay 5000 \
  --max-restarts 10

cd /home/jafar-tayyar-siddiqi/enrichment-saas/apps/worker-http
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
echo "✓ Backend and Worker deployed successfully on Google Cloud VM!"
echo "  PM2 status: pm2 status"
ENDSSH
