# 🔍 ACTUAL PROBLEM DIAGNOSIS

## 📋 **Aapka System Kya Hai:**

```
GOOGLE MAPS SCRAPER (Local Machine)
         ↓
   Scrapes leads (name, phone, website)
         ↓
   Calls ENRICHMENT API
   POST https://api.jentoai.pro/v1/public/enrich
         ↓
ENRICHMENT API (AWS EC2 Virtual Machine)
   - Runs on Amazon Virtual Machine
   - Has PostgreSQL database
   - Enriches leads (finds emails, socials, etc.)
         ↓
   Calls CRM API
   POST https://api.jentoai.pro/api/scraper-bridge/push-leads
         ↓
CRM DATABASE (PostgreSQL on EC2)
   - Stores enriched leads
   - Assigns to niches
   - Assigns to employees
         ↓
FRONTEND APP (Cloudflare Pages)
   https://app.jentoai.pro
   - Employees login
   - View their assigned leads
   - Call leads via Twilio
```

---

## ❌ **CURRENT PROBLEM:**

### **Issue 1: EC2 VM API Not Running**

```bash
curl -I https://api.jentoai.pro/
# Returns: HTTP/2 404
```

**Meaning:**
- ✅ Cloudflare DNS is working (points to EC2)
- ❌ NO backend API running on EC2
- ❌ EC2 Virtual Machine is either:
  - Stopped/Terminated
  - API process crashed
  - Port not open
  - Nginx/Proxy not configured

---

### **Issue 2: Frontend Can't Connect**

```
http://localhost:5173
Shows: "Failed to fetch"
```

**Why:**
- Frontend tries to call: `https://api.jentoai.pro/api/*`
- API returns 404
- Frontend shows error

---

### **Issue 3: Scraper Can't Send Leads**

```
Scraper calls: https://api.jentoai.pro/v1/public/enrich
Result: 404 Not Found
Leads: NOT ENRICHED
```

---

## 🔧 **SOLUTION - Check EC2 VM:**

### **Step 1: Login to AWS Console**

```
1. Go to: https://aws.amazon.com/console/
2. Login to your AWS account
3. Go to EC2 Dashboard
4. Find your enrichment API instance
```

### **Step 2: Check Instance Status**

```
Look for:
- Instance State: Running ✅ or Stopped ❌
- Status Checks: 2/2 checks passed ✅
- Public IP: xxx.xxx.xxx.xxx
```

### **Step 3: SSH into EC2**

```bash
# From your local machine
ssh -i /path/to/your-key.pem ubuntu@YOUR_EC2_IP

# OR if using Elastic IP
ssh -i /path/to/your-key.pem ubuntu@api.jentoai.pro
```

### **Step 4: Check if API is Running**

```bash
# On EC2 server:

# Check Node.js processes
ps aux | grep node

# Check if API is listening
sudo lsof -i :3000
# OR
sudo netstat -tlnp | grep 3000

# Check PM2 (if using process manager)
pm2 status
pm2 logs

# Check Docker (if using Docker)
docker ps
docker logs <container-name>
```

### **Step 5: Restart API if Needed**

```bash
# If using PM2:
pm2 restart all

# If using systemd service:
sudo systemctl restart jentoai-api
sudo systemctl status jentoai-api

# If using Docker:
docker-compose restart
# OR
docker-compose up -d

# If manual start:
cd /path/to/enrichment-saas-aws/apps/api
npm run start
```

### **Step 6: Test API**

```bash
# On EC2:
curl http://localhost:3000/health

# Should return:
{"status":"ok","timestamp":"..."}
```

### **Step 7: Check Public Access**

```bash
# From your LOCAL machine:
curl https://api.jentoai.pro/health

# Should return:
{"status":"ok"}
```

---

## 📊 **What Should Be Running on EC2:**

### **Option A: Docker Setup**

```yaml
# docker-compose.yml should exist:
services:
  api:
    image: enrichment-api:latest
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://...
      - JWT_SECRET=...
      - PUBLIC_ENRICH_API_KEY=...
  
  postgres:
    image: postgres:15
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_DB=enrichment_saas
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=...
  
  redis:
    image: redis:7
    ports:
      - "6379:6379"
```

### **Option B: Direct Node.js**

```bash
# Process should be running:
node apps/api/dist/index.js
# OR
npm run start --prefix apps/api
```

### **Option C: PM2 Process Manager**

```bash
# PM2 ecosystem file:
pm2 start ecosystem.config.js

# Should show:
┌────┬────────────────────┬──────────┬──────┬───────────┬──────────┬──────────┐
│ id │ name               │ mode     │ ↺    │ status    │ cpu      │ memory   │
├────┼────────────────────┼──────────┼──────┼───────────┼──────────┼──────────┤
│ 0  │ enrichment-api     │ fork     │ 0    │ online    │ 0%       │ 150mb    │
│ 1  │ postgres           │ fork     │ 0    │ online    │ 0%       │ 50mb     │
└────┴────────────────────┴──────────┴──────┴───────────┴──────────┴──────────┘
```

---

## 🔍 **Debugging Checklist:**

### **On EC2 Server:**

- [ ] **Instance is running** (AWS Console → EC2 → Status)
- [ ] **SSH accessible** (can you login?)
- [ ] **PostgreSQL running** (`sudo systemctl status postgresql`)
- [ ] **Redis running** (if needed) (`sudo systemctl status redis`)
- [ ] **API process running** (`ps aux | grep node`)
- [ ] **API listening on port** (`sudo lsof -i :3000`)
- [ ] **Local health check works** (`curl http://localhost:3000/health`)
- [ ] **Firewall allows port 3000** (`sudo ufw status`)
- [ ] **Nginx proxy configured** (if using reverse proxy)

### **Cloudflare Configuration:**

- [ ] **DNS record exists** (api.jentoai.pro → EC2 IP)
- [ ] **SSL enabled** (Full or Full Strict mode)
- [ ] **Proxy status** (Proxied or DNS Only?)
- [ ] **Page rules** (no blocking rules?)

---

## 🎯 **Quick Fix Commands:**

### **If EC2 is STOPPED:**

```
1. AWS Console → EC2 → Instances
2. Select your instance
3. Actions → Instance State → Start
4. Wait 2-3 minutes
5. Test: curl https://api.jentoai.pro/health
```

### **If API Process CRASHED:**

```bash
ssh into EC2

# Restart API
pm2 restart all
# OR
sudo systemctl restart jentoai-api
# OR
cd /path/to/api && npm run start

# Check logs
pm2 logs
# OR
journalctl -u jentoai-api -f
```

### **If PostgreSQL DOWN:**

```bash
# Restart PostgreSQL
sudo systemctl restart postgresql
sudo systemctl status postgresql

# Check if DB exists
sudo -u postgres psql -l | grep enrichment_saas

# Check tables
sudo -u postgres psql -d enrichment_saas -c "\dt"
```

---

## 📞 **What You Need to Do:**

### **IMMEDIATE ACTIONS:**

1. **Check AWS Console**
   - Is EC2 instance running?
   - Check status checks

2. **SSH to EC2**
   - Can you login?
   - What processes are running?

3. **Check API Logs**
   - `pm2 logs` or `journalctl`
   - Look for errors

4. **Restart Services**
   - PostgreSQL
   - API server
   - Nginx (if using)

5. **Test**
   ```bash
   curl https://api.jentoai.pro/health
   curl https://api.jentoai.pro/v1/public/enrich \
     -X POST \
     -H "x-api-key: jento-internal-enrich-key-2024" \
     -d '{"domain":"google.com","wait":false}'
   ```

---

## 💡 **Alternative - Use Local for Now:**

If EC2 is not accessible, you can run enrichment LOCALLY for testing:

```bash
# Install PostgreSQL locally
sudo apt install postgresql
sudo systemctl start postgresql

# Create database
sudo -u postgres psql -c "CREATE DATABASE enrichment_saas;"

# Run API locally
cd /home/jafar-tayyar-siddiqi/Downloads/email\ app/.kiro/specs/enrichment-saas-aws/apps/api
npm run dev

# Test
curl http://localhost:3000/health
```

Then update scraper to use:
```bash
export ENRICHMENT_API_URL=http://localhost:3000
```

---

## ✅ **Summary:**

**Root Cause:** EC2 Virtual Machine API is NOT RUNNING

**Solution:**
1. Login to AWS Console
2. Check EC2 instance status
3. SSH into EC2
4. Start/restart API service
5. Test endpoints

**Until EC2 is fixed:**
- Frontend will show "Failed to fetch"
- Scraper can't enrich leads
- Employees can't access app

---

**EC2 VM MUST BE RUNNING for the system to work!** 🚀
