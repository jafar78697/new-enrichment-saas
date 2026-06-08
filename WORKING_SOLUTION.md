# 🚀 WORKING SOLUTION - Local Development

## ✅ **What's Running Now:**

```
✅ API Server:     http://localhost:3001  (RUNNING)
✅ Frontend Dev:   http://localhost:5173  (RUNNING)
✅ Database:       SQLite (local file)
```

---

## 🌐 **Access the App:**

### **Open in Browser:**
```
http://localhost:5173
```

**NOT:** ~~https://app.jentoai.pro~~ (that's for production EC2)

---

## 🔐 **Login:**

### **First Time - Create Manager:**

Open browser console (F12) and run:

```javascript
fetch('http://localhost:3001/api/auth/bootstrap-manager', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Manager',
    email: 'manager@jentoai.pro',
    password: 'manager123'
  })
})
.then(r => r.json())
.then(data => {
  console.log('Manager created!', data);
  localStorage.setItem('call_token', data.token);
  localStorage.setItem('call_user', JSON.stringify(data.user));
  localStorage.setItem('enr_token', data.token);
  localStorage.setItem('call_agent_id', String(data.user.id));
  window.location.href = '/dashboard';
});
```

### **Or Use cURL:**

```bash
curl -X POST http://localhost:3001/api/auth/bootstrap-manager \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Manager",
    "email": "manager@jentoai.pro",
    "password": "manager123"
  }'
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "name": "Manager",
    "email": "manager@jentoai.pro",
    "role": "manager",
    "status": "active"
  }
}
```

---

### **Login Page:**

After creating manager:

```
Go to: http://localhost:5173/call-login

Email: manager@jentoai.pro
Password: manager123

✅ Should redirect to dashboard
```

---

## 📊 **Test Everything:**

### **1. Check API is Working:**

```bash
curl http://localhost:3001/health
# Should return: {"status":"ok","timestamp":"..."}
```

### **2. Check Login Works:**

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "manager@jentoai.pro",
    "password": "manager123"
  }'
```

### **3. Get Token:**

```bash
# Save the token from response
TOKEN="eyJhbGciOiJIUzI1NiIs..."
```

### **4. Check Twilio Numbers:**

```bash
curl http://localhost:3001/api/twilio/numbers/pool \
  -H "Authorization: Bearer $TOKEN"
```

### **5. Check Employees:**

```bash
curl http://localhost:3001/api/employees/summary?hours=24 \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🔄 **Run Scraper to Add Leads:**

```bash
cd /home/jafar-tayyar-siddiqi/Downloads/email\ app/jento-mailer/scraper

# Set to LOCAL API
export ENRICHMENT_API_URL=http://localhost:3001
export ENRICHMENT_API_KEY=jento-scraper-secret-key-123
export PUBLIC_ENRICH_API_KEY=change-me-public-key

# Create job
cat > test-job.json << 'EOF'
{
  "job_id": "test-001",
  "keyword": "Beauty Salons",
  "location": "New York",
  "crm_niche": "Beauty Salons"
}
EOF

# Run
export BOT_TRIGGER_FILE=test-job.json
npx playwright test tests/keyword-based-scraper.spec.js
```

---

## 📁 **Database Location:**

```
SQLite database is at:
/home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas-aws/apps/api/data.db
```

### **Check Database:**

```bash
sqlite3 "/home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas-aws/apps/api/data.db"

# See tables
.tables

# See agents
SELECT id, name, email, role FROM agents;

# See contacts (after scraper runs)
SELECT id, name, phone_number, niche_id FROM contacts;

# See niches
SELECT id, name, assigned_agent_id FROM niches;
```

---

## 🎯 **Quick Start Checklist:**

- [ ] **Dev server running:** http://localhost:5173 ✅
- [ ] **API running:** http://localhost:3001 ✅
- [ ] **Create manager:** Use bootstrap-manager endpoint
- [ ] **Login:** Use manager credentials
- [ ] **Test Twilio:** Go to /twilio-numbers page
- [ ] **Run scraper:** Execute scraper to add leads
- [ ] **Check leads:** Go to /leads page

---

## ⚠️ **Important Notes:**

### **Why NOT https://app.jentoai.pro?**

```
❌ app.jentoai.pro → Points to Cloudflare Pages (frontend only)
❌ api.jentoai.pro → Points to EC2 server (NOT running)
✅ localhost:5173  → Local dev server (RUNNING)
✅ localhost:3001  → Local API (RUNNING)
```

### **When to Use Production:**

```
Production requires:
1. EC2 server running API
2. PostgreSQL database
3. Domain DNS configured
4. SSL certificates

For NOW, use LOCAL development!
```

---

## 🔧 **If Something Breaks:**

### **API Not Responding:**

```bash
# Check if running
ps aux | grep "tsx.*src/index.ts" | grep -v grep

# If not running, start it:
cd "/home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas-aws/apps/api"
npm run dev
```

### **Frontend Not Loading:**

```bash
# Dev server should be running on port 5173
# If not, restart:
cd "/home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas-aws/apps/web"
npm run dev
```

### **Database Errors:**

```bash
# Check database exists
ls -lh "/home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas-aws/apps/api/data.db"

# If missing, run migrations
cd "/home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas-aws/apps/api"
npm run db:migrate
```

---

## 📊 **API Endpoints (Local):**

```
Base URL: http://localhost:3001/api

Authentication:
POST /api/auth/bootstrap-manager  - Create first manager
POST /api/auth/login              - Login
GET  /api/auth/me                 - Get current user

Employees (Manager only):
GET  /api/employees               - List all employees
POST /api/employees               - Create employee
GET  /api/employees/summary       - Performance summary

Twilio Numbers:
GET  /api/twilio/numbers/pool     - All purchased numbers
POST /api/employees/:id/assign-number - Assign to employee

Leads/Contacts:
GET  /api/contacts                - List contacts
POST /api/contacts                - Create contact

Niches:
GET  /api/niches                  - List niches
POST /api/niches                  - Create niche
GET  /api/niches/my               - Employee's assigned niches

Scraper Bridge:
POST /api/scraper-bridge/push-leads - Push leads from scraper
```

---

## ✅ **Summary:**

### **Use LOCAL for Development:**
```
Frontend: http://localhost:5173
API:      http://localhost:3001
```

### **Production (Later):**
```
Frontend: https://app.jentoai.pro (needs EC2 API running)
API:      https://api.jentoai.pro (needs deployment)
```

---

## 🚀 **Start Using NOW:**

```
1. Open: http://localhost:5173
2. Create manager (bootstrap endpoint)
3. Login with credentials
4. Test all features
5. Run scraper to add leads
```

---

**Everything is WORKING locally!** 🎉
