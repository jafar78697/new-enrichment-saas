import { query, getPool } from '../calls-module/db/index.js';
import { RestClient } from '@signalwire/compatibility-api';
import { env } from '../voice-agent/config/env.js';
import { normalizeNorthAmericanPhone } from '../utils/us-phone.js';

const projectId = env.SIGNALWIRE_PROJECT_ID;
const apiToken = env.SIGNALWIRE_API_TOKEN;
const spaceUrl = env.SIGNALWIRE_SPACE_URL;

let signalwireClient = null;
if (projectId && apiToken && spaceUrl) {
  signalwireClient = RestClient(projectId, apiToken, { signalwireSpaceUrl: spaceUrl });
}

const PUBLIC_BASE_URL = env.PUBLIC_BASE_URL || 'http://localhost:3000';
let workerTickRunning = false;

// We use 2 seconds interval
const TICK_INTERVAL = 2000;
// Global stagger of 1 second between outbound calls across the VM
let lastGlobalDialTime = 0;
const GLOBAL_STAGGER_MS = 1000;

export async function startMultiLaneWorker() {
  if (process.env.ENABLE_MULTI_AI_CALLING !== 'true') return;
  console.log('[multi-lane-caller] Starting multi-lane outbound worker...');
  
  setInterval(async () => {
    if (workerTickRunning) return;
    workerTickRunning = true;
    try {
      await runMultiLaneTick();
    } catch (error) {
      console.error('[multi-lane-caller] Tick error:', error);
    } finally {
      workerTickRunning = false;
    }
  }, TICK_INTERVAL);
}

// Generate deterministic 64-bit integer for pg advisory locks based on UUID strings
function getLockId(tenantId, laneId) {
  // Use two integers since JS bitwise is 32-bit. Wait, Postgres pg_try_advisory_lock takes one 64-bit int or two 32-bit ints.
  // We can just use hashtextextended via query, but that's slow. We will use a quick 32-bit hash.
  let hash = 0;
  const str = tenantId + laneId;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}

async function runMultiLaneTick() {
  if (!signalwireClient) return;

  const { rows: lanes } = await query(
    `SELECT * FROM ai_calling_lanes 
     WHERE status IN ('running', 'draining') 
       AND (next_dial_after IS NULL OR next_dial_after <= NOW())`
  );

  for (const lane of lanes) {
    const lockId = getLockId(lane.tenant_id, lane.id);
    const pool = getPool();
    const client = await pool.connect();
    let hasLock = false;

    try {
      // 1. Acquire Lock
      const lockRes = await client.query('SELECT pg_try_advisory_lock($1) as acquired', [lockId]);
      hasLock = lockRes.rows[0].acquired;
      if (!hasLock) continue;

      // Update heartbeat
      await client.query(`UPDATE ai_calling_lanes SET last_heartbeat_at = NOW() WHERE id = $1`, [lane.id]);

      // 2. Stale Recovery
      await client.query(`
        UPDATE ai_call_queue_items q
        SET state = 'queued'
        WHERE lane_id = $1 AND state IN ('claimed', 'dialing')
          AND updated_at < NOW() - INTERVAL '3 minutes'
          AND NOT EXISTS (
            SELECT 1 FROM ai_call_sessions s WHERE s.id = q.session_id AND s.ended_at IS NULL
          )
      `, [lane.id]);

      // 3. Check for active calls in this lane
      const { rows: activeSessions } = await client.query(
        `SELECT id FROM ai_call_sessions WHERE lane_id = $1 AND ended_at IS NULL LIMIT 1`, 
        [lane.id]
      );
      if (activeSessions.length > 0) continue; // Busy

      // 4. Stagger
      const nowMs = Date.now();
      if (nowMs - lastGlobalDialTime < GLOBAL_STAGGER_MS) {
        continue; 
      }

      // 5. Check if draining
      if (lane.status === 'draining') {
        if (!lane.active_call_sid) {
          await client.query(`UPDATE ai_calling_lanes SET status = 'paused' WHERE id = $1`, [lane.id]);
        }
        continue;
      }

      // 6. Claim a lead atomically
      const claimQuery = `
        WITH candidate AS (
          SELECT id, lead_id
          FROM ai_call_queue_items
          WHERE tenant_id = $1
            AND lane_id = $2
            AND state = 'queued'
            AND scheduled_at <= NOW()
          ORDER BY priority ASC, scheduled_at ASC, created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE ai_call_queue_items q
        SET state = 'claimed',
            claimed_at = NOW(),
            claim_token = gen_random_uuid(),
            attempt_number = attempt_number + 1,
            updated_at = NOW()
        FROM candidate
        WHERE q.id = candidate.id
        RETURNING q.*;
      `;
      const { rows: claims } = await client.query(claimQuery, [lane.tenant_id, lane.id]);
      if (claims.length === 0) {
        // Queue empty. Attempt to auto-populate new leads from CRM for this niche
        const popRes = await client.query(
          `INSERT INTO ai_call_queue_items (tenant_id, lane_id, lead_id, state, priority)
           SELECT er.tenant_id, $2, er.id, 'queued', 100
           FROM enrichment_results er
           WHERE er.tenant_id = $1
             AND er.niche_id = $3
             AND er.do_not_call = false
             AND er.lead_stage IN ('new', 'enriched', 'assigned', 'followup')
             AND (er.lead_stage != 'followup' OR (er.next_followup_at IS NOT NULL AND er.next_followup_at <= NOW()))
             AND er.primary_phone IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM ai_call_queue_items q 
               WHERE q.lead_id = er.id 
                 AND q.state IN ('queued', 'claimed', 'dialing', 'ringing', 'streaming')
             )
           ORDER BY CASE WHEN er.lead_stage = 'followup' THEN 0 ELSE 1 END, er.created_at ASC
           LIMIT 3
           ON CONFLICT (tenant_id, lead_id) WHERE state IN ('queued', 'claimed', 'dialing', 'ringing', 'streaming')
           DO NOTHING RETURNING id`,
          [lane.tenant_id, lane.id, lane.niche_id]
        );

        if (popRes.rowCount && popRes.rowCount > 0) {
          // Immediately try to claim again on the next tick
          continue;
        }

        // Still empty, just backoff
        await client.query(`UPDATE ai_calling_lanes SET next_dial_after = NOW() + INTERVAL '30 seconds' WHERE id = $1`, [lane.id]);
        continue;
      }
      const queueItem = claims[0];

      // 6. Find rotation numbers
      const { rows: numbers } = await client.query(
        `SELECT ln.*, p.phone_number FROM ai_calling_lane_numbers ln
         JOIN phone_numbers p ON ln.phone_number_id = p.id
         WHERE ln.lane_id = $1 AND ln.enabled = true AND ln.health_status = 'healthy' 
         ORDER BY ln.position ASC`, 
        [lane.id]
      );

      if (numbers.length === 0) {
        await client.query(`UPDATE ai_calling_lanes SET status = 'error', last_error = 'No healthy numbers' WHERE id = $1`, [lane.id]);
        // Release queue item
        await client.query(`UPDATE ai_call_queue_items SET state = 'queued' WHERE id = $1`, [queueItem.id]);
        continue;
      }

      // Rotate: find the next healthy number strictly after or equal to rotation_cursor, wrapping around.
      let selectedNumber = numbers.find(n => n.position >= lane.rotation_cursor);
      if (!selectedNumber) {
         selectedNumber = numbers[0]; // Wrap around
      }
      const fromPhone = selectedNumber.phone_number;

      let sessionId = null;
      let swCall = null;
      let normalizedToPhone = null;

      try {
        await client.query('BEGIN');

        // Get lead details and lock it
        const { rows: leadDetails } = await client.query(
          `SELECT primary_phone as phone, do_not_call, lead_stage, next_followup_at FROM enrichment_results WHERE id = $1 FOR UPDATE SKIP LOCKED`,
          [queueItem.lead_id]
        );
        
        if (leadDetails.length === 0) {
          await client.query(`UPDATE ai_call_queue_items SET state = 'failed', last_error = 'Lead lock busy or deleted' WHERE id = $1`, [queueItem.id]);
          await client.query('COMMIT');
          continue;
        }
        
        const leadInfo = leadDetails[0];
        if (leadInfo.do_not_call || !['new', 'enriched', 'assigned', 'followup'].includes(leadInfo.lead_stage)) {
          await client.query(`UPDATE ai_call_queue_items SET state = 'failed', last_error = 'Lead ineligible (DNC or stage changed)' WHERE id = $1`, [queueItem.id]);
          await client.query('COMMIT');
          continue;
        }

        if (leadInfo.lead_stage === 'followup' && leadInfo.next_followup_at && new Date(leadInfo.next_followup_at) > new Date()) {
          await client.query(`UPDATE ai_call_queue_items SET state = 'queued', claim_token = NULL, scheduled_at = $1 WHERE id = $2`, [leadInfo.next_followup_at, queueItem.id]);
          await client.query('COMMIT');
          continue;
        }
        
        const toPhone = leadInfo.phone;
        normalizedToPhone = normalizeNorthAmericanPhone(toPhone);
        if (!normalizedToPhone) {
          await client.query(`UPDATE ai_call_queue_items SET state = 'failed', last_error = 'No valid phone' WHERE id = $1`, [queueItem.id]);
          await client.query('COMMIT');
          continue;
        }

        // Phone uniqueness check
        const { rows: duplicateCalls } = await client.query(
          `SELECT 1 FROM ai_call_queue_items q
           JOIN enrichment_results e ON q.lead_id = e.id
           WHERE e.primary_phone = $1 AND e.tenant_id = $2
             AND q.state IN ('claimed', 'dialing', 'ringing', 'streaming', 'active')
             AND q.id != $3`,
          [toPhone, lane.tenant_id, queueItem.id]
        );
        // Also check if any duplicate uses normalized logic via JS array if many matching, 
        // but simplest is just checking DB on exact phone for now. Wait, we should normalize the DB query 
        // since we want normalized uniqueness. But `enrichment_results.primary_phone` might be raw. 
        // We will just do a pattern or LIKE, but we have `normalizeNorthAmericanPhone`. 
        // Let's just check the DB but relying on standard text comparison is tricky if not normalized. 
        // Since we are enforcing uniqueness on `normalizedToPhone`, let's check `toPhone` exactly as a fallback, 
        // but real fix is that we can't easily query normalized values if they aren't saved normalized. 
        // Actually, we can check all active calls for this tenant and filter in JS if they match the normalized phone.
        const { rows: activeCalls } = await client.query(
          `SELECT q.id, e.primary_phone FROM ai_call_queue_items q
           JOIN enrichment_results e ON q.lead_id = e.id
           WHERE e.tenant_id = $1
             AND q.state IN ('claimed', 'dialing', 'ringing', 'streaming', 'active')
             AND q.id != $2`,
          [lane.tenant_id, queueItem.id]
        );
        
        let hasDuplicate = false;
        for (const ac of activeCalls) {
           if (normalizeNorthAmericanPhone(ac.primary_phone) === normalizedToPhone) {
              hasDuplicate = true;
              break;
           }
        }

        if (hasDuplicate) {
          await client.query(`UPDATE ai_call_queue_items SET state = 'queued', claim_token = NULL, scheduled_at = NOW() + INTERVAL '2 minutes' WHERE id = $1`, [queueItem.id]);
          await client.query('COMMIT');
          continue;
        }

      // Fetch Agent Config for snapshot
      const { rows: agentConfigRows } = await client.query(
        `SELECT id, name, voice, language, prompt, greeting, max_call_duration_sec, speech_speed, listen_eot_threshold, listen_eot_timeout_ms
         FROM ai_agent_configs WHERE id = $1`,
        [lane.agent_config_id]
      );
      const agentSnapshot = agentConfigRows[0] || {};

      // 7. Create Session Snapshot
      const { rows: sessionRes } = await client.query(
        `INSERT INTO ai_call_sessions (
           tenant_id, lane_id, queue_item_id, lead_id, phone_number_id, script_version_id, call_state, agent_config_snapshot
         ) VALUES ($1, $2, $3, $4, $5, $6, 'starting', $7) RETURNING id`,
        [lane.tenant_id, lane.id, queueItem.id, queueItem.lead_id, selectedNumber.phone_number_id, lane.active_script_version_id, JSON.stringify(agentSnapshot)]
      );
      sessionId = sessionRes[0].id;

      // 8. Outbound Call
      lastGlobalDialTime = Date.now();
      const callArgs = {
        from: fromPhone,
        to: normalizedToPhone,
        url: `${PUBLIC_BASE_URL}/api/voice/twiml/outbound?sessionId=${sessionId}`,
        statusCallback: `${PUBLIC_BASE_URL}/api/voice/webhooks/call-status?sessionId=${sessionId}`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        machineDetection: 'Enable'
      };
        
        // Double check lane status right before dialing in case it was stopped/paused
        // Lock the lane row so Stop endpoint waits for us to finish creating the call
        const { rows: laneCheck } = await client.query('SELECT status FROM ai_calling_lanes WHERE id = $1 FOR UPDATE', [lane.id]);
        if (laneCheck.length === 0 || laneCheck[0].status !== 'running') {
          await client.query('ROLLBACK');
          await client.query(`UPDATE ai_call_queue_items SET state = 'queued', claim_token = NULL WHERE id = $1`, [queueItem.id]);
          await client.query(`DELETE FROM ai_call_sessions WHERE id = $1`, [sessionId]);
          continue;
        }
        
        swCall = await signalwireClient.calls.create(callArgs);
        
        // Update rotation
        const newCursor = selectedNumber.position === 0 ? 1 : 0;
        await client.query(`UPDATE ai_calling_lanes SET rotation_cursor = $1 WHERE id = $2`, [newCursor, lane.id]);
        
        // Update session, queue, AND CRM ownership
        await client.query(`UPDATE ai_call_sessions SET provider_request_id = $1, signalwire_call_sid = $1 WHERE id = $2`, [swCall.sid, sessionId]);
        await client.query(`UPDATE ai_call_queue_items SET state = 'dialing', session_id = $1 WHERE id = $2`, [sessionId, queueItem.id]);
        await client.query(
          `UPDATE enrichment_results 
           SET lead_stage = 'calling', 
               raw_data = jsonb_set(COALESCE(raw_data, '{}'::jsonb), '{active_call_sid}', $1::jsonb)
           WHERE id = $2`,
          [JSON.stringify(swCall.sid), queueItem.lead_id]
        );

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        
        // Orphan call recovery: if provider call was created but DB failed
        let isOrphanUnrecoverable = false;
        if (swCall && swCall.sid) {
          try {
            await signalwireClient.calls(swCall.sid).update({ status: 'completed' });
          } catch (hangupErr) {
            console.error('[multi-lane-caller] Failed to hangup orphan call:', swCall.sid, hangupErr);
            isOrphanUnrecoverable = true;
          }
        }
        
        // Retry policy
        if (isOrphanUnrecoverable) {
           await client.query(`UPDATE ai_call_queue_items SET state = 'failed', last_error = 'Orphan call unrecoverable' WHERE id = $1`, [queueItem.id]);
        } else if (queueItem.attempt_number < 3) {
           await client.query(`UPDATE ai_call_queue_items SET state = 'queued', last_error = $1, scheduled_at = NOW() + INTERVAL '1 minute' WHERE id = $2`, [err.message, queueItem.id]);
        } else {
           await client.query(`UPDATE ai_call_queue_items SET state = 'failed', last_error = $1 WHERE id = $2`, [err.message, queueItem.id]);
        }
        await client.query(`UPDATE ai_call_sessions SET ended_at = NOW(), hangup_reason = 'provider_error', call_state = 'error' WHERE id = $1`, [sessionId]);
        
        // Number health update
        await client.query(`UPDATE ai_calling_lane_numbers SET last_error = $1 WHERE lane_id = $2 AND phone_number_id = $3`, [err.message, lane.id, selectedNumber.phone_number_id]);
      }

    } finally {
      if (hasLock) {
        await client.query('SELECT pg_advisory_unlock($1)', [lockId]);
      }
      client.release();
    }
  }
}
