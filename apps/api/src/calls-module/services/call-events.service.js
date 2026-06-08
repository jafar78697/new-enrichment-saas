import { query } from '../db/index.js';
import { emitToAgent } from './socket.service.js';

function mapOutcome(status, currentOutcome, duration) {
  // If agent already set an outcome manually, keep it
  if (currentOutcome) {
    return currentOutcome;
  }

  if (status === 'completed') {
    // If call lasted more than 0 seconds, it was answered
    return (duration && Number(duration) > 0) ? 'connected' : 'no_answer';
  }

  if (status === 'busy') {
    return 'busy';
  }

  if (status === 'no-answer' || status === 'failed' || status === 'canceled') {
    return 'no_answer';
  }

  return null;
}

export async function fetchCallByIdentifier({ id, callSid }) {
  const conditions = [];
  const params = [];

  if (id != null) {
    params.push(id);
    conditions.push(`c.id = $${params.length}`);
  }

  if (callSid != null) {
    params.push(callSid);
    conditions.push(`(c.call_sid = $${params.length} OR c.child_call_sid = $${params.length})`);
  }

  if (conditions.length === 0) {
    return null;
  }

  const result = await query(
    `
      SELECT
        c.*,
        contacts.name AS contact_name,
        contacts.phone_number AS contact_phone_number,
        agents.name AS agent_name,
        agents.email AS agent_email
      FROM calls c
      LEFT JOIN contacts ON contacts.id = c.contact_id
      LEFT JOIN agents ON agents.id = c.agent_id
      WHERE ${conditions.join(' AND ')}
      LIMIT 1
    `,
    params
  );

  return result.rows[0] ?? null;
}

export async function upsertOutboundParentCall({
  parentCallSid,
  agentId,
  contactId,
  from,
  to,
  status,
  shouldRecord
}) {
  const result = await query(
    `
      INSERT INTO calls (
        contact_id,
        agent_id,
        call_sid,
        direction,
        status,
        started_at,
        from_number,
        to_number,
        recording_enabled
      )
      VALUES ($1, $2, $3, 'outbound', $4, CURRENT_TIMESTAMP, $5, $6, $7)
      ON CONFLICT (call_sid)
      DO UPDATE SET
        contact_id = COALESCE(EXCLUDED.contact_id, calls.contact_id),
        agent_id = COALESCE(EXCLUDED.agent_id, calls.agent_id),
        status = EXCLUDED.status,
        from_number = COALESCE(EXCLUDED.from_number, calls.from_number),
        to_number = COALESCE(EXCLUDED.to_number, calls.to_number),
        recording_enabled = EXCLUDED.recording_enabled,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `,
    [contactId || null, agentId || null, parentCallSid, status, from || null, to || null, shouldRecord]
  );

  const call = result.rows[0];
  emitToAgent(call.agent_id, 'call.updated', { call });
  return call;
}

export async function upsertInboundParentCall({
  parentCallSid,
  agentId,
  from,
  to,
  status
}) {
  const result = await query(
    `
      INSERT INTO calls (
        agent_id,
        call_sid,
        direction,
        status,
        started_at,
        from_number,
        to_number
      )
      VALUES ($1, $2, 'inbound', $3, CURRENT_TIMESTAMP, $4, $5)
      ON CONFLICT (call_sid)
      DO UPDATE SET
        agent_id = COALESCE(EXCLUDED.agent_id, calls.agent_id),
        status = EXCLUDED.status,
        from_number = COALESCE(EXCLUDED.from_number, calls.from_number),
        to_number = COALESCE(EXCLUDED.to_number, calls.to_number),
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `,
    [agentId || null, parentCallSid, status, from || null, to || null]
  );

  const call = result.rows[0];
  emitToAgent(call.agent_id, 'call.updated', { call });
  return call;
}

export async function handleCallStatusWebhook(payload) {
  const mainCallSid = payload.ParentCallSid || payload.CallSid;
  const childCallSid = payload.ParentCallSid ? payload.CallSid : null;
  const terminalStatuses = new Set(['completed', 'busy', 'failed', 'no-answer', 'canceled']);
  const endedAt = terminalStatuses.has(payload.CallStatus) ? new Date().toISOString() : null;

  const existing = await fetchCallByIdentifier({ callSid: mainCallSid });

  const result = await query(
    `
      INSERT INTO calls (
        contact_id,
        agent_id,
        call_sid,
        child_call_sid,
        direction,
        status,
        duration_seconds,
        started_at,
        ended_at,
        from_number,
        to_number,
        outcome
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        COALESCE($8, CURRENT_TIMESTAMP),
        $9,
        $10,
        $11,
        $12
      )
      ON CONFLICT (call_sid)
      DO UPDATE SET
        child_call_sid = COALESCE(EXCLUDED.child_call_sid, calls.child_call_sid),
        status = EXCLUDED.status,
        duration_seconds = COALESCE(EXCLUDED.duration_seconds, calls.duration_seconds),
        ended_at = COALESCE(EXCLUDED.ended_at, calls.ended_at),
        from_number = COALESCE(EXCLUDED.from_number, calls.from_number),
        to_number = COALESCE(EXCLUDED.to_number, calls.to_number),
        outcome = COALESCE(calls.outcome, EXCLUDED.outcome),
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `,
    [
      existing?.contact_id ?? null,
      existing?.agent_id ?? null,
      mainCallSid,
      childCallSid,
      existing?.direction ?? (payload.Direction?.startsWith('inbound') ? 'inbound' : 'outbound'),
      payload.CallStatus,
      payload.CallDuration ? Number(payload.CallDuration) : existing?.duration_seconds ?? null,
      existing?.started_at ?? null,
      endedAt,
      payload.From ?? existing?.from_number ?? null,
      payload.To ?? existing?.to_number ?? null,
      mapOutcome(payload.CallStatus, existing?.outcome, payload.CallDuration)
    ]
  );

  const call = result.rows[0];
  emitToAgent(call.agent_id, 'call.updated', { call, source: 'status-callback' });
  return call;
}

export async function handleRecordingWebhook(payload) {
  const result = await query(
    `
      UPDATE calls
      SET
        recording_sid = COALESCE($2, recording_sid),
        recording_url = COALESCE($3, recording_url),
        recording_status = COALESCE($4, recording_status),
        updated_at = CURRENT_TIMESTAMP
      WHERE call_sid = $1 OR child_call_sid = $1
      RETURNING *
    `,
    [
      payload.CallSid,
      payload.RecordingSid ?? null,
      payload.RecordingUrl ? `${payload.RecordingUrl}.mp3` : null,
      payload.RecordingStatus ?? null
    ]
  );

  const call = result.rows[0];
  if (call) {
    emitToAgent(call.agent_id, 'call.updated', { call, source: 'recording-callback' });
  }

  return call;
}
