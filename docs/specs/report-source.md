# Deepgram AI Agent Research Report

**Audience:** Jento AI product and engineering team
**Date:** 2026-09-03
**Scope:** Existing SignalWire calling, the current AI Agent section, Deepgram Voice Agent API, reliability, and cost control.
**Assumption:** Manual browser calling ab chal rahi hai aur usay AI-agent kaam ke dauran change nahi kiya jayega.

## Seedha jawab

Deepgram ko current app ke sath attach karne ka sahi tareeqa yeh hai:

`SignalWire phone stream -> aik per-call Deepgram Voice Agent WebSocket -> CRM session/logs`

Deepgram aik hi WebSocket par listening, LLM, speaking, turn-taking aur barge-in karta hai. Is liye current Deepgram bridge ke sath Google STT, old OpenAI realtime pipeline, old media server, aur browser test socket ko ek sath on karna zaroori nahi hai. Yeh duplicate services latency, bills aur crash surface barhati hain.

Manual browser dialer ko is redesign se bilkul alag rakha jaye. AI agent pehle sirf browser preview aur inbound/test number par chale. Automated outbound/campaign calling default se band rahe.

## Official Deepgram findings

- Deepgram Voice Agent API full voice loop (STT + LLM + TTS + turn-taking) aik WebSocket par chalata hai. Server ka kaam telephony audio ko bridge karna aur control events ko handle karna hai. [Deepgram Voice Agent overview](https://developers.deepgram.com/docs/voice-agent)
- Phone audio ke liye `mulaw` / `8000 Hz` input aur output use karna chahiye. Is se telephony bytes direct pass hote hain aur resampling nahi hoti. [Deepgram telephony guide](https://developers.deepgram.com/docs/twilio-and-deepgram-voice-agent)
- `UserStartedSpeaking` event par carrier ka queued agent audio clear karna chahiye. Yeh natural interruption/barge-in ke liye official pattern hai. [Barge-in guide](https://developers.deepgram.com/docs/twilio-and-deepgram-voice-agent)
- Har connection ke foran baad `Settings` bhejni hoti hain. Settings mein exact listen, think, speak model aur audio format pinned hone chahiye. [Configure Voice Agent](https://developers.deepgram.com/docs/configure-voice-agent)
- Live transcript ke liye `ConversationText` event authoritative event hai. Is mein role aur content milta hai; isay CRM session mein save karna chahiye. [ConversationText reference](https://developers.deepgram.com/docs/voice-agent-conversation-text)
- Custom CRM tools client/server code ko handle karne hote hain. `FunctionCallRequest.functions[]` mein har function ka `id`, `name`, `arguments`, aur `client_side` milta hai. Client-side tool ke baad `FunctionCallResponse` with `id`, `name`, aur `content` bhejna hota hai. [Function call request](https://developers.deepgram.com/docs/voice-agent-function-call-request), [Function call response](https://developers.deepgram.com/docs/voice-agent-function-call-response)
- Deepgram ki public pricing page currently Voice Agent usage ko conversation-minute par bill karti hai. Exact rate tier aur date ke sath change ho sakti hai; current published rates production enable karne se pehle dashboard par dobara verify ki jayein. [Current Deepgram pricing](https://deepgram.com/pricing)

## Current app diagnosis

### Jo cheez sahi direction mein hai

- `apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js` SignalWire media stream ko Deepgram endpoint `wss://agent.deepgram.com/v1/agent/converse` se connect karta hai.
- `apps/api/src/voice-agent/providers/deepgram-agent.js` telephony-compatible `mulaw` / `8000` input aur output set karta hai.
- Bridge `Welcome`, `SettingsApplied`, binary audio, aur `UserStartedSpeaking` ka basic flow handle karta hai.
- `ai_call_sessions` ko Deepgram-specific session record ke taur par use karne ki niyyat hai. Yeh old generic voice tables se behtar starting point hai.

### High-risk problems

1. **Deepgram on karte hi unrelated legacy systems bhi on ho jate hain.**
   `apps/api/src/index.ts` ke aik `VOICE_AGENT_ENABLED` switch se Deepgram bridge ke sath old Twilio media server, browser Socket.IO gateway, old OpenAI/Google/ElevenLabs pipeline, aur supervisor bhi attach ho jate hain. Deepgram MVP ke liye in mein se sirf Deepgram bridge aur optional call-monitor zaroori hain.

2. **Aik call par duplicate Google STT chal raha hai.**
   `deepgram-signalwire-bridge.js` line 6 Google STT import karti hai; lines 175-211 usay start karti hain; line 278 har audio frame Google ko bhi bhejti hai. Deepgram already transcription, turn detection, aur barge-in provide karta hai. Yeh duplicate audio processing hai aur unnecessary cost/latency banata hai.

3. **Function calling current implementation official Deepgram payload se match nahi karti.**
   Bridge `event.name` aur `event.arguments` read karta hai, jab ke official payload `event.functions[]` deta hai. Response mein code `call_id` aur `output` bhejta hai, jab ke documented message `id`, `name`, aur `content` use karta hai. Is wajah se `end_call` ya CRM note tool unreliable ho sakta hai.

4. **`schedule_callback` jhooti success de sakta hai.**
   Provider config is tool ko declare karti hai lekin bridge isay actually calendar/CRM mein schedule nahi karta. Unknown tool ko `Success` reply mil sakta hai. Agent ko appointment promise karne se pehle ya to tool implement ho ya tool list se remove ho.

5. **Fake callback defaults production mein unsafe hain.**
   Current default `+18005550199` aur `hello@jentoai.com` hain. Agent ko fallback contact invent nahi karna chahiye. Callback phone/email missing ho to agent ko booking/message dene se roka jaye aur config validation fail ho.

6. **AI Agent API screens abhi real product nahi hain.**
   `routes/voice-agents.js`, `routes/prompts.js`, aur `routes/knowledge-base.js` empty/stub JSON return karte hain. UI agar in endpoints par depend kare to user ka agent/prompt save nahi hoga.

7. **Analytics wrong data model par chal rahi hai.**
   `routes/analytics.js` old `voice_call_sessions` aur Twilio/OpenAI/Vertex cost keys read karti hai, jab ke new Deepgram bridge `ai_call_sessions` write karta hai. Is liye Deepgram call count/cost/history galat ya blank dikhegi.

8. **AI Agent pipeline mein fuzool aur misleading controls hain.**
   `apps/web/src/pages/AgentPipeline.tsx` mein queue, automatic Start Calling/Stop Calling, old BrowserAgentTester, live recordings, aur duplicate call panels mix hain. Current BrowserAgentTester Deepgram browser preview nahi; woh old browser Socket.IO pipeline use karta hai. Recording UI bhi misleading hai kyunke Deepgram bridge raw recording persist nahi karta.

9. **Provider silently overwrite ho raha hai.**
   `apps/api/src/routes/crm.ts` aur `voice-agent/routes/twiml.js` `openai_realtime` ko chupke se `deepgram_voice_agent` bana dete hain. Provider ko explicit enum hona chahiye; unknown value par error aana chahiye, silent fallback nahi.

10. **Schema ownership incomplete hai.**
    Code `ai_agent_configs` aur `ai_call_sessions` query karta hai, lekin checked-in migration set mein un tables ki clear canonical create migration nahi mili. Isay single migration mein formalize karna zaroori hai, warna fresh environment/incomplete database par configuration/session fail hogi.

11. **SignalWire stream URL ka session context abhi unreliable hai.**
    `twiml.js` `?sessionId=...` query string ke sath WebSocket URL banata hai, lekin SignalWire ke Stream documentation ke mutabiq stream URL query strings support nahi karta. Session ID aur agent metadata ko nested cXML `<Parameter>` se bhejna hoga aur bridge ko `start.customParameters` se read karna hoga. Warna audio bridge chalne ke bawajood CRM session, configured prompt, aur logs missing ho sakte hain. [SignalWire Stream reference](https://signalwire.com/docs/compatibility-api/cxml/reference/voice/stream)

## Recommended simple architecture

### Phase 1: Browser preview

Pehle Deepgram browser preview banao:

`Browser microphone -> temporary Deepgram token -> Deepgram Voice Agent -> browser audio`

- Server only short-lived token issue kare; permanent Deepgram key browser mein nahi jayegi.
- 5 minute max session, 1 active preview per user, aur explicit Stop button.
- Is preview mein SignalWire call nahi lagegi, is liye phone minutes/billing ka risk kam hoga.
- Agent config draft save hogi, lekin phone number call nahi karega.

### Phase 2: Inbound/test phone agent

`SignalWire number -> Connect/Stream -> Deepgram bridge -> ai_call_sessions -> transcript/logs`

- Aik call = aik Deepgram WebSocket.
- `mulaw`, `8000 Hz`, `container: none` dono directions mein.
- Deepgram `ConversationText` se transcript save ho.
- Deepgram `UserStartedSpeaking` par SignalWire queued audio clear ho.
- Sirf `end_call` aur `save_call_note` tool launch par allow hon. Dono tools server-side, allow-listed, aur audit log ke sath.
- `schedule_callback` tab tak hidden rahe jab tak calendar integration actual aur tested na ho.

### Phase 3: Controlled operator-started call

Yeh sirf tab jab Phase 1 aur Phase 2 ke real logs stable hon:

- Human operator specific eligible lead ko select kare aur confirm kare.
- No campaign loop, no random lead list, no retry worker.
- Per-call max duration, daily minutes/cost cap, aur manual kill switch.
- Consent, local laws, DNC/opt-out, time-zone aur recording disclosures separately verify ki jayein. Automated cold calling launch scope ka hissa nahi hai.

## Fuzool cheezen jo Deepgram MVP mein band ya separate honi chahiye

- Old `media-server.js` Twilio stream server.
- Old `call-pipeline.js` OpenAI/Google/ElevenLabs orchestration.
- `browser-gateway.js` aur current BrowserAgentTester.
- Google STT from `deepgram-signalwire-bridge.js`.
- Legacy campaign route aur automatic Start Calling UI.
- Recording panels jab tak recording consent, storage, retention, aur actual media persistence implemented na ho.
- LinkedIn/Reddit `AgentSettings` ko voice-agent settings se alag naam/route diya jaye. Woh voice AI configuration nahi hai.
- Old `voice_call_sessions` Deepgram analytics route se. Historical data ko migrate/retain karna alag task ho sakta hai.

## Cost aur accidental-call protection

Yeh guards code aur database dono mein hone chahiye; sirf UI button disabled hona kafi nahi hai:

1. `VOICE_AGENT_ENABLED=false` default rahe.
2. `AI_OUTBOUND_ENABLED=false` hard default rahe; is flag ke baghair outbound endpoint 403 return kare.
3. `AI_MAX_ACTIVE_CALLS=1` hard server/database lock.
4. `AI_MAX_SECONDS_PER_CALL=180` starting default; carrier `timeLimit` aur server timer dono.
5. `AI_MAX_MINUTES_PER_DAY=10` aur `AI_MAX_COST_USD_PER_DAY` low starting cap. New call create karne se pehle ledger check; limit cross ho to call bilkul na lage.
6. One `ai_usage_ledger` mein SignalWire seconds aur Deepgram seconds separate save hon. Displayed estimate actual final receipt nahi hota, is liye safety margin rakha jaye.
7. No automatic retry after failed provider/WebSocket/call status. Retry sirf human explicit click se.
8. No lead queue worker, cron, ya campaign loop unless separate compliance approval aur strict lead consent data ho.
9. Test number allow-list se shuru karo. Unapproved destination par AI call reject ho.
10. Admin-only enable/disable aur immutable audit event: kis ne, kab, kis agent se, kis number ko test kiya.
11. Deepgram API key server-only environment variable mein rahe. Frontend ko only short-lived limited token mil sakta hai.
12. Agent setting update test nahi hui to `draft`; live phone number par attach nahi ho sakti.

## Proposed AI Agent screen

Current overloaded Pipeline page ko replace karke yeh simple screens rakhein:

1. **Agents:** name, mode (`Browser preview`, `Inbound`, `Manual supervised`), Draft/Live status, assigned number, last test result, enable toggle.
2. **Agent editor:** purpose, greeting, system prompt, listen model, LLM model, voice, allowed tools, callback details, test number allow-list, limits.
3. **Test:** browser microphone preview and one controlled test-number action. Transcript, errors, duration aur estimated usage dikhayen.
4. **Call logs:** session state, transcript, tool audit, SignalWire seconds, Deepgram seconds, estimated cost, failure reason. Raw recordings only if separately enabled with disclosure/retention.

`Calls`, `Campaigns`, `Recordings`, aur `Automation` ko initial Deepgram screen se hata dena chahiye. Woh user ko aisa impression dete hain ke AI calling already safe aur operational hai jab ke backend paths old/stub hain.

## Implementation order

1. Deepgram-only mount flag create karo: bridge + minimal routes; legacy OpenAI/Google/Twilio pipeline attach na ho.
2. SignalWire query-string hata kar `<Parameter>` se session/agent context pass karo; bridge mein `start.customParameters` validate karo.
3. Canonical migrations: `ai_agent_configs`, `ai_call_sessions`, `ai_usage_ledger`, indexes, and constraints.
4. Deepgram bridge se Google STT hatao; `ConversationText`, `UserStartedSpeaking`, `Error`, `Warning`, `LatencyReport`, `History` properly persist karo.
5. Function-call handler ko official `functions[]` and `FunctionCallResponse { id, name, content }` protocol par fix karo. Unimplemented tool remove karo.
6. API endpoints with auth: real agents CRUD, test session start/stop, logs, limits.
7. New minimal AI Agent UI banao; old pipeline/browser tester/auto-call controls remove or dev-only feature flag mein move karo.
8. Browser preview test -> inbound test number -> controlled operator-started test call. Har phase par log/cost verification.

## Evidence limitations

- Deepgram official documentation Twilio media frames ka example deti hai. SignalWire compatibility stream ka actual staging payload ek controlled inbound test se capture karke verify hoga, lekin current bridge already same `start/media/stop` style expect karta hai.
- Production environment ka Deepgram key status is report mein inspect nahi kiya gaya aur koi secret expose nahi hua. Agent enable karne se pehle server-side key, SignalWire webhook URL, test number, and spending caps configure/verify karne honge.
- Pricing time-sensitive hai. Deepgram dashboard/current pricing page launch-day par dobara check karni hogi.

## Source ledger

- Deepgram, "Getting Started: Voice Agent", accessed 2026-09-03: https://developers.deepgram.com/docs/voice-agent
- Deepgram, "Twilio and Deepgram Voice Agent", accessed 2026-09-03: https://developers.deepgram.com/docs/twilio-and-deepgram-voice-agent
- Deepgram, "Configure the Voice Agent", accessed 2026-09-03: https://developers.deepgram.com/docs/configure-voice-agent
- Deepgram, "Conversation Text", accessed 2026-09-03: https://developers.deepgram.com/docs/voice-agent-conversation-text
- Deepgram, "Function Call Request", accessed 2026-09-03: https://developers.deepgram.com/docs/voice-agent-function-call-request
- Deepgram, "Function Call Response", accessed 2026-09-03: https://developers.deepgram.com/docs/voice-agent-function-call-response
- Deepgram, "Voice Agent observability", accessed 2026-09-03: https://developers.deepgram.com/docs/voice-agent-observability
- Deepgram, "Pricing", accessed 2026-09-03: https://deepgram.com/pricing
- SignalWire, "Stream", accessed 2026-09-03: https://signalwire.com/docs/compatibility-api/cxml/reference/voice/stream

## 2026-09-04 controlled outbound implementation addendum

The operator explicitly requested a consent-gated USA/Canada outbound workflow. The implemented flow is now:

`eligible CRM lead -> verified AI voice consent -> assigned -> calling -> answered/called or no answer`

### Current model choices

- Listening uses Deepgram `flux-general-en` with provider version `v2`. Flux includes conversational end-of-turn detection and is the current Deepgram-recommended English Voice Agent listen model.
- Speech uses `flux-kit-en` with provider version `v2`. Aura voices remain available as a fallback choice, with version `v1` selected automatically for Aura model names.
- Thinking uses managed `gpt-5.6-luna` first and `gpt-5.4-mini` second. Deepgram supports an ordered array of LLM providers and retries the next provider when the preferred model fails.
- Telephony remains `mulaw` at 8000 Hz in both directions, with no recording enabled by the AI caller.

### Runtime protections now implemented

- `libphonenumber-js` validates a full E.164 number and country metadata. Only numbers classified as `US` or `CA` pass; other `+1` NANP regions do not pass.
- USA/Canada leads may be selected and assigned while consent is pending. Assignment never asserts consent. Only leads with `ai_voice_consent=true` and `do_not_call=false` enter the callable queue or can be claimed by the worker and connected to Deepgram.
- Consent verification requires a human-entered source/date reference and writes an audit event.
- Calls-per-minute, daily attempts, daily connected minutes, an estimated AI budget, timezone, and local calling hours are stored per tenant. Server environment caps remain authoritative and UI values cannot raise them.
- SignalWire synchronous answering-machine detection runs for up to 10 seconds. A machine or fax response hangs up before the Deepgram session is opened. The Deepgram transcript detector is only allowed to classify the first 10 seconds as a fallback.
- Only one active AI call is allowed by the current production server cap. The queue pauses itself when empty or when a daily cap is reached.
- The legacy direct campaign endpoint is disabled and the active outbound code does not call any SignalWire subscriber-create endpoint.
- Live monitoring requires an authenticated manager/team-leader socket and verifies that the call belongs to the signed-in tenant. Prospect and agent audio are converted once to PCM16 and played on separate, concurrent speaker timelines; barge-in clears only queued agent audio.

### Compliance boundary

These technical controls do not turn scraped cold leads into consented AI-call leads. The FCC has confirmed that AI-generated voices fall under the TCPA's artificial/prerecorded voice restrictions. Canada's CRTC rules state that solicitation calls using an automatic dialing-announcing device require prior express consent. Production use needs a documented consent source, applicable do-not-call screening, correct local calling hours, and legal review for the exact campaign.

### Additional primary sources

- Deepgram, "LLM Models", accessed 2026-09-04: https://developers.deepgram.com/docs/voice-agent-llm-models
- Deepgram, "Configure the Voice Agent", accessed 2026-09-04: https://developers.deepgram.com/docs/configure-voice-agent
- Deepgram, "STT Models", accessed 2026-09-04: https://developers.deepgram.com/docs/voice-agent-stt-models
- Deepgram, "Flux TTS Voices & Languages", accessed 2026-09-04: https://developers.deepgram.com/docs/flux-tts/voices
- SignalWire Compatibility API OpenAPI specification, accessed 2026-09-04: https://raw.githubusercontent.com/signalwire/docs/main/fern/apis/compatibility/openapi.yaml
- FCC, "FCC Makes AI-Generated Voices in Robocalls Illegal", accessed 2026-09-04: https://docs.fcc.gov/public/attachments/DOC-400393A1.pdf
- CRTC, "Telemarketing rules", accessed 2026-09-04: https://crtc.gc.ca/eng/phone/telemarketing/tobligations/rules-regles.htm
- CRTC, "Unsolicited Telecommunications Rules", accessed 2026-09-04: https://crtc.gc.ca/eng/trules-reglest.htm

## 2026-09-05 deployment verification

- Frontend published to Cloudflare Pages deployment `2394c532`. The custom domain returned HTTP 200 and the deployed `/assets/index-DqsMEevL.js` SHA-256 matched the local production build.
- Backend updated on the existing VM and `enrichment-api` restarted. Public health, authenticated AI calling status, and Deepgram agent status returned HTTP 200. Campaign remained OFF with no active call or queued lead.
- Four backend unit tests passed for G.711 decoding and advisory-lock lifecycle. Three frontend unit tests passed for simultaneous speaker playback, barge-in, and PCM polarity. Backend type-check and frontend production build passed.
- Seven actual SQL templates were checked with PostgreSQL `EXPLAIN`, without executing writes. A two-connection advisory-lock test passed against the production database with an isolated test key.
- Live monitor authenticated a valid owner token, rejected an unknown call, and rejected an invalid token. No production call was subscribed to.
- Local fixture UI checks exercised USA/Canada filtering, consent/DNC exclusion, assignment, live transcript, machine-skip, and waiting-for-next-call states. Screenshots were inspected at desktop and mobile widths; document width did not exceed the viewport. Fixtures use no provider credentials and cannot call a real number.
- A bounded Deepgram WebSocket test accepted the final model/tool settings and generated 592 bytes of audio before closing. No PSTN call or SignalWire subscriber was created. This small provider test can incur a fractional AI usage charge.
- Failed leads are not auto-redialed. A 24-hour per-lead cooldown and shared worker/manual advisory lock prevent concurrent starts and immediate repeat attempts. Opt-out tools persist DNC to the CRM and linked source contact. Duplicate stream starts and repeated cleanup are guarded.

### Remaining operational boundaries

- An authorized test-number PSTN call is still required to validate carrier delivery and both sides of a real conversation. Simulated UI tests and provider audio generation do not prove full telephony delivery.
- The first up-to-10-second synchronous AMD check is performed by SignalWire before the bidirectional media stream opens. Those pre-stream seconds are not audible in the browser monitor and are not inspected by the VM. The VM transcript fallback checks the first 10 seconds after streaming begins. Classification is heuristic, not guaranteed.
- The daily dollar limit is an AI estimate, not a total SignalWire billing cap. Carrier usage, number rental, AMD, and existing account subscriptions may be billed separately. This release does not create subscriber resources or enable call recording.
- The UI timezone window governs a campaign, not every lead's geographical timezone. Operators must segment campaigns by the prospect's local calling window.

### Lead selection follow-up

Production inspection found 119 USA/Canada salon contacts, all without saved AI-call consent. The old checkbox guard incorrectly made CRM assignment depend on calling eligibility. Selection and assignment now accept non-blocked USA/Canada leads; pending consent is preserved and shown on the assigned view with a review action. The start status reports pending assignments separately from the callable queue. Existing DNC and unsubscribe blocks are retained.

The actual assignment routes passed an integration test against isolated PostgreSQL temporary tables, rolled back afterward: pending assignment succeeds, DNC/UK contacts stay excluded, repeated assignment does not duplicate the lead, pending calls cannot start, and explicitly verified fixture consent promotes the lead without starting a campaign. Seven readiness tests, API type-check, frontend build, and browser pending-lead selection/assignment/review checks passed. No production contacts were assigned or consented by these tests.
