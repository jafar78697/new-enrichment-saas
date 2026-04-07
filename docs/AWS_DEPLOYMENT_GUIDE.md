# Enrichment SaaS — Complete Deployment Guide
## (Free Stack: Cloudflare + Railway + Supabase + Upstash)

---

## Current Status — Kya Ho Chuka Hai

| Step | Status |
|------|--------|
| AWS CLI install | ✅ Done (v2.34.25) |
| IAM User banaya | ✅ Done (enrichment-saas-deploy) |
| Terraform install | ✅ Done (v1.14.8) |
| S3 state bucket | ✅ Done (enrichment-saas-terraform-state-jafar) |
| Terraform init | ✅ Done |
| Terraform plan | ✅ Done (no errors) |
| Terraform apply | ⏸ PAUSED — cost issue |

---

## Naya Plan — 100% FREE Stack

AWS full stack ~$50-80/month tha. Yeh affordable nahi. Is liye hum yeh stack use karenge:

| Service | Provider | Cost |
|---------|----------|------|
| Frontend | Cloudflare Pages | FREE |
| API (Node.js) | Cloudflare Workers | FREE (100k req/day) |
| Database | Supabase (PostgreSQL) | FREE (500MB) |
| Cache | Upstash Redis | FREE (10k req/day) |
| Message Queues | AWS SQS | FREE (1M msg/month) |
| HTTP Worker (Python) | Render.com | FREE |
| Browser Worker | Render.com | FREE (baad mein) |

**Total: $0/month** — bilkul free

---

## PHASE 1: GitHub Par Code Upload Karo

Yeh sabse pehla step hai — sab kuch GitHub par hona chahiye.

### Step 1.1 — GitHub Account Banao (agar nahi hai)

1. `https://github.com` par jao
2. "Sign up" click karo
3. Free account banao

### Step 1.2 — New Repository Banao

1. GitHub par login karo
2. Top right `+` button → "New repository"
3. Name: `enrichment-saas`
4. Private select karo
5. "Create repository" click karo

### Step 1.3 — Code Upload Karo

```bash
cd "/home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas-aws"

# .gitignore banao
cat > .gitignore << 'EOF'
node_modules/
.terraform/
*.tfvars
.env
.env.local
__pycache__/
*.pyc
.venv/
dist/
build/
.pytest_cache/
EOF

git init
git add .
git commit -m "Initial commit: Enrichment SaaS"
git branch -M main
git remote add origin https://github.com/[aapka-username]/enrichment-saas.git
git push -u origin main
```

---

## PHASE 2: Supabase Setup (Free PostgreSQL)

### Step 2.1 — Supabase Account Banao

1. `https://supabase.com` par jao
2. "Start your project" click karo
3. GitHub se login karo
4. "New project" click karo
5. Name: `enrichment-saas`
6. Database password set karo (save kar lo)
7. Region: `us-east-1` select karo
8. "Create new project" click karo — 2 minute wait karo

### Step 2.2 — Database URL Copy Karo

1. Project dashboard mein "Settings" → "Database"
2. "Connection string" section mein "URI" copy karo
3. Format: `postgresql://postgres:[password]@[host]:5432/postgres`
4. Yeh URL save kar lo — baad mein kaam aayega

### Step 2.3 — Database Migrations Run Karo

```bash
cd "/home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas-aws/packages/db"

# Dependencies install karo
npm install

# Database URL set karo (Supabase wala)
export DATABASE_URL="postgresql://postgres:[password]@[supabase-host]:5432/postgres"

# Migrations run karo
npm run migrate
```

Agar `npm run migrate` command nahi hai to:
```bash
# node-pg-migrate directly use karo
npx node-pg-migrate up --database-url "$DATABASE_URL" --migrations-dir src/migrations
```

### Step 2.4 — Tables Verify Karo

Supabase dashboard mein:
1. "Table Editor" click karo
2. Yeh tables dikhni chahiye: `tenants`, `users`, `enrichment_jobs`, `enrichment_results`, etc.

---

## PHASE 3: Upstash Redis Setup (Free Cache)

### Step 3.1 — Upstash Account Banao

1. `https://upstash.com` par jao
2. "Start for free" click karo
3. GitHub se login karo

### Step 3.2 — Redis Database Banao

1. "Create database" click karo
2. Name: `enrichment-saas-redis`
3. Type: Regional
4. Region: `us-east-1`
5. "Create" click karo

### Step 3.3 — Connection Details Copy Karo

Dashboard mein:
- `UPSTASH_REDIS_REST_URL` copy karo
- `UPSTASH_REDIS_REST_TOKEN` copy karo

Ya Redis URL format: `redis://default:[password]@[host]:[port]`

---

## PHASE 4: Cloudflare Setup (Free Frontend + API)

### Step 4.1 — Cloudflare Account Banao

1. `https://cloudflare.com` par jao
2. "Sign up" click karo
3. Free plan select karo

### Step 4.2 — Wrangler CLI Install Karo

```bash
npm install -g wrangler

# Login karo
wrangler login
```

Browser mein Cloudflare login page khulega — authorize karo.

### Step 4.3 — Frontend Deploy (Cloudflare Pages)

```bash
cd "/home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas-aws/apps/web"

# Dependencies install karo
npm install

# Production build banao
VITE_MOCK=false npm run build

# Cloudflare Pages par deploy karo
wrangler pages deploy dist --project-name enrichment-saas
```

Pehli baar poochega project name — `enrichment-saas` type karo.

Deploy hone ke baad URL milega: `https://enrichment-saas.pages.dev`

### Step 4.4 — API Worker Deploy (Cloudflare Workers)

Pehle `wrangler.toml` file banao:

```bash
cd "/home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas-aws/apps/api"
```

```toml
# wrangler.toml
name = "enrichment-saas-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[vars]
NODE_ENV = "production"

[[queues.producers]]
queue = "enrichment-http-queue"
binding = "HTTP_QUEUE"

[[queues.consumers]]
queue = "enrichment-http-queue"
max_batch_size = 10
```

```bash
# Deploy karo
wrangler deploy
```

API URL milega: `https://enrichment-saas-api.[account].workers.dev`

### Step 4.5 — Environment Variables Set Karo

```bash
# Database URL
wrangler secret put DATABASE_URL
# Paste karo: postgresql://postgres:[password]@[supabase-host]:5432/postgres

# Redis URL
wrangler secret put REDIS_URL
# Paste karo: redis://default:[password]@[upstash-host]:[port]

# JWT Secret
wrangler secret put JWT_PRIVATE_KEY
# Paste karo: koi bhi strong random string

wrangler secret put JWT_PUBLIC_KEY
# Same string (symmetric ke liye)

# Stripe (baad mein)
wrangler secret put STRIPE_SECRET_KEY
# Paste karo: sk_test_... ya sk_live_...
```

### Step 4.6 — Cloudflare Queues Banao

```bash
# HTTP enrichment queue
wrangler queues create enrichment-http-queue

# Browser enrichment queue
wrangler queues create enrichment-browser-queue

# Webhook queue
wrangler queues create enrichment-webhook-queue

# Export queue
wrangler queues create enrichment-export-queue
```

---

## PHASE 5: Render.com Setup (FREE Python Workers)

Render.com free tier mein Python background workers chalte hain. Koi credit card nahi chahiye.

### Step 5.1 — Render Account Banao

1. `https://render.com` par jao
2. "Get Started for Free" click karo
3. GitHub se login karo (GitHub account se connect karo)

### Step 5.2 — HTTP Worker Deploy Karo

1. Render dashboard mein "New +" click karo
2. "Background Worker" select karo
3. GitHub repository connect karo: `enrichment-saas`
4. Settings:
   - **Name**: `enrichment-http-worker`
   - **Root Directory**: `apps/worker-http`
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python main.py`
   - **Plan**: Free

5. "Create Background Worker" click karo

### Step 5.3 — Environment Variables Set Karo (Render)

Worker deploy hone ke baad "Environment" tab mein yeh variables add karo:

```
DATABASE_URL = postgresql://postgres:[password]@[supabase-host]:5432/postgres
REDIS_URL = redis://default:[password]@[upstash-host]:[port]
AWS_ACCESS_KEY_ID = AKIATMZTADJX7XXR5XPP
AWS_SECRET_ACCESS_KEY = [aapka secret key]
AWS_REGION = us-east-1
SQS_HTTP_QUEUE_URL = https://sqs.us-east-1.amazonaws.com/233645808239/enrichment-saas-production-http-queue
SQS_BROWSER_QUEUE_URL = https://sqs.us-east-1.amazonaws.com/233645808239/enrichment-saas-production-browser-queue
```

**Note:** AWS SQS queues already exist karte hain aapke account mein (Terraform plan se ready hain). Sirf `terraform apply` karo SQS ke liye — yeh free hai (1M messages/month free).

### Step 5.4 — Sirf SQS Deploy Karo (AWS Free Tier)

Agar sirf SQS queues chahiye (baki AWS nahi), to yeh karo:

```bash
cd "/home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas-aws/infra/terraform"
```

Ek alag minimal terraform file banao sirf queues ke liye:

```bash
cat > sqs_only.tf << 'EOF'
resource "aws_sqs_queue" "http_queue_free" {
  name = "enrichment-http-queue"
  visibility_timeout_seconds = 60
}

resource "aws_sqs_queue" "browser_queue_free" {
  name = "enrichment-browser-queue"
  visibility_timeout_seconds = 120
}

resource "aws_sqs_queue" "webhook_queue_free" {
  name = "enrichment-webhook-queue"
  visibility_timeout_seconds = 30
}

output "http_queue_url" { value = aws_sqs_queue.http_queue_free.url }
output "browser_queue_url" { value = aws_sqs_queue.browser_queue_free.url }
EOF
```

```bash
terraform apply -target=aws_sqs_queue.http_queue_free \
               -target=aws_sqs_queue.browser_queue_free \
               -target=aws_sqs_queue.webhook_queue_free
```

SQS queues free hain — 1 million messages per month free tier mein.

---

## PHASE 6: Frontend Ko API Se Connect Karo

### Step 6.1 — Frontend Environment Update Karo

```bash
cd "/home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas-aws/apps/web"

cat > .env.production << 'EOF'
VITE_MOCK=false
VITE_API_URL=https://enrichment-saas-api.[account].workers.dev
EOF
```

### Step 6.2 — Rebuild aur Redeploy

```bash
npm run build
wrangler pages deploy dist --project-name enrichment-saas
```

---

## PHASE 7: Test Karo

### Step 7.1 — API Health Check

```bash
curl https://enrichment-saas-api.[account].workers.dev/health
```

Response:
```json
{"status": "ok", "timestamp": "2026-..."}
```

### Step 7.2 — Signup Test

```bash
curl -X POST https://enrichment-saas-api.[account].workers.dev/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Jafar","email":"test@test.com","password":"Test123!","workspace_name":"My Workspace"}'
```

### Step 7.3 — Frontend Test

Browser mein kholo: `https://enrichment-saas.pages.dev`

Login page dikhni chahiye.

---

## Cost Summary

| Service | Free Limit | Paid |
|---------|-----------|------|
| Cloudflare Pages | Unlimited | Free |
| Cloudflare Workers | 100k req/day | Free |
| Cloudflare Queues | 1M msg/month | Free |
| Supabase | 500MB DB, 2GB bandwidth | Free |
| Upstash Redis | 10k req/day | Free |
| Railway (HTTP Worker) | $5 credit/month | ~$5/month |

**Total: $0-5/month** jab tak traffic kam ho.

---

## AWS Se Cloudflare Par Migration Notes

Hamara Terraform plan ready hai. Jab revenue aaye aur scale karna ho to:

```bash
# AWS infrastructure deploy karo
cd infra/terraform
terraform apply
```

Yeh sab ban jayega:
- VPC, RDS PostgreSQL, ElastiCache Redis
- ECS Fargate (API + Workers)
- SQS Queues, S3, CloudFront, ALB
- CloudWatch monitoring

**Migration path:** Cloudflare → AWS jab monthly revenue $200+ ho.

---

## Troubleshooting

### Wrangler login nahi ho raha
```bash
wrangler logout
wrangler login
```

### Supabase connection refused
- Supabase dashboard mein "Settings" → "Database" → "Connection pooling" enable karo
- Port 6543 use karo (pooler) instead of 5432

### Railway worker crash ho raha hai
```bash
# Logs dekho
railway logs
```

### Frontend blank page
```bash
# Cache clear karo
wrangler pages deployment list --project-name enrichment-saas
```

---

## Next Steps (Jab Customers Aayein)

1. Custom domain connect karo (Cloudflare DNS free hai)
2. Stripe live mode enable karo
3. Browser worker Railway par deploy karo
4. AWS par migrate karo (scale ke liye)
5. Monitoring setup karo (Sentry free tier)
