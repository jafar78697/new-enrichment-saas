# Multi AI Calling — detailed source review

Review date: 4 October 2026.

## Latest follow-up — implemented fixes ka recheck

Neeche original review historical snapshot hai. Latest local code ke mutabiq status:

- **Issue 1: normal multi-lane path addressed.** Worker ab lead_stage calling aur active_call_sid save karta hai, isliye ordinary No Answer callback lead ko no_answer kar sakta hai. Callback ka old CASE ab bhi calling-only hai; Assigned/dialing/ringing fallback behavior independently unchanged hai.
- **Issue 2: partial.** CRM ownership initialize hui, lekin callback-order gap baqi hai. Multi callback mein contactId raw_data/call_sid update ke baad session se resolve hota hai. Completed callback active_call_sid remove kar deta hai. Agar callback cleanup se pehle aaye aur CRM mein current call_sid nahi ho, bridge finalizer ka matching-SID WHERE fail karega. Session ka transcript-derived outcome CRM mein miss ho sakta hai. Durable call_sid/current_session_id aur shared finalizer chahiye; generic callback business outcome ko finalize hone se pehle erase na kare.
- **Issue 3: reported lookup gap addressed.** Dashboard aur Stop lists mein wait, identify, listening add hue hain. Transport/detection separation abhi complete nahi, magar pehle wala wait-call exclusion fix hua hai.
- **Issue 4: substantial improvement, partial.** Mute GainNode/ref se control hota hai; playAudioChunk stable hai; call change audio stop/reset karta hai; clear_audio handler add hua hai. Lekin clear_audio event AI speaker ke liye hai aur hook all sources, including customer, stop karta hai. Speaker-specific cancellation aur terminal/unmount cleanup chahiye. Natural socket reconnect par transcript ab bhi reset hoti hai; selected-audio-lane exclusivity bhi nahi mili.
- **Issue 5: reported legacy exclusion addressed.** Legacy worker lane-assigned leads exclude karta hai aur multi queue ke claimed/ringing/streaming states bhi check karta hai.
- **Issue 6: partial.** Returned SID catch scope mein hai aur DB failure par orphan hangup attempt hota hai. Hangup fail ho to sirf log karke queue retry aur session ended mark hota hai. Provider state unresolved hone tak retry hold/reconcile karo.
- **Issue 7: partial.** Dialing se pehle DNC/stage read add hui hai. Normalized-phone reservation/unique protection abhi nahi mili; do different lead IDs same phone ko parallel dial kar sakte hain. Lead FOR UPDATE SKIP LOCKED read BEGIN se pehle hai, isliye lock sirf us statement tak rehta hai. Lock-busy case ko Lead deleted/failed kehna bhi galat hai. Latest due time revalidation bhi read mein nahi hai.
- **Issue 8: authentication gap addressed.** Deepgram token route ab fastify.authenticate use karti hai. Role authorization aur provider response.ok handling abhi original recommendations ke mutabiq baqi hain.

Sabse pehle callback-order result gap, same-phone reservation, aur unresolved orphan retry fix karwao. Browser audio fixes ko actual call par verify karna baqi hai. Is follow-up mein app code modify/deploy aur real calls execute nahi kiye.

## Scope aur verdict

Updated local implementation review ki hai: lane assignment, queue refill/claim, number rotation, dialing, Stop/Pause, SignalWire callbacks, Deepgram bridge, outcome persistence, browser audio, provider status aur scripts.

App mein koi changes, migration, deployment ya outbound calls nahi kiye. Live VM configuration, provider account ki ownership, browser audio aur actual customer calls is review mein verify nahi hue. Neeche runtime examples code se nikle failure scenarios hain; production logs se confirmed incidents nahi.

Verdict: implementation improve hui hai. Happy path mein four lanes aur two-number rotation ka code maujood hai. Outcome finalization aur active-call tracking mein abhi blocking gaps hain. Bulk calling ko reliable kehne se pehle neeche wale P1 issues resolve karne chahiye.

Source root: `/home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas`.

## Jo fixes ab code mein maujood hain

- Script Publish ke return variables ab try block ke bahar declared hain; pehle wala scope bug resolve hai.
- Stop endpoint existing SignalWire client use karta hai aur general provider errors silently ignore nahi karta.
- Frontend Stop HTTP failure par alert karta hai.
- Worker dialing se pehle lane row ko transaction mein `FOR UPDATE` se lock karke status check karta hai. Stop ka lane UPDATE is lock ka wait karega; successful create-and-commit path mein pehle report hua Stop/dial timing gap address hua hai.
- Initial assignment aur automatic refill dono `LIMIT 3` use karte hain. Ek lane ab poora niche ek baar mein reserve nahi karti. Yeh bounded batches hain; formal fair dispatcher nahi.
- Paused lane ke liye bhi active-session query hoti hai.
- Campaign ON aur actual call ka display alag hua hai.
- Agent configuration ka per-session JSON snapshot save/load hota hai.
- Provider status real HTTP requests karta hai aur frontend `verified` read karta hai. Yeh credential/API-access check hai; live voice connection ki certification nahi.
- Callback session se missing `contactId` resolve karta hai aur terminal calls ke queue items finalize karta hai.
- Call transcripts DB mein append aur bridge cleanup par JSON file mein export hote hain.

## 1. P1 — No Answer lead Assigned reh kar dobara dial ho sakti hai

Evidence: [twiml.js:294](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/api/src/voice-agent/routes/twiml.js:294>), [worker refill:143](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/api/src/workers/multi-lane-outbound-caller.js:143>).

Callback WHERE mein `calling, assigned, dialing, ringing` allowed hain. Lekin SET ka CASE sirf `calling` ko `no_answer` karta hai. Multi-lane worker CRM lead ko dialing par `calling` set nahi karta. Assigned lead ka callback queue item complete karega, metadata update karega, lekin stage Assigned hi rahegi. Refill usi lead ko phir eligible samjhega.

Fix: terminal callback ko session ke lead_id aur tenant_id se finalize karo; matching current attempt ko no_answer stage do. Stage CASE aur WHERE ko consistent rakho. Retry chahiye to explicit retry policy aur scheduled_at se karo, Assigned reh jaane ke side effect se nahi.

Acceptance: Assigned lead par no-answer callback ke baad lead no_answer ho, active queue item terminal ho, aur refill usko bina explicit retry ke dobara na uthaye.

## 2. P1 — Transcript outcome session mein save ho kar CRM mein miss ho sakta hai

Evidence: [bridge final CRM update:774](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js:774>), [worker SID save:252](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/api/src/workers/multi-lane-outbound-caller.js:252>).

Bridge fallback transcript se not_interested/interested/followup classify kar sakta hai. Lekin final CRM update lead_stage calling/called aur CRM raw_data mein matching call_sid/active_call_sid maangta hai. Multi worker SID session mein save karta hai, CRM mein current SID/stage initialize nahi karta. Session-based callbacks ka initial raw_data update missing contactId resolve hone se pehle run hota hai. Isliye fallback outcome saved session mein ho sakta hai, magar lead filter/stage update skip ho sakta hai. Direct AI tool call aur terminal machine detector ke apne updates hain; issue un cases ka hai jahan fallback finalization required ho.

Fix: call attempt start par CRM mein current_session_id/current SID ki ownership establish karo. Ek shared idempotent finalizer session, queue item aur lead outcome update kare. Newer call ya manual edit ko old callback overwrite na kar sake. Generic telecom completed status ko AI business outcome par precedence na do.

Acceptance: prospect clear rejection bole aur AI tool fire hone se pehle hang up kare; session aur CRM dono Not Interested reflect karein. Callback aur bridge cleanup kisi bhi order mein aayen, result same rahe.

## 3. P1 — Hold par active call dashboard aur Stop se miss hoti hai

Evidence: [bridge detection:518](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js:518>), [lane active query:104](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/api/src/routes/multi-calling.ts:104>), [Stop active query:519](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/api/src/routes/multi-calling.ts:519>).

Please hold/recording announcement par detector action wait deta hai. Bridge wahi action session.call_state mein save karta hai. Dashboard aur Stop ki active-state lists mein wait/identify nahi hain. Human baad mein aaye to detection human branch call_state ko streaming wapas nahi karti. Call live reh kar card/SID lookup se gayab ho sakti hai. Stop campaign pause karega, lekin active call find na karne par hangup skip karega.

Fix: transport state aur answer/detection state ko alag columns mein rakho. Hold action transport streaming state ko replace na kare. Active lookup ko ended_at IS NULL aur session ownership par base karo; unknown nonterminal states ko silently idle na banao.

Acceptance: recorded-for-quality → hold → human flow mein same call SID aur monitor visible rahein. Hold ke darmiyan Stop current call end kare aur next call na shuru ho.

## 4. P2 — Mute/unmute reconnect, transcript reset aur stale audio

Evidence: [useCallMonitor.ts:86](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/web/src/hooks/useCallMonitor.ts:86>), [subscription reset:114](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/web/src/hooks/useCallMonitor.ts:114>), [effect dependencies:141](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/web/src/hooks/useCallMonitor.ts:141>).

playAudioChunk isVolumeOn par depend karta hai; socket effect playAudioChunk par depend karta hai. Mute toggle socket reconnect karta hai. monitor_subscribed transcript clear karta hai, aur server historical transcript replay nahi bhejta. Hook clear_audio event consume nahi karta, scheduled AudioBufferSource nodes track/stop nahi karta, aur call change par scheduling/audio context clean nahi karta. Purani audio next call ya unmute par sunai de sakti hai. Multiple lane audio independently enable ho sakti hai.

Fix: mute flag ref/gain node se control karo; socket lifecycle sirf call SID/account par ho. Scheduled sources track karo; clear_audio par AI sources cancel karo; terminal/call-change par dono speakers flush karo. Parent mein selectedAudioLaneId rakho taake ek waqt mein ek lane sunai de. Monitor connection aur telephone answer status alag show karo.

Acceptance: same call ke darmiyan mute/unmute transcript preserve kare; next call par purani audio na aaye; server clear_audio browser par apply ho.

Yeh live-listener bugs hain. In se prospect-side cutting ki exact wajah prove nahi hoti; uske liye real media/log evidence chahiye.

## 5. P1 — Legacy aur multi worker dono enabled hon to duplicate dialing ka risk

Evidence: [startup:361](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/api/src/index.ts:361>), [legacy queue exclusion:205](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/api/src/workers/outbound-caller.js:205>).

Startup dono workers ko independent flags se start kar sakta hai. Legacy worker queue exclusion queued/dialing/active check karta hai; multi queue claimed/ringing/streaming bhi use karti hai. Claimed window mein legacy worker same Assigned lead utha sakta hai. VM par dono actually enabled hain ya nahi, is review mein check nahi hua.

Fix: lane-assigned leads legacy worker se explicit exclude karo; shared lead/phone claim mechanism use karo. Startup flags ka compatibility check aur visible operating mode add karo.

Acceptance: dono modes accidentally enabled hon tab bhi lane lead ek hi provider call produce kare, ya configuration startup par reject ho.

## 6. P1 — Provider create successful, DB write failed: orphan call aur retry

Evidence: [worker create/catch:245](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/api/src/workers/multi-lane-outbound-caller.js:245>).

calls.create, SID writes aur transaction COMMIT ek catch share karte hain. Provider call create hone ke baad DB update/commit fail ho to catch rollback karke queue requeue aur session error/ended mark karta hai. Already-created phone call ko compensate/hangup/reconcile nahi karta. Next attempt ke saath old provider call overlap ho sakti hai.

Fix: returned SID ko catch-accessible variable mein rakho. Pre-create failure aur post-create persistence failure ko separate handle karo. Returned SID wale failures par provider state reconcile ya hangup karo; unknown provider result par blind retry mat karo. Recovery events durable rakho.

Acceptance: provider success ke baad DB write fail simulate karne par surviving provider call track/end ho; duplicate outbound retry na ho.

## 7. P1 — Same phone different leads aur changed DNC eligibility

Evidence: [queue helper:4](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/api/src/services/multi-calling/queue-service.ts:4>), [queue uniqueness migration:114](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/api/src/db/migrations/030_multi_ai_calling.sql:114>), [worker lead read:194](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/api/src/workers/multi-lane-outbound-caller.js:194>).

Active queue uniqueness lead_id par hai, normalized phone par nahi. Do scraped leads ke same phone ko two lanes dial kar sakti hain. normalizeNorthAmericanPhone helper defined hai lekin worker dialing mein use nahi hota. Queue insert DNC check karta hai; existing queued lead ko dial karte waqt worker sirf phone read karta hai. Queue hone ke baad DNC/stage/followup change ho to eligibility stale reh sakti hai.

Fix: normalized E.164 phone save/use karo, tenant+phone active reservation add karo, aur claim/dial par latest DNC, stage, followup time aur number status validate karo. Ineligible queue items cancel karo.

Acceptance: same phone ke duplicate CRM records/niches hon to ek active call; queued lead DNC ho to provider request zero.

## 8. P1 — Deepgram token endpoint par authentication missing

Evidence: [deepgram.ts:4](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/api/src/routes/deepgram.ts:4>), [registration:68](</home/jafar-tayyar-siddiqi/Downloads/email app/.kiro/specs/enrichment-saas/apps/api/src/index.ts:68>).

POST /v1/deepgram/token server key se grant token request karta hai, lekin route par authenticate preHandler nahi hai. Read registration path mein global authentication hook nahi mila; authenticate explicitly attached routes par run hota hai. Is route ki actual public reachability production proxy par verify nahi hui.

Fix: unused ho to remove karo; required ho to authenticated authorized role, tenant checks, appropriate rate limiting aur provider response-status handling add karo. Existing server preview bridge reuse karna preferable hai.

Acceptance: unauthenticated request 401; unauthorized role 403; provider failure ko successful token response na show karo.

## Requirement gaps aur practical limits

- Per-agent Google STT/TTS abhi is execution path mein implemented nahi: buildListenProvider type deepgram aur speak provider bhi deepgram hai. Listen model global environment se aata hai. Config snapshot alone Google provider support nahi banata.
- Speed field snapshot mein hai, lekin code speed sirf selected voice-model prefixes ke liye settings mein include karta hai. Har voice par 1.05 apply hone ka claim mat karo; supported-model behavior aur actual audio verify karo.
- Script schema node data ko z.any accept karta hai. Missing content, duplicate IDs, disconnected graph, bad edges aur incompatible outcomes ki graph validation publish se pehle chahiye. DFS prompt generation executable state machine ke barabar nahi.
- Integration checks har dashboard poll par dobara provider requests karte hain; bounded timeout/cache aur unavailable versus invalid credentials ka distinction chahiye.
- DB transcript aur cleanup JSON export code present hai; no-media/no-answer calls ke liye equivalent artifact finalization aur production storage/retention verify karni hai.
- Number rotation pair cursor 0/1 mein alternate karta hai. Eight real account numbers available/owned/healthy hona aur migration 033 apply hona deployment evidence se confirm karna baqi hai.

## Fix karne ka order

1. No Answer stage aur session-to-CRM unified finalizer.
2. Transport/detection states separate; Hold aur Stop active lookup correct.
3. Shared phone reservation, latest eligibility checks, legacy-worker exclusion.
4. Provider-create reconciliation aur orphan-call recovery.
5. Listener lifecycle/audio clear aur transcript continuity.
6. Token endpoint access control.
7. Script graph validation, provider selector, history/result interface polish.

## Agle coding agent ke liye verification scenarios

Neeche acceptance scenarios hain; is review mein execute nahi kiye:

- Normal Hello: selected script opener audible ho, company current lead wali ho.
- Recording notice + please hold + human: wait, phir human ko response; Stop hold ke darmiyan bhi work kare.
- Press 1/2: IVR result save, call hangup, next lead automatic.
- Voicemail greeting/tone: voicemail result session aur CRM dono mein; call terminate.
- Short clear refusal then hangup: Not Interested, Completed fallback nahi.
- Email handoff: confirmed email save, factual task/outcome; email bhejne ka jhoota claim nahi.
- Confirmed callback: date/time/timezone preserve; due se pehle redial nahi.
- Ringing timeout: No Answer stage; no accidental refill retry.
- Stop while calls.create pending: response ke baad no live orphan/current call and no next dial.
- Same phone in multiple leads: no overlapping calls.
- Mute/unmute/call switch: transcript preserved where appropriate; stale audio cleared.
- Callback before/after bridge cleanup: same outcome, no old callback overwriting newer attempt.

## Final note

Source defects identify kiye gaye hain. Actual voice cutting/silent greeting ki root cause sirf source se certify nahi ho sakti. Agla production diagnosis ek recent call SID par provider status/hangup cause, bridge start/stop, Deepgram SettingsApplied/error events, inbound/outbound audio frame counts aur transcript timestamps ko correlate kare. Existing credentials ko outputs mein expose na karo.
