#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Docker Starter — ek command mein poora stack
# Requirements: Docker + Docker Compose
# ─────────────────────────────────────────────────────────────

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Starting with Docker Compose..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$ROOT"

# Start only postgres + api + web (skip localstack for simplicity)
docker compose up postgres api web --build -d

echo ""
echo "✓ Stack is starting..."
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:3000/health"
echo ""
echo "Logs: docker compose logs -f api"
echo "Stop: docker compose down"
