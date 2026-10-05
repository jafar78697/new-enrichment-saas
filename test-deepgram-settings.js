import { buildDeepgramSettings } from './apps/api/src/voice-agent/providers/deepgram-agent.js';
const settings = buildDeepgramSettings({ company_name: "Test" }, { voice: "aura-orion-en" });
console.log(JSON.stringify(settings, null, 2));
