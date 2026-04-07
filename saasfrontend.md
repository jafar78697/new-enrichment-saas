# SaaS Frontend Design Brief

## Purpose

Yeh document [`requirements.md`](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas-aws/requirements.md) aur [`design.md`](/home/jafar-tayyar-siddiqi/Downloads/email%20app/.kiro/specs/enrichment-saas-aws/design.md) ko frontend design brief me convert karta hai.

Iska goal hai:

- modern SaaS web app UI define karna
- Stitch ya kisi design-generation tool ko strong direction dena
- white-based color palette finalize karna
- page-by-page UX clear karna
- generic dashboard nahi, premium product feel create karna

---

## Product Summary

**Product Name:** Enrichment SaaS

**Core Promise:** User website links, CSV, ya Google Sheet deta hai aur platform un domains ko enrich karke usable contact aur business intelligence data return karta hai.

**Core Jobs:**

- bulk enrichment job create karna
- progress track karna
- results filter aur export karna
- billing, credits aur integrations manage karna

**Important Scope Boundaries:**

- yeh scraping CRM nahi hai
- yeh email campaign tool nahi hai
- yeh inbox ya warmup product nahi hai
- UI ka center of gravity enrichment workflow hai, outreach nahi

---

## Frontend Product Goal

User ko 10 seconds ke andar samajh aa jana chahiye:

1. mere paas kitna usage aur credits bacha hai
2. meri active jobs kya kar rahi hain
3. naya enrichment job kaise start karna hai
4. results ko kis tarah filter, export, ya integrate karna hai

Frontend ko technical complexity hide karni hai. HTTP lane, Browser lane, retries, failures, credits, aur quotas powerful backend concepts hain, lekin UI me inko clean aur business-friendly language me dikhana hai.

---

## Design Direction

### Visual Theme

Design language "clean intelligence workspace" honi chahiye.

Feel:

- premium but not flashy
- calm, bright, fast
- analytics-grade trust
- slightly editorial, not overly corporate

Avoid:

- generic blue dashboard templates
- purple gradients
- over-dark UI
- crowded cards
- too many rounded toy-like elements

### Recommended Typography

- Heading font: `Space Grotesk`
- Body font: `Manrope`
- Data / numbers / API keys / tables: `JetBrains Mono`

If Stitch font control limited ho, to closest equivalent use kare:

- headings me strong geometric grotesk
- body me soft readable sans
- metrics me mono

---

## Best White-Based Color System

Yeh palette white ke saath modern aur premium lagegi:

| Token | Color | Use |
|------|------|-----|
| `bg.canvas` | `#F6F7F2` | app background, slightly warm white |
| `bg.surface` | `#FFFFFF` | cards, drawers, tables |
| `bg.subtle` | `#EEF2EA` | muted panels, filters, input groups |
| `text.primary` | `#14202B` | main headings and core text |
| `text.secondary` | `#52606D` | supporting text |
| `text.muted` | `#7B8794` | metadata and placeholders |
| `border.soft` | `#D8E1D7` | card borders |
| `border.strong` | `#BCC8BB` | active separators |
| `brand.primary` | `#0F766E` | primary CTA, links, key accents |
| `brand.primaryHover` | `#115E59` | primary hover |
| `brand.secondary` | `#0F4C81` | secondary accent, charts |
| `accent.signal` | `#F59E0B` | warnings, usage attention |
| `success` | `#15803D` | completed, healthy |
| `danger` | `#DC2626` | failed, destructive |
| `info` | `#2563EB` | info badges and highlights |

### Why This Palette Works

- white base app ko airy aur modern banata hai
- deep teal product ko differentiated feel deta hai
- navy accent trust aur SaaS seriousness add karta hai
- amber usage warnings ke liye naturally readable hai
- green and red statuses dashboards me immediately understandable hain

### Gradient Direction

Agar hero panels ya empty states me gradient use karna ho to subtle rakho:

- `linear-gradient(135deg, #F6F7F2 0%, #FFFFFF 42%, #EAF6F3 100%)`

Isse white dominant rehta hai lekin layout flat nahi lagta.

---

## Brand Moodboard

Product ko aisa feel dena hai jaise:

- data platform
- research tool
- premium B2B operator console

Keywords:

- precision
- clarity
- control
- throughput
- confidence

---

## Layout System

### App Shell

- left sidebar fixed navigation
- top utility bar with workspace switcher, search, notifications, profile
- main content wide and breathable
- page header sticky but light

### Sidebar

Sections:

- Overview
- New Job
- Jobs
- Results
- Integrations
- Billing
- API Keys
- Team Settings

Sidebar feel:

- white or near-white surface
- active item me teal left accent bar
- icon + label pairs
- subtle counters for active jobs or alerts

### Top Bar

Elements:

- page title
- quick search
- current workspace
- usage chip
- notifications
- profile avatar

---

## Information Architecture

### Primary Navigation

- `/dashboard`
- `/jobs/new`
- `/jobs`
- `/jobs/:id`
- `/results/:job_id`
- `/integrations`
- `/billing`
- `/api-keys`
- `/settings/team`
- `/settings/account`

### Auth Routes

- `/login`
- `/signup`

---

## Core UX Principles

1. Every important page par ek primary action obvious hona chahiye.
2. Usage aur credit information hidden nahi honi chahiye.
3. Failure states blunt but helpful honi chahiye.
4. Tables dense ho sakti hain, lekin headers aur filters clean rehne chahiye.
5. Progress ko visual + numeric dono form me dikhaya jaye.
6. Browser lane ko premium capability jaisa present karo, punishment jaisa nahi.

---

## Page-by-Page Design Spec

## 1. Login

Purpose:

- trust build karna
- clean SaaS entry point provide karna

Layout:

- split-screen ya centered auth card
- left side brand statement
- right side login form

Content:

- heading: "Sign in to Enrichment SaaS"
- subcopy: "Track jobs, enrich domains, and export verified company data."
- email field
- password field
- remember me
- forgot password
- primary CTA

Visual note:

- white card on soft warm-white background
- abstract network/grid illustration in pale teal lines

## 2. Signup

Purpose:

- fast onboarding

Fields:

- name
- workspace / company name
- email
- password

Support block:

- Starter / Growth / Pro summary
- trust microcopy: "No outreach tools. Pure enrichment workflow."

## 3. Overview Dashboard

Purpose:

- health snapshot
- recent activity
- direct path to create new job

Must include:

- total enriched this month
- success rate
- browser credits remaining
- HTTP rows used
- active jobs
- recent exports

Recommended layout:

- top hero strip with product status and primary CTA
- six metric cards in asymmetric grid
- active jobs section
- recent results or exports strip
- billing usage rail on the right for desktop

Hero copy example:

- title: "Your enrichment pipeline is moving"
- subtitle: "Monitor active jobs, usage, and result quality from one place."

Card style:

- white cards
- very thin borders
- large metric number in mono
- small trend or helper text under each metric

## 4. New Enrichment Job

Purpose:

- platform ka most important conversion page

Structure:

- step 1: input method select
- step 2: domain input / CSV upload / sheet connection
- step 3: mode selection
- step 4: options
- step 5: cost and time estimate
- step 6: submit

Input methods:

- Paste Links
- Upload CSV
- Connect Google Sheet

Mode cards:

- Fast HTTP
- Smart Hybrid
- Premium JS

Each mode card me:

- short label
- one-line explanation
- estimated cost impact
- best use case

Suggested copy:

- Fast HTTP: "Best for static websites and low-cost bulk runs."
- Smart Hybrid: "Recommended. Starts with HTTP and upgrades only when needed."
- Premium JS: "Use browser rendering for JavaScript-heavy sites."

Important UI behavior:

- duplicates removed count instantly show karo
- invalid domains list expandable tray me show karo
- estimated credits aur time real-time update karo
- usage limits exceed hone par upgrade alert inline show karo

## 5. Jobs List

Purpose:

- all jobs ek operational list me dikhana

Table columns:

- job name
- created by
- mode
- status
- progress
- success rate
- created at
- actions

Filters:

- status
- mode
- plan-sensitive jobs
- date range

Visual treatment:

- white table surface
- sticky filters row
- status badges
- progress mini-bars

## 6. Job Detail

Purpose:

- live operational control center

Top section:

- job title
- mode badge
- created date
- total domains
- cancel
- retry failed
- export

Middle section:

- large progress bar
- queued / processing / completed / failed counts
- HTTP complete vs browser complete split
- top errors

Bottom section:

- results preview table
- recent item activity
- quick actions

Key UX note:

- failure ko sirf red text me mat dikhana
- error summary compact cards me show karo
- "what to do next" strip add karo

Example:

- `3 domains failed due to timeout. Retry failed items or export current results.`

## 7. Results Explorer

Purpose:

- enriched data ko inspect, filter, aur export karna

Layout:

- left filter rail
- main results table
- top action bar
- optional right-side detail drawer

Filters:

- has email
- has phone
- has LinkedIn
- high confidence only
- browser enriched only
- failed only

Columns:

- domain
- primary email
- primary phone
- LinkedIn
- confidence
- source lane
- status

Detail drawer me:

- company identity
- contact data
- social links
- technical signals
- source URLs
- confidence scores

This page should feel:

- powerful
- clean
- spreadsheet-like but beautiful

## 8. Integrations

Purpose:

- automation users ke liye easy adoption

Sections:

- Webhooks
- n8n
- Google Sheets
- Node SDK
- API docs

Cards me show karo:

- what it does
- who it is for
- setup button
- docs button

## 9. Billing and Usage

Purpose:

- plan clarity
- quota visibility
- upgrade conversion

Must include:

- current plan
- billing period
- HTTP usage bar
- browser credits usage bar
- upgrade CTA
- buy credit pack CTA
- recent invoices

Recommended style:

- white main surface
- premium plan cards with thin borders
- active plan me teal ring ya subtle glow
- purchased credit packs alag card me show hon

## 10. API Keys

Purpose:

- developer trust

Layout:

- API keys table
- create key modal
- reveal-once UX
- revoke action
- usage note

Important:

- generated key ko mono block me show karo
- warning copy clear ho: "You will only see this secret once."

## 11. Team Settings

Purpose:

- multi-tenant collaboration

Sections:

- members list
- roles
- invites
- workspace settings

Roles:

- owner
- admin
- member

Visual direction:

- simple admin page
- avoid overdesign
- clarity > decoration

---

## Shared Component System

Components required:

- Button
- IconButton
- Card
- Badge
- Tabs
- SegmentedControl
- DataTable
- FilterChips
- Drawer
- Modal
- Toast
- ProgressBar
- EmptyState
- InlineAlert
- UsageBar
- StatCard
- DomainInputBox
- UploadDropzone
- PricingCard

### Status Badge Mapping

- `queued` → neutral gray
- `processing_http` → blue
- `processing_browser` → teal
- `completed` → green
- `partial` → amber
- `failed` → red
- `blocked` → gray-red
- `browser_timeout` → orange
- `insufficient_credits` → amber-red

---

## State Design Rules

Har major page ke liye ye states defined hon:

- loading
- empty
- success
- partial data
- error
- permission restricted

### Empty State Example

Overview empty state:

- title: "No enrichment jobs yet"
- body: "Start your first job with pasted domains, a CSV, or a Google Sheet."
- CTA: "Create New Job"

### Limit Reached State

- show quota card
- show remaining allowance
- upgrade button visible
- explanation blunt but friendly

Example:

- `You are about to exceed your monthly HTTP limit. Upgrade to continue this run.`

---

## Motion and Interaction

Motion subtle but intentional honi chahiye:

- page load par 120 to 180ms fade + lift
- cards stagger reveal
- progress bars smooth width transition
- drawer open soft spring feel
- hover states crisp, not floaty

Avoid:

- excessive parallax
- bouncing charts
- heavy glassmorphism

---

## Responsive Strategy

Desktop first, tablet supported.

Desktop:

- sidebar persistent
- tables full width
- filters side rail

Tablet:

- sidebar collapsible
- filter rail drawer me
- cards 2-column max

Mobile V1:

- functional but not primary target
- tables cards me collapse ho sakte hain

---

## Accessibility

- body text contrast AA level
- primary buttons on white background high contrast
- status colors sirf color se convey na hon, labels bhi hon
- tables keyboard navigable hon
- modals focus trap use karein
- progress bars accessible labels ke saath hon

---

## Content Tone

Tone:

- calm
- precise
- operational
- not salesy

Use words like:

- enriched
- queued
- processing
- completed
- partial
- credits remaining

Avoid words like:

- magic
- explosive growth
- killer leads

---

## Charts and Data Visualization

Recommended chart types:

- usage bars
- line chart for daily processed domains
- stacked bar for HTTP vs Browser completion
- donut for success vs failed vs partial

Chart styling:

- thin grid lines
- white background
- teal as primary data
- navy as secondary
- amber only for warnings

---

## Stitch Master Prompt

Use this as the main design-generation prompt:

```text
Design a premium modern SaaS dashboard for a product called "Enrichment SaaS". The product helps users submit domains, CSVs, or Google Sheets and enrich company websites into structured contact and business intelligence data. The UI should feel bright, clean, intelligent, and operational. Use a white-first visual system, not dark mode, not purple, and not a generic bootstrap dashboard.

Visual direction:
- warm white background
- crisp white cards
- deep teal primary accent
- navy secondary accent
- amber only for warnings and quota alerts
- typography pairing similar to Space Grotesk for headings, Manrope for body, JetBrains Mono for metrics
- lots of breathing room, elegant grid, premium B2B feel

Primary pages to design:
- Overview dashboard
- New Enrichment Job
- Jobs List
- Job Detail
- Results Explorer
- Integrations
- Billing and Usage
- API Keys
- Team Settings

Important UX goals:
- user should understand usage, credits, active jobs, and next action within 10 seconds
- progress bars and status badges should be immediately readable
- tables should be data-dense but beautiful
- browser enrichment should feel like a premium capability
- keep it minimal, sharp, and conversion-focused

Avoid:
- purple gradients
- over-dark themes
- generic admin template look
- crowded cards
- heavy glassmorphism
```

---

## Stitch Page Prompt Pack

### Prompt 1: Overview

```text
Create the Overview page for Enrichment SaaS. Show six KPI cards: total enriched this month, success rate, browser credits remaining, HTTP rows used, active jobs, recent exports. Below that show a recent jobs table and a compact usage panel. Use a premium white interface with deep teal accents and mono metric numbers.
```

### Prompt 2: New Job

```text
Create the New Enrichment Job page for Enrichment SaaS. Include three input methods: paste links, upload CSV, connect Google Sheet. Include a mode selector with cards for Fast HTTP, Smart Hybrid, and Premium JS. Show duplicate count, invalid domains, estimated time, estimated cost, and a clear primary CTA. Make this the strongest conversion page in the app.
```

### Prompt 3: Job Detail

```text
Create a Job Detail page for Enrichment SaaS that feels like a live operations console. Include a large progress bar, queued/processing/completed/failed metrics, HTTP vs Browser completion split, top error summary, results preview table, and actions for cancel, retry failed, export CSV, copy emails, and copy phones.
```

### Prompt 4: Results Explorer

```text
Create a Results Explorer page for Enrichment SaaS with a filter sidebar and a beautiful data table. Filters include has email, has phone, has LinkedIn, high confidence only, browser enriched only, and failed only. The table should show domain, email, phone, LinkedIn, confidence, lane, and status. Include bulk actions and a detail drawer.
```

### Prompt 5: Billing

```text
Create a Billing and Usage page for Enrichment SaaS. Show current plan, billing period, HTTP usage bar, browser credit usage bar, upgrade CTA, buy credit packs CTA, and recent invoices. Make it feel premium and trustworthy, using a white background, subtle borders, teal highlights, and amber warning states.
```

### Prompt 6: API Keys

```text
Create an API Keys management page for Enrichment SaaS. Show a table of keys, create-key modal, reveal-once secret state, revoke actions, and a developer-friendly mono layout. The page should feel secure, clean, and enterprise-ready.
```

---

## Final Recommendation

Is product ke liye best design direction yeh hai:

- white-first canvas
- teal + navy accent system
- editorial typography
- crisp borders instead of heavy shadows
- data-centric layouts
- strong New Job experience
- calm, premium, operator-grade dashboard feel

If Stitch ek hi pass me full app banata hai, to pehle `Overview`, `New Job`, aur `Job Detail` generate karwana best hoga. Yeh teen screens poore product ka visual language set kar denge.
