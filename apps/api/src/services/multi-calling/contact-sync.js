import { getPool } from '../../calls-module/db/index.js';
import { normalizeNorthAmericanPhone } from '../../utils/us-phone.js';

// Lean calling records: no website crawl, email discovery, or voice consent inference.
export async function syncNicheContacts(tenantId, nicheId = null) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`maps-calling-sync:${tenantId}`]);
    const { rows } = await client.query(`SELECT c.*, n.name AS niche_name FROM contacts c
      JOIN niches n ON n.id = c.niche_id
      WHERE c.tenant_id = $1 AND ($2::integer IS NULL OR c.niche_id = $2)`, [tenantId, nicheId]);
    const contacts = rows.map(c => ({ ...c, normalized_phone: normalizeNorthAmericanPhone(c.phone_number) }))
      .filter(c => c.normalized_phone);
    const data = JSON.stringify(contacts);
    // Reuse website-enrichment records by phone when they lack the contact link.
    // Their missing niche must not make already-scraped leads disappear.
    await client.query(`WITH matches AS (
      SELECT c.id AS contact_id, c.niche_id, candidate.id AS result_id FROM
        jsonb_to_recordset($2::jsonb) AS c(id integer, niche_id integer, normalized_phone text)
      JOIN LATERAL (SELECT e.id FROM enrichment_results e WHERE e.tenant_id = $1
        AND NOT (e.raw_data ? 'source_contact_id')
        AND regexp_replace(COALESCE(e.primary_phone, ''), '[^0-9]', '', 'g') IN
          (substring(c.normalized_phone from 2), substring(c.normalized_phone from 3))
        AND NOT EXISTS (SELECT 1 FROM ai_call_sessions s WHERE s.lead_id = e.id AND s.ended_at IS NULL)
        ORDER BY e.created_at DESC, e.id DESC LIMIT 1) candidate ON true
      WHERE NOT EXISTS (SELECT 1 FROM enrichment_results e WHERE e.tenant_id = $1
        AND e.raw_data->>'source_contact_id' = c.id::text)
    ) UPDATE enrichment_results e SET niche_id = m.niche_id,
      raw_data = e.raw_data || jsonb_build_object('source_contact_id', m.contact_id::text, 'niche_id', m.niche_id)
      FROM matches m WHERE e.id = m.result_id`, [tenantId, data]);
    // Refresh only identity fields on linked records; preserve outcomes and never clear DNC.
    await client.query(`UPDATE enrichment_results e SET
      niche_id = c.niche_id, primary_phone = c.normalized_phone,
      company_name = COALESCE(NULLIF(c.company, ''), c.name),
      primary_email = COALESCE(NULLIF(c.email, ''), e.primary_email),
      do_not_call = e.do_not_call OR c.do_not_call OR COALESCE(c.unsubscribed, false)
      FROM jsonb_to_recordset($2::jsonb) AS c(id integer, niche_id integer,
        normalized_phone text, company text, name text, email text, do_not_call boolean, unsubscribed boolean)
      WHERE e.tenant_id = $1 AND e.raw_data->>'source_contact_id' = c.id::text`, [tenantId, data]);
    const missing = await client.query(`SELECT c.* FROM jsonb_to_recordset($2::jsonb) AS c(
      id integer, niche_id integer, normalized_phone text, name text, company text, website text,
      email text, niche_name text, do_not_call boolean, unsubscribed boolean, stage text,
      ai_voice_consent boolean, ai_voice_consent_at timestamptz, ai_voice_consent_source text)
      WHERE NOT c.do_not_call AND NOT COALESCE(c.unsubscribed, false)
        AND COALESCE(c.stage, 'new_lead') NOT IN ('not_interested', 'do_not_call', 'closed_lost', 'closed_won')
        AND NOT EXISTS (SELECT 1 FROM enrichment_results e WHERE e.tenant_id = $1
          AND (e.raw_data->>'source_contact_id' = c.id::text OR
            regexp_replace(COALESCE(e.primary_phone, ''), '[^0-9]', '', 'g') IN
            (substring(c.normalized_phone from 2), substring(c.normalized_phone from 3))))`, [tenantId, data]);
    if (missing.rows.length) {
      const job = await client.query(`INSERT INTO enrichment_jobs
        (tenant_id, mode, status, source_type, total_items)
        VALUES ($1, 'ai_voice_queue', 'completed', 'crm_niche', $2) RETURNING id`, [tenantId, missing.rows.length]);
      await client.query(`WITH selected AS (
        SELECT * FROM jsonb_to_recordset($3::jsonb) AS c(id integer, niche_id integer,
          normalized_phone text, name text, company text, website text, email text, niche_name text,
          ai_voice_consent boolean, ai_voice_consent_at timestamptz, ai_voice_consent_source text)
      ), items AS (
        INSERT INTO enrichment_job_items (job_id, tenant_id, raw_input, normalized_domain, status, finished_at)
        SELECT $2, $1, 'crm-contact:' || id, COALESCE(NULLIF(website, ''), 'contact-' || id || '.local'),
          'completed', NOW() FROM selected RETURNING id, raw_input, normalized_domain
      ) INSERT INTO enrichment_results (job_item_id, tenant_id, domain, primary_phone, company_name,
        primary_email, niche_id, industry_guess, raw_data, lead_stage,
        ai_voice_consent, ai_voice_consent_at, ai_voice_consent_source)
      SELECT i.id, $1, i.normalized_domain, c.normalized_phone, COALESCE(NULLIF(c.company, ''), c.name),
        c.email, c.niche_id, c.niche_name,
        jsonb_build_object('source', 'contacts', 'source_contact_id', c.id::text,
          'niche_id', c.niche_id, 'niche_name', c.niche_name, 'website', c.website),
        'new', c.ai_voice_consent, c.ai_voice_consent_at, c.ai_voice_consent_source
      FROM selected c JOIN items i ON i.raw_input = 'crm-contact:' || c.id`,
      [tenantId, job.rows[0].id, JSON.stringify(missing.rows)]);
    }
    // A waiting item must still match its lane's current niche and remain callable.
    await client.query(`UPDATE ai_call_queue_items q SET state = 'cancelled', updated_at = NOW(),
      last_error = 'Lead no longer matches lane configuration or is opted out'
      FROM ai_calling_lanes l, enrichment_results e
      WHERE q.tenant_id = $1 AND q.lane_id = l.id AND q.lead_id = e.id AND q.state = 'queued'
        AND (l.niche_id IS DISTINCT FROM e.niche_id OR e.do_not_call)`, [tenantId]);
    // Fill configured lanes even while paused/ready; queue visibility is independent of dialing.
    const lanes = await client.query(`SELECT id, niche_id, agent_config_id FROM ai_calling_lanes
      WHERE tenant_id = $1 AND niche_id IS NOT NULL AND agent_config_id IS NOT NULL
        AND ($2::integer IS NULL OR niche_id = $2) ORDER BY slot_number`, [tenantId, nicheId]);
    let queued = 0;
    for (const lane of lanes.rows) {
      const result = await client.query(`INSERT INTO ai_call_queue_items (tenant_id, lane_id, lead_id, state, priority)
        SELECT e.tenant_id, $2, e.id, 'queued', 100 FROM enrichment_results e
        WHERE e.tenant_id = $1 AND e.niche_id = $3 AND e.do_not_call = false
          AND e.lead_stage IN ('new', 'enriched', 'assigned', 'followup')
          AND (e.lead_stage != 'followup' OR e.next_followup_at <= NOW())
          AND e.primary_phone IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.tenant_id = e.tenant_id
            AND c.id::text = e.raw_data->>'source_contact_id' AND (c.do_not_call OR COALESCE(c.unsubscribed, false)))
          AND NOT EXISTS (SELECT 1 FROM ai_call_queue_items q WHERE q.tenant_id = e.tenant_id
            AND q.lead_id = e.id AND q.state IN ('queued', 'claimed', 'dialing', 'ringing', 'streaming'))
        ON CONFLICT (tenant_id, lead_id) WHERE state IN ('queued', 'claimed', 'dialing', 'ringing', 'streaming')
        DO NOTHING RETURNING id`, [tenantId, lane.id, lane.niche_id]);
      queued += result.rowCount;
      await client.query(`UPDATE enrichment_results e SET assigned_to_ai = true,
        assigned_ai_agent_id = $3, ai_calling_lane_id = $2,
        lead_stage = CASE WHEN e.lead_stage IN ('new', 'enriched') THEN 'assigned' ELSE e.lead_stage END
        FROM ai_call_queue_items q WHERE q.tenant_id = $1 AND q.lane_id = $2 AND q.lead_id = e.id
          AND q.state = 'queued'`, [tenantId, lane.id, lane.agent_config_id]);
    }
    await client.query('COMMIT');
    return { created: missing.rows.length, queued };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
