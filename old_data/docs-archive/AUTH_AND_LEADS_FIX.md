# 🔧 "Authentication Required" Error - FIXED

## ❌ **Two Issues:**

### **Issue 1: "Authentication Required" on Twilio Numbers**
**Cause:** You're not logged in with REAL credentials yet  
**Solution:** Login with actual email/password from database

### **Issue 2: "Did not see leads from local app"**
**Cause:** Scraper was sending leads to `localhost:5000`, NOT to SaaS API  
**Solution:** Run scraper again (now it sends to SaaS API)

---

## ✅ **Step-by-Step Fix:**

### **STEP 1: Login with REAL Credentials**

The app NOW requires real authentication. You CANNOT use any random email/password.

#### **Option A: First-Time Manager Setup**

If this is the FIRST time, you need to bootstrap a manager:

```bash
# Check if bootstrap is needed
curl https://api.jentoai.pro/api/auth/bootstrap-status

# If returns: {"needsBootstrap": true}
# Then create first manager:
curl -X POST https://api.jentoai.pro/api/auth/bootstrap-manager \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Your Name",
    "email": "team.jentoai@gmail.com",
    "password": "your-secure-password"
  }'
```

#### **Option B: Use Existing Credentials**

If manager already exists:

```
Go to: https://app.jentoai.pro/call-login

Email: team.jentoai@gmail.com
Password: (the password you set)

✅ Should redirect to /dashboard
❌ If says "Invalid credentials" → Password is wrong
```

#### **Option C: Check Database Directly**

```bash
# SSH to your server
ssh your-server

# Check if user exists
sqlite3 /path/to/database.db "SELECT id, name, email, role, status FROM agents;"

# Should show something like:
# 1|Your Name|team.jentoai@gmail.com|manager|active
```

---

### **STEP 2: Verify Login Worked**

After logging in, check:

#### **Browser Console (F12):**
```javascript
// Should see these items:
localStorage.getItem('call_token')    // Should be a JWT token (long string)
localStorage.getItem('call_user')     // Should be JSON: {"id":1,"name":"...","role":"manager"}
localStorage.getItem('enr_token')     // Should be same as call_token
localStorage.getItem('call_agent_id') // Should be "1" (or your ID)
```

#### **Network Tab:**
```
Should see successful API calls:
GET /api/twilio/numbers/pool     → 200 OK
GET /api/employees/summary       → 200 OK
```

#### **If you see 401 errors:**
```
GET /api/twilio/numbers/pool     → 401 Unauthorized
```
**Cause:** Token not set or invalid  
**Solution:** Logout and login again

---

### **STEP 3: Run Scraper to Add Leads**

The SaaS database is EMPTY because scraper was sending to localhost. Now it's fixed!

#### **On Your Local Machine:**

```bash
cd /home/jafar-tayyar-siddiqi/Downloads/email\ app/jento-mailer/scraper

# Set environment variables
export ENRICHMENT_API_URL=https://api.jentoai.pro
export ENRICHMENT_API_KEY=jento-scraper-secret-key-123
export PUBLIC_ENRICH_API_KEY=change-me-public-key

# Create job file
cat > test-job.json << 'EOF'
{
  "job_id": "test-001",
  "keyword": "Beauty Salons",
  "location": "New York",
  "crm_niche": "Beauty Salons"
}
EOF

# Run scraper
export BOT_TRIGGER_FILE=test-job.json
npx playwright test tests/keyword-based-scraper.spec.js
```

#### **Watch Console Output:**

You should see:
```
🤖 Automated Job: test-001 (Beauty Salons)
✅ [1/20] "ABC Salon" | https://abcsalon.com | +1-555-0123
🧠 Calling Enrichment API for abcsalon.com...
   ... Enriched: found email info@abcsalon.com
📤 Pushing 1 leads to CRM...
✅ Call Center Response: 1 leads pushed to niche 12
```

**If you see errors:**
```
Failed to push leads: ...
```
**Check:**
1. API is running: `curl https://api.jentoai.pro/health`
2. API key is correct
3. Niche assignment exists

---

### **STEP 4: Verify Leads in SaaS App**

After scraper runs:

```
1. Go to: https://app.jentoai.pro/leads
2. Hard refresh: Ctrl + Shift + R
3. You should see the scraped leads!
```

#### **Or Check Database Directly:**

```bash
# On server
sqlite3 /path/to/database.db << 'EOF'
SELECT 
  c.id,
  c.name,
  c.phone_number,
  c.email,
  n.name as niche_name,
  a.name as assigned_to
FROM contacts c
LEFT JOIN niches n ON c.niche_id = n.id
LEFT JOIN agents a ON c.assigned_agent_id = a.id
ORDER BY c.created_at DESC
LIMIT 10;
EOF
```

---

## 🔍 **Common Errors & Solutions:**

### **Error: "Authentication required"**

**Cause:** Not logged in or token expired

**Solution:**
```
1. Go to: https://app.jentoai.pro/call-login
2. Login with REAL credentials
3. Check console: localStorage.getItem('call_token') should exist
```

---

### **Error: "Invalid credentials"**

**Cause:** Wrong email or password

**Solution:**
```bash
# Reset password (on server)
sqlite3 /path/to/database.db << 'EOF'
-- First, check user exists
SELECT id, email, role FROM agents WHERE email = 'team.jentoai@gmail.com';

-- If exists, you need to use bootstrap-manager or accept-invite flow
EOF
```

**Or create new manager:**
```bash
curl -X POST https://api.jentoai.pro/api/auth/bootstrap-manager \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Manager",
    "email": "manager@jentoai.pro",
    "password": "new-password-123"
  }'
```

---

### **Error: "Please accept your invite first"**

**Cause:** User exists but has no password_hash

**Solution:**
```bash
# Create employee with password (as manager)
curl -X POST https://api.jentoai.pro/api/employees \
  -H "Authorization: Bearer YOUR_MANAGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "New Employee",
    "email": "employee@jentoai.pro",
    "password": "employee-password",
    "role": "employee"
  }'
```

---

### **Error: Scraper says "Failed to push leads"**

**Cause:** API not reachable or wrong API key

**Solution:**
```bash
# Test API endpoint
curl -X POST https://api.jentoai.pro/api/scraper-bridge/push-leads \
  -H "x-api-key: jento-scraper-secret-key-123" \
  -H "Content-Type: application/json" \
  -d '{
    "niche_name": "Test",
    "leads": [{
      "name": "Test Lead",
      "phone_number": "+1234567890",
      "company": "Test Co"
    }]
  }'

# Should return:
# {"imported": 1, "message": "1 leads pushed to niche X"}
```

---

### **Error: Twilio numbers shows empty list**

**Cause:** No Twilio credentials configured OR no numbers purchased

**Solution:**
```bash
# Check server .env file
ssh your-server
cat /path/to/api/.env | grep TWILIO

# Should have:
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxx

# If missing, add them and restart API:
pm2 restart api
```

**Check if numbers exist:**
```bash
curl https://api.jentoai.pro/api/twilio/numbers/pool \
  -H "Authorization: Bearer YOUR_TOKEN"

# Should return:
# {"numbers": [{"phoneNumber": "+1234567890", ...}]}
```

---

## 📊 **Complete Flow Verification:**

### **1. Check API is Running:**
```bash
curl https://api.jentoai.pro/health
# Should return: {"status": "ok"}
```

### **2. Check Auth is Working:**
```bash
curl -X POST https://api.jentoai.pro/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "team.jentoai@gmail.com",
    "password": "your-password"
  }'

# Should return:
# {"token": "eyJhbGciOi...", "user": {...}}
```

### **3. Check Niche Exists:**
```bash
curl https://api.jentoai.pro/api/niches \
  -H "Authorization: Bearer YOUR_TOKEN"

# Should return niches list
```

### **4. Check Leads Exist:**
```bash
curl https://api.jentoai.pro/api/contacts \
  -H "Authorization: Bearer YOUR_TOKEN"

# Should return contacts (if scraper ran)
```

### **5. Check Frontend:**
```
1. Login: https://app.jentoai.pro/call-login
2. Dashboard: https://app.jentoai.pro/dashboard
3. Leads: https://app.jentoai.pro/leads
4. Twilio Numbers: https://app.jentoai.pro/twilio-numbers
```

---

## 🎯 **Quick Test Checklist:**

Run these in order:

- [ ] **API is running:** `curl https://api.jentoai.pro/health` → OK
- [ ] **Login works:** Use real credentials → Redirects to dashboard
- [ ] **Token exists:** Console → `localStorage.getItem('call_token')` → Has value
- [ ] **Twilio numbers:** `/twilio-numbers` → Shows numbers (or empty if none purchased)
- [ ] **Run scraper:** Execute scraper script → Console shows "pushing leads"
- [ ] **Leads appear:** `/leads` → Shows scraped leads
- [ ] **Employee access:** Login as employee → Sees only assigned niche leads

---

## 💡 **Important Notes:**

### **Leads are NOT in SaaS yet because:**
1. Scraper was sending to `localhost:5000` (fixed now)
2. You need to run scraper AGAIN to populate SaaS database
3. Local app leads are separate - they're NOT automatically synced

### **To get leads into SaaS:**
1. ✅ Scraper code fixed (sends to SaaS API now)
2. ⏳ Run scraper manually (follow Step 3 above)
3. ⏳ Leads will appear in SaaS app automatically

### **Authentication is REAL now:**
1. ✅ No more mock login
2. ✅ Backend verifies email/password
3. ✅ JWT tokens required for all API calls
4. ✅ Different roles (manager vs employee) have different access

---

## 🚀 **TL;DR - Do This Now:**

```bash
# 1. Login with real credentials
Go to: https://app.jentoai.pro/call-login
Use: team.jentoai@gmail.com + your password

# 2. Run scraper to add leads
cd /home/jafar-tayyar-siddiqi/Downloads/email\ app/jento-mailer/scraper
export ENRICHMENT_API_URL=https://api.jentoai.pro
export BOT_TRIGGER_FILE=test-job.json
npx playwright test tests/keyword-based-scraper.spec.js

# 3. Check results
Go to: https://app.jentoai.pro/leads
Hard refresh: Ctrl + Shift + R
```

---

**After these steps, everything will work!** 🎉
