import { query } from '../../calls-module/db/index.js';

export async function createCallSession({ tenantId, leadId, provider, signalwireCallSid, agentConfigId }) {
  const { rows } = await query(`
    INSERT INTO ai_call_sessions (tenant_id, lead_id, provider, signalwire_call_sid, agent_config_id, started_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    RETURNING id
  `, [tenantId, leadId, provider, signalwireCallSid, agentConfigId]);
  return rows[0].id;
}

export async function updateCallSessionState(sessionId, { callState, firstAnswerType }) {
  await query(`
    UPDATE ai_call_sessions
    SET call_state = COALESCE($1, call_state),
        first_answer_type = COALESCE($2, first_answer_type)
    WHERE id = $3
  `, [callState, firstAnswerType, sessionId]);
}

export async function endCallSession(sessionId, { hangupReason, durationSec, transcript, summary, outcome, costEstimateUsd }) {
  await query(`
    UPDATE ai_call_sessions
    SET ended_at = NOW(),
        hangup_reason = $1,
        duration_sec = $2,
        transcript = $3::jsonb,
        summary = $4,
        outcome = $5,
        cost_estimate_usd = $6
    WHERE id = $7
  `, [hangupReason, durationSec, JSON.stringify(transcript || []), summary, outcome, costEstimateUsd, sessionId]);
}
