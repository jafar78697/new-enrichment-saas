#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  Enrichment SaaS — Complete Setup & Run Script
#  Ek baar chalao, sab kuch ready ho jayega
# ═══════════════════════════════════════════════════════════
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Enrichment SaaS — Setup & Run          ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Step 1: Check Node.js ──────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "❌ Node.js not found!"
  echo "   Install: https://nodejs.org (v18+)"
  exit 1
fi
NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo "❌ Node.js v18+ required. Current: $(node -v)"
  exit 1
fi
echo "✓ Node.js $(node -v)"

# ── Step 2: Check PostgreSQL ───────────────────────────────
if ! command -v psql &>/dev/null; then
  echo ""
  echo "❌ PostgreSQL not found!"
  echo ""
  echo "   Install karo:"
  echo "   Ubuntu/Debian: sudo apt install postgresql postgresql-contrib"
  echo "   Mac:           brew install postgresql@16"
  echo ""
  echo "   Ya Docker use karo (agar Docker installed hai):"
  echo "   docker run -d --name pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16"
  echo ""
  exit 1
fi
echo "✓ PostgreSQL found"

# ── Step 3: Start PostgreSQL service if not running ────────
if ! pg_isready -q 2>/dev/null; then
  echo "→ Starting PostgreSQL..."
  sudo service postgresql start 2>/dev/null || true
  sleep 2
fi

# ── Step 4: Create database ────────────────────────────────
echo "→ Setting up database..."
# Try with postgres user
if psql -U postgres -c "SELECT 1" &>/dev/null 2>&1; then
  DB_USER="postgres"
elif psql -U "$USER" -c "SELECT 1" &>/dev/null 2>&1; then
  DB_USER="$USER"
  # Update .env with correct user
  sed -i "s|postgresql://postgres:postgres@|postgresql://$USER:@|g" "$ROOT/apps/api/.env"
else
  echo "⚠️  Could not connect to PostgreSQL."
  echo "   Make sure PostgreSQL is running and accessible."
  echo "   Try: sudo -u postgres psql"
  exit 1
fi

# Create DB if not exists
psql -U "$DB_USER" -tc "SELECT 1 FROM pg_database WHERE datname='enrichment_saas'" 2>/dev/null | grep -q 1 || \
  psql -U "$DB_USER" -c "CREATE DATABASE enrichment_saas" 2>/dev/null
echo "✓ Database 'enrichment_saas' ready"

# ── Step 5: Run migrations ─────────────────────────────────
echo "→ Running database migrations..."
for f in "$ROOT/apps/api/src/db/migrations/"*.sql; do
  [ -f "$f" ] || continue
  echo "  ↳ $(basename $f)"
  psql -U "$DB_USER" -d enrichment_saas -f "$f" --quiet 2>/dev/null || true
done
echo "✓ Migrations complete"

# ── Step 6: Install dependencies ──────────────────────────
echo "→ Installing dependencies..."
cd "$ROOT"
if command -v pnpm &>/dev/null; then
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
else
  echo "  pnpm not found, installing..."
  npm install -g pnpm
  pnpm install
fi
echo "✓ Dependencies installed"

# ── Step 7: Launch ─────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  ✓ Setup complete! Starting servers...   ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  Frontend → http://localhost:5173"
echo "  Backend  → http://localhost:3000"
echo "  Health   → http://localhost:3000/health"
echo ""
echo "  Press Ctrl+C to stop"
echo ""

# Start both in parallel
cd "$ROOT/apps/api" && npm run dev &
API_PID=$!

sleep 3  # wait for API to start

cd "$ROOT/apps/web" && npm run dev &
WEB_PID=$!

# Wait for both
wait $API_PID $WEB_PID
