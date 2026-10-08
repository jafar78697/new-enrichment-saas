import { query } from '../../calls-module/db/index.js';
import { saveCallResult } from './call-result-service.js';

const terminalStates = new Set(['completed', 'failed', 'busy', 'no-answer', 'canceled']);

// A provider call may end before the audio bridge opens. It still needs a
// finalized result and queue release, since no media 'stop' event will arrive.
export async function finalizeUnstreamedCall({ sessionId, status, durationSec = 0, reason = null }) {
  if (!terminalStates.has(status)) return false;
  const session = (await query('SELECT * FROM ai_call_sessions WHERE id = $1', [sessionId])).rows[0];
  if (!session || session.signalwire_stream_sid || session.result_finalized_at) return false;
  const connectionFailure = status === 'completed' && !session.outcome;
  const outcome = session.outcome || (connectionFailure ? 'technical_error' : 'no_answer');
  const summary = connectionFailure
    ? 'Call ended before AI audio connected. No conversation was recorded.'
    : `Call ended: ${status}.`;
  await saveCallResult({ sessionId, outcome, note: summary, source: 'telecom_event', fallback: true, durationSec });
  const { rows } = await query(`UPDATE ai_call_sessions
    SET call_state = $2, ended_at = COALESCE(ended_at, NOW()),
        provider_terminated_at = COALESCE(provider_terminated_at, NOW()),
        result_finalized_at = COALESCE(result_finalized_at, NOW()),
        duration_sec = GREATEST(COALESCE(duration_sec, 0), $3),
        hangup_reason = COALESCE(hangup_reason, $4)
    WHERE id = $1 AND signalwire_stream_sid IS NULL RETURNING queue_item_id`,
  [sessionId, status, durationSec, reason || (connectionFailure ? 'voice_connection_failed' : status)]);
  if (rows[0]?.queue_item_id) {
    await query(`UPDATE ai_call_queue_items SET state = $2, last_error = $3, updated_at = NOW()
      WHERE id = $1 AND state NOT IN ('completed', 'failed', 'cancelled')`,
    [rows[0].queue_item_id, connectionFailure || ['failed', 'canceled'].includes(status) ? 'failed' : 'completed', connectionFailure ? summary : null]);
  }
  return rows.length > 0;
}
