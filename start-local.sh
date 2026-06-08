#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Local Development Starter — runs everything without Docker
# Requirements: Node.js 18+, PostgreSQL, (optional) Redis
# ─────────────────────────────────────────────────────────────

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Enrichment SaaS — Local Dev Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Check PostgreSQL
if ! command -v psql &>/dev/null; then
  echo "❌ PostgreSQL not found. Install: sudo apt install postgresql"
  exit 1
fi

# 2. Create database if not exists
echo "→ Setting up database..."
psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='enrichment_saas'" | grep -q 1 || \
  psql -U postgres -c "CREATE DATABASE enrichment_saas"

# 3. Run migrations
echo "→ Running migrations..."
for f in "$ROOT/apps/api/src/db/migrations/"*.sql; do
  echo "  Applying: $(basename $f)"
  psql -U postgres -d enrichment_saas -f "$f" --quiet
done

echo "✓ Database ready"

# 4. Install API dependencies
echo "→ Installing API dependencies..."
cd "$ROOT/apps/api"
npm install --silent

# 5. Install Web dependencies
echo "→ Installing Web dependencies..."
cd "$ROOT/apps/web"
npm install --silent

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ Setup complete! Now run in 2 terminals:"
echo ""
echo "  Terminal 1 (Backend):"
echo "  cd .kiro/specs/enrichment-saas-aws/apps/api"
echo "  npm run dev"
echo ""
echo "  Terminal 2 (Frontend):"
echo "  cd .kiro/specs/enrichment-saas-aws/apps/web"
echo "  npm run dev"
echo ""
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:3000"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
