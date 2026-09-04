import { Router } from 'express';
import { env } from '../config/env.js';
import { asyncHandler, AppError } from '../utils/errors.js';
import { query } from '../../calls-module/db/index.js';

const router = Router();

function resolveTenantId(req) {
  const tenantId = req.tenantId || env.VOICE_AGENT_TENANT_ID || null;
  if (!tenantId) throw new AppError('No tenant is available for this voice-agent session.', 409);
  return tenantId;
}

router.get('/summary', asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const { rows } = await query(
    `SELECT
       COUNT(*)::int AS inbound_calls_today,
       COALESCE(SUM(duration_sec), 0)::int AS inbound_seconds,
       COALESCE(AVG(duration_sec), 0)::int AS average_duration_seconds,
       COALESCE(SUM(cost_estimate_usd), 0)::numeric AS inbound_estimated_cost,
       COUNT(*) FILTER (WHERE call_state = 'error')::int AS failed_calls
     FROM ai_call_sessions
     WHERE tenant_id = $1 AND started_at >= date_trunc('day', NOW())`,
    [tenantId],
  );
  const { rows: previewRows } = await query(
    `SELECT
       COUNT(*)::int AS previews_today,
       COALESCE(SUM(usage_seconds), 0)::int AS preview_reserved_seconds,
       COALESCE(SUM(estimated_cost_usd), 0)::numeric AS preview_estimated_cost
     FROM ai_usage_ledger
     WHERE tenant_id = $1 AND source = 'browser_preview'
       AND created_at >= date_trunc('day', NOW())`,
    [tenantId],
  );

  const calls = rows[0] || {};
  const previews = previewRows[0] || {};
  const estimatedCost = Number(calls.inbound_estimated_cost || 0) + Number(previews.preview_estimated_cost || 0);
  res.json({
    inboundCallsToday: Number(calls.inbound_calls_today || 0),
    inboundMinutes: Number(calls.inbound_seconds || 0) / 60,
    averageDurationSeconds: Number(calls.average_duration_seconds || 0),
    previewsToday: Number(previews.previews_today || 0),
    previewReservedMinutes: Number(previews.preview_reserved_seconds || 0) / 60,
    failedCalls: Number(calls.failed_calls || 0),
    estimatedCost,
    dailyBudgetUsd: env.AI_MAX_COST_USD_PER_DAY,
  });
}));

export default router;
