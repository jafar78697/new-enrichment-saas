# Multi AI Lanes — Frontend aur Calling Solution

Date: 4 October 2026

Scope: sirf review aur proposed solution. Is document se app code, database, provider configuration ya deployment change nahi hota.

## 1. Review mein kya verify hua

Project: `/home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas`.

- Frontend mein four lane cards, assignment modal, published-script selector, voice-profile selector aur A/B phone selectors hain.
- Dashboard ab five-second polling karta hai.
- Updated cards mein live transcript, prospect details, queue preview aur Interested/Not Interested/Voicemail/No Answer counters hain.
- Latest source mein callback URL aur provider-error column fix ho chuke hain; fallbackOutcome ab cleanup ke outer scope mein hai.
- Actual production page ko browser se khola, lekin sign-in screen mili. Authenticated visual behavior verify nahi hua.
- Live VM credentials aur provider authentication is review mein verify nahi hue. Code integration present hona account healthy hone ka proof nahi hai.

## 2. Abhi frontend misleading kyun hai

`apps/web/src/pages/multi-ai/components/LaneCard.tsx` ab `lane.status === 'running'` ko `isLive` maanta hai. Running campaign bina active call ke bhi live animation dikha sakti hai. Pause karte hi monitor hat jata hai, jabke current phone call abhi chal sakti hai.

Solution: campaign status aur phone-call status do alag values rakho.

- Campaign: ready, running, paused, stopping, error.
- Call: idle, dialing, ringing, answered, waiting_for_human, speaking, listening, ending, ended, failed.
- Audio monitor: disconnected, connecting, subscribed, receiving_audio, muted, error.

Green live badge sirf actual connected call ke liye ho. Ringing ko ringing likho. Queue waiting ko waiting likho. Audio animation incoming frames se chale; sirf unmute button se nahi.

## 3. Page ka proposed layout

Top row mein teen useful panels:

1. SignalWire account: expected space, masked project ID, verified voice-number count, last successful check, exact error.
2. Deepgram account: configured/verified/error, effective STT model, TTS voice, last successful session/check.
3. Campaign summary: active agents out of four, active calls, queued leads, Stop All.

Status values: Not configured, Configured but unverified, Verified, Error. Existing keys ko frontend tak kabhi return na karo. SignalWire DB number list ko provider account ownership verification se distinguish karo.

Four cards hamesha dikhein. Har configured card mein:

- Agent name aur niche name.
- Assigned script name/version.
- Caller numbers A/B; current caller aur next caller.
- STT provider/model; TTS voice; configured speed aur effective speed.
- Queue count, current company/phone, actual call state aur connected duration.
- Start Agent, Pause After This Call, Stop Agent Now, Listen, Configure.
- Separate End Current Call; ye campaign ko stop nahi karta.
- Results, Queue, History, Settings tabs ya detail drawer.

Start All optional convenience action ho, lekin default behavior har agent ko separately start karna ho.

## 4. Assignment flow

Configure kholne par current values prefill hon. Current modal har field reset karta hai aur assigned numbers ko dropdown se exclude karta hai, isliye existing pair edit/review karna mushkil hai.

Five-step flow:

1. Agent display name aur niche choose karo.
2. Published script choose karo; opening aur example conversation preview dikhao.
3. Number A aur B choose karo. Current lane ke existing numbers available rahen, doosri lane ke numbers locked hon.
4. Voice/STT/TTS/speed choose karo; unsupported provider options disabled hon.
5. Eligible lead count aur configuration review; save karo, automatic start mat karo.

Active call ke dauran niche/pair/script reassignment reject karo ya next-call configuration ke taur par save karo. Purani niche ki pending queue ko nayi niche ke saath reuse mat karo.

## 5. Different niches aur same niche, dono modes

Different mode: Agent 1 Plumbing, Agent 2 HVAC, Agent 3 Roofing, Agent 4 Electrical. Har lane ki apni script aur exclusive number pair.

Same mode: chaaron Plumbing par kaam karein; sab same script use kar sakte hain ya approved variants. Har agent ko different lead milni chahiye.

Abhi same niche block hoti hai:

- `apps/api/src/routes/multi-calling.ts` mein NICHE_IN_USE check.
- `apps/api/src/db/migrations/030_multi_ai_calling.sql` mein active-niche unique index.

Nayi migration mein niche uniqueness remove karo; phone-number exclusivity retain karo. Four-slot maximum retain karo. Shared voice profile allowed ho, lekin har call ki history/timers/context independent hon.

Shared-niche queue ke liye recommended design:

- Ek niche dispatch service eligible leads ko running lanes mein distribute kare.
- Existing `(tenant_id, lead_id)` active-queue uniqueness retain karo.
- Assignment deterministic/fair round robin ya least queued lane se ho.
- Ek lane assignment ke waqt sari niche leads claim na kare; warna doosri same-niche lanes empty rahengi.
- Claim transaction mein `FOR UPDATE SKIP LOCKED`, lead eligibility aur lane status dobara check hon.
- Same phone duplicate leads mein ho to normalized-phone level par simultaneous dialing block karo.
- Har lane: one active call. Four lanes: up to four concurrent calls, subject to verified provider capacity.
- Pair rotation: A, B, A, B. Two numbers ek lane mein do simultaneous calls ka matlab nahi.

## 6. STT/TTS aur Google ka matlab

Agar 'Google SSTV' se murad Speech-to-Text ya Text-to-Speech hai: STT customer ki awaz ko text banata hai; TTS AI ke text ko awaz banata hai.

Current code Deepgram listen aur Deepgram speak use karta hai. Google speech adapter current lane configuration mein implemented nahi mila. Google LLM/think selection ko Google STT/TTS samajhna ghalat hoga.

Recommended initial setup: existing Deepgram path stabilize karo; har agent ka separate session, voice setting aur transcript rakho. Four agents ke liye four separate Deepgram accounts zaroori nahi; shared account ki concurrent-session capacity verify karni hogi.

Google speech add karni ho to uske liye separate supported pipeline/adapter design chahiye: telephony media -> streaming STT -> turn detection -> LLM/tools -> streaming TTS -> telephony output. Audio formats, barge-in, playback clearing, machine detection aur live-monitor dono speakers ke liye preserve karo. Sirf dropdown add karna integration nahi hai.

Official references:

- https://developers.deepgram.com/docs/voice-agent-stt-models
- https://developers.deepgram.com/docs/voice-agent-settings
- https://developers.deepgram.com/docs/voice-agent-llm-models

## 7. Provider-account verification

Current wiring:

- `apps/api/src/voice-agent/config/env.js`: DEEPGRAM_API_KEY aur SignalWire project/token/space settings.
- `apps/api/src/workers/multi-lane-outbound-caller.js`: SignalWire RestClient aur lane-number lookup.
- `apps/api/src/voice-agent/providers/deepgram-agent.js`: effective listen/think/speak settings.
- `apps/web/src/services/deepgramAgentsApi.ts`: existing agent status/list/preview/history APIs.

Proposed authenticated manager-only endpoint: GET `/v1/multi-calling/integrations/status`. Return sanitized provider identity, configured/verified flags, effective settings, lastCheckedAt aur errorCode. Provider check ko cache karo; polling har five seconds provider request na kare.

SignalWire check:

- Running VM process ki effective settings read karo; local env presence se conclusion mat nikalo.
- Expected space ko user-approved account se compare karo.
- Read-only provider request se authentication aur actual purchased voice numbers verify karo.
- Selected pair ke dono numbers same intended account ke hain aur voice-capable hain.
- Public HTTPS/media callback host current VM deployment ko route karta ho.

Deepgram check:

- Effective runtime key configured hai ya nahi.
- Low-impact authorized account/status check available ho to use karo; otherwise recent successful session evidence se status explain karo.
- Paid voice-session probe ko normal page polling ka hissa mat banao.
- Actual effective voice/model/speed aur exact provider errors display karo.

## 8. Call lifecycle aur next-call reliability

Session creation mein lead ID, agent ID, lane ID, selected caller ID, script version/hash, voice/settings snapshot aur tenant ID capture hon. Current worker lead ID capture karta hai, lekin agent lookup live lane par fallback karta hai; agent settings immutable snapshot banana abhi bhi zaroori hai.

Provider SID ko create response milte hi `signalwire_call_sid` mein save karo. Sirf TwiML request par SID save karne se busy/no-answer call jo media connect nahi karti, callback matching miss kar sakti hai.

One canonical finalizer ho jo provider terminal callback aur media cleanup dono se idempotently invoke ho:

1. Session terminal state/outcome settle.
2. CRM lead result aur note update.
3. Queue terminal state update.
4. Transcript save aur recording availability reflect.
5. Lane ka next_dial_after update.
6. Browser ko call-ended/result event.
7. Next call fresh independent session mein start.

No-answer/busy call mein media cleanup nahi aati; callback must finalize queue. Completed queue item ke bawajood CRM stage assigned reh gayi to refill use dobara queue kar sakta hai. Refill eligibility ko settled outcome, previous attempts aur due follow-up se decide karo.

Old single-agent worker aur multi-lane worker same leads ke liye compete na karein. Legacy worker ko lane-assigned leads exclude karna hoga ya multi-mode mein legacy campaign worker disable ho.

## 9. Controls ka exact behavior

- Start Agent: saved lane queue start; browser sirf control/monitor kare.
- Pause After This Call: new claims rok do; current call/monitor continue.
- Stop Agent Now: lane stop flag persist, current call terminate, pending timers cancel, next dial block.
- End Current Call: current call end; running lane next lead continue kare.
- Stop All: chaaron lanes stop aur active calls end.

Worker lock lene ke baad lane status freshly read kare. Tick ke shuru ka stale status stop button ke baad bhi dial karwa sakta hai.

## 10. Audio aur results

All four transcripts dikha sakte hain. Browser mein ek selected call ka audio default ho; Listen doosri lane par switch karne se pehli mute ho. Isse awazein overlap nahi hotin. Server calls unaffected rahen.

Current monitor hook volume toggle par socket effect dobara chalata hai. Socket subscription ko volume state se separate karo; mutable audio playback refs use karo. Existing `clear_audio` event par scheduled AI audio clear karo. AI/customer audio ko independent timing streams se mix karo; ek shared append-only playback cursor overlap ko artificial delay bana sakta hai.

Har call ke baad automatic result toast: company, caller, Voicemail/IVR/No Answer/Interested/Not Interested/Follow-up, short reason, history link. Green AI result. Manual-result popup automatically wapas add na karo.

History mein customer + AI transcript, outcome evidence, confirmed email/contact name, follow-up time/timezone, provider SID, duration aur errors. Audio recording aur STT alag cheezen hain: transcript present hone ka matlab recording stored hona nahi. Recording available/missing clearly label karo.

## 11. API aur UI contracts

Lane response mein configuration, campaign status, activeCall object, queue counts, result counts, latest result aur lastError ho. Active call campaign paused hone par bhi return ho jab tak actual call terminal nahi.

Configure API ko current pair IDs, niche/script/profile settings return karne chahiye. Frontend polling failure ko empty lanes ki tarah render mat karo; visible error banner aur retry ho.

Server script validator: typed node payloads, one Start, valid edges/handles, reachable branches, no ambiguous conditions, allowed outcomes. Compiler condition boundaries aur branch rejoin explicitly describe kare. Latest DFS/sourceHandle labels improvement hain, lekin complete graph semantics aur merge validation ka replacement nahi.

Script-delete query abhi `ai_multi_lanes` reference karti hai; actual `ai_calling_lanes` aur active_script_version_id join use karo. Publish transaction/idempotency aur one effective published version/explicit latest version selection define karo.

## 12. Coding agent ke liye implementation order

1. Integrations status aur frontend visible errors.
2. Actual-call state ko running campaign se separate karo; controls/monitor fix.
3. Canonical finalizer aur SID persistence; no-answer call end-to-end verify.
4. Same-niche support migration + shared fair lead dispatcher.
5. Configure prefill aur per-agent voice/script/settings.
6. Script validation/compiler aur versioning complete.
7. History, automatic results, transcript/recording/follow-up details.
8. One agent, then two agents, then four agents controlled rollout.

## 13. Completion acceptance

- Four agents configure aur separately start/stop ho sakte hain.
- Different niches aur same niche dono work karein.
- Same lead/phone ko simultaneously double-call na ho.
- Eight owned voice numbers verified; har pair A/B rotate kare.
- Ringing ko connected label na diya jaye.
- Pause ke baad current call visible; Stop ke baad next call na ho.
- Busy/no-answer bina media session bhi finalize ho.
- Human rejection Not Interested; voicemail Voicemail; hold/recording announcement wait.
- Har result correct CRM lead/lane mein save ho.
- AI aur customer audio selected lane mein suna ja sake.
- Transcript har call mein separately available; recording status explicit.
- Actual live integration identity verify hone ke baad hi Connected/Verified badge aaye.

## 14. Files to focus on

Frontend: `apps/web/src/pages/multi-ai/LaneDashboard.tsx`, `components/LaneCard.tsx`, `VisualScriptBuilder.tsx`, `apps/web/src/hooks/useCallMonitor.ts`, `apps/web/src/services/deepgramAgentsApi.ts`.

Backend: `apps/api/src/routes/multi-calling.ts`, `services/multi-calling/queue-service.ts`, `script-schema.ts`, `script-compiler.ts`, `workers/multi-lane-outbound-caller.js`, `voice-agent/routes/twiml.js`, `voice-agent/orchestrator/deepgram-signalwire-bridge.js`, `voice-agent/providers/deepgram-agent.js`.

Database: new migration to allow shared niches; retain exclusive numbers and lead dedupe; session settings snapshot/finalization fields as needed. Already applied migrations silently edit na karo.
