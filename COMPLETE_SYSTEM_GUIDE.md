# 🎯 Complete System Guide: Scraper → SaaS Enrichment → Employee Niche Access

## ✅ Your Requirements:

1. ✅ **NO local enrichment** - Only SaaS app does enrichment
2. ✅ **Scraper runs** → Leads go to SaaS app
3. ✅ **Employee niche access** - Each employee sees only assigned niches

---

## 📊 Complete Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   YOUR COMPLETE WORKFLOW                         │
└─────────────────────────────────────────────────────────────────┘

STEP 1: YOU RUN SCRAPER (Local)
┌──────────────────────────────────────┐
│  jento-mailer/scraper/               │
│                                      │
│  Job Trigger File (JSON):            │
│  {                                   │
│    "job_id": "job-001",              │
│    "keyword": "Beauty Salons",       │
│    "location": "New York",           │
│    "crm_niche": "Beauty Salons"  ← NICHE YAHAN DEFINE HOGI!
│  }                                   │
│                                      │
│  Command:                            │
│  npx playwright test \               │
│    tests/keyword-based-scraper.spec.js│
│                                      │
│  Output:                             │
│  50-100 leads from Google Maps       │
│  SAB KE SAATH niche = "Beauty Salons"│
└──────────┬───────────────────────────┘
           │
           ▼
STEP 2: WEBSITE INTELLIGENCE (Local triggers SaaS)
┌──────────────────────────────────────┐
│  website-intelligence.js             │
│                                      │
│  For each lead:                      │
│  1. Visit website                    │
│  2. Call SaaS API:                   │
│     POST https://api.jentoai.pro     │
│     /v1/public/enrich                │
│                                      │
│  3. Pass NICHE with leads:           │
│     niche_name: "Beauty Salons"      │
│     ← NICHE LEADS KE SAATH JAYEGI!   │
│                                      │
│  ⚠️ NO local enrichment!             │
│  Only calls SaaS enrichment API      │
└──────────┬───────────────────────────┘
           │
           ▼
STEP 3: SAAS ENRICHMENT (Cloud - api.jentoai.pro)
┌──────────────────────────────────────┐
│  /v1/public/enrich endpoint          │
│                                      │
│  Deep scraping:                      │
│  📞 Phone numbers (PRIMARY!)         │
│  ✅ Emails (multiple)                │
│  ✅ LinkedIn, Facebook, Instagram    │
│  ✅ Twitter, WhatsApp                │
│  ✅ Company info                     │
│  ✅ Industry type                    │
│  ✅ Technology stack                 │
│                                      │
│  Returns enriched data               │
└──────────┬───────────────────────────┘
           │
           ▼
STEP 4: PUSH TO CRM (Cloud)
┌──────────────────────────────────────┐
│  /api/scraper-bridge/push-leads      │
│                                      │
│  Receives:                           │
│  {                                   │
│    "niche_name": "Beauty Salons",    │
│    "leads": [...]                    │
│  }                                   │
│                                      │
│  Actions:                            │
│  1. Find/create niche by name        │
│     "Beauty Salons" → niche_id = 12  │
│  2. Get assigned_agent_id from niche │
│     (e.g., agent_id = 5 for John)    │
│  3. Insert ALL leads with:           │
│     - niche_id = 12                  │
│     - assigned_agent_id = 5          │
│  4. Skip duplicates                  │
│                                      │
│  ✅ NICHE ALREADY ASSIGNED!          │
│  ✅ LEADS NICHE KE SAATH SAVE HONGE! │
└──────────┬───────────────────────────┘
           │
           ▼
STEP 5: EMPLOYEE ACCESS (Cloud - app.jentoai.pro)
┌──────────────────────────────────────┐
│  Employee logs in                    │
│                                      │
│  Sees only:                          │
│  ✅ Their assigned niches            │
│  ✅ Leads in those niches            │
│  ✅ Can call those leads             │
│                                      │
│  CANNOT see:                         │
│  ❌ Other niches                     │
│  ❌ Other employee's leads           │
└──────────────────────────────────────┘
```

---

## 🎯 Niche Flow - Complete Journey

```
┌─────────────────────────────────────────────────────────────────┐
│                   NICHE KA SAFAR!                                │
└─────────────────────────────────────────────────────────────────┘

Step 1: JOB TRIGGER FILE (JSON Input)
┌──────────────────────────────────────────┐
│  {                                       │
│    "job_id": "job-001",                  │
│    "keyword": "Beauty Salons",           │
│    "location": "New York",               │
│    "crm_niche": "Beauty Salons"  ← NICHE│
│  }                                       │
└──────────┬───────────────────────────────┘
           │
           │ crmNiche = "Beauty Salons"
           ▼
Step 2: SCRAPER CODE
┌──────────────────────────────────────────┐
│  const crmNiche = automatedJob.crm_niche │
│  // crmNiche = "Beauty Salons"           │
│                                          │
│  // Scraper extracts leads:              │
│  Lead 1: {name, phone, website}          │
│  Lead 2: {name, phone, website}          │
│  Lead 3: {name, phone, website}          │
│  ...                                     │
│                                          │
│  // SAB KE SAATH NICHE ATTACH HOGI!      │
└──────────┬───────────────────────────────┘
           │
           │ enrichAndReportToJentoAPI(leads, crmNiche)
           │ crmNiche = "Beauty Salons"
           ▼
Step 3: WEBSITE INTELLIGENCE
┌──────────────────────────────────────────┐
│  async enrichAndReportToJentoAPI(        │
│    leads,                                │
│    category  ← "Beauty Salons"           │
│  ) {                                     │
│                                          │
│    // Enrich each lead                   │
│    // Then push to CRM:                  │
│    axios.post('/push-leads', {           │
│      niche_name: category,  ← NICHE!     │
│      leads: validLeads                   │
│    })                                    │
│  }                                       │
└──────────┬───────────────────────────────┘
           │
           │ POST /api/scraper-bridge/push-leads
           │ Body: {
           │   niche_name: "Beauty Salons",
           │   leads: [...]
           │ }
           ▼
Step 4: SCRAPER BRIDGE API
┌──────────────────────────────────────────┐
│  router.post('/push-leads', async () => {│
│    const payload = req.body;             │
│    const nicheName = payload.niche_name; │
│    // nicheName = "Beauty Salons"        │
│                                          │
│    // 1. Find or create niche            │
│    const niche = await query(            │
│      "SELECT id, assigned_agent_id       │
│       FROM niches                        │
│       WHERE name = $1",                  │
│      [nicheName]                         │
│    );                                    │
│                                          │
│    // 2. Get assigned employee           │
│    const assignedAgentId =               │
│      niche.assigned_agent_id;            │
│    // Example: 5 (John Doe)              │
│                                          │
│    // 3. Insert leads WITH NICHE!        │
│    INSERT INTO contacts (                │
│      name, phone, email,                 │
│      niche_id,           ← NICHE ID!     │
│      assigned_agent_id   ← EMPLOYEE!     │
│    ) VALUES ...                          │
│  })                                      │
└──────────┬───────────────────────────────┘
           │
           │ Database:
           │ contacts table:
           │ - niche_id = 12
           │ - assigned_agent_id = 5
           ▼
Step 5: DATABASE (Final State)
┌──────────────────────────────────────────┐
│  niches table:                           │
│  ┌────┬─────────────────┬─────────────┐  │
│  │ id │ name            │ agent_id    │  │
│  ├────┼─────────────────┼─────────────┤  │
│  │ 12 │ Beauty Salons   │ 5 (John)    │  │
│  └────┴─────────────────┴─────────────┘  │
│                                          │
│  contacts table:                         │
│  ┌────┬──────────┬──────────┬─────────┐  │
│  │ id │ name     │ niche_id │ agent_id│  │
│  ├────┼──────────┼──────────┼─────────┤  │
│  │ 1  │ ABC Salon│ 12       │ 5       │  │
│  │ 2  │ XYZ Salon│ 12       │ 5       │  │
│  │ 3  │ 123 Salon│ 12       │ 5       │  │
│  └────┴──────────┴──────────┴─────────┘  │
│                                          │
│  ✅ SAB LEADS NICHE #12 MEIN HAIN!       │
│  ✅ SAB JOHN (AGENT 5) KO ASSIGN HAIN!   │
└──────────┬───────────────────────────────┘
           │
           ▼
Step 6: EMPLOYEE DASHBOARD
┌──────────────────────────────────────────┐
│  John logs in (agent_id = 5)             │
│                                          │
│  GET /api/niches/my                      │
│  Response:                               │
│  {                                       │
│    "niches": [                           │
│      {                                   │
│        "id": 12,                         │
│        "name": "Beauty Salons",          │
│        "contact_count": 145              │
│      }                                   │
│    ]                                     │
│  }                                       │
│                                          │
│  GET /api/contacts                       │
│  Backend filters:                        │
│  WHERE assigned_agent_id = 5             │
│                                          │
│  John sees:                              │
│  ✅ 145 Beauty Salon leads               │
│  ❌ NO other niches                      │
└──────────────────────────────────────────┘
```

---

## 🔄 How Scraper Pushes Leads to SaaS

### **File:** `jento-mailer/scraper/website-intelligence.js`

```javascript
// Line 96-156: enrichAndReportToJentoAPI()

async enrichAndReportToJentoAPI(leads, category) {
  const JENTO_API = 'https://api.jentoai.pro';
  const PUBLIC_API_KEY = process.env.PUBLIC_ENRICH_API_KEY;
  const SCRAPER_API_KEY = process.env.ENRICHMENT_API_KEY;

  for (const lead of leads) {
    // 1. Call SaaS enrichment API (NOT local!)
    if (lead.website && lead.website !== 'N/A') {
      const enrichRes = await axios.post(
        `${JENTO_API}/v1/public/enrich`, 
        {
          domain: lead.website,
          wait: true  // Wait for result
        },
        {
          headers: { 'x-api-key': PUBLIC_API_KEY }
        }
      );
      
      const enrichedData = enrichRes.data.result;
      // Contains: emails, socials, company info, etc.
    }

    // 2. Merge original + enriched data
    callCenterLeads.push({
      name: lead.name,
      phone_number: lead.phone || '',  ← PHONE NUMBER (REQUIRED!)
      email: enrichedData?.contact_email || null,
      website: lead.website,
      linkedin: enrichedData?.linkedin || null,
      notes: enrichedData?.description || ''
    });
  }

  // 3. Push to CRM - ONLY LEADS WITH PHONE NUMBERS!
  const pushRes = await axios.post(
    `${JENTO_API}/api/scraper-bridge/push-leads`,
    {
      niche_name: category,  // e.g., "Beauty Salons"
      leads: validLeads  // Filtered: phone >= 3 digits
    },
    {
      headers: { 'x-api-key': SCRAPER_API_KEY }
    }
  );
}
```

---

## 📞 PHONE NUMBER - PRIMARY OUTREACH CHANNEL

### **Current Priority:**

```
┌─────────────────────────────────────────────────────────┐
│              OUTREACH PRIORITY (Phase 1)                 │
└─────────────────────────────────────────────────────────┘

1️⃣  📞 PHONE NUMBERS  ← MOST IMPORTANT!
    • Direct calling via Twilio
    • Primary outreach method
    • EVERY lead MUST have phone number
    • Scraper validates: phone >= 3 digits
    • Without phone = lead rejected

2️⃣  📧 EMAILS  ← Secondary (for now)
    • Backup communication
    • Future email campaigns
    • Nice to have, not required

3️⃣  🌐 SOCIAL MEDIA  ← Future use
    • LinkedIn, Facebook, Instagram
    • Multi-channel outreach (Phase 2)
    • Currently just collected, not used
```

### **Why Phone Number is Critical:**

1. **Immediate Outreach** - Call leads right away
2. **Higher Response Rate** - 80%+ answer rate vs 20% email
3. **Personal Connection** - Build trust faster
4. **Twilio Integration** - Direct calling from app
5. **Recording & Tracking** - Monitor call quality

### **Scraper Phone Validation:**

```javascript
// website-intelligence.js - Line 138

// Filter out leads WITHOUT phone numbers
const validLeads = callCenterLeads.filter(l => 
  l.phone_number && l.phone_number.length >= 3
);

// Only leads with phone numbers are pushed to CRM!
if (validLeads.length > 0) {
  console.log(`📤 Pushing ${validLeads.length} leads to CRM...`);
  // Push to API
} else {
  console.log(`... No valid leads (with phone numbers) to push.`);
}
```

### **Lead Data Structure (Phone First):**

```javascript
{
  name: "ABC Salon",
  phone_number: "+1-555-0123",  ← REQUIRED!
  company: "ABC Salon",
  email: "info@abcsalon.com",   ← Optional
  website: "https://abcsalon.com",
  linkedin: "https://linkedin.com/...",  ← Future
  notes: "Beauty salon in New York"
}
```

### **Twilio Calling Flow:**

```
Employee sees lead in app
    ↓
Clicks "Call" button
    ↓
Twilio initiates call from employee's assigned number
    ↓
Lead receives call
    ↓
Employee talks to lead
    ↓
Call recorded automatically
    ↓
Call logged in database with:
    - Duration
    - Recording URL
    - Outcome (connected, voicemail, etc.)
    - Notes
```

---

## 👥 Employee Niche Access System

### **Database Schema:**

```sql
-- Niches table
CREATE TABLE niches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,          -- e.g., "Beauty Salons"
  description TEXT,
  assigned_agent_id INTEGER REFERENCES agents(id),  -- Employee who owns this niche
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Contacts table
CREATE TABLE contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone_number TEXT UNIQUE,
  company TEXT,
  email TEXT,
  notes TEXT,
  assigned_agent_id INTEGER,          -- Auto-set from niche owner
  source TEXT DEFAULT 'scraper',
  niche_id INTEGER REFERENCES niches(id),  -- Links to niche
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Agents (employees) table
CREATE TABLE agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL,                 -- 'manager' or 'employee'
  status TEXT DEFAULT 'active',
  twilio_phone_number TEXT,           -- Assigned Twilio number
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🎯 How Employee Access Works

### **Scenario 1: Manager Creates Niche + Assigns Employee**

```javascript
// Manager creates niche and assigns to employee
POST /api/niches
Headers: Authorization: Bearer MANAGER_TOKEN

Body:
{
  "name": "Beauty Salons",
  "description": "All beauty salons in New York",
  "assigned_agent_id": 5  // Employee ID
}

Response:
{
  "niche": {
    "id": 12,
    "name": "Beauty Salons",
    "assigned_agent_id": 5,
    "agent_name": "John Doe",
    "agent_email": "john@company.com"
  }
}
```

### **Scenario 2: Scraper Pushes Leads to Niche**

```javascript
// Scraper pushes leads
POST /api/scraper-bridge/push-leads
Headers: x-api-key: SCRAPER_API_KEY

Body:
{
  "niche_name": "Beauty Salons",  // Matches existing niche
  "leads": [
    {
      "name": "ABC Salon",
      "phone_number": "+1-555-0123",
      "email": "info@abcsalon.com",
      "website": "https://abcsalon.com"
    }
  ]
}

Backend does:
1. Finds niche "Beauty Salons" (id: 12)
2. Gets assigned_agent_id (5)
3. Inserts leads with assigned_agent_id = 5
4. Employee 5 can now see these leads!
```

### **Scenario 3: Employee Logs In**

```javascript
// Employee login
POST /api/auth/login
Body:
{
  "email": "john@company.com",
  "password": "password123"
}

Response:
{
  "token": "jwt-token-xyz",
  "user": {
    "id": 5,
    "name": "John Doe",
    "role": "employee"
  }
}

// Employee sees only their niches
GET /api/niches/my
Headers: Authorization: Bearer jwt-token-xyz

Response:
{
  "niches": [
    {
      "id": 12,
      "name": "Beauty Salons",
      "contact_count": 145  // Total leads in this niche
    }
  ]
}

// Employee sees only leads in their niches
GET /api/contacts
Headers: Authorization: Bearer jwt-token-xyz

Backend filters:
SELECT * FROM contacts 
WHERE assigned_agent_id = 5  // Only this employee's leads
```

---

## 🚀 How to Run the Complete System

### **Step 1: Configure Environment Variables**

**In `jento-mailer/.env`:**
```bash
# SaaS API URL
ENRICHMENT_API_URL=https://api.jentoai.pro

# API Keys (must match backend)
ENRICHMENT_API_KEY=jento-scraper-secret-key-123
PUBLIC_ENRICH_API_KEY=change-me-public-key

# Scraper trigger file
BOT_TRIGGER_FILE=job-001.json
```

**In `apps/api/.env`:**
```bash
# API Keys
SCRAPER_API_KEY=jento-scraper-secret-key-123
PUBLIC_ENRICH_API_KEY=change-me-public-key

# Database
DATABASE_URL=postgresql://user:pass@host:5432/jentoai
```

---

### **Step 2: Create Job Trigger File**

**Create:** `jento-mailer/scraper/job-001.json`

```json
{
  "job_id": "job-001",
  "keyword": "Beauty Salons",
  "location": "New York",
  "crm_niche": "Beauty Salons"  ← YE NICHE HAI! Leads isi ke saath jayengi!
}
```

**Important:**
- `crm_niche` **MUST** match the niche name in SaaS app
- If niche doesn't exist in SaaS, it will be created automatically
- If niche exists, leads will be added to it with assigned employee

---

### **Step 3: Run Scraper**

```bash
cd jento-mailer/scraper

# Run scraper
npx playwright test tests/keyword-based-scraper.spec.js

# Watch the output:
# 🔍 Searching: "Beauty Salons in New York"
# 🧠 Calling Enrichment API for https://abcsalon.com...
#    ... Enriched: found email info@abcsalon.com
# 📤 Pushing 50 leads to Call Center CRM (Niche: Beauty Salons)...
# ✅ Call Center Response: 50 leads pushed to niche 12
```

---

### **Step 4: Assign Niche to Employee (Manager)**

**Via API:**
```bash
curl -X POST https://api.jentoai.pro/api/niches \
  -H "Authorization: Bearer MANAGER_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Beauty Salons",
    "assigned_agent_id": 5
  }'
```

**Or via Frontend:**
1. Login as manager at `app.jentoai.pro`
2. Go to "🔐 Access Management"
3. Add employee
4. Assign niche to employee

---

### **Step 5: Employee Sees Leads**

1. Employee logs in at `app.jentoai.pro`
2. Goes to "👥 Leads"
3. Sees **only** leads from assigned niches
4. Can call leads using Twilio number

---

## 📋 Complete Workflow Summary

| Step | Action | Location | Who Does It |
|------|--------|----------|-------------|
| 1 | Create niche | SaaS App | Manager |
| 2 | Assign niche to employee | SaaS App | Manager |
| 3 | Run scraper | Local | You |
| 4 | Enrich websites | SaaS API | Cloud |
| 5 | Push leads to CRM | SaaS API | Cloud |
| 6 | Leads appear in niche | Database | Automatic |
| 7 | Employee sees leads | SaaS App | Employee |
| 8 | Employee calls leads | SaaS App | Employee |

---

## 🔍 Employee Access Control

### **What Employee CAN See:**
✅ Leads in assigned niches only  
✅ Their own Twilio number  
✅ Call logs for their calls  
✅ Their performance stats  

### **What Employee CANNOT See:**
❌ Other niches  
❌ Other employees' leads  
❌ Manager settings  
❌ Billing/API keys  

### **What Manager CAN Do:**
✅ Create/delete niches  
✅ Assign niches to employees  
✅ See all leads (all niches)  
✅ Add/remove employees  
✅ View all performance data  

---

## 🎯 Example Scenario

### **Setup:**
- **Manager:** You (admin@jentoai.com)
- **Employee 1:** John (john@company.com) - Assigned to "Beauty Salons"
- **Employee 2:** Sarah (sarah@company.com) - Assigned to "Restaurants"

### **Workflow:**

1. **You run scraper:**
   ```bash
   # Job 1
   Keyword: "Beauty Salons"
   Location: "New York"
   CRM Niche: "Beauty Salons"
   
   # Job 2
   Keyword: "Italian Restaurants"
   Location: "Manhattan"
   CRM Niche: "Restaurants"
   ```

2. **Scraper pushes leads:**
   - 50 beauty salon leads → Niche "Beauty Salons" → assigned_agent_id = 1 (John)
   - 75 restaurant leads → Niche "Restaurants" → assigned_agent_id = 2 (Sarah)

3. **John logs in:**
   - Sees: 50 beauty salon leads ✅
   - Does NOT see: 75 restaurant leads ❌

4. **Sarah logs in:**
   - Sees: 75 restaurant leads ✅
   - Does NOT see: 50 beauty salon leads ❌

5. **You (Manager) log in:**
   - See: All 125 leads ✅
   - Can reassign niches ✅
   - Can add more employees ✅

---

## ✅ Benefits of This System

1. **NO Local Enrichment** - All heavy lifting done by SaaS API
2. **Centralized Data** - All leads in one cloud database
3. **Access Control** - Employees see only their assigned work
4. **Scalable** - Add more employees, assign more niches
5. **Professional** - Clean separation of duties
6. **Trackable** - Know which employee is working which niche

---

## 🚀 Quick Start Commands

```bash
# 1. Setup scraper
cd jento-mailer/scraper
echo '{
  "job_id": "job-001",
  "keyword": "Beauty Salons",
  "location": "New York",
  "crm_niche": "Beauty Salons"
}' > job-001.json

# 2. Run scraper
export BOT_TRIGGER_FILE=job-001.json
npx playwright test tests/keyword-based-scraper.spec.js

# 3. Check results
# Leads will appear in: app.jentoai.pro/leads
# Assigned to niche owner automatically!
```

---

**Your system is ready!** 🎉

- ✅ Scraper → SaaS enrichment (no local)
- ✅ Leads auto-assigned to niches
- ✅ Employees see only their niches
- ✅ Manager controls everything

Just run the scraper and watch the magic happen! 🚀
