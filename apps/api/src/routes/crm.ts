import { FastifyInstance } from 'fastify';
import { normalizeUSPhone } from '../utils/us-phone.js';

// Canonical pipeline stages. Frontend renders columns in this exact order.
export const PIPELINE_STAGES = [
  'new',
  'assigned',
  'calling',
  'called',
  'no_answer',
  'followup',
  'interested',
  'demo_scheduled',
  'proposal_sent',
  'closed_won',
  'closed_lost',
] as const;

type Stage = (typeof PIPELINE_STAGES)[number];

async function writeAudit(
  fastify: FastifyInstance,
  tenantId: string,
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  metadata: any = null,
) {
  try {
    await fastify.db.query(
      `INSERT INTO audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, actorId, action, entityType, entityId, metadata ? JSON.stringify(metadata) : null],
    );
  } catch (err) {
    fastify.log.warn({ err, action }, 'audit log failed');
  }
}

export default async function crmRoutes(fastify: FastifyInstance) {
  // Ensure assigned_to_ai exists (runs once on boot)
  try {
    await fastify.db.query('ALTER TABLE enrichment_results ADD COLUMN IF NOT EXISTS assigned_to_ai BOOLEAN DEFAULT false;');
    await fastify.db.query(`
      CREATE TABLE IF NOT EXISTS ai_calling_controls (
        tenant_id UUID PRIMARY KEY,
        is_running BOOLEAN NOT NULL DEFAULT false,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await fastify.db.query(`UPDATE enrichment_results SET lead_stage = 'assigned' WHERE assigned_to_ai = true AND lead_stage IN ('new', 'enriched');`);
  } catch (err) {
    console.error('Failed to alter enrichment_results for assigned_to_ai:', err);
  }

  // ================================================================
  // LEADS  (enrichment_results surfaced as pipeline leads)
  // ================================================================

  // GET /v1/leads?stage=&owner=&q=&page=&limit=
  fastify.get('/v1/leads', { preHandler: [fastify.authenticate as any] }, async (request: any) => {
    const { tenantId } = request.tenant;
    const q = request.query as any;
    const page = Math.max(1, parseInt(q.page || '1'));
    const limit = Math.min(200, parseInt(q.limit || '100'));
    const offset = (page - 1) * limit;

    const where: string[] = ['tenant_id = $1'];
    const params: any[] = [tenantId];
    if (q.stage) { params.push(q.stage); where.push(`lead_stage = $${params.length}`); }
    if (q.owner) { params.push(q.owner); where.push(`lead_owner_id = $${params.length}`); }
    if (q.assigned_to_ai) {
      params.push(q.assigned_to_ai === 'true' || q.assigned_to_ai === true);
      where.push(`assigned_to_ai = $${params.length}`);
    }
    if (q.q) {
      params.push(`%${q.q}%`);
      where.push(`(domain ILIKE $${params.length} OR company_name ILIKE $${params.length} OR primary_email ILIKE $${params.length})`);
    }

    const sql = `
      SELECT id, domain, company_name, industry_guess, primary_email, primary_phone,
             linkedin_url, facebook_url, instagram_url, twitter_url, youtube_url, tiktok_url,
             whatsapp_link, one_line_pitch, confidence_level, ecommerce_signal, saas_signal,
             lead_stage, lead_owner_id, lead_priority, lead_notes,
             last_contacted_at, next_followup_at,
             ai_summary, ai_pain_points, ai_score, ai_updated_at,
             assigned_to_ai, raw_data,
             created_at
      FROM enrichment_results
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const { rows } = await fastify.db.query(sql, [...params, limit, offset]);

    const { rows: countRows } = await fastify.db.query(
      `SELECT COUNT(*) FROM enrichment_results WHERE ${where.join(' AND ')}`,
      params,
    );
    return { leads: rows, total: parseInt(countRows[0].count), page, limit };
  });

  // POST /v1/leads/queue-ai
  // Queues enrichment leads directly, or promotes calls-module contacts from a niche
  // into enrichment_results so the AI voice worker can call them one by one.
  fastify.post('/v1/leads/queue-ai', { preHandler: [fastify.authenticate as any] }, async (request: any, reply) => {
    const { tenantId, userId } = request.tenant;
    const body = request.body || {};
    const leadIds = Array.isArray(body.lead_ids) ? body.lead_ids.filter(Boolean) : [];
    const contactIds = Array.isArray(body.contact_ids)
      ? body.contact_ids.map(Number).filter((id: number) => Number.isInteger(id) && id > 0)
      : [];
    const nicheId = body.niche_id ? Number(body.niche_id) : null;
    const limit = Math.max(1, Math.min(500, Number(body.limit || 100)));

    if (!leadIds.length && !nicheId && !contactIds.length) {
      return reply.code(400).send({ error: 'Provide lead_ids, contact_ids, or niche_id' });
    }

    let queuedExisting = 0;
    let createdFromContacts = 0;

    if (leadIds.length) {
      const { rowCount } = await fastify.db.query(
        `UPDATE enrichment_results
         SET assigned_to_ai = true,
             lead_stage = CASE
               WHEN lead_stage IN ('calling', 'interested', 'demo_scheduled', 'proposal_sent', 'closed_won', 'closed_lost')
                 THEN lead_stage
               ELSE 'assigned'
             END
         WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [tenantId, leadIds],
      );
      queuedExisting += rowCount || 0;
    }

    if (nicheId) {
      const { rows: jobRows } = await fastify.db.query(
        `INSERT INTO enrichment_jobs (tenant_id, mode, status, source_type, total_items)
         VALUES ($1, 'ai_voice_queue', 'completed', 'crm_niche', 0)
         RETURNING id`,
        [tenantId],
      );
      const jobId = jobRows[0].id;

      const existingParams: any[] = [tenantId, nicheId];
      const selectedExistingFilter = contactIds.length
        ? `AND c.id = ANY($${existingParams.push(contactIds)}::int[])`
        : '';
      const { rowCount: updatedExisting } = await fastify.db.query(
        `UPDATE enrichment_results er
         SET assigned_to_ai = true,
             lead_stage = CASE
               WHEN er.lead_stage IN ('calling', 'interested', 'demo_scheduled', 'proposal_sent', 'closed_won', 'closed_lost')
                 THEN er.lead_stage
               ELSE 'assigned'
             END
         FROM contacts c
         WHERE er.tenant_id = $1
           AND er.raw_data->>'source_contact_id' = c.id::text
           AND c.niche_id = $2
           AND c.phone_number IS NOT NULL
           AND c.phone_number <> ''
           ${selectedExistingFilter}`,
        existingParams,
      );
      queuedExisting += updatedExisting || 0;

      const insertParams: any[] = [jobId, tenantId, nicheId];
      const selectedInsertFilter = contactIds.length
        ? `AND c.id = ANY($${insertParams.push(contactIds)}::int[])`
        : '';
      const limitParam = insertParams.push(limit);
      const { rows: insertedRows } = await fastify.db.query(
        `INSERT INTO enrichment_results (
           job_id, tenant_id, domain, primary_email, primary_phone, company_name,
           industry_guess, one_line_pitch, confidence_level, raw_data,
           lead_stage, assigned_to_ai, lead_priority
         )
         SELECT
           $1,
           $2,
           COALESCE(
             NULLIF(regexp_replace(COALESCE(c.website, ''), '^https?://(www\\.)?([^/]+).*$', '\\2'), ''),
             'contact-' || c.id || '.local'
           ) AS domain,
           c.email,
           c.phone_number,
           COALESCE(NULLIF(c.company, ''), c.name),
           n.name,
           'CRM niche lead queued for AI voice outreach: ' || n.name,
           'crm',
           jsonb_build_object(
             'source', 'contacts',
             'source_contact_id', c.id::text,
             'niche_id', n.id,
             'niche_name', n.name,
             'website', c.website,
             'notes', c.notes
           ),
           'assigned',
           true,
           CASE WHEN COALESCE(c.score, 0) >= 70 THEN 'high' ELSE 'medium' END
         FROM contacts c
         JOIN niches n ON n.id = c.niche_id
         WHERE c.niche_id = $3
           AND c.phone_number IS NOT NULL
           AND c.phone_number <> ''
           ${selectedInsertFilter}
           AND NOT EXISTS (
             SELECT 1 FROM enrichment_results er
             WHERE er.tenant_id = $2
               AND er.raw_data->>'source_contact_id' = c.id::text
           )
         ORDER BY c.updated_at DESC, c.created_at DESC
         LIMIT $${limitParam}
         RETURNING id`,
        insertParams,
      );
      createdFromContacts = insertedRows.length;

      await fastify.db.query(
        `UPDATE enrichment_jobs SET total_items = $1, completed_items = $1, updated_at = NOW() WHERE id = $2`,
        [createdFromContacts, jobId],
      );
    }

    await writeAudit(fastify, tenantId, userId, 'lead.ai_queued', 'lead', 'bulk', {
      leadIds,
      contactIds,
      nicheId,
      queuedExisting,
      createdFromContacts,
    });

    return {
      ok: true,
      queuedExisting,
      createdFromContacts,
      totalQueued: queuedExisting + createdFromContacts,
    };
  });

  fastify.get('/v1/leads/ai-calling/status', { preHandler: [fastify.authenticate as any] }, async (request: any) => {
    const { tenantId } = request.tenant;
    const { rows: controlRows } = await fastify.db.query(
      'SELECT is_running FROM ai_calling_controls WHERE tenant_id = $1',
      [tenantId],
    );
    const { rows: callRows } = await fastify.db.query(
      `SELECT id, raw_data->>'active_call_sid' AS active_call_sid
       FROM enrichment_results
       WHERE tenant_id = $1 AND assigned_to_ai = true AND lead_stage = 'calling'
       ORDER BY last_contacted_at DESC NULLS LAST LIMIT 1`,
      [tenantId],
    );
    const { rows: lastRows } = await fastify.db.query(
      `SELECT
         id,
         company_name,
         domain,
         primary_phone,
         lead_stage,
         last_contacted_at,
         raw_data->>'active_call_sid' AS active_call_sid,
         raw_data
       FROM enrichment_results
       WHERE tenant_id = $1
         AND assigned_to_ai = true
         AND last_contacted_at IS NOT NULL
       ORDER BY last_contacted_at DESC
       LIMIT 1`,
      [tenantId],
    );
    const { rows: nextRows } = await fastify.db.query(
      `SELECT
         id,
         company_name,
         domain,
         primary_phone,
         lead_stage
       FROM enrichment_results
       WHERE tenant_id = $1
         AND assigned_to_ai = true
         AND lead_stage IN ('assigned', 'followup')
         AND primary_phone IS NOT NULL
         AND primary_phone <> ''
         AND (next_followup_at IS NULL OR next_followup_at <= NOW())
       ORDER BY
         CASE WHEN lead_stage = 'followup' THEN 0 ELSE 1 END,
         COALESCE(next_followup_at, created_at) ASC
       LIMIT 1`,
      [tenantId],
    );
    const { rows: queueRows } = await fastify.db.query(
      `SELECT COUNT(*)::int AS count
       FROM enrichment_results
       WHERE tenant_id = $1
         AND assigned_to_ai = true
         AND lead_stage IN ('assigned', 'followup')
         AND primary_phone IS NOT NULL
         AND primary_phone <> ''`,
      [tenantId],
    );
    const { rows: stageRows } = await fastify.db.query(
      `SELECT lead_stage, COUNT(*)::int AS count
       FROM enrichment_results
       WHERE tenant_id = $1 AND assigned_to_ai = true
       GROUP BY lead_stage`,
      [tenantId],
    );
    const { rows: recentRows } = await fastify.db.query(
      `SELECT
         id,
         company_name,
         domain,
         primary_phone,
         primary_email,
         lead_stage,
         lead_notes,
         ai_summary,
         last_contacted_at,
         raw_data
       FROM enrichment_results
       WHERE tenant_id = $1
         AND assigned_to_ai = true
         AND last_contacted_at IS NOT NULL
       ORDER BY last_contacted_at DESC
       LIMIT 12`,
      [tenantId],
    );

    const activeLeadId = callRows[0]?.id || null;
    const activeCallSid = callRows[0]?.active_call_sid || null;
    const lastCall = lastRows[0] || null;
    const nextLead = nextRows[0] || null;
    const stageCounts = Object.fromEntries(stageRows.map((row: any) => [row.lead_stage, row.count]));

    return {
      isRunning: controlRows[0]?.is_running === true,
      activeLeadId,
      activeCallSid,
      lastCall,
      nextLead,
      queueCount: queueRows[0]?.count || 0,
      stageCounts,
      recentActivity: recentRows,
    };
  });

  fastify.post('/v1/leads/ai-calling/start', { preHandler: [fastify.authenticate as any] }, async (request: any) => {
    const { tenantId, userId } = request.tenant;
    await fastify.db.query(
      `INSERT INTO ai_calling_controls (tenant_id, is_running, updated_at)
       VALUES ($1, true, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET is_running = true, updated_at = NOW()`,
      [tenantId],
    );
    await writeAudit(fastify, tenantId, userId, 'ai_calling.started', 'tenant', tenantId);
    return { ok: true, isRunning: true };
  });

  fastify.post('/v1/leads/ai-calling/stop', { preHandler: [fastify.authenticate as any] }, async (request: any) => {
    const { tenantId, userId } = request.tenant;
    await fastify.db.query(
      `INSERT INTO ai_calling_controls (tenant_id, is_running, updated_at)
       VALUES ($1, false, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET is_running = false, updated_at = NOW()`,
      [tenantId],
    );

    const { rows: activeRows } = await fastify.db.query(
      `SELECT id, raw_data->>'active_call_sid' AS active_call_sid
       FROM enrichment_results
       WHERE tenant_id = $1 AND assigned_to_ai = true AND lead_stage = 'calling'`,
      [tenantId],
    );
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (accountSid && authToken) {
      const twilio = (await import('twilio')).default;
      const client = twilio(accountSid, authToken);
      await Promise.all(activeRows
        .filter((row: any) => row.active_call_sid)
        .map((row: any) => client.calls(row.active_call_sid).update({ status: 'completed' }).catch((err: any) => {
          fastify.log.warn({ callSid: row.active_call_sid, err }, 'Could not terminate AI campaign call');
        })));
    }

    await fastify.db.query(
      `UPDATE enrichment_results
       SET lead_stage = 'assigned',
           raw_data = COALESCE(raw_data, '{}'::jsonb) - 'active_call_sid',
           lead_notes = CONCAT_WS(E'\n', NULLIF(lead_notes, ''), '[AI Call] Calling queue stopped before a live call SID was available.')
       WHERE tenant_id = $1
         AND assigned_to_ai = true
         AND lead_stage = 'calling'
         AND COALESCE(raw_data->>'active_call_sid', '') = ''`,
      [tenantId],
    );
    await writeAudit(fastify, tenantId, userId, 'ai_calling.stopped', 'tenant', tenantId, { stoppedCalls: activeRows.length });
    return { ok: true, isRunning: false, stoppedCalls: activeRows.length };
  });

  // POST /v1/leads/:id/start-call → Manually trigger an outbound AI call to a specific lead
  fastify.post('/v1/leads/:id/start-call', { preHandler: [fastify.authenticate as any] }, async (request: any, reply) => {
    const { tenantId, userId } = request.tenant;
    const leadId = request.params.id;

    // Fetch the lead
    const { rows } = await fastify.db.query(
      `SELECT id, tenant_id, primary_phone, company_name, domain, lead_stage, assigned_to_ai
       FROM enrichment_results WHERE id = $1 AND tenant_id = $2`,
      [leadId, tenantId],
    );
    const lead = rows[0];
    if (!lead) return reply.code(404).send({ error: 'Lead not found' });
    if (!lead.primary_phone) return reply.code(400).send({ error: 'Lead has no phone number' });
    if (!lead.assigned_to_ai) return reply.code(400).send({ error: 'Lead is not assigned to AI' });
    if (lead.lead_stage === 'calling') return reply.code(409).send({ error: 'Call already in progress for this lead' });

    // Check Twilio config
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromPhone = process.env.TWILIO_PHONE_NUMBER;
    const publicBaseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';

    if (!accountSid || !authToken || !fromPhone) {
      return reply.code(503).send({ error: 'Twilio is not configured on this server' });
    }

    // Mark lead as calling
    await fastify.db.query(
      `UPDATE enrichment_results SET lead_stage = 'calling', last_contacted_at = NOW() WHERE id = $1`,
      [leadId],
    );

    let callSid: string | null = null;
    try {
      const twilio = (await import('twilio')).default;
      const client = twilio(accountSid, authToken);
      const webhookUrl = `${publicBaseUrl}/api/voice/twiml/outbound?contactId=${leadId}&tenantId=${tenantId}`;
      const normalizedPhone = normalizeUSPhone(lead.primary_phone);
      if (!normalizedPhone) {
        await fastify.db.query(
          `UPDATE enrichment_results
           SET lead_stage = 'no_answer',
               lead_notes = CONCAT_WS(E'\n', NULLIF(lead_notes, ''), '[AI Call] Manual call skipped because phone number is not a valid USA number.')
           WHERE id = $1`,
          [leadId],
        );
        return reply.code(400).send({ error: 'Only valid USA numbers can be called' });
      }

      const call = await client.calls.create({
        url: webhookUrl,
        to: normalizedPhone,
        from: fromPhone,
        method: 'POST',
        statusCallback: `${publicBaseUrl}/api/voice/webhooks/call-status?contactId=${leadId}`,
        statusCallbackMethod: 'POST',
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        record: true,
        recordingChannels: 'mono',
        recordingTrack: 'both',
        recordingStatusCallback: `${publicBaseUrl}/api/voice/webhooks/call-status?contactId=${leadId}`,
        recordingStatusCallbackMethod: 'POST',
        recordingStatusCallbackEvent: ['in-progress', 'completed', 'absent'],
        trim: 'do-not-trim',
        machineDetection: 'Enable',
        machineDetectionTimeout: 8,
      });
      callSid = call.sid;

      // Update lead raw_data with active_call_sid
      await fastify.db.query(
        `UPDATE enrichment_results 
         SET raw_data = jsonb_set(COALESCE(raw_data, '{}'::jsonb), '{active_call_sid}', concat('"', $1::text, '"')::jsonb)
         WHERE id = $2`,
        [callSid, leadId],
      );

      fastify.log.info({ leadId, callSid }, 'Manual outbound call created');
    } catch (err: any) {
      // Roll back stage so the worker can retry
      await fastify.db.query(
        `UPDATE enrichment_results SET lead_stage = 'assigned' WHERE id = $1 AND lead_stage = 'calling'`,
        [leadId],
      );
      return reply.code(502).send({ error: `Twilio call failed: ${err.message}` });
    }

    await writeAudit(fastify, tenantId, userId, 'lead.call_started', 'lead', leadId, { callSid });
    return { ok: true, callSid };
  });

  // POST /v1/leads/:id/end-call → Manually terminate an active AI call
  fastify.post('/v1/leads/:id/end-call', { preHandler: [fastify.authenticate as any] }, async (request: any, reply) => {
    const { tenantId } = request.tenant;
    const leadId = request.params.id;
    const { callSid } = request.body as any;

    // Fetch the lead to verify ownership
    const { rows } = await fastify.db.query(
      `SELECT id, lead_stage, raw_data->>'active_call_sid' AS db_call_sid
       FROM enrichment_results WHERE id = $1 AND tenant_id = $2`,
      [leadId, tenantId],
    );
    const lead = rows[0];
    if (!lead) return reply.code(404).send({ error: 'Lead not found' });

    const activeCallSid = callSid || lead.db_call_sid;
    if (!activeCallSid) {
      // Revert stage just in case
      await fastify.db.query(
        `UPDATE enrichment_results SET lead_stage = 'assigned' WHERE id = $1`,
        [leadId],
      );
      return { ok: true, message: 'No active call SID found, stage reset to assigned' };
    }

    // Terminate call in Twilio
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      return reply.code(503).send({ error: 'Twilio is not configured' });
    }

    try {
      const twilio = (await import('twilio')).default;
      const client = twilio(accountSid, authToken);
      await client.calls(activeCallSid).update({ status: 'completed' });
      fastify.log.info({ leadId, activeCallSid }, 'Manual outbound call terminated via API');
    } catch (err: any) {
      fastify.log.warn({ leadId, activeCallSid, error: err.message }, 'Failed to terminate call in Twilio');
    }

    if (!activeCallSid) {
      await fastify.db.query(
        `UPDATE enrichment_results 
         SET lead_stage = 'assigned',
             raw_data = COALESCE(raw_data, '{}'::jsonb) - 'active_call_sid'
         WHERE id = $1`,
        [leadId],
      );
      return { ok: true, message: 'No active Twilio SID found; lead moved back to assigned' };
    }

    await fastify.db.query(
      `UPDATE enrichment_results
       SET lead_notes = CONCAT_WS(E'\n', NULLIF(lead_notes, ''), '[AI Call] Manual stop requested; waiting for final Twilio status.')
       WHERE id = $1`,
      [leadId],
    );

    return { ok: true, message: 'Call stop requested; final stage will update from Twilio callback.' };
  });

  // GET /v1/leads/active-calls -> Returns mapping of contactId -> callSid for live monitoring
  fastify.get('/v1/leads/active-calls', { preHandler: [fastify.authenticate as any] }, async (request: any) => {
    const { tenantId } = request.tenant;
    try {
      // @ts-ignore
      const { getPipelineStats } = await import('../voice-agent/orchestrator/call-pipeline.js');
      const stats = getPipelineStats();
      const activeCalls: Record<string, string> = {};
      stats.pipelines.forEach((p: any) => {
        if (p.contactId && p.callSid) {
          activeCalls[p.contactId] = p.callSid;
        }
      });

      // Also query the DB for leads in 'calling' stage for this tenant to get their active_call_sid
      const { rows } = await fastify.db.query(
        `SELECT id, raw_data->>'active_call_sid' AS active_call_sid
         FROM enrichment_results
         WHERE tenant_id = $1 AND lead_stage = 'calling'`,
        [tenantId]
      );
      rows.forEach((row: any) => {
        if (row.active_call_sid) {
          activeCalls[row.id] = row.active_call_sid;
        }
      });

      return { activeCalls };
    } catch (err) {
      return { activeCalls: {} };
    }
  });

  // GET /v1/leads/pipeline  → groups counts by stage for Kanban
  fastify.get('/v1/leads/pipeline', { preHandler: [fastify.authenticate as any] }, async (request: any) => {
    const { tenantId } = request.tenant;
    const { rows } = await fastify.db.query(
      `SELECT lead_stage, COUNT(*)::int AS n
       FROM enrichment_results WHERE tenant_id = $1
       GROUP BY lead_stage`,
      [tenantId],
    );
    const map: Record<string, number> = {};
    for (const r of rows) map[r.lead_stage] = r.n;
    return {
      stages: PIPELINE_STAGES.map((s) => ({ stage: s, count: map[s] || 0 })),
    };
  });

  // GET /v1/leads/:id
  fastify.get('/v1/leads/:id', { preHandler: [fastify.authenticate as any] }, async (request: any, reply) => {
    const { tenantId } = request.tenant;
    const { rows } = await fastify.db.query(
      `SELECT * FROM enrichment_results WHERE id = $1 AND tenant_id = $2`,
      [request.params.id, tenantId],
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Lead not found' });
    const { rows: hist } = await fastify.db.query(
      `SELECT * FROM lead_stage_history WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [request.params.id],
    );
    const { rows: taskRows } = await fastify.db.query(
      `SELECT * FROM tasks WHERE lead_id = $1 ORDER BY due_at NULLS LAST, created_at DESC`,
      [request.params.id],
    );
    return { lead: rows[0], history: hist, tasks: taskRows };
  });

  // PATCH /v1/leads/:id  → update stage / owner / notes / priority / next_followup_at
  fastify.patch('/v1/leads/:id', { preHandler: [fastify.authenticate as any] }, async (request: any, reply) => {
    const { tenantId, userId } = request.tenant;
    const body = (request.body || {}) as any;
    const updates: string[] = [];
    const params: any[] = [];

    const { rows: current } = await fastify.db.query(
      `SELECT lead_stage, lead_owner_id, assigned_to_ai FROM enrichment_results WHERE id = $1 AND tenant_id = $2`,
      [request.params.id, tenantId],
    );
    if (!current[0]) return reply.code(404).send({ error: 'Lead not found' });

    if (typeof body.lead_stage === 'string' && PIPELINE_STAGES.includes(body.lead_stage as Stage)) {
      params.push(body.lead_stage); updates.push(`lead_stage = $${params.length}`);
    }
    if (body.lead_owner_id === null || typeof body.lead_owner_id === 'string') {
      params.push(body.lead_owner_id); updates.push(`lead_owner_id = $${params.length}`);
    }
    if (typeof body.lead_priority === 'string') {
      params.push(body.lead_priority); updates.push(`lead_priority = $${params.length}`);
    }
    if (typeof body.lead_notes === 'string') {
      params.push(body.lead_notes); updates.push(`lead_notes = $${params.length}`);
    }
    if (body.next_followup_at === null || typeof body.next_followup_at === 'string') {
      params.push(body.next_followup_at); updates.push(`next_followup_at = $${params.length}`);
    }
    if (typeof body.assigned_to_ai === 'boolean') {
      params.push(body.assigned_to_ai); updates.push(`assigned_to_ai = $${params.length}`);
    }
    if (!updates.length) return reply.code(400).send({ error: 'No valid fields to update' });

    params.push(request.params.id);
    params.push(tenantId);
    const { rows } = await fastify.db.query(
      `UPDATE enrichment_results SET ${updates.join(', ')}
       WHERE id = $${params.length - 1} AND tenant_id = $${params.length}
       RETURNING *`,
      params,
    );

    // Stage-change side effect: history + audit
    if (body.lead_stage && body.lead_stage !== current[0].lead_stage) {
      await fastify.db.query(
        `INSERT INTO lead_stage_history (tenant_id, lead_id, from_stage, to_stage, changed_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [tenantId, request.params.id, current[0].lead_stage, body.lead_stage, userId],
      );
      await writeAudit(fastify, tenantId, userId, 'lead.stage_changed', 'lead', request.params.id, {
        from: current[0].lead_stage, to: body.lead_stage,
      });
    }
    if (body.lead_owner_id !== undefined && body.lead_owner_id !== current[0].lead_owner_id) {
      await writeAudit(fastify, tenantId, userId, 'lead.owner_changed', 'lead', request.params.id, {
        from: current[0].lead_owner_id, to: body.lead_owner_id,
      });
    }
    return { lead: rows[0] };
  });

  // ================================================================
  // TASKS / FOLLOW-UP QUEUE
  // ================================================================

  // GET /v1/tasks?status=open&assigned_to=&due_before=
  fastify.get('/v1/tasks', { preHandler: [fastify.authenticate as any] }, async (request: any) => {
    const { tenantId } = request.tenant;
    const q = request.query as any;
    const where: string[] = ['tenant_id = $1'];
    const params: any[] = [tenantId];
    if (q.status) { params.push(q.status); where.push(`status = $${params.length}`); }
    if (q.assigned_to) { params.push(q.assigned_to); where.push(`assigned_to = $${params.length}`); }
    if (q.lead_id) { params.push(q.lead_id); where.push(`lead_id = $${params.length}`); }
    if (q.due_before) { params.push(q.due_before); where.push(`due_at <= $${params.length}`); }

    const { rows } = await fastify.db.query(
      `SELECT * FROM tasks WHERE ${where.join(' AND ')}
       ORDER BY due_at NULLS LAST, created_at DESC LIMIT 500`,
      params,
    );
    return { tasks: rows };
  });

  // POST /v1/tasks
  fastify.post('/v1/tasks', { preHandler: [fastify.authenticate as any] }, async (request: any, reply) => {
    const { tenantId, userId } = request.tenant;
    const b = (request.body || {}) as any;
    if (!b.title) return reply.code(422).send({ error: 'title required' });
    const { rows } = await fastify.db.query(
      `INSERT INTO tasks (tenant_id, lead_id, assigned_to, created_by, title, description, task_type, due_at, priority)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        tenantId, b.lead_id || null, b.assigned_to || userId, userId,
        b.title, b.description || null, b.task_type || 'followup',
        b.due_at || null, b.priority || 'medium',
      ],
    );
    await writeAudit(fastify, tenantId, userId, 'task.created', 'task', rows[0].id, { title: b.title });
    return reply.code(201).send({ task: rows[0] });
  });

  // PATCH /v1/tasks/:id
  fastify.patch('/v1/tasks/:id', { preHandler: [fastify.authenticate as any] }, async (request: any, reply) => {
    const { tenantId, userId } = request.tenant;
    const b = (request.body || {}) as any;
    const updates: string[] = [];
    const params: any[] = [];
    for (const k of ['title', 'description', 'task_type', 'due_at', 'priority', 'assigned_to', 'status']) {
      if (k in b) { params.push(b[k]); updates.push(`${k} = $${params.length}`); }
    }
    if (b.status === 'done') { updates.push(`completed_at = now()`); }
    if (!updates.length) return reply.code(400).send({ error: 'No fields to update' });
    params.push(request.params.id); params.push(tenantId);
    const { rows } = await fastify.db.query(
      `UPDATE tasks SET ${updates.join(', ')} WHERE id = $${params.length - 1} AND tenant_id = $${params.length}
       RETURNING *`,
      params,
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Task not found' });
    if (b.status === 'done') {
      await writeAudit(fastify, tenantId, userId, 'task.completed', 'task', request.params.id);
    }
    return { task: rows[0] };
  });

  // DELETE /v1/tasks/:id
  fastify.delete('/v1/tasks/:id', { preHandler: [fastify.authenticate as any] }, async (request: any) => {
    const { tenantId } = request.tenant;
    await fastify.db.query(`DELETE FROM tasks WHERE id = $1 AND tenant_id = $2`, [request.params.id, tenantId]);
    return { success: true };
  });

  // ================================================================
  // ANALYTICS
  // ================================================================

  // GET /v1/analytics/overview
  fastify.get('/v1/analytics/overview', { preHandler: [fastify.authenticate as any] }, async (request: any) => {
    const { tenantId } = request.tenant;
    const q = (request.query || {}) as any;
    const days = Math.min(365, Math.max(1, parseInt(q.days || '30')));

    const [leadsByStage, stageMovement, tasksOpen, enrichJobs, topIndustries, costsData] = await Promise.all([
      fastify.db.query(
        `SELECT lead_stage, COUNT(*)::int AS n FROM enrichment_results
         WHERE tenant_id = $1 GROUP BY lead_stage`,
        [tenantId],
      ),
      fastify.db.query(
        `SELECT to_stage, COUNT(*)::int AS n FROM lead_stage_history
         WHERE tenant_id = $1 AND created_at > now() - ($2 || ' days')::interval
         GROUP BY to_stage`,
        [tenantId, String(days)],
      ),
      fastify.db.query(
        `SELECT COUNT(*)::int AS n FROM tasks
         WHERE tenant_id = $1 AND status = 'open'`,
        [tenantId],
      ),
      fastify.db.query(
        `SELECT status, COUNT(*)::int AS n FROM enrichment_jobs
         WHERE tenant_id = $1 AND created_at > now() - ($2 || ' days')::interval
         GROUP BY status`,
        [tenantId, String(days)],
      ),
      fastify.db.query(
        `SELECT industry_guess AS industry, COUNT(*)::int AS n FROM enrichment_results
         WHERE tenant_id = $1 AND industry_guess IS NOT NULL
         GROUP BY industry_guess ORDER BY n DESC LIMIT 10`,
        [tenantId],
      ),
      fastify.db.query(
        `SELECT 
           COALESCE(SUM((cost_breakdown->'twilio'->>'total')::numeric), 0) AS twilio_cost,
           COALESCE(SUM((cost_breakdown->'openAI'->>'cost')::numeric), 0) AS openai_cost
         FROM voice_call_sessions vcs
         JOIN calls c ON c.call_sid = vcs.call_sid
         WHERE c.tenant_id = $1 AND vcs.created_at > now() - ($2 || ' days')::interval`,
        [tenantId, String(days)],
      ),
    ]);

    return {
      range_days: days,
      leads_by_stage: leadsByStage.rows,
      stage_movement: stageMovement.rows,
      tasks_open: tasksOpen.rows[0]?.n || 0,
      enrichment_jobs: enrichJobs.rows,
      top_industries: topIndustries.rows,
      costs: {
        twilio: parseFloat(costsData?.rows[0]?.twilio_cost || 0),
        openai: parseFloat(costsData?.rows[0]?.openai_cost || 0),
        total: parseFloat(costsData?.rows[0]?.twilio_cost || 0) + parseFloat(costsData?.rows[0]?.openai_cost || 0),
      }
    };
  });

  // ================================================================
  // AUDIT LOG (read-only)
  // ================================================================
  fastify.get('/v1/audit', { preHandler: [fastify.authenticate as any] }, async (request: any) => {
    const { tenantId, role } = request.tenant;
    if (role !== 'owner' && role !== 'admin' && role !== 'manager') {
      return { entries: [] };
    }
    const q = (request.query || {}) as any;
    const limit = Math.min(200, parseInt(q.limit || '100'));
    const { rows } = await fastify.db.query(
      `SELECT a.*, u.email AS actor_email
       FROM audit_log a LEFT JOIN users u ON u.id = a.actor_user_id
       WHERE a.tenant_id = $1 ORDER BY a.created_at DESC LIMIT $2`,
      [tenantId, limit],
    );
    return { entries: rows };
  });

  // ================================================================
  // AI LAYER  (OpenAI-backed; falls back to deterministic stub when no key)
  // ================================================================
  const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
  const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  async function callOpenAI(system: string, user: string): Promise<string> {
    if (!OPENAI_KEY) return '';
    try {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          temperature: 0.4,
          max_tokens: 600,
        }),
      });
      if (!resp.ok) return '';
      const data = (await resp.json()) as any;
      return data.choices?.[0]?.message?.content?.trim() || '';
    } catch {
      return '';
    }
  }

  // POST /v1/ai/lead-summary  { lead_id }
  fastify.post('/v1/ai/lead-summary', { preHandler: [fastify.authenticate as any] }, async (request: any, reply) => {
    const { tenantId, userId } = request.tenant;
    const { lead_id } = (request.body || {}) as any;
    if (!lead_id) return reply.code(422).send({ error: 'lead_id required' });

    const { rows } = await fastify.db.query(
      `SELECT * FROM enrichment_results WHERE id = $1 AND tenant_id = $2`,
      [lead_id, tenantId],
    );
    const lead = rows[0];
    if (!lead) return reply.code(404).send({ error: 'Lead not found' });

    const context = [
      `Company: ${lead.company_name || lead.domain}`,
      `Domain: ${lead.domain}`,
      `Industry: ${lead.industry_guess || 'unknown'}`,
      `Pitch: ${lead.one_line_pitch || ''}`,
      `Ecommerce: ${lead.ecommerce_signal}`,
      `SaaS: ${lead.saas_signal}`,
      `CMS: ${lead.cms_guess || ''}`,
      `Email: ${lead.primary_email || 'none'} / Phone: ${lead.primary_phone || 'none'}`,
    ].join('\n');

    const system = 'You are a senior SDR. Write concise sales intelligence on a prospect.';
    const user = `Analyze this prospect and output EXACTLY this format in plain text:\n\nSUMMARY:\n<2-3 sentence company summary>\n\nPAIN_POINTS:\n- <pain 1>\n- <pain 2>\n- <pain 3>\n\nSCORE: <0-100 integer>\n\nProspect data:\n${context}`;

    let ai = await callOpenAI(system, user);
    if (!ai) {
      // Fallback stub when no OPENAI_KEY — deterministic placeholder.
      ai = `SUMMARY:\n${lead.company_name || lead.domain} operates in ${lead.industry_guess || 'an unclassified'} industry.\n\nPAIN_POINTS:\n- Configure OPENAI_API_KEY to enable real AI analysis.\n\nSCORE: 50`;
    }

    const sumMatch = ai.match(/SUMMARY:\s*([\s\S]*?)(?=\n\s*PAIN_POINTS:|$)/i);
    const painMatch = ai.match(/PAIN_POINTS:\s*([\s\S]*?)(?=\n\s*SCORE:|$)/i);
    const scoreMatch = ai.match(/SCORE:\s*(\d+)/i);
    const summary = sumMatch?.[1]?.trim() || ai;
    const pains = painMatch?.[1]?.trim() || '';
    const score = scoreMatch ? Math.min(100, Math.max(0, parseInt(scoreMatch[1]))) : null;

    await fastify.db.query(
      `UPDATE enrichment_results
       SET ai_summary = $1, ai_pain_points = $2, ai_score = $3, ai_updated_at = now()
       WHERE id = $4 AND tenant_id = $5`,
      [summary, pains, score, lead_id, tenantId],
    );
    await writeAudit(fastify, tenantId, userId, 'ai.summary_generated', 'lead', lead_id, { score });
    return { summary, pain_points: pains, score };
  });

  // POST /v1/ai/generate-message  { lead_id, channel: 'email' | 'call' | 'linkedin' }
  // Returns generated text; does NOT send anything (collect-only, per spec).
  fastify.post('/v1/ai/generate-message', { preHandler: [fastify.authenticate as any] }, async (request: any, reply) => {
    const { tenantId } = request.tenant;
    const b = (request.body || {}) as any;
    if (!b.lead_id) return reply.code(422).send({ error: 'lead_id required' });
    const channel = b.channel || 'email';

    const { rows } = await fastify.db.query(
      `SELECT * FROM enrichment_results WHERE id = $1 AND tenant_id = $2`,
      [b.lead_id, tenantId],
    );
    const lead = rows[0];
    if (!lead) return reply.code(404).send({ error: 'Lead not found' });

    const system = `You are a world-class SDR writing a short outbound ${channel} message.`;
    const user = `Write a concise, personalized ${channel} message for:\nCompany: ${lead.company_name || lead.domain}\nIndustry: ${lead.industry_guess || 'unknown'}\nPitch: ${lead.one_line_pitch || ''}\n\nKeep it under 120 words and include one specific observation about their business.`;
    let text = await callOpenAI(system, user);
    if (!text) text = `[AI disabled — set OPENAI_API_KEY.]\nHi ${lead.company_name || 'there'}, I noticed you operate in the ${lead.industry_guess || 'same'} space and wanted to share how we help similar companies automate outbound.`;
    return { channel, text };
  });
}
