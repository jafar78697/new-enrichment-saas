import { FastifyInstance } from 'fastify';

// Canonical pipeline stages. Frontend renders columns in this exact order.
export const PIPELINE_STAGES = [
  'new',
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
             assigned_to_ai,
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

  // GET /v1/leads/active-calls -> Returns mapping of contactId -> callSid for live monitoring
  fastify.get('/v1/leads/active-calls', { preHandler: [fastify.authenticate as any] }, async (request: any) => {
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

    const [leadsByStage, stageMovement, tasksOpen, enrichJobs, topIndustries] = await Promise.all([
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
    ]);

    return {
      range_days: days,
      leads_by_stage: leadsByStage.rows,
      stage_movement: stageMovement.rows,
      tasks_open: tasksOpen.rows[0]?.n || 0,
      enrichment_jobs: enrichJobs.rows,
      top_industries: topIndustries.rows,
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
