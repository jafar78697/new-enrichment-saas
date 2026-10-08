const CONNECTION_ALLOWANCE_USD = 0.017;

function finiteNonnegative(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

export function callReservation(agentConfig, env) {
  const cap = Math.max(60, finiteNonnegative(env.AI_MAX_SECONDS_PER_CALL, 180));
  const seconds = Math.min(cap, Math.max(60, finiteNonnegative(agentConfig?.max_call_duration_sec, cap)));
  // Conservative application estimate plus one unit of phone/stream/AMD fees.
  // Provider-specific access fees and account rentals are not an invoice cap.
  const rate = Math.max(0.1, finiteNonnegative(env.AI_ESTIMATED_COST_USD_PER_MINUTE, 0.1));
  return { seconds, usd: Math.ceil((seconds / 60 * rate + CONNECTION_ALLOWANCE_USD) * 10000 - 1e-9) / 10000 };
}

export function assessCallingBudget(control, sessions, previews, prospective, env) {
  const configuredLimit = (value, fallback) => {
    if (value === null || value === undefined || value === '') return finiteNonnegative(fallback, 0);
    return finiteNonnegative(value, 0);
  };
  const limits = {
    // Preserve configured campaign limits: the single-agent default of five
    // calls must not silently replace an existing multi-lane limit of 500.
    calls: configuredLimit(control.max_calls_per_day, env.AI_MAX_OUTBOUND_CALLS_PER_DAY),
    seconds: configuredLimit(control.max_minutes_per_day, env.AI_MAX_MINUTES_PER_DAY) * 60,
    usd: Math.min(configuredLimit(control.max_cost_usd_per_day, env.AI_MAX_COST_USD_PER_DAY), finiteNonnegative(env.AI_MAX_COST_USD_PER_DAY, 100)),
  };
  let calls = 0;
  let seconds = finiteNonnegative(previews?.usage_seconds, 0);
  let usd = finiteNonnegative(previews?.estimated_cost_usd, 0);
  for (const session of sessions) {
    if (session.in_budget_day) calls += 1;
    // Legacy ended records predate provider_terminated_at. Only newly reserved
    // calls require that extra confirmation before releasing their allowance.
    const open = !session.ended_at || (session.agent_config_snapshot?.billing_reservation && !session.provider_terminated_at);
    if (open) {
      const reserved = callReservation(session.agent_config_snapshot, env);
      seconds += reserved.seconds;
      usd += Math.max(reserved.usd, finiteNonnegative(session.agent_config_snapshot?.billing_reservation?.usd, 0));
    } else {
      const duration = finiteNonnegative(session.duration_sec, 0);
      seconds += duration;
      const rate = Math.max(0.1, finiteNonnegative(env.AI_ESTIMATED_COST_USD_PER_MINUTE, 0.1));
      const modeled = duration / 60 * rate + (session.signalwire_call_sid ? CONNECTION_ALLOWANCE_USD : 0);
      usd += Math.max(modeled, finiteNonnegative(session.cost_estimate_usd, 0));
    }
  }
  let reason = null;
  if (calls + 1 > limits.calls) reason = 'Daily call-count limit reached';
  else if (seconds + prospective.seconds > limits.seconds + 0.000001) reason = 'Daily talk-time limit has insufficient remaining allowance';
  else if (usd + prospective.usd > limits.usd + 0.000001) reason = 'Daily estimated cost budget has insufficient remaining allowance';
  return { allowed: !reason, reason, limits, used: { calls, seconds, usd }, reservation: prospective };
}

// The caller must already hold a transaction. Every lane uses the same tenant
// lock and commits its reservation with its session before the next caller reads.
export async function checkCallingBudget(client, tenantId, agentConfig, env) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`ai-calling-budget:${tenantId}`]);
  const control = (await client.query('SELECT * FROM ai_calling_controls WHERE tenant_id = $1 FOR UPDATE', [tenantId])).rows[0];
  if (!control) return { allowed: false, reason: 'Calling budget configuration is missing' };
  let timezone = control.calling_timezone || 'America/New_York';
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); } catch { timezone = 'America/New_York'; }
  const sessions = (await client.query(`
    WITH boundary AS (SELECT (date_trunc('day', NOW() AT TIME ZONE $2) AT TIME ZONE $2) AT TIME ZONE 'UTC' AS day_start)
    SELECT s.signalwire_call_sid, s.ended_at, s.provider_terminated_at,
      s.duration_sec, s.cost_estimate_usd, s.agent_config_snapshot,
      s.created_at >= boundary.day_start AS in_budget_day
    FROM ai_call_sessions s CROSS JOIN boundary
    WHERE s.tenant_id = $1 AND (s.created_at >= boundary.day_start OR s.ended_at IS NULL)
      AND (s.signalwire_call_sid IS NOT NULL OR s.ended_at IS NULL)
  `, [tenantId, timezone])).rows;
  const previews = (await client.query(`SELECT COALESCE(SUM(usage_seconds), 0) AS usage_seconds,
      COALESCE(SUM(estimated_cost_usd), 0) AS estimated_cost_usd
    FROM ai_usage_ledger WHERE tenant_id = $1 AND source = 'browser_preview'
      AND created_at >= ((date_trunc('day', NOW() AT TIME ZONE $2) AT TIME ZONE $2) AT TIME ZONE 'UTC')`, [tenantId, timezone])).rows[0];
  return assessCallingBudget(control, sessions, previews, callReservation(agentConfig, env), env);
}
