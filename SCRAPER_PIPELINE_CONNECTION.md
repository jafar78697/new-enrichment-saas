# 🔗 Complete Scraper → SaaS App Pipeline

## 📊 **Full Data Flow Architecture**

```
┌─────────────────────────────────────────────────────────────────┐
│                    JENTOAI COMPLETE PIPELINE                     │
└─────────────────────────────────────────────────────────────────┘

1️⃣  GOOGLE MAPS SCRAPER
    ┌────────────────────────────────────┐
    │  Location: jento-mailer/scraper/   │
    │  File: tests/keyword-based-        │
    │        scraper.spec.js             │
    │                                    │
    │  Tech: Playwright (Chromium)       │
    │  Input: Keyword + Location         │
    │  Output: Business leads            │
    └────────┬───────────────────────────┘
             │
             │ Scrapes:
             │ - Business name
             │ - Phone number
             │ - Website URL
             │ - Address
             │
             ▼
2️⃣  WEBSITE INTELLIGENCE (Enrichment)
    ┌────────────────────────────────────┐
    │  Location: jento-mailer/scraper/   │
    │  File: website-intelligence.js     │
    │                                    │
    │  Scrapes website for:              │
    │ - Contact emails                   │
    │ - Social media links               │
    │   (LinkedIn, Facebook, Instagram)  │
    │ - Technology stack                 │
    │ - Business details                 │
    └────────┬───────────────────────────┘
             │
             │ POST request to:
             │ https://api.jentoai.pro
             │ /api/scraper-bridge/push-leads
             │
             │ Headers:
             │ x-api-key: ENRICHMENT_API_KEY
             │
             ▼
3️⃣  SCRAPER BRIDGE API
    ┌────────────────────────────────────┐
    │  Location: apps/api/src/calls-     │
    │  module/routes/scraper-bridge.     │
    │  routes.js                         │
    │                                    │
    │  Endpoint: POST /api/scraper-      │
    │            bridge/push-leads       │
    │                                    │
    │  Auth: API Key (x-api-key header)  │
    │  Database: PostgreSQL              │
    │                                    │
    │  Actions:                          │
    │  1. Find/create niche by name      │
    │  2. Insert leads into contacts     │
    │  3. Auto-assign to niche owner     │
    │  4. Skip duplicates (phone #)      │
    └────────┬───────────────────────────┘
             │
             │ Database INSERT:
             │ - contacts table
             │ - niche_id
             │ - assigned_agent_id
             │ - source: 'scraper'
             │
             ▼
4️⃣  DATABASE (PostgreSQL)
    ┌────────────────────────────────────┐
    │  Tables:                           │
    │  • contacts (leads)                │
    │  • niches (categories)             │
    │  • agents (employees)              │
    │                                    │
    │  Schema:                           │
    │  contacts (                        │
    │    id, name, phone_number,         │
    │    company, email, notes,          │
    │    assigned_agent_id, source,      │
    │    niche_id                        │
    │  )                                 │
    └────────┬───────────────────────────┘
             │
             │ Query via:
             │ GET /api/contacts
             │ GET /api/employees/:id/contacts
             │
             ▼
5️⃣  FRONTEND APP (app.jentoai.pro)
    ┌────────────────────────────────────┐
    │  Location: apps/web/src/           │
    │  Tech: React + TypeScript + Vite   │
    │  Deployed: Cloudflare Pages        │
    │                                    │
    │  Pages:                            │
    │  📊 Dashboard - Stats & overview   │
    │  🔍 Enrichment - Select & enrich   │
    │  👥 Leads - View enriched leads    │
    │  📞 Twilio Numbers - Phone pool    │
    │  🔐 Access Management - Permissions│
    │  👨‍💼 Employees - Performance       │
    │  📞 Call Logs - Call history       │
    └────────────────────────────────────┘
```

---

## 🔌 **Connection Points**

### **Scraper → API Bridge**

**File:** `jento-mailer/scraper/website-intelligence.js`

```javascript
const JENTO_API = process.env.ENRICHMENT_API_URL || 'https://api.jentoai.pro';
const SCRAPER_API_KEY = process.env.ENRICHMENT_API_KEY || 'jento-scraper-secret-key-123';

// Push leads to SaaS app
const pushRes = await axios.post(`${JENTO_API}/api/scraper-bridge/push-leads`, {
  niche_name: crmNiche,
  leads: scrapedLeads
}, {
  headers: { 'x-api-key': SCRAPER_API_KEY }
});
```

**API Endpoint:** `apps/api/src/calls-module/routes/scraper-bridge.routes.js`

```javascript
router.post('/push-leads', requireApiKey, async (req, res) => {
  // 1. Find or create niche
  // 2. Insert leads into contacts table
  // 3. Auto-assign to niche owner
  // 4. Return count of imported leads
});
```

---

## ✅ **Is Scraper Connected?**

### **YES!** The connection exists:

| Component | Status | Location |
|-----------|--------|----------|
| Google Maps Scraper | ✅ Exists | `jento-mailer/scraper/tests/keyword-based-scraper.spec.js` |
| Website Intelligence | ✅ Exists | `jento-mailer/scraper/website-intelligence.js` |
| API Bridge Endpoint | ✅ Exists | `apps/api/src/calls-module/routes/scraper-bridge.routes.js` |
| Database Schema | ✅ Exists | PostgreSQL `contacts` table |
| Frontend Display | ✅ Exists | `apps/web/src/pages/Leads.tsx` |

---

## 🔍 **Data Flow Example**

### **Step-by-Step:**

1. **You run scraper:**
   ```bash
   cd jento-mailer/scraper
   npx playwright test tests/keyword-based-scraper.spec.js
   ```

2. **Scraper extracts from Google Maps:**
   ```json
   {
     "name": "ABC Salon",
     "phone": "+1-555-0123",
     "website": "https://abcsalon.com",
     "address": "123 Main St, New York"
   }
   ```

3. **Website Intelligence scrapes website:**
   ```json
   {
     "emails": ["info@abcsalon.com"],
     "socials": {
       "linkedin": "https://linkedin.com/company/abc",
       "facebook": "https://facebook.com/abcsalon",
       "instagram": "https://instagram.com/abcsalon"
     }
   }
   ```

4. **Pushed to SaaS API:**
   ```bash
   POST https://api.jentoai.pro/api/scraper-bridge/push-leads
   Headers: x-api-key: jento-scraper-secret-key-123
   Body: {
     "niche_name": "Beauty Salons",
     "leads": [
       {
         "name": "ABC Salon",
         "phone_number": "+1-555-0123",
         "website": "https://abcsalon.com",
         "email": "info@abcsalon.com",
         "notes": "LinkedIn: https://linkedin.com/company/abc\nFacebook: https://facebook.com/abcsalon"
       }
     ]
   }
   ```

5. **Stored in database:**
   ```sql
   INSERT INTO contacts (
     name, phone_number, company, email, notes, 
     assigned_agent_id, source, niche_id
   ) VALUES (
     'ABC Salon', '+1-555-0123', NULL, 'info@abcsalon.com',
     'LinkedIn: ...', NULL, 'scraper', 5
   );
   ```

6. **Shows in Frontend:**
   - Go to app.jentoai.pro
   - Click "👥 Leads"
   - See ABC Salon with all details!

---

## ⚙️ **Environment Variables Needed**

### **For Scraper:**
```bash
# In jento-mailer/.env or scraper/.env
ENRICHMENT_API_URL=https://api.jentoai.pro
ENRICHMENT_API_KEY=jento-scraper-secret-key-123
```

### **For API Backend:**
```bash
# In apps/api/.env
SCRAPER_API_KEY=jento-scraper-secret-key-123
DATABASE_URL=postgresql://...
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
```

---

## 🎯 **How to Test the Connection**

### **1. Test API Endpoint:**
```bash
curl -X POST https://api.jentoai.pro/api/scraper-bridge/push-leads \
  -H "Content-Type: application/json" \
  -H "x-api-key: jento-scraper-secret-key-123" \
  -d '{
    "niche_name": "Test Niche",
    "leads": [
      {
        "name": "Test Business",
        "phone_number": "+1-555-9999",
        "website": "https://test.com",
        "email": "test@test.com"
      }
    ]
  }'
```

**Expected Response:**
```json
{
  "imported": 1,
  "message": "1 leads pushed to niche 123"
}
```

### **2. Run Scraper:**
```bash
cd jento-mailer/scraper

# Set environment variables
export BOT_TRIGGER_FILE=job-123.json

# Run scraper
npx playwright test tests/keyword-based-scraper.spec.js
```

### **3. Check Database:**
```bash
# SSH to your server
ssh ec2-user@your-server

# Connect to PostgreSQL
psql -U postgres -d jentoai

# Query leads
SELECT name, phone_number, email, niche_id, source 
FROM contacts 
ORDER BY created_at DESC 
LIMIT 10;
```

### **4. View in Frontend:**
1. Login to `https://app.jentoai.pro`
2. Click "👥 Leads"
3. You should see the scraped leads!

---

## 🔧 **If Scraper is NOT Pushing Leads**

### **Common Issues:**

1. **API Key mismatch:**
   ```bash
   # Check scraper .env
   cat jento-mailer/.env | grep ENRICHMENT_API_KEY
   
   # Check API backend .env
   cat apps/api/.env | grep SCRAPER_API_KEY
   
   # They must match!
   ```

2. **API URL wrong:**
   ```bash
   # Should be: https://api.jentoai.pro
   # NOT: http://localhost:3000
   ```

3. **Backend not running:**
   ```bash
   # Check if API is up
   curl https://api.jentoai.pro/health
   
   # Should return: {"status":"ok"}
   ```

4. **Database connection failed:**
   ```bash
   # Check API logs
   ssh your-server
   journalctl -u api-jentoai -f
   ```

---

## 📈 **Current State**

✅ **Scraper code exists** - Can scrape Google Maps  
✅ **Website intelligence exists** - Can extract emails & socials  
✅ **API endpoint exists** - Can receive leads  
✅ **Database schema exists** - Can store leads  
✅ **Frontend exists** - Can display leads  

⚠️ **What to verify:**
- Is `ENRICHMENT_API_KEY` configured correctly?
- Is `SCRAPER_API_KEY` matching in backend?
- Is the backend running at `api.jentoai.pro`?
- Are there any errors in API logs?

---

## 🚀 **Quick Test**

Run this to test the full pipeline:

```bash
# 1. Test API endpoint
curl -X POST https://api.jentoai.pro/api/scraper-bridge/push-leads \
  -H "x-api-key: jento-scraper-secret-key-123" \
  -H "Content-Type: application/json" \
  -d '{
    "niche_name": "Test",
    "leads": [{"name": "Test", "phone_number": "+1234567890"}]
  }'

# 2. If you get {"imported": 1}, the connection works!
# 3. Login to app.jentoai.pro → Leads → You should see it!
```

---

**The scraper IS connected to the SaaS app!** 🎉

The pipeline is:  
**Google Maps → Scraper → API Bridge → Database → Frontend**

All pieces exist and are ready to use!
