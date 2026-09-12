# JentoAI Calling SaaS - Implementation Plan

Tareekh: 8 September 2026  
Zabaan: Roman Urdu  
Status: Planning complete; implementation abhi shuru nahin hui.  
Project: `/home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/calling-saas`  
Monorepo: `/home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas`

## 1. Maqsad Aur Is Document Ka Istemal

Pakistan mein maujood community members ko paid browser calling aur Maps-based business discovery deni hai. Shuru mein payment gateway nahin hoga. Customer WhatsApp par rabta karega, JazzCash par payment bhejega aur screenshot/transaction reference share karega. Admin actual payment receive hone ki tasdeeq karega, account banayega ya purane account ka package/balance update karega.

Admin username choose ya generate kar sakega; system har account ke liye alag random temporary password generate karega. Har customer ka apna login, calling numbers, usage limits, payment history aur Maps credits honge.

Yeh implementation ke liye proposed blueprint hai. Neeche diye gaye defaults aur misaali rates business ke final faislay nahin hain. Har implementation step apni acceptance checks pass karne ke baad complete mark hoga. Abhi sirf yeh file banayi gayi hai; application, database, payment account aur production mein koi tabdeeli is document ka hissa nahin.

## 2. Maujooda Code Se Kya Maloom Hua

Neeche ke paths monorepo ke relative hain. Yeh local source inspection hai; deployed server aur live database ki tasdeeq nahin ki gayi.

- `apps/calling-saas/src/App.tsx`: landing, dashboard, enrichment, numbers aur settings routes hain; customer login aur protected dashboard flow abhi mukammal nahin.
- `apps/calling-saas/src/pages/DashboardHome.tsx`: name, statistics aur recent jobs demo data hain. Inhein real tenant data se replace karna hai.
- `apps/calling-saas/src/pages/Enrichment.tsx`: `token` ya `dummy-token` se `/v1/google-maps/scrape` call hoti hai; job history local state mein hai aur CSV button ka action nahin.
- `apps/api/src/routes/google-maps.ts`: Places Text Search integration file maujood hai, lekin inspected `apps/api/src/index.ts` mein is route ka import/registration nahin mila. File ki mojoodgi ko working endpoint nahin samajhna.
- `apps/api/src/calls-module/routes/google-maps.routes.js`: doosra Maps endpoint `/api/google-maps/scrape` mounted hai. Yeh Google account selector leta hai aur kuch contacts/niche operations tenant filter ke baghair karta hai.
- Maps ke dono implementations asal mein Google Places API call karte hain. Yeh browser se Maps website scrape karne wala implementation nahin. Maujooda filtering US leads par focused hai.
- `apps/calling-saas/src/services/callsApi.ts`: `enr_token` aur `call_token` use hote hain. Baqi screens ka `token` flow is se mukhtalif hai.
- `apps/calling-saas/src/components/DialerPopup.tsx`: cached agent ID ya agents list ka pehla agent choose karne ka fallback hai. SaaS mein identity authenticated membership se aani chahiye.
- `apps/calling-saas/src/hooks/useSignalWireDevice.ts`: browser SignalWire Relay se call banata hai; maximum duration ka timer browser mein hai aur call logging call shuru hone ke baad hoti hai. Paid use ke liye backend/provider control zaroori hai.
- `apps/api/src/routes/auth.ts`: email/password login aur disabled public signup hai. Username onboarding, forced password change aur admin customer creation extend karne hain.
- `apps/api/src/index.ts`: calls-token fallback hardcoded tenant/user aur `pro` plan assign karta hai. Yeh multiple independent customers ke liye release blocker hai.
- `apps/api/src/calls-module/middleware/auth.js`: legacy token bridging, default tenant aur enrichment tokens ko manager banane wale paths hain. Inhein explicit tenant membership aur role mapping se replace karna hai.
- `apps/api/src/routes/phone-numbers.ts`: SignalWire number provisioning hai; missing configuration par mock purchase possible hai, real balance deduction nahin. Frontend mein Twilio text aur fixed dollar prices hain; `phone`/`phoneNumber` response mismatch bhi hai.
- `apps/api/src/routes/billing.ts`: Lemon Squeezy checkout aur usage counters hain. JazzCash manual requests/approval/ledger is flow mein nahin.
- `packages/auth`, `packages/db`, `packages/queue`: reuse ke liye auth, database aur queue foundations hain. Database migrations multiple locations par hain; actual schema pehle map karna hai.
- `apps/api/package.json`: `build` script `tsc --noEmit || true` chalata hai. Sirf iska successful exit type safety ka saboot nahin; direct typecheck zaroori hoga.

Backend ka actual source Fastify ke saath mounted Express calling modules use karta hai. Naya alag backend banane ke bajaye isi structure mein scoped services add karna proposed hai.

## 3. Pehle Version Ka Scope

### Customer Ko Kya Milega

- Username/password login, pehli dafa password change, logout aur account recovery.
- Apna dashboard: package, expiry, calling balance, Maps credits aur assigned phone numbers.
- Browser dialer: number selection, call, hang up, mute, keypad aur call history.
- Maps discovery screen: search, maximum credits, job progress, permitted results aur usage history.
- Apni integration ke liye scoped JentoAI API key, jo wahi credits use kare.
- JazzCash instructions, WhatsApp contact, payment reference aur approval status.
- Low balance, package expiry aur pending renewal states.

### Admin Ko Kya Milega

- Customers create/search/suspend/reactivate karna; username aur temporary password generate karna.
- Payment receive verify karke approve/reject karna; package ya balances update karna.
- Caller IDs, seats, concurrent calls, destinations aur usage caps set karna.
- Number purchase/assignment/renewal/release requests manage karna.
- Customer-wise usage, provider costs, payment records aur action history dekhna.
- Password reset, API key revoke aur service pause controls.

### Baad Ke Versions

Automatic JazzCash/payment gateway, WhatsApp Business automation, self-service instant number purchasing, reseller hierarchy, advanced CRM campaigns aur AI auto-dialing pehle release ka hissa nahin. Maujooda AI routes ko paid customers ke liye tab tak expose nahin karna jab tak unki tenant isolation, permissions aur metering bhi verified na hon.

## 4. Business Decisions Aur Required Values

Abhi implementation rok kar sawal poochne ki zaroorat nahin; in values ko configuration/TBD rakhna hai. Paid activation se pehle relevant value final honi chahiye.

- `WHATSAPP_SUPPORT_NUMBER`: international format mein admin/support ka number; abhi TBD.
- `JAZZCASH_RECEIVER_NUMBER` aur `JAZZCASH_ACCOUNT_TITLE`: exact receiving details; abhi TBD.
- Payment verification hours aur expected turnaround: admin apni availability ke mutabiq set kare; instant approval promise nahin.
- Packages: PKR price, access duration, seats, assigned numbers, Maps units, calling allowance, renewal terms.
- Allowed calling countries: source US-focused hai, lekin user ne final destination countries nahin bataye. Pakistan mein customer hona aur Pakistan ko call karna alag decisions hain.
- Phone number countries/types, monthly rental, first-month/setup charge aur renewal policy.
- Calling rate card, currency conversion, provider fees, call billing increments aur margin.
- Maps credit unit, per-operation weights aur pack price; section 9 mein proposed model hai.
- Customer ko sirf app, app plus API, ya API-only access dena: feature flags se support.
- Account duration, balance expiry, grace period aur refund rules: sale se pehle visible terms.
- Team accounts: default ek customer workspace aur ek owner seat; extra seats configurable.

Owner ka irada registered company ke baghair shuru karna hai. Software mein company registration number ko default compulsory field nahin rakhenge. Lekin selected telecom provider ka Pakistan-based individual account, resale/subaccount arrangement, JazzCash account ka intended commercial use aur applicable operating requirements abhi verify nahin hue. Yeh plan eligibility ki guarantee nahin deta; actual provider/account terms ki tasdeeq pehle paid launch ki dependency hai.

## 5. Customer Onboarding Aur WhatsApp Flow

1. Visitor ko package information aur WhatsApp contact milta hai.
2. WhatsApp message mein desired package, caller-ID count, seats, target countries aur expected daily calling volume aata hai.
3. Admin `New Customer Request` banata hai. Company naam optional; customer name aur contact number required. Email optional rakhne ke liye existing NOT NULL constraints ka deliberate migration hoga, fake email nahin banayenge.
4. Admin quote/order banata hai: unique reference, amount in PKR, package version, allocations, expiry aur receiving JazzCash details ka snapshot.
5. Customer reference ke saath JazzCash transfer karta hai aur screenshot plus transaction ID WhatsApp par bhejta hai.
6. Admin request ke saath proof attach/record karta hai aur apni JazzCash transaction history mein actual incoming transfer verify karta hai.
7. Approval se verified receipt record hota hai aur package/balance entitlement ek hi database transaction mein apply hota hai.
8. Account naya ho to admin username confirm karta hai, random temporary password generate hota hai. Login URL aur credentials admin khud customer ko share karta hai.
9. Customer first login par naya password set karta hai. Calling tab available hoti hai jab payment entitlement aur assigned provider number dono ready hon.
10. Existing customer top-up kare to usi tenant mein credits/balance add hote hain; naya account nahin banta.

WhatsApp MVP mein simple contact link/manual chat hoga. System messages khud nahin bhejega. Chat mein aaya screenshot apne aap app mein sync nahin hota; admin attach karega. Existing logged-in customer ke liye optional private proof upload bhi available ho sakta hai.

## 6. Manual Payment Model

### Status Aur Verification

Order/payment request states: `awaiting_payment -> pending_review -> approved` ya `rejected`; unpaid request `expired`/`cancelled` bhi ho sakti hai. Rejected proof dobara bhejne par nayi submission history preserve hogi.

Payment approved aur service ready alag states hain. Number provisioning fail ho to payment approved rehti hai aur fulfillment `pending`/`failed` hota hai; customer ko pending number assignment dikhana hai.

Har request par expected amount, received amount, currency, transaction ID, receiving account, sender reference, proof, reviewer, verified timestamp aur reason store ho. Screenshot proof hai; approval actual received transfer match hone par hoga.

### Double Credit Aur Adjustments

- `(payment_method, receiver_account_id, transaction_reference)` par unique receipt identity ho, taake ek transfer doosre customer par reuse na ho.
- Request approve par row lock aur idempotency key use ho. Do clicks ya do admin tabs se ek hi allocation ho.
- Client se bheji gayi credits quantity trust na ho; saved package/order snapshot se allocation derive ho.
- Partial ya extra amount par admin revised quote/allocation select kare aur difference ka reason record kare. Full package silently activate na ho.
- Wrong approval ko historical row edit/delete karke erase na karein; linked reversal/adjustment entry ho.
- Refund ke liye requested, approved aur actually paid states alag hon. JazzCash se paisa wapas bhejna manual admin action hai; button se financial transfer assume nahin karna.
- Daily reconciliation mein actual JazzCash receipts, approved requests aur granted balances compare hon.

### Proof Storage

Proof images private storage mein hon; public URLs nahin. File type/content validation, configured size limit, randomized names aur short-lived authorized access ho. Payment details/logs redact hon. MVP proposal: 5 MB image limit aur 90-day proof retention; owner ki recordkeeping needs ke mutabiq final karna hai. Financial ledger retention ko proof-image deletion se alag rakhein.

## 7. Login, Roles Aur Customer Data Separation

### Account Creation

Admin readable username type kare ya `Generate username` use kare. Normalized lowercase username unique ho; collision par naya suffix. Password cryptographic randomness se minimum 20 characters equivalent generate ho, plaintext sirf creation/reset response mein ek baar dikhaya jaye aur database mein existing bcrypt-based hashing use ho.

Temporary password proposed 24 ghante valid ho aur first login par forced change ho. Expired/missing password ko admin regenerate kare; purana password retrieve na kiya ja sake. Account creation retry par duplicate tenant/user na bane. Password response logging aur browser persistence disable ho.

First password change se pehle session sirf change-password/logout allow kare. Login throttling, generic invalid-credentials message, revocable sessions, real refresh-session rotation aur logout revocation ho. Reset se previous sessions invalidate hon. Existing refresh route ko access token ko refresh token samajhne se replace karna hai.

Same-origin deployment mein secure HttpOnly cookie session preferred hai; CSRF/origin checks saath hon. Agar current deployment cross-origin ho to cookie/CORS settings validate karke ek consistent auth transport choose karein. Multiple localStorage token names aur dummy-token fallbacks eliminate hon.

### Roles

- `platform_admin`: all customer provisioning, payments, balances aur provider configuration.
- `tenant_owner`: apni workspace, allowed seats aur tenant API keys; platform billing approval ka haq nahin.
- `agent`: assigned calling aur allowed lead access; doosre tenants ya platform settings tak access nahin.

Platform admin entitlement database se explicit ho; legacy `manager` role ko automatic global admin na banayein. Initial admin server-side one-time provisioning se create ho, public signup ya hardcoded password se nahin. Paid pilot se pehle admin MFA aur recovery process ready ho.

### Tenant Enforcement

Har customer tenant ka matlab separate workspace hai, registered legal company hona zaroori nahin. Authenticated membership se tenant ID derive ho; request body ki tenant ID authority nahin.

Users, agents, contacts, niches, calls, phone numbers, jobs, results, payments, exports, API keys aur recordings sab tenant-scoped hon. Lists, single-record reads, mutations, websocket subscriptions, queue workers aur provider callbacks sab par ownership check ho. Child-parent relationships cross-tenant attach na ho sakein.

Fixed tenant IDs, environment-wide customer fallbacks aur auto-manager assignment paid paths se hatayein. `canAccessAgent` ko role ke saath tenant bhi verify karna hoga. Existing customers ka real user-to-agent mapping banayein; pehla agent select karne ka fallback remove ho.

Suspension/expiry aur changed limits database/cache version se request time par check hon; purane JWT claims se active/pro status indefinitely na milta rahe.

## 8. Calling Numbers, Seats Aur Limits

"Kitne numbers pe chalana hai" ko ek field mein combine nahin karna. Onboarding par neeche ke independent values confirm aur order mein save karne hain:

- `max_phone_numbers`: kitne purchased/verified outgoing caller IDs milenge.
- `max_seats`: kitne alag log apne logins se use karenge.
- `max_concurrent_calls`: ek waqt mein tenant ki kitni calls active ho sakti hain.
- `max_daily_unique_destinations`: ek din mein kitne mukhtalif destination numbers dial ho sakte hain.
- `max_daily_call_attempts`: retries samet total attempts ka cap.
- `allowed_destination_countries`, `max_call_seconds` aur monthly/spending allowance.

Proposal: daily window `Asia/Karachi` ke mutabiq; storage UTC. Numbers E.164 normalization se compare hon. Same number retry unique destination dobara consume nahin kare, lekin attempt count consume kare. Limits tenant ke aggregate par aur zaroorat par per-agent bhi hon.

### Number Provisioning

Customer request -> admin quote/verify funds -> reserve rental funds -> provider purchase -> database assignment -> ready status. Provider availability aur pricing server se aaye; hardcoded `$1.50` aur successful mock purchase production mein remove hon.

Provider purchase aur database transaction ek atomic system nahin. Operation ID, provisioning state aur reconciliation worker use ho: provider purchase successful lekin DB write fail ho to number recover/attach ho, blindly dobara purchase na ho. Unknown timeout par provider inventory check karein.

Number tenant ownership ke baghair select nahin ho sakta. Caller ID sirf provider-issued ya provider-verified approved number ho. Renewal date aur recurring cost store hon; low balance par renewal notice aur proposed 3-day grace policy dikhayein. Grace cost kis ka hoga final business rule hai. Number release request aur provider-confirmed release alag states hon; release irreversible ownership loss ho sakta hai is liye intentional admin confirmation ho.

### Call Authorization Aur Metering

1. Call start request user, tenant, agent, caller ID, destination, account status aur entitlement validate kare.
2. Atomic transaction mein concurrent slot, attempts/destination allowance aur required balance reserve ho.
3. Backend-controlled provider call/session authorize ho; caller/destination/duration policy provider level par bind ho.
4. Browser ko sirf scoped short-lived calling credentials milen. Generic Relay token se extra unmetered PSTN calls possible hon to architecture provider application/server-controlled dialing par shift ho.
5. Verified provider events call lifecycle update karein. Browser timer aur `log-outbound` financial source of truth na hon.
6. Provider-side maximum duration enforce ho, tab close/disconnect par bhi. Allowed duration reserved funds aur rate card se derive ho.
7. Final provider duration/billable legs se reserved funds settle hon, unused funds release hon, concurrent slot free ho.

Browser/PSTN legs, inbound calls, transfer legs, recording aur AI cost alag provider charges ho sakte hain; sirf frontend talk timer ko cost na samjhein. Rate card mein supported service components define hon. Unsupported inbound/transfer/AI features launch mein disable hon jab tak metered na hon.

Repeated/out-of-order callbacks event ID se deduplicate hon; raw signed body verify ho. Unknown calls ko tenant guess karke bill na karein; reconciliation queue mein rakhein. Lost callbacks, stale reservations, call-create timeout aur delayed charges ke liye recovery worker ho. Settled estimate aur later provider cost difference explicit adjustment ho; allowance se zyada cost platform loss/review mein jaye, silently negative prepaid balance nahin.

## 9. Maps API Aur Credits Ka Model

### Customer Ko Apni API Dena

Customer ko JentoAI API key milegi. Google provider key server par rahegi; customer/browser ko raw Google key ya `account_1/account_2` provider selector nahin dena. API aur UI dono same authenticated job service aur wallet use karein.

Existing official Places integration starting point hai. Permanent scraped lead database, raw Maps data redistribution aur CSV export ko automatically allowed assume nahin karna. Google Places policies storage/caching ko limit karti hain, place IDs ke liye exception batati hain, aur attribution plus public terms/privacy requirements deti hain. Relevant feature mein allowed storage/display/export policy confirm karke enforce karni hai. [Google Places Policies](https://developers.google.com/maps/documentation/places/web-service/policies), checked 8 September 2026.

Proposed API application-specific discovery/jobs API hogi, unrestricted Google proxy nahin. Agar intended bulk lead resale/export selected provider terms mein fit nahin hota to us feature ke liye suitable licensed data provider evaluate karein; Google key milna resale permission nahin hai. Provider decision tak export feature off reh sakta hai.

### Proposed Credit Unit

MVP recommendation: credits successful logical API operations ke mutabiq deduct hon, fixed per-lead promise ke mutabiq nahin. Search ki har fetched page ek operation ho; optional details/enrichment apni operation type ho. Customer ko operation ka credit rate aur job maximum pehle dikhaya jaye.

Example sirf arithmetic ke liye: `maps_search_page = 5 credits`, `place_details = 2 credits`. Do pages aur teen details ka total `2 * 5 + 3 * 2 = 16 credits`. Yeh Google rates ya final selling prices nahin. Result count variable hai; 1 credit = 1 guaranteed lead ka wada nahin.

Google billing requested fields/SKU se badalti hai; field mask ka highest applicable SKU relevant hota hai. Is liye phone/website/details ke required fields ka actual rate launch par record karke credit weights set hon. [Google Places Usage and Billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing), checked 8 September 2026.

### Charge Rules

- Valid successful search page, zero results ke saath bhi, displayed operation rate consume karegi. Yeh customer-facing pricing mein wazeh ho.
- Validation rejection aur known provider failure customer ko charge na karein. Provider-side retries ka extra cost internal record ho.
- Same idempotency key aur same request ka retry naya job/charge na banaye; same key with different payload conflict return kare.
- Network timeout ka outcome unknown ho to operation `uncertain` ho; automatic duplicate customer charge na ho. Reconcile ya explicit platform-funded retry policy ho.
- Job cancel/fail/partially complete ho to successfully delivered logical operations settle hon aur baqi reservation release ho.
- Duplicates filter hone se already consumed search API page ka charge reverse nahin hota. Repeated result download/view, jab retention policy allow kare, dobara credits charge nahin karta.
- Google Maps, website/browser enrichment aur AI enrichment alag named operations hon. Extra enrichment user ke selected budget ke baghair na chale.

### Job Execution

Request mein keywords, location/country, result cap, page cap aur `max_credits` validate hon. Backend maximum spend calculate karke balance reserve kare aur `202` with job ID return kare. Background queue existing queue package se integrate ho.

Worker tenant, job ID, rate snapshot aur reservation ke saath execute kare. Har page/details operation se pehle remaining budget verify ho. Pagination, multiple keywords, retries aur details sab total job budget mein count hon. Zero/invalid results par bhi request/page ceiling ho, taake endless searches na chalti rahen.

States: `queued`, `running`, `completed`, `partially_completed`, `failed`, `cancelled`. Completion aur result writes durable hon; worker crash ke baad operation identity se resume ho. Partial results aur actual used credits visible hon. Polling initial UI ke liye kaafi hai.

Per-tenant jobs/minute, parallel jobs, daily credits aur platform provider spending cap ho. Existing US-only filter ko explicit destination support decision se align karein. `place_id` se job deduplication aur allowed retention ke andar result identity maintain ho; data ke saath source/expiry metadata rakhein.

## 10. Wallet, Pricing Aur Accounting

Customer ko do separate balances dikhana proposed hai: calling balance in PKR aur Maps credits. Number rental/package fee alag order line items hon. Calling allowance display minutes mein estimate ho sakta hai, lekin destination-specific cost aur authoritative ledger se settle ho.

PKR money integer paisa mein, Maps credits integer units mein, provider costs explicit currency aur fixed precision mein store hon. Floating-point totals avoid hon. Kisi unit ko doosri unit se implicit add/subtract na karein.

Wallet par `available`, `reserved` aur total balance ho. Append-only ledger event types: grant/topup, reserve, capture, release, expiry, refund/reversal aur reasoned adjustment. Capture reserved amount ko spend kare, release usay available mein lautaye; state transitions atomic hon. Har entry ka tenant, unit, operation ID, actor, timestamp aur related order/job/call ho.

Financial grants ki balanced accounting entries aur aapas mein linked allocation lines hon, taake ek received PKR payment ka breakdown package fee, rental, calling funding aur Maps pack mein reconcile ho. Provider cost tracking customer credit unit se alag ho. Purchased Maps units ko PKR ki tarah cash refund value assume na karein; refund original order ke terms se calculate ho.

Rate card version mein provider operation/destination, provider currency/cost, conversion snapshot, sell rate, margin aur effective date ho. Active jobs/calls apni starting rate version use karein. Existing customer ke balance ko price edit se rewrite na karein.

Proposed renewal behavior: access period aur wallet alag hon. Expiry par nayi paid operations block hon lekin billing/support login available ho. Purchased unused balance proposed non-expiring hai; included promotional allowance period end par expire ho sakti hai. Final policy sale se pehle publish ho aur ledger mein credit lots/expiry track hon.

## 11. Database Changes Ka Naksha

Exact migration names actual database baseline inspect karne ke baad choose hon. Existing tables ko duplicate create karne ke bajaye extend/reuse karein.

- `tenants`, `users`, `workspaces`: customer status, normalized username, optional verified contact fields, membership model, forced password change aur authentication version.
- `agents`: canonical `tenant_id` aur user membership mapping; SignalWire identity/number ownership.
- `sessions` / activation-reset records: hashed secrets, expiry, revoked state aur token rotation relationship.
- `plans`, `plan_versions`, `customer_subscriptions`, `tenant_limits`: package definitions, immutable purchased snapshot, start/end dates aur feature flags.
- `payment_accounts`, `orders`, `order_items`, `manual_payment_requests`, `payment_receipts`, `payment_proofs`: receiving detail versions, quote, submitted evidence aur verified receipt.
- `wallets`, `wallet_ledger`, `credit_lots`, `usage_reservations`: unit-separated amounts, operation uniqueness, expiry aur settlement.
- `phone_numbers`, `number_assignments`, `provisioning_operations`: provider inventory, tenant ownership, rental period, purchase/release reconciliation.
- `calls`, `call_sessions`, `provider_events`, `usage_operations`: canonical tenant, provider IDs, legs, lifecycle, billing and idempotent events.
- `enrichment_jobs`, `enrichment_results`, `job_operations`: credit budget, rate version, partial completion, source and retention metadata.
- `api_keys`: lookup prefix, hash, tenant, scopes, expiry/revocation aur optional per-key caps.
- `audit_logs`, `outbox_events`: admin changes, durable work dispatch aur reconciliation evidence.

Constraints: unique normalized username; one wallet per tenant/unit; globally unique verified receipt reference within receiving account; unique provider event/operation ID; nonnegative available/reserved balances; composite tenant/record ownership constraints jahan munasib hon.

Calls/contacts ke existing numeric IDs aur SaaS UUIDs ko silently interchangeable na banayein. Existing global contact-phone uniqueness ko tenant-scoped uniqueness mein migrate karna hoga, warna do customers ka same lead ek hi row mein merge ho sakta hai.

Backfill: existing records ki ownership evidence se map ho; unmapped records admin-only quarantine hon. Arbitrary new customer tenant mein purana data copy na ho. Pehle nullable columns/backfill, phir verified non-null constraints aur indexes. Ledger opening balance existing verified balances se one-time migration event ho; old counters ko dobara credit na karein.

## 12. Backend Aur Frontend Work Map

### Existing Files Jahan Kaam Hoga

- `apps/api/src/index.ts`: canonical auth, route registration, legacy compatibility boundaries.
- `apps/api/src/routes/auth.ts`, `packages/auth/src/tenant_guard.ts`: username login, tenant context, current membership/status.
- `apps/api/src/calls-module/middleware/auth.js`: correct user/agent mapping aur tenant-aware permissions.
- `apps/api/src/routes/billing.ts`: manual billing mode integration; existing gateway flow feature-gated rahe, duplicate allocation na ho.
- `apps/api/src/routes/phone-numbers.ts`: real provisioning, balance/limit checks, mock production success removal.
- `apps/api/src/routes/google-maps.ts` aur Express Maps route: shared tenant-aware job service; old endpoint ko unmetered bypass na rehne dein.
- `apps/api/src/calls-module/routes/signalwire.routes.js`: authorization, signed events, ownership, reservations aur provider-controlled limits.
- `apps/calling-saas/src/App.tsx`: public/auth/customer/admin route boundaries.
- Existing frontend pages/services/dialer hook: unified API client, authenticated agent identity, real balances/history aur correct number contract.

### Proposed New Modules

Backend mein scoped `admin-customers`, `manual-payments`, `wallets`, `plans`, `usage`, `audit` routes/services. Queue workers mein Maps job execution, provider-event reconciliation, reservation recovery aur renewals. Existing local queue/database conventions reuse hon; naya framework sirf is plan ke liye add na ho.

Frontend mein `Login`, `ChangePassword`, `Billing`, `Usage`, `ApiKeys`, `AccountSettings` aur admin customers/customer-detail/payments/plans/numbers pages. Payment admin page mein proof, actual reference, amount comparison, approve/reject aur action history ek workflow mein hon.

### Proposed API Surface

Route names implementation mein existing prefixes ke saath finalize hon; behavior contract yeh hai:

- `POST /v1/auth/login`, `/change-password`, `/logout`, `/refresh`; `GET /v1/me`.
- `POST /v1/admin/customers`; customer limits/status update aur password reset actions.
- `POST /v1/billing/payment-requests`; own request list/detail; optional proof upload.
- `POST /v1/admin/payments/:id/approve` aur `/reject`; idempotency required on approval.
- `GET /v1/wallets`, `/v1/usage`, `/v1/billing/orders`.
- Number requests/list aur admin provisioning/assignment/renewal/release actions.
- `POST /v1/calling/sessions`; own session status/end; provider callbacks separate authenticated signature path.
- `POST /v1/maps/jobs`; own job status/results/cancel; export sirf permitted data ke liye.
- Tenant API key create/list/revoke; Maps scopes aur per-key limits.

Common errors: `401` no valid session, `403` permission/feature/account restriction, `409` state/idempotency conflict, `422` invalid data, `429` rate cap, `503` provider unavailable. Insufficient balance ka stable machine code `INSUFFICIENT_BALANCE` ho aur UI top-up link de. Cursor pagination aur payload size limits list endpoints par hon.

## 13. Step-by-Step Implementation Checklist

Har step ki completion par changed files, verification result aur remaining dependency yahin note karni hai. Aik step ke successful checks ke baad agla step uthaya jaye.

### Step 01 - Baseline Aur Final Configuration Contract

- [ ] Running entrypoint, route prefixes, proxy/origins, database schema aur migration runner map karein.
- [ ] Existing tests/build baseline capture karein; pre-existing failures alag note karein.
- [ ] JazzCash/WhatsApp placeholders, limits aur draft packages configuration define karein.
- [ ] Provider account/resale eligibility aur Maps data feature requirements verify karne ke owners/dependencies record karein.

Acceptance: existing customer paths aur schemas ka confirmed map ho; koi unknown default tenant migration mein assume na ho.

### Step 02 - Tenant Schema Aur Migration

- [ ] Tenant/user/agent relationships aur customer-owned tables extend karein.
- [ ] Backup + staging migration rehearsal; existing records ownership backfill karein.
- [ ] Tenant indexes, constraints aur unmapped-data quarantine add karein.

Acceptance: A aur B tenant fixtures mein contact/agent/call IDs cross-link nahin hote; existing mapped data apni ownership retain karta hai.

### Step 03 - Canonical Authentication Aur Roles

- [ ] Username login, temporary passwords, forced change, real sessions aur revocation implement karein.
- [ ] Fixed tenant, default manager aur first-agent fallbacks replace karein.
- [ ] Platform admin bootstrap/MFA aur tenant owner/agent authorization add karein.
- [ ] Legacy read/write/calling/worker routes par same tenant enforcement karein.

Acceptance: tampered/expired token reject; member admin nahin ban sakta; suspended user ka existing session paid action nahin kar sakta; A ko B ka data/API/socket access nahin.

### Step 04 - Admin Customer Provisioning

- [ ] Admin customer list/detail/create aur generated username/password build karein.
- [ ] Tenant + user + workspace + agent mapping transaction mein create ho.
- [ ] Required numbers, seats, destinations, concurrency aur daily volume fields save hon.
- [ ] Suspend/reactivate/reset actions audit log ke saath hon.

Acceptance: admin se naya account create karke customer first password change ke baad sirf apna blank workspace dekhe; retry duplicate account na banaye.

### Step 05 - Ledger, Plans Aur Rate Versions

- [ ] Unit-separated wallets, reservations aur immutable ledger build karein.
- [ ] Versioned plan/order snapshots aur expiry/renewal rules implement karein.
- [ ] Concurrent debit, reserve/capture/release aur reversal invariants verify karein.

Acceptance: simultaneous operations combined balance se zyada reserve nahin kar sakte; ledger se displayed balance reproduce hota hai.

### Step 06 - JazzCash Aur WhatsApp Billing

- [ ] Public/contact aur logged-in payment request screens; configurable receiving details.
- [ ] Admin proof attachment/review/actual receipt confirmation flow.
- [ ] Atomic approve + grant + audit; rejection, duplicates, partial amount aur refund records.
- [ ] Customer payment status/history aur daily reconciliation report.

Acceptance: test receipt approve se exactly one allocation; same transaction doosre order par credit na de; pending screenshot se balance na badhe.

### Step 07 - Phone Number Lifecycle

- [ ] Provider-backed availability/rates aur admin-controlled purchase/assignment.
- [ ] Number count limits, tenant ownership, rental reservations aur retries/reconciliation.
- [ ] Renewal due/grace/release states aur production mock removal.

Acceptance: unpaid/over-limit request provider purchase trigger na kare; provider success + DB failure recover ho; A ka number B choose na kar sake.

### Step 08 - Paid Calling Enforcement

- [ ] Backend call authorization, slot/destination/attempt reservations aur rate snapshot.
- [ ] Provider-controlled call permissions/duration; generic-token bypass close karein.
- [ ] Signed lifecycle events, billable legs, settlement aur stale-session recovery.
- [ ] Browser dialer identity, number selector, errors aur real history integrate karein.

Acceptance: balance zero/suspended/over-cap call provider tak nahin jati; do browsers concurrency cap nahin todte; browser close hone par call maximum duration enforce hoti hai; duplicate callback double debit nahin karta.

### Step 09 - Maps Jobs Aur Credit Metering

- [ ] Mounted canonical Maps endpoint aur shared UI/API job service.
- [ ] Reserve-before-dispatch queue, page/details operations, partial results aur cancellation.
- [ ] Bounded retries, idempotency, provider error states, caps aur retention/attribution policy.
- [ ] Legacy Maps route ko same service par route ya inaccessible karein.

Acceptance: 16-credit example mein 16 settle; rejected request zero; partial job remaining credits release; retries same logical operation ko dobara charge na karein; unknown outcome reconciled ho.

### Step 10 - Customer API Access

- [ ] Hashed API keys, one-time secret display, scoped permissions, rotate/revoke.
- [ ] Per-key plus tenant-wide quotas aur same Maps wallet charging.
- [ ] Request/status examples aur stable errors; provider key hidden rahe.

Acceptance: API key se admin/calling permissions automatically na milen; revoked key fail ho; UI aur API concurrent spend shared cap follow karein.

### Step 11 - Customer Dashboard Aur Complete UI

- [ ] Demo metrics, hardcoded name/prices aur inactive buttons replace karein.
- [ ] Live package, wallets, limits, jobs/calls/payment history aur settings.
- [ ] Empty/loading/error/pending/expired states; billing access expiry ke baad bhi.
- [ ] Desktop aur mobile browser checks, text/controls overlap aur auth redirects verify karein.

Acceptance: new account zero actual usage dekhe; payment/usage ke baad numbers update hon; refresh par history persist ho; supported workflows end-to-end complete hon.

### Step 12 - Integration Verification Aur Recovery

- [ ] Fake provider adapters + real PostgreSQL/queue integration scenarios.
- [ ] Duplicate payment, concurrent spends, forged callbacks, cross-tenant IDs aur legacy bypass checks.
- [ ] Worker/process restart, missing callback, unknown provider timeout aur queue redelivery drills.
- [ ] Direct API typecheck, frontend production build aur focused browser E2E.
- [ ] Controlled provider test numbers par authorized integration test; real customer outreach is test ka hissa nahin.

Acceptance: account creation -> payment -> grant -> number -> call -> settlement aur Maps UI/API flow verified; known release blockers resolved hon.

### Step 13 - Small Community Pilot Aur Launch

- [ ] Staging dry run ke baad small invite-only customer group; suggested 3-5 accounts, final count owner choose kare.
- [ ] Low initial provider spend/concurrency caps, daily payment/cost/ledger checks.
- [ ] Provider eligibility, data usage policy aur final pricing/terms configuration complete ho.
- [ ] Support contact, password recovery, failed-payment/provisioning aur renewal runbooks ready hon.
- [ ] Pilot evidence ke baad enrollment expand karein.

Acceptance: verified payment-to-service journey, tenant isolation aur provider cost reconciliation stable hon; unresolved billing bypass ke saath paid launch na ho.

## 14. Deployment, Recovery Aur Operations

Calling SaaS aur existing CRM shared backend use karte hain, is liye new features flags se expose hon: manual billing, customer onboarding, metered calls, metered Maps aur customer API. Legacy private CRM ka unmetered route paid customer token se reachable na rahe.

Staging mein DB backup/restore aur migration test; additive migrations pehle, new code baad, data verification ke baad constraints tighten hon. Repository docs deploy scripts ke bare mein mukhtalif guidance deti hain; implementation ke waqt actual active deployment path verify karein. Is document ko deployment authorization na samjhein.

Rollback mein new operations pause hon, existing provider calls settle/reconcile hon aur database ledger preserve rahe. Payment/call ledger drop ya reverse migrations se historical money records delete na hon. Old unmetered code ko new paid accounts ke saamne restore na karein.

Monitoring mein failed login spikes, failed approvals, duplicate receipts, wallet invariant mismatch, stuck reservations, unknown calls, number renewal failures aur provider-cost variance shamil hon. Sensitive credentials/proofs ordinary logs mein na hon. Provider budget cap hit ho to new operations pause hon aur affected customers ko accurate status mile.

Daily admin routine: receipts match karein, pending activations resolve karein, low provider balance/renewals dekhein aur ledger/provider differences review karein. Manual billing mode mein customer payment aane se provider balance automatically fund nahin hota; owner ko telecom/Google billing funding alag manage karni hogi.

## 15. Overall Completion Criteria

- [ ] Admin bina direct database editing ke username aur unique temporary password wala account bana sakta hai.
- [ ] Customer actual received JazzCash payment ke approval ke baad correct package/balance leta hai.
- [ ] Har customer ke data, phone numbers, sessions aur API requests isolated hain.
- [ ] Caller IDs, seats, concurrent calls, daily destinations/attempts aur spending limits backend/provider se enforce hote hain.
- [ ] Calling aur Maps charges explainable, reproducible aur duplicate-safe ledger mein hain.
- [ ] Customer UI aur API same credits use karte hain; provider secrets hidden hain.
- [ ] Expiry, renewal, password reset, reversal aur provider failure workflows tested hain.
- [ ] Provider/account eligibility aur intended Maps display/storage/export scope verified hai.
- [ ] Production build/typecheck aur high-risk integration checks pass hain; deployment recovery rehearsed hai.

## 16. Progress Record

8 September 2026: local frontend, Fastify/Express auth paths, billing, Maps, phone provisioning aur dialer code inspect kiya. Official Google Places policy/billing references check kiye. Implementation plan tayyar kiya. Steps 01-13 pending hain; application implementation abhi start nahin hui.

Agla authorized implementation session Step 01 se shuru hoga. Har completed step ke neeche date, changed files, checks aur unresolved decisions record honge.
