import fs from 'node:fs';
import dotenv from 'dotenv';
import WebSocket from 'ws';
import { RestClient } from '@signalwire/compatibility-api';
import { SpeechClient } from '@google-cloud/speech';

dotenv.config({ path: '.env' });

const report = {
  checkedAt: new Date().toISOString(),
  config: {},
  database: {},
  signalwire: {},
  deepgram: {},
  googleStt: {},
  publicWebSocket: {},
};

function safeError(error) {
  return {
    ok: false,
    code: error?.code || error?.status || error?.statusCode || null,
    message: String(error?.message || error || 'Unknown error')
      .replaceAll(process.env.SIGNALWIRE_API_TOKEN || '__never__', '[redacted]')
      .replaceAll(process.env.DEEPGRAM_API_KEY || '__never__', '[redacted]'),
  };
}

function lastFour(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? `***${digits.slice(-4)}` : null;
}

function waitForSocketResult(url, options, onOpen, onMessage, timeoutMs = 15000) {
  return new Promise((resolve) => {
    let settled = false;
    let socket;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket?.close(); } catch {}
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: false, message: 'Timed out waiting for WebSocket response' }), timeoutMs);
    try {
      socket = new WebSocket(url, options);
      socket.on('open', () => onOpen(socket, finish));
      socket.on('message', (data, isBinary) => onMessage(socket, data, isBinary, finish));
      socket.on('error', (error) => finish(safeError(error)));
      socket.on('unexpected-response', (_req, response) => {
        finish({ ok: false, code: response.statusCode, message: `Unexpected HTTP ${response.statusCode}` });
      });
    } catch (error) {
      finish(safeError(error));
    }
  });
}

async function checkDatabase() {
  try {
    const { query, getPool } = await import('../src/calls-module/db/index.js');
    const tenantId = process.env.VOICE_AGENT_TENANT_ID;
    const tenant = await query(
      `SELECT id, name, slug, status FROM tenants WHERE id = $1::uuid LIMIT 1`,
      [tenantId],
    );
    const subscription = await query(
      `SELECT COUNT(*)::int AS count FROM customer_subscriptions
       WHERE tenant_id = $1::uuid AND status = 'active'`,
      [tenantId],
    );
    const agents = await query(
      `SELECT id, name, mode, is_active, voice, language
       FROM ai_agent_configs
       WHERE tenant_id = $1::uuid AND is_active = true
       ORDER BY updated_at DESC`,
      [tenantId],
    );
    const controls = await query(
      `SELECT COALESCE(bool_or(is_running), false) AS is_running
       FROM ai_calling_controls WHERE tenant_id = $1::uuid`,
      [tenantId],
    );
    report.database = {
      ok: tenant.rows.length === 1 && Number(subscription.rows[0]?.count || 0) > 0 && agents.rows.length > 0,
      tenant: tenant.rows[0] || null,
      activeCallingSubscriptions: Number(subscription.rows[0]?.count || 0),
      activeAgents: agents.rows,
      callingRunning: Boolean(controls.rows[0]?.is_running),
    };
    await getPool().end();
    return agents.rows.find((agent) => agent.mode === 'outbound') || agents.rows[0] || null;
  } catch (error) {
    report.database = safeError(error);
    return null;
  }
}

async function checkSignalWire() {
  const projectId = process.env.SIGNALWIRE_PROJECT_ID;
  const apiToken = process.env.SIGNALWIRE_API_TOKEN;
  const spaceUrl = process.env.SIGNALWIRE_SPACE_URL;
  const configuredNumber = process.env.SIGNALWIRE_PHONE_NUMBER;
  if (!projectId || !apiToken || !spaceUrl || !configuredNumber) {
    report.signalwire = { ok: false, message: 'One or more SignalWire settings are missing' };
    return;
  }
  try {
    const client = RestClient(projectId, apiToken, { signalwireSpaceUrl: spaceUrl });
    const [accountResult, numbersResult, balanceResult] = await Promise.allSettled([
      client.api.v2010.accounts(projectId).fetch(),
      client.incomingPhoneNumbers.list({ limit: 100 }),
      client.balance.fetch(),
    ]);
    const account = accountResult.status === 'fulfilled' ? accountResult.value : null;
    const numbers = numbersResult.status === 'fulfilled' ? numbersResult.value : [];
    const balance = balanceResult.status === 'fulfilled' ? balanceResult.value : null;
    const normalizedConfiguredNumber = String(configuredNumber).replace(/\D/g, '');
    const normalizedNumbers = numbers.map((number) => String(number.phoneNumber || '').replace(/\D/g, ''));
    const ownsConfiguredNumber = normalizedNumbers.includes(normalizedConfiguredNumber);
    report.signalwire = {
      ok: numbersResult.status === 'fulfilled' && ownsConfiguredNumber,
      accountLookup: accountResult.status === 'fulfilled'
        ? { ok: true, status: account?.status || null }
        : safeError(accountResult.reason),
      numberLookup: numbersResult.status === 'fulfilled'
        ? { ok: true }
        : safeError(numbersResult.reason),
      balanceLookup: balanceResult.status === 'fulfilled'
        ? { ok: true }
        : safeError(balanceResult.reason),
      ownedPhoneNumberCount: numbers.length,
      ownedPhoneSuffixes: numbers.map((number) => lastFour(number.phoneNumber)),
      configuredPhone: lastFour(configuredNumber),
      configuredPhoneOwned: ownsConfiguredNumber,
      balanceAvailable: balance?.balance != null,
      currency: balance?.currency || null,
      note: 'Read-only provider check; no call was placed.',
    };
  } catch (error) {
    report.signalwire = safeError(error);
  }
}

async function checkDeepgram(agentConfig) {
  if (!process.env.DEEPGRAM_API_KEY) {
    report.deepgram = { ok: false, message: 'DEEPGRAM_API_KEY is missing' };
    return;
  }
  try {
    const { buildDeepgramSettings } = await import('../src/voice-agent/providers/deepgram-agent.js');
    const settings = buildDeepgramSettings(
      { company_name: 'Integration Check', niche_name: 'plumbing' },
      agentConfig || { name: 'Integration Check', voice: process.env.DEEPGRAM_AGENT_VOICE || 'flux-kit-en', language: 'en' },
    );
    let welcomed = false;
    let settingsApplied = false;
    let agentThinking = false;
    let agentTextReceived = false;
    let audioReceived = false;
    const eventTypes = [];
    report.deepgram = await waitForSocketResult(
      'wss://agent.deepgram.com/v1/agent/converse',
      { headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` } },
      () => {},
      (socket, data, isBinary, finish) => {
        if (isBinary) {
          audioReceived = data.length > 0;
          return;
        }
        let message;
        try { message = JSON.parse(data.toString()); } catch { return; }
        if (message.type && !eventTypes.includes(message.type)) eventTypes.push(message.type);
        if (message.type === 'Welcome') {
          welcomed = true;
          socket.send(JSON.stringify(settings));
          return;
        }
        if (message.type === 'SettingsApplied') {
          settingsApplied = true;
          socket.send(JSON.stringify({
            type: 'InjectUserMessage',
            content: 'Hello. In one short sentence, confirm that this voice integration test is working.',
          }));
          return;
        }
        if (message.type === 'AgentThinking') agentThinking = true;
        if (message.type === 'ConversationText' && /assistant|agent|ai/i.test(String(message.role))) agentTextReceived = true;
        if (message.type === 'AgentAudioDone') {
          finish({
            ok: welcomed && settingsApplied && agentTextReceived && audioReceived,
            welcomed,
            settingsApplied,
            agentThinking,
            agentTextReceived,
            audioReceived,
            eventTypes,
            listenModel: settings.agent.listen.provider.model,
            thinkModels: (Array.isArray(settings.agent.think) ? settings.agent.think : [settings.agent.think]).map((item) => item.provider.model),
            speakModel: settings.agent.speak.provider.model,
            audio: settings.audio,
            note: 'Real Deepgram WebSocket, Settings, LLM response, and generated audio were checked; no phone call was placed.',
          });
          return;
        }
        if (message.type === 'Error' || message.type === 'Warning') {
          finish({ ok: false, welcomed, providerMessage: message });
        }
      },
      30000,
    );
  } catch (error) {
    report.deepgram = safeError(error);
  }
}

async function checkGoogleStt() {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) {
    report.googleStt = { ok: false, configured: false, message: 'GOOGLE_APPLICATION_CREDENTIALS is missing' };
    return;
  }
  if (!fs.existsSync(credentialsPath)) {
    report.googleStt = { ok: false, configured: true, credentialsFileExists: false, message: 'Google credentials file does not exist' };
    return;
  }
  const client = new SpeechClient();
  try {
    const silentPcm = Buffer.alloc(8000 * 2);
    const [response] = await client.recognize({
      audio: { content: silentPcm.toString('base64') },
      config: { encoding: 'LINEAR16', sampleRateHertz: 8000, languageCode: 'en-US', model: 'phone_call' },
    });
    report.googleStt = {
      ok: true,
      configured: true,
      credentialsFileExists: true,
      apiRequestPassed: true,
      transcriptCount: response.results?.length || 0,
      activeInPrimaryDeepgramCallPath: false,
      note: 'Google STT accepted a silent test request. Primary AI Calling currently uses Deepgram STT.',
    };
  } catch (error) {
    report.googleStt = { ...safeError(error), configured: true, credentialsFileExists: true };
  } finally {
    await client.close().catch(() => {});
  }
}

async function checkPublicWebSocket() {
  const baseUrl = process.env.PUBLIC_BASE_URL || 'https://api.jentoai.pro';
  const wsUrl = `${baseUrl.replace(/^http/, 'ws').replace(/\/$/, '')}/api/voice/signalwire/deepgram-stream`;
  report.publicWebSocket = await waitForSocketResult(
    wsUrl,
    {},
    (_socket, finish) => finish({ ok: true, url: wsUrl, note: 'Public WSS upgrade succeeded; connection closed before sending a call session.' }),
    () => {},
    15000,
  );
}

report.config = {
  voiceAgentEnabled: String(process.env.VOICE_AGENT_ENABLED).toLowerCase() === 'true',
  outboundCallerProcessEnabled: String(process.env.ENABLE_AI_OUTBOUND_CALLER).toLowerCase() === 'true',
  outboundWorkerEnabled: String(process.env.AI_OUTBOUND_ENABLED).toLowerCase() === 'true',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || null,
  defaultTenantConfigured: Boolean(process.env.VOICE_AGENT_TENANT_ID),
};

const agent = await checkDatabase();
await Promise.all([checkSignalWire(), checkDeepgram(agent), checkGoogleStt(), checkPublicWebSocket()]);
console.log(JSON.stringify(report, null, 2));
