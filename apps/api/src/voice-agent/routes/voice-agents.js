import { Router } from 'express';
import { z } from 'zod';
import { env, VOICE_AGENT_ENABLED } from '../config/env.js';
import { buildBrowserAgentConfig } from '../providers/deepgram-agent.js';
import { asyncHandler, AppError } from '../utils/errors.js';
import { wsUrl } from '../utils/http.js';
import { issueBrowserPreviewTicket, removeBrowserPreviewTickets } from '../services/browser-preview-tickets.js';
import { query } from '../../calls-module/db/index.js';

const router = Router();
const activePreviews = new Map();

const agentSchema = z.object({
  name: z.string().trim().min(2).max(80),
  mode: z.enum(['browser_preview', 'inbound']).default('browser_preview'),
  isActive: z.boolean().default(true),
  voice: z.string().trim().min(2).max(100).default('aura-2-thalia-en'),
  language: z.literal('en').default('en'),
  greeting: z.string().trim().min(3).max(500).default('Hello, thanks for calling Jento AI. How can I help you today?'),
  prompt: z.string().trim().min(40).max(8000),
  assignedPhoneNumber: z.string().trim().min(7).max(30).nullable().optional(),
  maxCallDurationSec: z.coerce.number().int().min(60).max(600).default(180),
});

function resolveTenantId(req) {
  const tenantId = req.tenantId || env.VOICE_AGENT_TENANT_ID || null;
  if (!tenantId) {
    throw new AppError('No tenant is available for this voice-agent session. Sign in with the workspace account or set VOICE_AGENT_TENANT_ID on the server.', 409);
  }
  return tenantId;
}

function previewSubject(req) {
  return String(req.user?.id || req.user?.email || 'unknown-user');
}

async function settlePreviewReservation(reservation) {
  if (!reservation?.ledgerId || reservation.settled) return;
  reservation.settled = true;
  const usageSeconds = Math.min(
    env.DEEPGRAM_BROWSER_PREVIEW_MAX_SECONDS,
    Math.max(1, Math.ceil((Date.now() - reservation.startedAt) / 1000)),
  );
  const estimatedCost = Number(((usageSeconds / 60) * env.AI_ESTIMATED_COST_USD_PER_MINUTE).toFixed(4));
  try {
    await query(
      `UPDATE ai_usage_ledger
       SET usage_seconds = $1, estimated_cost_usd = $2
       WHERE id = $3`,
      [usageSeconds, estimatedCost, reservation.ledgerId],
    );
  } catch (error) {
    reservation.settled = false;
    console.error('[voice-agent] Browser preview cost settlement failed:', error.message);
  }
}

async function prunePreviewReservations() {
  const now = Date.now();
  for (const [key, entry] of activePreviews.entries()) {
    if (entry.expiresAt <= now) {
      activePreviews.delete(key);
      await settlePreviewReservation(entry);
    }
  }
}

function serializeAgent(row) {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    mode: row.mode,
    isActive: row.is_active,
    voice: row.voice,
    language: row.language,
    prompt: row.prompt,
    greeting: row.greeting,
    assignedPhoneNumber: row.assigned_phone_number,
    maxCallDurationSec: row.max_call_duration_sec,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getAgent(agentId, tenantId) {
  const { rows } = await query(
    `SELECT id, tenant_id, name, provider, mode, is_active, voice, language, prompt,
            greeting, assigned_phone_number, max_call_duration_sec, created_at, updated_at
     FROM ai_agent_configs
     WHERE id = $1 AND tenant_id = $2
     LIMIT 1`,
    [agentId, tenantId],
  );
  if (!rows[0]) throw new AppError('AI agent not found', 404);
  return rows[0];
}

function validateInboundConfiguration(agent) {
  if (agent.mode === 'inbound' && !agent.assignedPhoneNumber) {
    throw new AppError('Inbound agents need the SignalWire phone number that will receive the test call.', 400);
  }
}

async function assertPreviewBudget(tenantId, estimatedCost) {
  const { rows } = await query(
    `SELECT COALESCE(SUM(estimated_cost_usd), 0)::numeric AS estimated_cost
     FROM ai_usage_ledger
     WHERE tenant_id = $1 AND created_at >= date_trunc('day', NOW())`,
    [tenantId],
  );
  const used = Number(rows[0]?.estimated_cost || 0);
  if (used + estimatedCost > env.AI_MAX_COST_USD_PER_DAY) {
    throw new AppError('The daily AI preview budget is reached. It resets tomorrow; no new preview was started.', 429);
  }
}

router.get('/status', asyncHandler(async (_req, res) => {
  res.json({
    enabled: VOICE_AGENT_ENABLED,
    deepgramConfigured: Boolean(VOICE_AGENT_ENABLED && env.DEEPGRAM_API_KEY),
    outboundEnabled: env.AI_OUTBOUND_ENABLED,
    browserPreviewMaxSeconds: env.DEEPGRAM_BROWSER_PREVIEW_MAX_SECONDS,
    inboundMaxSeconds: env.AI_MAX_SECONDS_PER_CALL,
    maxActiveCalls: env.AI_MAX_ACTIVE_CALLS,
    dailyMinuteLimit: env.AI_MAX_MINUTES_PER_DAY,
    dailyBudgetUsd: env.AI_MAX_COST_USD_PER_DAY,
  });
}));

router.get('/', asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const { rows } = await query(
    `SELECT id, name, provider, mode, is_active, voice, language, prompt,
            greeting, assigned_phone_number, max_call_duration_sec, created_at, updated_at
     FROM ai_agent_configs
     WHERE tenant_id = $1
     ORDER BY updated_at DESC, created_at DESC`,
    [tenantId],
  );
  res.json({ agents: rows.map(serializeAgent) });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const agent = await getAgent(req.params.id, resolveTenantId(req));
  res.json({ agent: serializeAgent(agent) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const agent = agentSchema.parse(req.body);
  validateInboundConfiguration(agent);
  const { rows } = await query(
    `INSERT INTO ai_agent_configs
       (tenant_id, name, provider, mode, is_active, voice, language, prompt, greeting, assigned_phone_number, max_call_duration_sec)
     VALUES ($1, $2, 'deepgram_voice_agent', $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, name, provider, mode, is_active, voice, language, prompt,
               greeting, assigned_phone_number, max_call_duration_sec, created_at, updated_at`,
    [
      tenantId, agent.name, agent.mode, agent.isActive, agent.voice, agent.language,
      agent.prompt, agent.greeting, agent.assignedPhoneNumber || null, agent.maxCallDurationSec,
    ],
  );
  res.status(201).json({ agent: serializeAgent(rows[0]) });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const current = await getAgent(req.params.id, tenantId);
  const changes = agentSchema.partial().parse(req.body);
  const merged = {
    name: changes.name ?? current.name,
    mode: changes.mode ?? current.mode,
    isActive: changes.isActive ?? current.is_active,
    voice: changes.voice ?? current.voice,
    language: changes.language ?? current.language,
    prompt: changes.prompt ?? current.prompt,
    greeting: changes.greeting ?? current.greeting,
    assignedPhoneNumber: changes.assignedPhoneNumber !== undefined ? changes.assignedPhoneNumber : current.assigned_phone_number,
    maxCallDurationSec: changes.maxCallDurationSec ?? current.max_call_duration_sec,
  };
  validateInboundConfiguration(merged);
  const { rows } = await query(
    `UPDATE ai_agent_configs
     SET name = $1, mode = $2, is_active = $3, voice = $4, language = $5,
         prompt = $6, greeting = $7, assigned_phone_number = $8,
         max_call_duration_sec = $9, updated_at = NOW()
     WHERE id = $10 AND tenant_id = $11
     RETURNING id, name, provider, mode, is_active, voice, language, prompt,
               greeting, assigned_phone_number, max_call_duration_sec, created_at, updated_at`,
    [
      merged.name, merged.mode, merged.isActive, merged.voice, merged.language,
      merged.prompt, merged.greeting, merged.assignedPhoneNumber || null,
      merged.maxCallDurationSec, req.params.id, tenantId,
    ],
  );
  res.json({ agent: serializeAgent(rows[0]) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  await getAgent(req.params.id, tenantId);
  await query('DELETE FROM ai_agent_configs WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]);
  res.status(204).send();
}));

router.post('/:id/preview-token', asyncHandler(async (req, res) => {
  if (!VOICE_AGENT_ENABLED || !env.DEEPGRAM_API_KEY) {
    throw new AppError('Deepgram browser preview is not enabled on this server.', 503);
  }

  const tenantId = resolveTenantId(req);
  const agent = await getAgent(req.params.id, tenantId);
  if (!agent.is_active) throw new AppError('Activate this agent before starting a preview.', 409);

  await prunePreviewReservations();
  const subject = previewSubject(req);
  const key = `${subject}:${agent.id}`;
  let reservation = activePreviews.get(key);
  if (!reservation) {
    const activeForUser = [...activePreviews.values()].filter((entry) => entry.subject === subject).length;
    if (activeForUser >= env.DEEPGRAM_BROWSER_PREVIEW_MAX_ACTIVE_PER_USER) {
      throw new AppError('Only one browser preview can run at a time for this user.', 429);
    }

    const estimatedCost = Number(((env.DEEPGRAM_BROWSER_PREVIEW_MAX_SECONDS / 60) * env.AI_ESTIMATED_COST_USD_PER_MINUTE).toFixed(4));
    await assertPreviewBudget(tenantId, estimatedCost);
    const { rows } = await query(
      `INSERT INTO ai_usage_ledger (tenant_id, agent_config_id, source, usage_seconds, estimated_cost_usd)
       VALUES ($1, $2, 'browser_preview', $3, $4)
       RETURNING id`,
      [tenantId, agent.id, env.DEEPGRAM_BROWSER_PREVIEW_MAX_SECONDS, estimatedCost],
    );
    reservation = {
      subject,
      ledgerId: rows[0].id,
      startedAt: Date.now(),
      expiresAt: Date.now() + env.DEEPGRAM_BROWSER_PREVIEW_MAX_SECONDS * 1000,
      settled: false,
    };
    activePreviews.set(key, reservation);
  }

  const ticket = issueBrowserPreviewTicket({
    subject,
    agentId: agent.id,
    agentConfig: agent,
    expiresAt: reservation.expiresAt,
  });
  res.json({
    token: ticket,
    expiresIn: Math.max(1, Math.floor((reservation.expiresAt - Date.now()) / 1000)),
    maxSeconds: Math.max(1, Math.floor((reservation.expiresAt - Date.now()) / 1000)),
    url: wsUrl(req, '/api/voice/browser-preview'),
    config: buildBrowserAgentConfig(agent),
  });
}));

router.post('/:id/preview-stop', asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  await getAgent(req.params.id, tenantId);
  const subject = previewSubject(req);
  const reservation = activePreviews.get(`${subject}:${req.params.id}`);
  activePreviews.delete(`${subject}:${req.params.id}`);
  await settlePreviewReservation(reservation);
  removeBrowserPreviewTickets({ subject, agentId: req.params.id });
  res.status(204).send();
}));

router.get('/history/sessions', asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 25)));
  const { rows } = await query(
    `SELECT s.id, s.provider, s.signalwire_call_sid, s.call_state, s.first_answer_type,
            s.hangup_reason, s.started_at, s.ended_at, s.duration_sec, s.outcome,
            s.cost_estimate_usd, s.last_error, a.name AS agent_name
     FROM ai_call_sessions s
     LEFT JOIN ai_agent_configs a ON a.id = s.agent_config_id
     WHERE s.tenant_id = $1
     ORDER BY s.started_at DESC NULLS LAST
     LIMIT $2`,
    [tenantId, limit],
  );
  res.json({ sessions: rows });
}));

export default router;
