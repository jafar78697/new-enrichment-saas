#!/bin/bash
# Stop the merged JentoAI backend on port 3000.
ROOT="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$ROOT/apps/api/api.pid"
if [ -f "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE")"
  kill "$PID" 2>/dev/null && echo "✓ Stopped pid=$PID" || echo "→ pid=$PID was not running"
  rm -f "$PID_FILE"
else
  # Fallback: kill whatever listens on :3000
  PID="$(ss -ltnp 2>/dev/null | grep ':3000 ' | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -n1)"
  if [ -n "$PID" ]; then
    kill "$PID" && echo "✓ Stopped :3000 listener (pid=$PID)"
  else
    echo "→ No backend running on :3000"
  fi
fi
