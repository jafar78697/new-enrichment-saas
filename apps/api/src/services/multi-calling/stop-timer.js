import { query, getPool } from '../../calls-module/db/index.js';
import { finalizeUnstreamedCall } from '../../voice-agent/services/unstreamed-call-result.js';

const terminalStates = new Set(['completed', 'failed', 'busy', 'no-answer', 'canceled']);

// Shared by the start API and the final dial guard. An expired timer stays
// locked until the user explicitly cancels or replaces it; no automatic restart.
export async function stopTimerBlocksCalling(client, tenantId, lock = false) {
  const { rows } = await client.query(`SELECT status,
    stop_at <= clock_timestamp() AS expired FROM ai_calling_stop_timers
    WHERE tenant_id = $1 ${lock ? 'FOR SHARE' : ''}`, [tenantId]);
  const timer = rows[0];
  return !!timer && (['stopping', 'completed'].includes(timer.status)
    || (timer.status === 'scheduled' && timer.expired));
}

// SDK requests may stall; release this scheduler attempt so other workspaces
// continue, then retry safely. A late hangup is harmless: lanes remain paused.
async function boundedRequest(promise) {
  let timeout;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('Provider hangup request timed out')), 10000);
    })]);
  } finally { clearTimeout(timeout); }
}

export async function processExpiredStopTimers(signalwireClient) {
  const due = await query(`SELECT tenant_id FROM ai_calling_stop_timers
    WHERE (status = 'scheduled' AND stop_at <= clock_timestamp())
       OR (status = 'stopping' AND (next_attempt_at IS NULL OR next_attempt_at <= clock_timestamp()))
    ORDER BY stop_at LIMIT 20`);
  for (const timer of due.rows) {
    const client = await getPool().connect();
    let locked = false;
    try {
      // Hold across provider requests. Two worker processes cannot stop the same
      // workspace concurrently, even after the pause transaction commits.
      locked = (await client.query('SELECT pg_try_advisory_lock(hashtext($1), 37007) AS locked', [timer.tenant_id])).rows[0].locked;
      if (!locked) continue;
      await client.query('BEGIN');
      const current = (await client.query(`SELECT *, stop_at <= clock_timestamp() AS expired
        FROM ai_calling_stop_timers WHERE tenant_id = $1 FOR UPDATE`, [timer.tenant_id])).rows[0];
      if (!current || !(current.status === 'stopping' || (current.status === 'scheduled' && current.expired))) {
        await client.query('ROLLBACK'); continue;
      }
      // Pause every lane before fetching sessions. A dial already in flight
      // holds the lane row lock; we wait for it and include its returned SID.
      await client.query(`UPDATE ai_calling_lanes SET status = 'paused', updated_at = NOW()
        WHERE tenant_id = $1`, [timer.tenant_id]);
      await client.query(`UPDATE ai_calling_stop_timers SET status = 'stopping',
        next_attempt_at = clock_timestamp() + INTERVAL '5 seconds', updated_at = NOW()
        WHERE tenant_id = $1`, [timer.tenant_id]);
      const sessions = (await client.query(`SELECT s.id, s.signalwire_call_sid, s.signalwire_stream_sid
        FROM ai_call_sessions s JOIN ai_calling_lanes l ON l.id = s.lane_id AND l.tenant_id = s.tenant_id
        WHERE s.tenant_id = $1 AND (s.ended_at IS NULL OR s.result_finalized_at IS NULL)`, [timer.tenant_id])).rows;
      await client.query(`UPDATE ai_call_sessions SET call_state = 'ending',
        hangup_reason = COALESCE(hangup_reason, 'stop-timer-expired')
        WHERE tenant_id = $1 AND lane_id IS NOT NULL AND ended_at IS NULL`, [timer.tenant_id]);
      await client.query('COMMIT');

      const attempts = await Promise.allSettled(sessions.map(async session => {
        if (!session.signalwire_call_sid) throw new Error('A starting call is still waiting for its provider ID');
        if (!signalwireClient) throw new Error('SignalWire is unavailable; lanes paused and hangup will retry');
        let call = await boundedRequest(signalwireClient.calls(session.signalwire_call_sid).fetch());
        if (!terminalStates.has(call.status)) {
          try {
            call = await boundedRequest(signalwireClient.calls(session.signalwire_call_sid).update({ status: 'completed' }));
          } catch (error) {
            // The prospect can hang up between fetch and update.
            call = await boundedRequest(signalwireClient.calls(session.signalwire_call_sid).fetch());
            if (!terminalStates.has(call.status)) throw error;
          }
        }
        if (!terminalStates.has(call.status)) throw new Error('Provider has not yet confirmed hangup');
        await query(`UPDATE ai_call_sessions SET provider_terminated_at = COALESCE(provider_terminated_at, NOW())
          WHERE id = $1`, [session.id]);
        if (!session.signalwire_stream_sid) {
          await finalizeUnstreamedCall({ sessionId: session.id, status: call.status,
            durationSec: Number(call.duration || 0), reason: 'stop-timer-expired' });
        } else {
          await query(`UPDATE ai_call_sessions SET ended_at = COALESCE(ended_at, NOW()),
            call_state = $2, duration_sec = GREATEST(COALESCE(duration_sec, 0), $3)
            WHERE id = $1`, [session.id, call.status, Number(call.duration || 0)]);
          const { finalizeEndedCall } = await import('../../voice-agent/orchestrator/deepgram-signalwire-bridge.js');
          await finalizeEndedCall(session.id);
        }
      }));
      const errors = attempts.filter(result => result.status === 'rejected').map(result => result.reason?.message || 'Hangup failed');
      const pending = await query(`SELECT 1 FROM ai_call_sessions WHERE tenant_id = $1
        AND lane_id IS NOT NULL AND (ended_at IS NULL OR result_finalized_at IS NULL) LIMIT 1`, [timer.tenant_id]);
      if (errors.length || pending.rowCount) {
        await query(`UPDATE ai_calling_stop_timers SET last_error = $2,
          next_attempt_at = clock_timestamp() + INTERVAL '5 seconds', updated_at = NOW()
          WHERE tenant_id = $1 AND status = 'stopping'`, [timer.tenant_id, errors.join('; ').slice(0, 1000) || 'Waiting for call results to finish saving']);
      } else {
        await query(`UPDATE ai_calling_stop_timers SET status = 'completed', completed_at = NOW(),
          next_attempt_at = NULL, last_error = NULL, updated_at = NOW()
          WHERE tenant_id = $1 AND status = 'stopping'`, [timer.tenant_id]);
        console.log('[multi-lane-timer] All lanes stopped:', timer.tenant_id);
      }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[multi-lane-timer] Stop attempt failed:', error.message);
      await query(`UPDATE ai_calling_stop_timers SET last_error = $2,
        next_attempt_at = clock_timestamp() + INTERVAL '5 seconds'
        WHERE tenant_id = $1 AND status IN ('scheduled', 'stopping')`, [timer.tenant_id, error.message.slice(0, 1000)]);
    } finally {
      if (locked) await client.query('SELECT pg_advisory_unlock(hashtext($1), 37007)', [timer.tenant_id]).catch(() => {});
      client.release();
    }
  }
}
