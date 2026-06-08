# 🎯 Complete System Guide: Google Maps API → SaaS CRM → Employee Niche Access

## ✅ Your Requirements:

1. ✅ **NO local scraper or Playwright** - The SaaS app handles everything via Google Places API directly.
2. ✅ **Direct Lead Fetch** → Leads are fetched from Google Maps API and go straight to CRM.
3. ✅ **Employee niche access** - Each employee sees only assigned niches.

---

## 📊 Complete Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   YOUR COMPLETE WORKFLOW                         │
└─────────────────────────────────────────────────────────────────┘

STEP 1: USER SEARCHES LEADS (SaaS Dashboard)
┌──────────────────────────────────────┐
│  User/Manager logs into SaaS         │
│  Enters Keyword: "Beauty Salons"     │
│  Enters Location: "New York"         │
│  Selects Niche: "Beauty Salons"      │
│                                      │
│  Calls SaaS API:                     │
│  POST /v1/google-maps/scrape         │
└──────────┬───────────────────────────┘
           │
           ▼
STEP 2: GOOGLE PLACES API (Cloud)
┌──────────────────────────────────────┐
│  /v1/google-maps/scrape endpoint     │
│                                      │
│  Fetches directly from:              │
│  places.googleapis.com               │
│                                      │
│  Extracts:                           │
│  📞 Phone numbers (PRIMARY!)         │
│  ✅ Website URLs                     │
│  ✅ Company Names & Addresses        │
│                                      │
│  Returns leads to frontend           │
└──────────┬───────────────────────────┘
           │
           ▼
STEP 3: PUSH TO CRM (Cloud)
┌──────────────────────────────────────┐
│  Frontend filters valid leads        │
│  Calls /api/scraper-bridge/push-leads│
│                                      │
│  Payload:                            │
│  {                                   │
│    "niche_name": "Beauty Salons",    │
│    "leads": [...]                    │
│  }                                   │
│                                      │
│  Actions:                            │
│  1. Find/create niche by name        │
│     "Beauty Salons" → niche_id = 12  │
│  2. Get assigned_agent_id from niche │
│  3. Insert ALL leads with:           │
│     - niche_id = 12                  │
│     - assigned_agent_id = 5          │
│                                      │
│  ✅ LEADS ARE SAVED IN NICHE!        │
└──────────┬───────────────────────────┘
           │
           ▼
STEP 4: EMPLOYEE ACCESS (Cloud)
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

1. **Dashboard Input**: You enter a keyword and select a CRM Niche in the App.
2. **Google Maps API**: The backend queries `places.googleapis.com` and fetches leads.
3. **CRM Bridge**: Valid leads (must have phone numbers) are pushed to `/api/scraper-bridge/push-leads` along with the chosen `niche_name`.
4. **Database Matching**: The CRM finds the niche ID, checks who it is assigned to, and assigns all new leads to that specific agent.
5. **Employee Dashboard**: When the assigned agent logs in, they see all the newly fetched leads waiting for them.

---

## 📞 PHONE NUMBER - PRIMARY OUTREACH CHANNEL

### **Current Priority:**

1️⃣  📞 **PHONE NUMBERS**  ← MOST IMPORTANT!
    • Direct calling via Twilio
    • Primary outreach method
    • EVERY lead MUST have phone number

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
```

---

## 👥 Employee Niche Access System

### **How Employee Access Works**

**Scenario 1: Manager Creates Niche + Assigns Employee**
Manager goes to "Access Management", creates a niche (e.g. "Beauty Salons") and assigns it to John (Employee).

**Scenario 2: Fetching Leads**
Manager fetches leads via Google Maps API and pushes them into the "Beauty Salons" niche.

**Scenario 3: Employee Logs In**
John logs in and sees ONLY the "Beauty Salons" niche and the 50 leads inside it. Sarah logs in and sees ONLY her assigned "Restaurants" niche.

---

**Your system is ready and completely Playwright-free!** 🎉
- ✅ Direct Google Maps API integration
- ✅ No heavy browser automation overhead
- ✅ Leads auto-assigned to niches
- ✅ Employees see only their niches
- ✅ Manager controls everything
