#!/bin/bash
# ═══════════════════════════════════════════════════════
#  Deploy Enrichment SaaS API to AWS EC2
#  Run this from your laptop:
#  bash deploy-to-ec2.sh
# ═══════════════════════════════════════════════════════

EC2_IP="34.26.233.14"
EC2_USER="ubuntu"
PEM_KEY="$HOME/Downloads/enrichment-key.pem"
REPO="https://github.com/jafar78697/new-enrichment-saas.git"
APP_DIR="/home/ubuntu/enrichment-saas"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Deploying to EC2: $EC2_IP"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Copy .env.production to EC2
echo "→ Copying environment file..."
scp -i "$PEM_KEY" \
  ".kiro/specs/enrichment-saas-aws/apps/api/.env.production" \
  "$EC2_USER@$EC2_IP:/tmp/api.env"

# Run setup on EC2
ssh -i "$PEM_KEY" "$EC2_USER@$EC2_IP" << 'ENDSSH'
set -e

echo "→ Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "→ Installing pnpm and pm2..."
sudo npm install -g pnpm pm2

echo "→ Cloning/updating repo..."
if [ -d "/home/ubuntu/enrichment-saas" ]; then
  cd /home/ubuntu/enrichment-saas
  git pull origin main
else
  git clone https://github.com/jafar78697/new-enrichment-saas.git /home/ubuntu/enrichment-saas
  cd /home/ubuntu/enrichment-saas
fi

echo "→ Setting up environment..."
cp /tmp/api.env apps/api/.env

echo "→ Installing dependencies..."
CI=true pnpm install --no-frozen-lockfile

echo "→ Starting API with PM2..."
cd apps/api
pm2 delete enrichment-api 2>/dev/null || true
pm2 start "npx tsx src/index.ts" \
  --name enrichment-api \
  --env production \
  --restart-delay 3000 \
  --max-restarts 10
pm2 save
pm2 startup | tail -1 | sudo bash

echo "→ Installing and configuring Nginx..."
sudo apt-get install -y nginx

sudo tee /etc/nginx/sites-available/enrichment-api > /dev/null << 'NGINX'
server {
    listen 80;
    server_name api.jentoai.pro;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/enrichment-api /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx
sudo systemctl enable nginx

echo ""
echo "✓ API deployed successfully!"
echo "  Running at: http://api.jentoai.pro"
echo "  PM2 status: pm2 status"
echo "  Logs: pm2 logs enrichment-api"
ENDSSH

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ EC2 deployment complete!"
echo ""
echo "Next steps:"
echo "1. Cloudflare DNS mein add karo:"
echo "   Type: A | Name: api | IP: 54.91.39.13 | Proxy: ON"
echo ""
echo "2. Frontend build karo:"
echo "   cd .kiro/specs/enrichment-saas-aws/apps/web"
echo "   npm run build"
echo "   npx wrangler pages deploy dist --project-name enrichment-web"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
