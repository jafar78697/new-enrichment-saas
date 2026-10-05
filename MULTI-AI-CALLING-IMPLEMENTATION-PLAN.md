# Multi AI Calling — Implementation Plan

## 1. Maqsad

8 SignalWire numbers ko 4 fixed pairs mein divide karna hai. Har pair ek independent AI calling lane hoga:

- Lane 1: Agent 1 + Niche 1 + 2 numbers
- Lane 2: Agent 2 + Niche 2 + 2 numbers
- Lane 3: Agent 3 + Niche 3 + 2 numbers
- Lane 4: Agent 4 + Niche 4 + 2 numbers

Har lane ek waqt mein sirf ek live call karega. Pair ke dono numbers calls ke darmiyan round-robin rotate honge. Pura system maximum 4 simultaneous live calls karega. 8 simultaneous calls is design ka hissa nahi honge.

## 2. Current System Mein Kya Badalna Zaroori Hai

Current code ko review karne par yeh blockers mile:

1. `outbound-caller.js` tenant-level lock aur tenant-level active-call check use karta hai. Is wajah se ek tenant ki sirf ek call chal sakti hai.
2. 8 numbers `SIGNALWIRE_PHONE_NUMBER` environment variable ki ek global list mein hain. Kisi number ka niche ya agent ke saath durable relation nahi hai.
3. Number rotation total attempted leads ke count se calculate hoti hai. Parallel workers mein yeh race condition create karegi.
4. `ai_calling_controls` tenant-level single on/off state rakhta hai. Har lane ko separately start, pause aur drain nahi kiya ja sakta.
5. Current status endpoint sirf ek `activeCallSid` return karta hai.
6. Current browser call-monitor socket ek waqt mein sirf ek call room join karta hai; doosri call subscribe karne par pehli leave ho jati hai.
7. Deepgram bridge ka global `AI_MAX_ACTIVE_CALLS` abhi production mein single-call behavior ke liye bana hai.
8. Agent prompt mein plumbing instructions hard-coded hain. Multi-niche mode mein har lane ka script isolated aur versioned hona chahiye.

Sirf `AI_MAX_ACTIVE_CALLS=4` karna unsafe hoga. Queue collision, wrong script, wrong caller ID aur mixed live monitoring ho sakti hai.

## 3. Product Interface

Sidebar mein naya section:

**Multi AI Calling**

Page par 4 lane cards hongi. Har card mein:

- Agent slot: Agent 1, Agent 2, Agent 3, Agent 4
- Niche dropdown
- Phone Pair A aur Phone Pair B
- Cold calling script editor
- Voice selection
- Assigned leads count
- Current caller ID
- Current live lead
- Queue count
- Last result
- Start, Pause, Drain aur Edit buttons
- Lane health: Ready, Calling, Paused, Error

### Niche Assign Flow

1. User `Assign Niche` press karega.
2. Niche select karega.
3. System pehla empty lane choose karega.
4. System next 2 healthy, unassigned SignalWire numbers us lane ko allocate karega.
5. System ek outbound agent config create ya attach karega.
6. Script editor open hoga. User apni cold calling script paste karega.
7. Save par niche, agent, script aur number pair ek transaction mein assign honge.
8. Paanchvi niche par system save nahi karega aur message dega: `4 agents already assigned. Pause or remove one lane before adding another niche.`

Niche assign karne se leads automatically call nahi hongi. User lane ko explicitly `Start` karega.

## 4. Cold Calling Script Ka Model

User ko ek bada unsafe system prompt edit nahi karna padega. UI mein yeh fields hongi:

- Opening line
- Offer / value proposition
- 2–4 qualifying questions
- Common objections aur short answers
- Meeting / follow-up CTA
- Price line, agar niche ke liye use karni ho
- Full custom instructions (optional)

Backend in fields ko protected safety prompt ke saath compile karega. System rules user script se separate rahenge:

- Prospect ki baat poori sunna
- Voicemail aur IVR detection
- `press 1/2` par IVR result
- `please hold` aur `recorded for quality` par human ka wait
- Do-not-call ko foran respect karna
- Result aur transcript save karna
- Wrong niche ya previous company name reuse na karna

Har script ka version save hoga. Har call session mein `script_version_id` store hoga, taake baad mein pata chale kis script ne result diya.

## 5. Database Design

### `ai_calling_lanes`

- `id`
- `tenant_id`
- `slot_number` (1–4)
- `name`
- `niche_id`
- `agent_config_id`
- `script_version_id`
- `status` (`draft`, `ready`, `running`, `paused`, `draining`, `error`)
- `max_concurrent_calls` (default 1)
- `rotation_cursor`
- `cooldown_seconds`
- `last_error`
- timestamps

Constraints:

- `(tenant_id, slot_number)` unique
- ek active niche ek hi active lane mein
- ek agent ek hi active lane mein
- maximum 4 active lanes per tenant API transaction mein enforce hon

### `ai_calling_lane_numbers`

- `lane_id`
- `phone_number_id`
- `position` (1 ya 2)
- `enabled`
- `health_status`
- `cooldown_until`
- `attempt_count`
- `answered_count`
- `last_used_at`

Constraints:

- ek active number ek hi active lane mein
- `(lane_id, position)` unique

### `ai_calling_scripts`

- `id`
- `tenant_id`
- `niche_id`
- `version`
- structured script fields
- compiled prompt
- `is_active`
- timestamps

### `ai_call_queue_items`

- `id`
- `tenant_id`
- `lane_id`
- `lead_id`
- `state` (`queued`, `dialing`, `streaming`, `completed`, `failed`, `cancelled`)
- `priority`
- `attempt_number`
- `next_attempt_at`
- `caller_number_id`
- `session_id`
- timestamps

Unique constraint active queue states mein same lead ko do lanes se call hone se roke.

### Existing Tables Ke Additions

`ai_call_sessions`:

- `lane_id`
- `phone_number_id`
- `script_version_id`
- `provider_request_id`

`phone_numbers`:

- outbound health aur reputation metadata ke liye optional fields ya separate health table

## 6. Backend APIs

- `GET /v1/multi-calling/lanes`
- `POST /v1/multi-calling/lanes/assign`
- `PATCH /v1/multi-calling/lanes/:id`
- `DELETE /v1/multi-calling/lanes/:id`
- `POST /v1/multi-calling/lanes/:id/start`
- `POST /v1/multi-calling/lanes/:id/pause`
- `POST /v1/multi-calling/lanes/:id/drain`
- `POST /v1/multi-calling/start-all`
- `POST /v1/multi-calling/pause-all`
- `GET /v1/multi-calling/status`
- `GET /v1/multi-calling/numbers/available`
- `POST /v1/multi-calling/scripts/preview`

Assign endpoint ek database transaction use karega. Agar niche, agent ya dono numbers mein se koi already assigned ho to poora request rollback hoga.

## 7. Four-Lane Worker

Current tenant-wide worker ko lane scheduler mein convert karna hai:

1. Har tick par running lanes load hongi.
2. Har lane ke liye alag PostgreSQL advisory lock hoga.
3. Lane sirf tab next lead claim karega jab us lane ki koi active call na ho.
4. Queue item `FOR UPDATE SKIP LOCKED` se claim hoga.
5. Rotation cursor transaction ke andar increment hoga.
6. Assigned pair ka next healthy number select hoga.
7. SignalWire call create hogi aur lane/session IDs webhook parameters mein jayengi.
8. Terminal callback ke baad session finalize hoga.
9. Chhota cooldown complete hone ke baad usi lane ki next lead chalegi.

Ek lane ki error doosri 3 lanes ko stop nahi karegi. `Pause All` sab lanes ko pause karega; `Pause Lane` sirf selected niche ko.

## 8. Frequency Aur Concurrency

Recommended first production setting:

- 4 lanes
- 1 active call per lane
- maximum 4 simultaneous calls
- har lane mein terminal callback ke baad 3–5 second cooldown
- global start staggering: ek hi millisecond mein 4 calls create na hon; starts ko approximately 1 second apart dispatch karein
- busy/no-answer par immediate redial nahi; same lead ke liye retry policy alag ho

Deepgram ki official Pay As You Go Voice Agent limit North America mein up to 45 concurrent connections per project hai, isliye 4 calls Deepgram ki published limit ke andar hain. SignalWire ki exact production CPS/concurrency account-specific verify karni hogi. Account capacity preflight fail ho to system lane start block karega aur clear provider error dikhayega.

## 9. Number Pair Rotation

Har lane ka apna persisted cursor hoga:

- Call 1 -> Number A
- Call 2 -> Number B
- Call 3 -> Number A
- Call 4 -> Number B

Rules:

- same number do lanes mein nahi hoga
- failed number temporarily cooldown par jayega
- provider failure number health mein count hoga; prospect busy/no-answer number failure nahi hoga
- number disabled ho to pair ka doosra number temporary use ho sakta hai, lekin UI warning dikhayegi
- caller ID ko niche ke saath stable rakha jayega; har call par poore 8 numbers mein random jump nahi hoga

## 10. Browser Aur Live Listen

Calls browser se execute nahi hongi. Calls Google VM, SignalWire aur Deepgram ke darmiyan server-side chalengi. Isliye ek browser se 4 agents chalne mein basic calling issue nahi aayega, aur browser close hone par bhi calls continue hongi.

Browser monitor ko redesign karna hoga:

- status endpoint ek ke bajaye 4 active calls return kare
- Socket.IO monitor ek socket par 4 call rooms subscribe kar sake
- page par 4 live lane tiles hon
- sab lanes ki transcript live aa sakti hai
- default mein sirf selected lane ka audio play ho
- user doosri lane par click karke Listen Live switch kare
- 4 calls ka audio ek saath mix na kiya jaye

## 11. Deepgram Bridge Changes

- global active-call cap ko 4 lane sessions ke liye configure karna
- har call ka independent Deepgram WebSocket aur context
- context mein `lane_id`, `agent_id`, `niche_id`, `script_version_id`, `number_id`
- transcripts aur tool results correct lane/session mein save hon
- ek call ka barge-in, clear-audio, end-call ya voicemail detection doosri call ko affect na kare
- Deepgram 429 ya provider error par sirf affected lane pause/backoff ho
- har non-audio WebSocket event append-only observability log mein save ho

## 12. Results Aur Reporting

Har lane ke liye:

- attempts
- connected calls
- human conversations
- voicemail
- IVR
- no answer / busy
- interested
- not interested
- follow-up
- average talk time
- script version
- caller number
- error rate

Result AI se aaye to green AI label rahega. System confidence low ho to `Needs Review` result hoga; galat confident result force nahi hoga.

## 13. Implementation Phases

### Phase 0 — Stabilize and Snapshot

- current single-agent flow ka production snapshot
- current 8 SignalWire numbers sync aur verify
- current active calls zero karna
- feature flag `MULTI_AI_CALLING_ENABLED=false`

### Phase 1 — Database and APIs

- migrations
- four-slot validation
- niche/agent/number transaction
- script versioning
- lane status endpoints

### Phase 2 — Worker Isolation

- per-lane locks
- durable queue items
- persisted number rotation
- independent pause/drain/recovery

### Phase 3 — Voice Bridge Concurrency

- 4 isolated media sessions
- correct lane context
- active-call cap 4
- per-session logging and cleanup

### Phase 4 — Multi AI Calling UI

- new sidebar page
- four lane cards
- niche assignment wizard
- number pair picker
- script editor and preview
- start/pause controls

### Phase 5 — Multi-call Monitoring

- four active calls status
- multi-room socket subscription
- one selected audio stream
- four live transcripts and final result notices

### Phase 6 — Controlled Rollout

1. One lane with two numbers
2. Two lanes in parallel
3. Four lanes with test leads
4. Four lanes with real campaign volume

Har stage tab tak next stage par nahi jayega jab tak calls, transcripts, results aur stop controls acceptance criteria pass na karein.

## 14. Acceptance Criteria

- 4 niches assign hoti hain; 5th niche blocked hoti hai.
- Har niche ke saath correct agent, correct script aur exactly 2 numbers save hote hain.
- Maximum 4 live calls; maximum 1 live call per lane.
- Same lead do lanes se call nahi hota.
- Same phone number do lanes mein assign nahi hota.
- Lane 1 pause karne se Lane 2–4 continue karti hain.
- Restart ke baad rotation cursor aur queue state lose nahi hoti.
- Har call ka transcript, result, script version, niche, agent aur caller ID correct session mein hota hai.
- Browser close hone par campaign continue hota hai.
- Browser mein ek selected call ki dono sides ki audio sunai deti hai.
- `Pause All` nayi calls rokta hai aur active calls ko configured drain/end behavior deta hai.
- Deepgram ya SignalWire error rapid redial loop create nahi karta.

## 15. Rollback

Multi-agent system feature flag ke peeche rahega. Rollback par:

- new lane scheduler stop
- old single-lane worker re-enable
- database records preserve
- existing lead results aur transcripts delete nahi honge
- numbers ko automatically release nahi kiya jayega

## 16. Final Recommendation

Is feature ko 4 independent lanes ki tarah build karein, na ke ek existing worker ko sirf 4 concurrent calls ki permission dekar. Do numbers per lane rotate hon, ek call per lane active ho, scripts versioned hon, aur browser sirf control/monitoring surface rahe. Yeh design four niches ko parallel chalata hai aur call, number, script aur result mixing se bachata hai.

