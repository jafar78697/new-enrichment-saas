#!/bin/bash
# Script to start a Cloudflare Tunnel for the Enrichment SaaS Backend

echo "Starting Cloudflare Tunnel for Enrichment SaaS Backend..."
echo "This will securely route internet traffic to your local backend API running on port 3000."
echo "Ensure you have authenticated cloudflared via 'cloudflared tunnel login' first."

# We are mapping the backend to api.jentoai.pro, or whatever hostname is specified
HOSTNAME="api.jentoai.pro"
LOCAL_URL="http://localhost:3000"

echo "Routing $HOSTNAME -> $LOCAL_URL"

# The command to start a quick tunnel or a managed tunnel.
# If they have a managed tunnel, they would run: cloudflared tunnel run <tunnel_name>
# Below is a quick command for a managed tunnel ingress rule (requires a properly configured config.yml)
# OR running a quick temporary tunnel.

cloudflared tunnel --url $LOCAL_URL --hostname $HOSTNAME
