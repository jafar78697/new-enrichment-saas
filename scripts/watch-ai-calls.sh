#!/usr/bin/env bash
set -euo pipefail

SERVER_IP="${SERVER_IP:-13.61.8.100}"
SSH_KEY="${SSH_KEY:-$HOME/Downloads/aws-enrichment-key.pem}"
REMOTE_USER="${REMOTE_USER:-ubuntu}"

echo "=============================================="
echo " Jento AI Calling Live Watch"
echo " Server: ${REMOTE_USER}@${SERVER_IP}"
echo " Time:   $(date)"
echo "=============================================="
echo
echo "Ye watch 4 cheezen dikhay gi:"
echo "1) PM2 process status"
echo "2) API /health"
echo "3) Active calls endpoint"
echo "4) API aur outbound caller ke recent logs"
echo

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "${REMOTE_USER}@${SERVER_IP}" '
set -e
cd /home/ubuntu/enrichment-saas
echo "===== PM2 STATUS ====="
pm2 status
echo
echo "===== API HEALTH ====="
curl -sS http://127.0.0.1:3000/health
echo
echo
echo "===== ACTIVE CALLS ====="
curl -sS http://127.0.0.1:3000/v1/leads/active-calls || true
echo
echo
echo "===== AI CALLING STATUS ====="
curl -sS http://127.0.0.1:3000/v1/leads/ai-calling/status || true
echo
echo
echo "===== LIVE LOGS (Ctrl+C to stop) ====="
tail -n 80 -F \
  ~/.pm2/logs/enrichment-api-out.log \
  ~/.pm2/logs/enrichment-api-error.log \
  ~/.pm2/logs/ai-outbound-caller-out.log \
  ~/.pm2/logs/ai-outbound-caller-error.log
'
