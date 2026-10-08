// @ts-ignore shared contact synchronization runtime
import { syncNicheContacts } from './contact-sync.js';
import { getPool } from '../../calls-module/db/index.js';
import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

export function normalizeNorthAmericanPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const parsed = parsePhoneNumberFromString(phone, 'US');
  if (parsed && parsed.isValid() && parsed.countryCallingCode === '1') {
    return parsed.number;
  }
  return null;
}

export async function populateLaneQueue(tenantId: string, laneId: string, nicheId: number, agentConfigId: string) {
  const synced = await syncNicheContacts(tenantId, nicheId);
  const pool = getPool();
  
  // 1. Backfill niche_id from raw_data if missing (for legacy data)
  await pool.query(
    `UPDATE enrichment_results 
     SET niche_id = (raw_data->>'niche_id')::integer 
     WHERE tenant_id = $1 AND niche_id IS NULL AND raw_data ? 'niche_id'`,
    [tenantId]
  );

  // 2. Insert eligible leads into ai_call_queue_items
  // Eligibility: same tenant, same niche, valid phone, not DNC, 
  // stage is new/enriched/assigned or followup due, not active in another lane queue
  
  const query = `
    INSERT INTO ai_call_queue_items (tenant_id, lane_id, lead_id, state, priority)
    SELECT er.tenant_id, $2, er.id, 'queued', 100
    FROM enrichment_results er
    WHERE er.tenant_id = $1
      AND er.niche_id = $3
      AND er.do_not_call = false
      AND er.lead_stage IN ('new', 'enriched', 'assigned', 'followup')
      AND (
        er.lead_stage != 'followup' OR 
        (er.next_followup_at IS NOT NULL AND er.next_followup_at <= NOW())
      )
      AND er.primary_phone IS NOT NULL
      -- Must not already be active in ANY lane queue
      AND NOT EXISTS (
        SELECT 1 FROM ai_call_queue_items q 
        WHERE q.lead_id = er.id 
          AND q.state IN ('queued', 'claimed', 'dialing', 'ringing', 'streaming')
      )
    ORDER BY CASE WHEN er.lead_stage = 'followup' THEN 0 ELSE 1 END, er.created_at ASC
    ON CONFLICT (tenant_id, lead_id) WHERE state IN ('queued', 'claimed', 'dialing', 'ringing', 'streaming')
    DO NOTHING
    RETURNING id;
  `;
  
  const result = await pool.query(query, [tenantId, laneId, nicheId]);
  
  // 3. Mark them assigned_to_ai in enrichment_results just to mirror old behavior (optional but good for UI)
  if (result.rowCount && result.rowCount > 0) {
    const ids = result.rows.map((r: any) => r.id);
    await pool.query(
      `UPDATE enrichment_results er
       SET assigned_to_ai = true,
           ai_calling_lane_id = $2,
           assigned_ai_agent_id = $3,
           lead_stage = CASE WHEN lead_stage = 'new' OR lead_stage = 'enriched' THEN 'assigned' ELSE lead_stage END
       FROM ai_call_queue_items q
       WHERE q.id = ANY($1::uuid[]) AND er.id = q.lead_id`,
      [ids, laneId, agentConfigId]
    );
  }
  
  return synced.queued + (result.rowCount || 0);
}
