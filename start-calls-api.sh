#!/bin/bash
# Start the merged JentoAI backend (enrichment + calls module) on port 3000.
# The existing cloudflared tunnel exposes this as https://calls.jentoai.com.
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/apps/api"

# If something is already listening on :3000, stop it first.
OLD_PID="$(ss -ltnp 2>/dev/null | grep ':3000 ' | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -n1)"
if [ -n "$OLD_PID" ]; then
  echo "→ Stopping existing process on :3000 (pid=$OLD_PID)"
  kill "$OLD_PID" 2>/dev/null || true
  sleep 2
fi

mkdir -p storage
nohup npx tsx src/index.ts > api.log 2>&1 &
echo $! > api.pid
sleep 4

if curl -fs http://localhost:3000/api/calls-health > /dev/null; then
  echo "✓ Backend live on :3000 (pid=$(cat api.pid))"
  echo "  Tunnel:  https://calls.jentoai.com"
  echo "  Log:     $ROOT/apps/api/api.log"
else
  echo "✗ Backend failed to come up — check $ROOT/apps/api/api.log"
  exit 1
fi
