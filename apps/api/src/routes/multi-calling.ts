import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ScriptSchema } from '../services/multi-calling/script-schema.js';
import { compileScript } from '../services/multi-calling/script-compiler.js';
import { validateScriptGraph } from '../services/multi-calling/script-validator.js';
import { populateLaneQueue } from '../services/multi-calling/queue-service.js';
// @ts-ignore — shared JavaScript voice runtime
import { finalizeUnstreamedCall } from '../voice-agent/services/unstreamed-call-result.js';
import { signalwireClient } from '../calls-module/config/signalwire.js';
// @ts-ignore — shared scheduler runtime
import { stopTimerBlocksCalling } from '../services/multi-calling/stop-timer.js';

export default async function (fastify: FastifyInstance) {
  const draftExpectation = z.object({ expectedDraftId: z.string().uuid(), expectedRevision: z.number().int().positive() });
  const mapZodErrorsToIssues = (zodError: any, definition: any): any[] => {
    if (!zodError || !zodError.errors) return [{ code: 'SCHEMA_ERROR', message: zodError?.message || 'Invalid schema' }];
    return zodError.errors.map((e: any) => {
      let nodeId: string | undefined = undefined;
      const pathStr = e.path.join('.');
      if (e.path[0] === 'nodes' && typeof e.path[1] === 'number') {
        const nodeIndex = e.path[1];
        if (definition?.nodes && definition.nodes[nodeIndex]?.id) {
          nodeId = definition.nodes[nodeIndex].id;
        }
      }
      return {
        nodeId,
        field: pathStr,
        code: 'SCHEMA_ERROR',
        message: e.message
      };
    });
  };

  
  fastify.get('/v1/multi-calling/stop-timer', {
    preHandler: [fastify.authenticate]
  }, async (req: any) => {
    const result = await fastify.db.query(`SELECT *, clock_timestamp() AS server_now
      FROM ai_calling_stop_timers WHERE tenant_id = $1`, [req.tenant.tenantId]);
    return { timer: result.rows[0] || null, serverNow: result.rows[0]?.server_now || new Date().toISOString() };
  });

  fastify.put('/v1/multi-calling/stop-timer', {
    preHandler: [fastify.authenticate]
  }, async (req: any, reply) => {
    const parsed = z.object({ durationSeconds: z.number().int().min(60).max(604800) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Choose a duration between 1 minute and 7 days.' });
    const result = await fastify.db.query(`INSERT INTO ai_calling_stop_timers
      (tenant_id, duration_seconds, stop_at, status)
      VALUES ($1, $2::integer, clock_timestamp() + ($2::integer * INTERVAL '1 second'), 'scheduled')
      ON CONFLICT (tenant_id) DO UPDATE SET duration_seconds = EXCLUDED.duration_seconds,
        stop_at = EXCLUDED.stop_at, status = 'scheduled', armed_at = clock_timestamp(),
        completed_at = NULL, next_attempt_at = NULL, last_error = NULL, updated_at = NOW()
      WHERE ai_calling_stop_timers.status <> 'stopping'
      RETURNING *, clock_timestamp() AS server_now`, [req.tenant.tenantId, parsed.data.durationSeconds]);
    if (!result.rowCount) return reply.code(409).send({ error: 'Calls are still disconnecting. Wait for all lanes to stop before setting another timer.' });
    return { timer: result.rows[0], serverNow: result.rows[0].server_now };
  });

  fastify.delete('/v1/multi-calling/stop-timer', {
    preHandler: [fastify.authenticate]
  }, async (req: any, reply) => {
    const result = await fastify.db.query(`UPDATE ai_calling_stop_timers SET status = 'cancelled',
      last_error = NULL, next_attempt_at = NULL, updated_at = NOW()
      WHERE tenant_id = $1 AND status <> 'stopping'
      RETURNING *, clock_timestamp() AS server_now`, [req.tenant.tenantId]);
    if (!result.rowCount) {
      const current = await fastify.db.query('SELECT status FROM ai_calling_stop_timers WHERE tenant_id = $1', [req.tenant.tenantId]);
      if (current.rows[0]?.status === 'stopping') return reply.code(409).send({ error: 'Calls are already disconnecting. Wait for completion.' });
    }
    return { timer: result.rows[0] || null, serverNow: result.rows[0]?.server_now || new Date().toISOString() };
  });

  fastify.get('/v1/multi-calling/integrations/status', {
    preHandler: [fastify.authenticate]
  }, async (req: any, reply) => {
    // Check local env config
    const hasDeepgram = !!process.env.DEEPGRAM_API_KEY;
    const hasSignalWire = !!(process.env.SIGNALWIRE_PROJECT_ID && process.env.SIGNALWIRE_API_TOKEN && process.env.SIGNALWIRE_SPACE_URL);
    
    let deepgramVerified = false;
    let signalwireVerified = false;

    if (hasDeepgram) {
      try {
        const res = await fetch('https://api.deepgram.com/v1/projects', {
          headers: { 'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}` }
        });
        if (res.ok) deepgramVerified = true;
      } catch (e) {}
    }

    if (hasSignalWire) {
      try {
        const auth = Buffer.from(`${process.env.SIGNALWIRE_PROJECT_ID}:${process.env.SIGNALWIRE_API_TOKEN}`).toString('base64');
        const res = await fetch(`https://${process.env.SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${process.env.SIGNALWIRE_PROJECT_ID}/IncomingPhoneNumbers.json`, {
          headers: { 'Authorization': `Basic ${auth}` }
        });
        if (res.ok) signalwireVerified = true;
      } catch (e) {}
    }

    return {
      deepgram: {
        configured: hasDeepgram,
        runtimeReady: (fastify as any).voiceAgentReady === true,
        verified: deepgramVerified,
        lastCheckedAt: new Date().toISOString()
      },
      signalwire: {
        configured: hasSignalWire,
        verified: signalwireVerified,
        expectedSpace: process.env.SIGNALWIRE_SPACE_URL || null,
        lastCheckedAt: new Date().toISOString()
      }
    };
  });

  fastify.get('/v1/multi-calling/lanes', {
    preHandler: [fastify.authenticate]
  }, async (req: any, reply) => {
    const tenantId = req.tenant.tenantId;
    const result = await fastify.db.query(
      `SELECT l.*, 
        a.name as agent_name, 
        a.voice as voice_id,
        n.name as niche_name,
        sv.version as script_version,
        s.name as script_name
       FROM ai_calling_lanes l
       LEFT JOIN ai_agent_configs a ON l.agent_config_id = a.id
       LEFT JOIN niches n ON l.niche_id = n.id
       LEFT JOIN ai_calling_script_versions sv ON l.active_script_version_id = sv.id
       LEFT JOIN ai_calling_scripts s ON sv.script_id = s.id
       WHERE l.tenant_id = $1
       ORDER BY l.slot_number ASC`,
      [tenantId]
    );

    const lanes = result.rows;
    for (const lane of lanes) {
      const q = await fastify.db.query(`SELECT state, COUNT(*) as count FROM ai_call_queue_items WHERE lane_id = $1 GROUP BY state`, [lane.id]);
      const contacts = await fastify.db.query(`SELECT COUNT(*)::int AS total FROM contacts
        WHERE tenant_id = $1 AND niche_id = $2`, [tenantId, lane.niche_id]);
      lane.niche_lead_count = contacts.rows[0].total;
      lane.queue = q.rows.reduce((acc: any, row: any) => ({ ...acc, [row.state]: parseInt(row.count) }), {});
      
      const nums = await fastify.db.query(`SELECT n.id as phone_number_id, n.phone_number, ln.position, ln.health_status FROM ai_calling_lane_numbers ln JOIN phone_numbers n ON ln.phone_number_id = n.id WHERE ln.lane_id = $1 ORDER BY ln.position ASC`, [lane.id]);
      lane.numbers = nums.rows;

      const statsRes = await fastify.db.query(
        `SELECT outcome, COUNT(*) as count FROM ai_call_sessions WHERE lane_id = $1 GROUP BY outcome`,
        [lane.id]
      );
      lane.stats = statsRes.rows.reduce((acc: any, row: any) => ({ ...acc, [row.outcome || 'called']: parseInt(row.count) }), {});

      const queuePreviewRes = await fastify.db.query(
        `SELECT er.company_name, er.domain 
         FROM ai_call_queue_items q 
         JOIN enrichment_results er ON q.lead_id = er.id 
         WHERE q.lane_id = $1 AND q.state = 'queued' 
         ORDER BY q.priority ASC, q.scheduled_at ASC 
         LIMIT 3`,
         [lane.id]
      );
      lane.queue_preview = queuePreviewRes.rows;

      const activeCallRes = await fastify.db.query(
        `SELECT s.signalwire_call_sid, s.call_state, er.company_name, er.primary_phone, er.domain
         FROM ai_call_sessions s
         LEFT JOIN enrichment_results er ON s.lead_id = er.id
         WHERE s.lane_id = $1 AND s.ended_at IS NULL AND s.call_state IN ('starting', 'ringing', 'in-progress', 'streaming', 'answered', 'wait', 'identify', 'listening', 'ending') 
         ORDER BY s.created_at DESC LIMIT 1`,
        [lane.id]
      );
      if (activeCallRes.rowCount > 0) {
        lane.active_call_sid = activeCallRes.rows[0].signalwire_call_sid;
        lane.active_call_state = activeCallRes.rows[0].call_state;
        lane.active_prospect = {
          name: activeCallRes.rows[0].company_name || activeCallRes.rows[0].domain || 'Unknown',
          company: activeCallRes.rows[0].company_name || activeCallRes.rows[0].domain,
          phone: activeCallRes.rows[0].primary_phone
        };
      }
    }

    return { lanes };
  });

  fastify.get('/v1/multi-calling/history', {
    preHandler: [fastify.authenticate]
  }, async (req: any, reply) => {
    const parsed = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(20),
      offset: z.coerce.number().int().min(0).default(0),
      laneId: z.string().uuid().optional(),
      outcome: z.enum(['all', 'interested', 'not_interested', 'voicemail', 'ivr', 'no_answer', 'followup', 'do_not_call', 'technical_error', 'needs_review', 'in_progress']).default('all')
    }).safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid history filter or pagination.' });
    const { limit, offset, laneId, outcome } = parsed.data;
    const tenantId = req.tenant.tenantId;
    // Provider completion is not a sales result. Preserve explicit human intent.
    // IVR is stored as no_answer in the existing result service; expose its subtype.
    const displayOutcome = `CASE
      WHEN s.outcome IN ('interested', 'not_interested', 'followup', 'do_not_call', 'technical_error') THEN s.outcome
      WHEN s.outcome = 'voicemail' OR s.hangup_reason = 'VOICEMAIL' THEN 'voicemail'
      WHEN s.hangup_reason IN ('IVR_OR_MENU', 'AI_RECEPTIONIST_OR_BOT')
        OR (s.outcome = 'no_answer' AND s.first_answer_type IN ('IVR_OR_MENU', 'AI_RECEPTIONIST_OR_BOT')) THEN 'ivr'
      WHEN s.outcome = 'no_answer' THEN 'no_answer'
      WHEN s.ended_at IS NULL THEN 'in_progress'
      ELSE 'needs_review' END`;
    const base = `WITH calls AS (
      SELECT s.*, ${displayOutcome} AS display_outcome
      FROM ai_call_sessions s
      WHERE s.tenant_id = $1 AND s.lane_id IS NOT NULL
        AND ($2::uuid IS NULL OR s.lane_id = $2::uuid)
    )`;
    const { rows } = await fastify.db.query(`${base}
      SELECT s.id AS session_id, s.created_at, s.ended_at, s.duration_sec,
        s.outcome, s.display_outcome, s.hangup_reason, s.summary, s.result_details,
        s.transcript, s.signalwire_call_sid, s.call_state, s.first_answer_type,
        s.lead_id, l.slot_number AS lane_slot, l.name AS lane_name,
        pn.phone_number AS caller_number, er.raw_data->>'contact_name' AS person_name, er.company_name, er.domain,
        er.primary_email, er.primary_phone, er.lead_stage
      FROM calls s
      LEFT JOIN ai_calling_lanes l ON s.lane_id = l.id AND l.tenant_id = $1
      LEFT JOIN enrichment_results er ON s.lead_id = er.id AND er.tenant_id = $1
      LEFT JOIN phone_numbers pn ON s.phone_number_id = pn.id AND pn.tenant_id = $1
      WHERE ($3::text = 'all' OR s.display_outcome = $3)
      ORDER BY s.created_at DESC, s.id DESC LIMIT $4 OFFSET $5`,
      [tenantId, laneId || null, outcome, limit, offset]);
    const counts = await fastify.db.query(`${base}
      SELECT display_outcome, COUNT(*)::int AS count FROM calls GROUP BY display_outcome`,
      [tenantId, laneId || null]);
    const resultCounts: Record<string, number> = {};
    for (const row of counts.rows) resultCounts[row.display_outcome] = row.count;
    const allCount = Object.values(resultCounts).reduce((sum, count) => sum + count, 0);
    return { history: rows, total: outcome === 'all' ? allCount : (resultCounts[outcome] || 0), counts: { ...resultCounts, all: allCount } };
  });

  fastify.post('/v1/multi-calling/lanes/:slot/assign', {
    preHandler: [fastify.authenticate]
  }, async (req: any, reply) => {
    const tenantId = req.tenant.tenantId;
    const slot = parseInt(req.params.slot);
    const { nicheId, agentConfigId, scriptVersionId, phoneNumberIds, name, autoQueueNewNicheLeads = true } = req.body;

    if (![1, 2, 3, 4].includes(slot)) return reply.code(400).send({ error: 'Invalid slot number', code: 'INVALID_SLOT' });
    if (!phoneNumberIds || phoneNumberIds.length !== 2) return reply.code(400).send({ error: 'Exactly 2 phone numbers required', code: 'INVALID_NUMBERS' });
    if (phoneNumberIds[0] === phoneNumberIds[1]) return reply.code(400).send({ error: 'Phone numbers must be unique', code: 'DUPLICATE_NUMBERS' });

    const client = await fastify.db.connect();
    try {
      await client.query('BEGIN');

      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [tenantId]);
      const existingLane = (await client.query('SELECT id, status FROM ai_calling_lanes WHERE tenant_id = $1 AND slot_number = $2 FOR UPDATE', [tenantId, slot])).rows[0];
      if (existingLane) {
        const busy = await client.query(`SELECT 1 FROM ai_call_sessions WHERE lane_id = $1 AND (ended_at IS NULL OR result_finalized_at IS NULL) LIMIT 1`, [existingLane.id]);
        if (busy.rowCount || ['running', 'draining'].includes(existingLane.status)) throw { status: 409, code: 'LANE_BUSY', message: 'Pause the lane and finish its call before changing its configuration.' };
      }

      // Check capacity
      if (nicheId) {
        const otherLanes = await client.query(`SELECT id FROM ai_calling_lanes WHERE tenant_id = $1 AND slot_number != $2 AND niche_id IS NOT NULL`, [tenantId, slot]);
        if (otherLanes.rowCount >= 4) {
          throw { code: 'LANE_CAPACITY_REACHED', message: 'All 4 AI agents are assigned. Pause and remove one lane before assigning another niche.', status: 409 };
        }
      }

      // Verify numbers belong to tenant and not used by another lane
      const nums = await client.query(`SELECT id FROM phone_numbers WHERE id = ANY($1) AND tenant_id = $2 AND provider = 'signalwire' AND status = 'active'`, [phoneNumberIds, tenantId]);
      if (nums.rowCount !== 2) {
        throw { code: 'INVALID_NUMBERS', message: 'One or both numbers are invalid or not owned by tenant', status: 400 };
      }

      const numUsed = await client.query(`
        SELECT ln.lane_id FROM ai_calling_lane_numbers ln 
        JOIN ai_calling_lanes l ON ln.lane_id = l.id 
        WHERE ln.phone_number_id = ANY($1) AND l.slot_number != $2`, 
        [phoneNumberIds, slot]
      );
      if (numUsed.rowCount > 0) {
        throw { code: 'NUMBER_IN_USE', message: 'A selected number is already assigned to another lane', status: 409 };
      }

      // Verify niche exists if provided
      if (nicheId) {
        // Verify niche exists
        const nicheExists = await client.query(`SELECT id FROM niches WHERE id = $1`, [nicheId]);
        if (nicheExists.rowCount === 0) throw { code: 'INVALID_NICHE', message: 'Niche not found', status: 404 };
      }

      // Verify script version
      if (scriptVersionId) {
        const scriptRes = await client.query(`SELECT status FROM ai_calling_script_versions WHERE id = $1 AND tenant_id = $2`, [scriptVersionId, tenantId]);
        if (scriptRes.rowCount === 0) throw { code: 'INVALID_SCRIPT', message: 'Script version not found', status: 404 };
        if (scriptRes.rows[0].status !== 'published') throw { code: 'SCRIPT_NOT_PUBLISHED', message: 'Script version must be published', status: 400 };
      }

      // Verify agent config
      if (agentConfigId) {
        const agentRes = await client.query(`SELECT id FROM ai_agent_configs WHERE id = $1 AND tenant_id = $2`, [agentConfigId, tenantId]);
        if (agentRes.rowCount === 0) throw { code: 'INVALID_AGENT', message: 'Agent config not found', status: 404 };
      }

      const laneResult = await client.query(
        `INSERT INTO ai_calling_lanes (tenant_id, slot_number, name, niche_id, agent_config_id, active_script_version_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'ready')
         ON CONFLICT (tenant_id, slot_number) DO UPDATE SET 
           name = $3, niche_id = $4, agent_config_id = $5, active_script_version_id = $6, status = 'ready'
         RETURNING id`,
        [tenantId, slot, name || `Lane ${slot}`, nicheId || null, agentConfigId || null, scriptVersionId || null]
      );
      const laneId = laneResult.rows[0].id;

      await client.query(`UPDATE ai_call_queue_items q SET state = 'cancelled', updated_at = NOW(),
        last_error = 'Lane niche changed'
        FROM enrichment_results e WHERE q.lane_id = $1 AND q.state = 'queued' AND q.lead_id = e.id
          AND e.niche_id IS DISTINCT FROM $2::integer`, [laneId, nicheId || null]);
      await client.query(`DELETE FROM ai_calling_lane_numbers WHERE lane_id = $1`, [laneId]);
      await client.query(`INSERT INTO ai_calling_lane_numbers (lane_id, phone_number_id, position) VALUES ($1, $2, 0), ($1, $3, 1)`, [laneId, phoneNumberIds[0], phoneNumberIds[1]]);

      await client.query('COMMIT');
      
      let queuedCount = 0;
      if (nicheId && agentConfigId && autoQueueNewNicheLeads) {
        try {
           queuedCount = await populateLaneQueue(tenantId, laneId, nicheId, agentConfigId);
        } catch(e) {
           console.error('Failed to populate queue', e);
           return reply.code(503).send({ error: 'Lane settings saved, but lead sync failed. Reload and retry.', code: 'QUEUE_SYNC_FAILED' });
        }
      }
      
      return { success: true, laneId, queuedCount };
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err.status) {
        return reply.code(err.status).send({ error: err.message, code: err.code });
      }
      throw err;
    } finally {
      client.release();
    }
  });

  fastify.get('/v1/multi-calling/assignment-options', {
    preHandler: [fastify.authenticate]
  }, async (req: any, reply) => {
    const parsed = z.object({ laneId: z.string().uuid().optional() }).safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid lane ID.' });
    const tenantId = req.tenant.tenantId;
    const laneId = parsed.data.laneId || null;
    if (laneId) {
      const lane = await fastify.db.query('SELECT id FROM ai_calling_lanes WHERE id = $1 AND tenant_id = $2', [laneId, tenantId]);
      if (!lane.rowCount) return reply.code(404).send({ error: 'Lane not found.' });
    }
    // Use the same authenticated workspace as the lane dashboard. A failure in
    // the separate legacy voice/niche API must not silently empty every select.
    const [agents, numbers, scripts, niches] = await Promise.all([
      fastify.db.query(`SELECT id, name, voice, language FROM ai_agent_configs
        WHERE tenant_id = $1 AND is_active = true ORDER BY name, id`, [tenantId]),
      fastify.db.query(`SELECT p.id, p.phone_number, ln.lane_id FROM phone_numbers p
        LEFT JOIN ai_calling_lane_numbers ln ON ln.phone_number_id = p.id
        WHERE p.tenant_id = $1 AND p.provider = 'signalwire' AND p.status = 'active'
          AND (ln.lane_id IS NULL OR ln.lane_id = $2::uuid)
        ORDER BY p.phone_number, p.id`, [tenantId, laneId]),
      fastify.db.query(`SELECT s.id, s.name, s.niche_id, v.id AS published_version_id, v.version
        FROM ai_calling_scripts s
        JOIN LATERAL (SELECT id, version FROM ai_calling_script_versions
          WHERE script_id = s.id AND tenant_id = $1 AND status = 'published'
          ORDER BY version DESC, created_at DESC, id DESC LIMIT 1) v ON true
        WHERE s.tenant_id = $1 ORDER BY s.name, s.id`, [tenantId]),
      fastify.db.query(`SELECT id, name FROM niches
        WHERE (tenant_id = $1 OR tenant_id IS NULL) AND status = 'active'
        ORDER BY name, id`, [tenantId])
    ]);
    reply.header('Cache-Control', 'no-store');
    return { agents: agents.rows, numbers: numbers.rows, scripts: scripts.rows, niches: niches.rows };
  });

  fastify.get('/v1/multi-calling/available-numbers', {
    preHandler: [fastify.authenticate]
  }, async (req: any, reply) => {
    const tenantId = req.tenant.tenantId;
    const result = await fastify.db.query(
      `SELECT p.id, p.phone_number, p.phone_number as friendly_name, ln.lane_id 
       FROM phone_numbers p
       LEFT JOIN ai_calling_lane_numbers ln ON p.id = ln.phone_number_id
       WHERE p.tenant_id = $1 AND p.provider = 'signalwire' AND p.status = 'active'`,
      [tenantId]
    );
    return { numbers: result.rows };
  });

  fastify.get('/v1/multi-calling/scripts', {
    preHandler: [fastify.authenticate]
  }, async (req: any, reply) => {
    const tenantId = req.tenant.tenantId;
    const result = await fastify.db.query(
      `SELECT s.id, s.name, s.niche_id, v.id as published_version_id
       FROM ai_calling_scripts s
       LEFT JOIN ai_calling_script_versions v ON s.id = v.script_id AND v.status = 'published'
       WHERE s.tenant_id = $1
       ORDER BY s.created_at DESC`,
      [tenantId]
    );
    return { scripts: result.rows };
  });

  fastify.get('/v1/multi-calling/scripts/:scriptId', {
    preHandler: [fastify.authenticate]
  }, async (req: any, reply) => {
    const tenantId = req.tenant.tenantId;
    const { scriptId } = req.params;
    
    const scriptRes = await fastify.db.query(
      `SELECT * FROM ai_calling_scripts WHERE id = $1 AND tenant_id = $2`,
      [scriptId, tenantId]
    );
    if (scriptRes.rowCount === 0) return reply.code(404).send({ error: 'Script not found' });
    
    const draftRes = await fastify.db.query(
      `SELECT * FROM ai_calling_script_versions WHERE script_id = $1 AND status = 'draft' ORDER BY version DESC LIMIT 1`,
      [scriptId]
    );
    
    // Fallback to published if no draft
    if (draftRes.rowCount === 0) {
      const pubRes = await fastify.db.query(
        `SELECT * FROM ai_calling_script_versions WHERE script_id = $1 AND status = 'published' ORDER BY version DESC LIMIT 1`,
        [scriptId]
      );
      if (pubRes.rowCount === 0) return reply.code(404).send({ error: 'No versions found' });
      return { script: scriptRes.rows[0], version: pubRes.rows[0] };
    }
    
    return { script: scriptRes.rows[0], version: draftRes.rows[0] };
  });

  fastify.put('/v1/multi-calling/scripts/:scriptId', {
    preHandler: [fastify.authenticate]
  }, async (req: any, reply) => {
    const tenantId = req.tenant.tenantId;
    const { scriptId } = req.params;
    const { name, definition, nicheId, expectedDraftId } = req.body || {};
    const expected = draftExpectation.safeParse(req.body);
    if (!expected.success) return reply.code(400).send({ error: 'Valid draft ID and positive revision are required.', issues: mapZodErrorsToIssues(expected.error, definition) });

    let parsed;
    try {
      parsed = ScriptSchema.parse(definition);
    } catch (err: any) {
      return reply.code(400).send({
        error: 'Script schema validation failed',
        details: err.errors ? err.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`) : [err.message],
        issues: mapZodErrorsToIssues(err, definition)
      });
    }
    
    const client = await fastify.db.connect();
    try {
      await client.query('BEGIN');

      const scriptLock = await client.query(
        `SELECT id FROM ai_calling_scripts WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [scriptId, tenantId]
      );
      if (scriptLock.rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Script not found' });
      }
      
      await client.query(
        `UPDATE ai_calling_scripts SET name = $1, niche_id = $2, updated_at = NOW() WHERE id = $3 AND tenant_id = $4`,
        [name, nicheId || null, scriptId, tenantId]
      );

      const draftRes = await client.query(
        `SELECT id, draft_revision FROM ai_calling_script_versions WHERE script_id = $1 AND tenant_id = $2 AND status = 'draft'`,
        [scriptId, tenantId]
      );
      
      let newDraftId = null;
      let newRevision = 1;

      if (draftRes.rowCount > 0) {
        newDraftId = draftRes.rows[0].id;
        const currentRevision = draftRes.rows[0].draft_revision || 1;
        if (!expectedDraftId || expectedDraftId !== newDraftId) {
          await client.query('ROLLBACK');
          return reply.code(409).send({ error: 'Draft conflict: expected draft does not match or is missing.' });
        }
        if (!req.body.expectedRevision || req.body.expectedRevision !== currentRevision) {
          await client.query('ROLLBACK');
          return reply.code(409).send({ error: 'Draft conflict: someone else has modified this draft or revision is missing.' });
        }
        newRevision = currentRevision + 1;
        await client.query(
          `UPDATE ai_calling_script_versions SET definition = $1, draft_revision = $2 WHERE id = $3 AND tenant_id = $4 AND status = 'draft'`,
          [JSON.stringify(parsed), newRevision, newDraftId, tenantId]
        );
      } else {
        const maxVerRes = await client.query(
          `SELECT MAX(version) as v FROM ai_calling_script_versions WHERE script_id = $1`,
          [scriptId]
        );
        const nextVer = (maxVerRes.rows[0].v || 0) + 1;
        const insertRes = await client.query(
          `INSERT INTO ai_calling_script_versions (script_id, tenant_id, version, status, definition, created_by, draft_revision)
           VALUES ($1, $2, $3, 'draft', $4, $5, 1) RETURNING id`,
          [scriptId, tenantId, nextVer, JSON.stringify(parsed), (typeof req.tenant.userId === 'string' && req.tenant.userId.length === 36 ? req.tenant.userId : null)]
        );
        newDraftId = insertRes.rows[0].id;
      }

      await client.query('COMMIT');
      return { success: true, draftId: newDraftId, revision: newRevision };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  fastify.delete('/v1/multi-calling/scripts/:scriptId', {
    preHandler: [fastify.authenticate]
  }, async (req: any, reply) => {
    const tenantId = req.tenant.tenantId;
    const { scriptId } = req.params;
    
    // Check if script is in use by a lane
    const lanesRes = await fastify.db.query(
      `SELECT l.slot_number FROM ai_calling_lanes l 
       JOIN ai_calling_script_versions v ON l.active_script_version_id = v.id 
       WHERE v.script_id = $1 AND l.tenant_id = $2`,
      [scriptId, tenantId]
    );
    if (lanesRes.rowCount > 0) {
      return reply.code(400).send({ error: 'Cannot delete script because it is assigned to one or more lanes.' });
    }

    const res = await fastify.db.query(
      `DELETE FROM ai_calling_scripts WHERE id = $1 AND tenant_id = $2`,
      [scriptId, tenantId]
    );
    
    if (res.rowCount === 0) return reply.code(404).send({ error: 'Script not found' });
    
    return { success: true };
  });

  fastify.post('/v1/multi-calling/scripts', {
    preHandler: [fastify.authenticate]
  }, async (req: any, reply) => {
    const tenantId = req.tenant.tenantId;
    const { name, definition, nicheId } = req.body;

    const parsedDef = ScriptSchema.safeParse(definition);
    if (!parsedDef.success) {
      return reply.code(400).send({
        error: 'Invalid script definition structure',
        details: parsedDef.error.issues.map(e => `${e.path.join('.')}: ${e.message}`),
        issues: mapZodErrorsToIssues(parsedDef.error, definition)
      });
    }
    const parsed = parsedDef.data;
    const client = await fastify.db.connect();
    
    let scriptId;
    try {
      await client.query('BEGIN');
      const scriptRes = await client.query(
        `INSERT INTO ai_calling_scripts (tenant_id, name, niche_id, created_by) VALUES ($1, $2, $3, $4) RETURNING id`,
        [tenantId, name, nicheId || null, (typeof req.tenant.userId === 'string' && req.tenant.userId.length === 36 ? req.tenant.userId : null)]
      );
      scriptId = scriptRes.rows[0].id;

      const draftRes = await client.query(
        `INSERT INTO ai_calling_script_versions (script_id, tenant_id, version, status, definition, created_by, draft_revision)
         VALUES ($1, $2, 1, 'draft', $3, $4, 1) RETURNING id`,
        [scriptId, tenantId, JSON.stringify(parsed), (typeof req.tenant.userId === 'string' && req.tenant.userId.length === 36 ? req.tenant.userId : null)]
      );
      const draftId = draftRes.rows[0].id;
      
      await client.query('COMMIT');
      return { success: true, scriptId, draftId, revision: 1 };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });


  fastify.post('/v1/multi-calling/scripts/validate', {
    preHandler: [fastify.authenticate]
  }, async (req: any, reply) => {
    const { definition } = req.body;
    let parsed;
    try {
      parsed = ScriptSchema.parse(definition);
    } catch (err: any) {
      return reply.code(400).send({
        valid: false,
        errors: err.errors ? err.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`) : [err.message],
        warnings: [],
        issues: mapZodErrorsToIssues(err, definition)
      });
    }

    const validation = validateScriptGraph(parsed);
    if (!validation.valid) {
      return validation;
    }

    try {
      const { prompt, hash } = compileScript(parsed);
      return {
        ...validation,
        promptLength: prompt.length,
        prompt,
        hash
      };
    } catch (compileErr: any) {
      return {
        valid: false,
        errors: [compileErr.message],
        warnings: validation.warnings,
        issues: [{ code: 'COMPILATION_ERROR', message: compileErr.message }]
      };
    }
  });

  fastify.post('/v1/multi-calling/scripts/:scriptId/publish', {
    preHandler: [fastify.authenticate]
  }, async (req: any, reply) => {
    const tenantId = req.tenant.tenantId;
    const { scriptId } = req.params;
    const expected = draftExpectation.safeParse(req.body);
    if (!expected.success) return reply.code(400).send({ error: 'Valid draft ID and positive revision are required.', issues: mapZodErrorsToIssues(expected.error, null) });

    const client = await fastify.db.connect();
    let versionId: string = '';
    let finalPrompt: string = '';
    
    try {
      await client.query('BEGIN');

      const scriptLock = await client.query(
        `SELECT id FROM ai_calling_scripts WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [scriptId, tenantId]
      );
      if (scriptLock.rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Script not found' });
      }
      
      const draftRes = await client.query(
        `SELECT * FROM ai_calling_script_versions WHERE script_id = $1 AND tenant_id = $2 AND status = 'draft'`,
        [scriptId, tenantId]
      );
      if (draftRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'No draft found' });
      }

      const draft = draftRes.rows[0];
      const { expectedDraftId, expectedRevision } = req.body || {};
      if (!expectedDraftId || expectedDraftId !== draft.id) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'Draft conflict: expected draft does not match or is missing.' });
      }
      if (!expectedRevision || expectedRevision !== draft.draft_revision) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'Draft conflict: someone else has modified this draft or revision is missing.' });
      }
      
      let parsedDef;
      try {
        parsedDef = ScriptSchema.parse(draft.definition);
      } catch (err: any) {
        await client.query('ROLLBACK');
        return reply.code(400).send({
          error: 'Script schema validation failed',
          details: err.errors ? err.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`) : [err.message],
          warnings: [],
          issues: mapZodErrorsToIssues(err, draft.definition)
        });
      }

      const validation = validateScriptGraph(parsedDef);
      if (!validation.valid) {
        await client.query('ROLLBACK');
        return reply.code(400).send({
          error: 'Script graph validation failed',
          details: validation.errors,
          warnings: validation.warnings,
          issues: validation.issues
        });
      }

      let compiledResult;
      try {
        compiledResult = compileScript(parsedDef);
      } catch (compileErr: any) {
        await client.query('ROLLBACK');
        return reply.code(400).send({
          error: 'Script compilation failed',
          details: [compileErr.message],
          warnings: validation.warnings,
          issues: [{ code: 'COMPILATION_ERROR', message: compileErr.message }]
        });
      }

      const { prompt, hash } = compiledResult;

      // Archive previous published versions
      await client.query(
        `UPDATE ai_calling_script_versions SET status = 'archived' WHERE script_id = $1 AND status = 'published'`,
        [scriptId]
      );

      const pubRes = await client.query(
        `UPDATE ai_calling_script_versions 
         SET status = 'published', compiled_prompt = $1, compiled_hash = $2, published_at = NOW()
         WHERE id = $3 AND status = 'draft' RETURNING id, version`,
        [prompt, hash, draft.id]
      );
      
      if (pubRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'Conflict: draft was altered or already published.' });
      }

      const newDraftRes = await client.query(
        `INSERT INTO ai_calling_script_versions (script_id, tenant_id, version, status, definition, created_by, draft_revision)
         VALUES ($1, $2, $3, 'draft', $4, $5, 1) RETURNING id`,
        [scriptId, tenantId, pubRes.rows[0].version + 1, JSON.stringify(draft.definition), (typeof req.tenant.userId === 'string' && req.tenant.userId.length === 36 ? req.tenant.userId : null)]
      );

      // Update lanes to use the new version
      // The worker takes a snapshot of this active_script_version_id upon starting a call
      const affectedLanes = await client.query(
        `UPDATE ai_calling_lanes 
         SET active_script_version_id = $1, updated_at = NOW() 
         WHERE active_script_version_id IN (
           SELECT id FROM ai_calling_script_versions WHERE script_id = $2
         ) AND tenant_id = $3 RETURNING id, name, status`,
        [pubRes.rows[0].id, scriptId, tenantId]
      );
      
      versionId = pubRes.rows[0].id;
      finalPrompt = prompt;
      
      await client.query('COMMIT');
      return { success: true, versionId, prompt: finalPrompt, draftId: newDraftRes.rows[0].id, revision: 1, affectedLanes: affectedLanes.rows };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  fastify.post('/v1/multi-calling/lanes/:laneId/start', {
    preHandler: [fastify.authenticate]
  }, async (req: any, reply) => {
    const { laneId } = req.params;
    const tenantId = req.tenant.tenantId;
    
    if ((fastify as any).voiceAgentReady !== true) {
      return reply.code(503).send({ error: 'Voice service is unavailable. No calls have been started.', code: 'VOICE_SERVICE_UNAVAILABLE' });
    }

    // A terminal provider callback can arrive after bridge cleanup stopped.
    // Retry only confirmed-ended sessions through the original result classifier.
    const unfinished = await fastify.db.query(`SELECT id FROM ai_call_sessions
      WHERE lane_id = $1 AND tenant_id = $2 AND ended_at IS NOT NULL
        AND provider_terminated_at IS NOT NULL AND result_finalized_at IS NULL
      ORDER BY created_at ASC LIMIT 10`, [laneId, tenantId]);
    if (unfinished.rowCount) {
      try {
        // @ts-ignore — JavaScript voice runtime
        const { finalizeEndedCall } = await import('../voice-agent/orchestrator/deepgram-signalwire-bridge.js');
        for (const session of unfinished.rows) await finalizeEndedCall(session.id);
      } catch (error: any) {
        return reply.code(503).send({ error: `Previous call result could not be saved: ${error.message}`, code: 'FINALIZATION_FAILED' });
      }
    }

    const client = await fastify.db.connect();
    try {
      await client.query('BEGIN');
      // Lock the timer before the lane, matching scheduler lock order.
      if (await stopTimerBlocksCalling(client, tenantId, true)) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'The all-lanes timer has expired. Set a new timer or cancel it before starting a lane.', code: 'STOP_TIMER_EXPIRED' });
      }
      const lane = (await client.query(`SELECT * FROM ai_calling_lanes WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, [laneId, tenantId])).rows[0];
      if (!lane) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'Lane not found' }); }
      const config = await client.query(`SELECT v.compiled_prompt, v.compiled_hash FROM ai_calling_script_versions v
        JOIN ai_agent_configs a ON a.id = $2 AND a.tenant_id = $3 AND a.is_active = true
        WHERE v.id = $1 AND v.tenant_id = $3 AND v.status = 'published'`, [lane.active_script_version_id, lane.agent_config_id, tenantId]);
      if (!lane.niche_id || !config.rows[0]?.compiled_prompt || !config.rows[0]?.compiled_hash) {
        await client.query('ROLLBACK'); return reply.code(422).send({ error: 'Choose a niche, an active agent and a valid published script.', code: 'INCOMPLETE_CONFIGURATION' });
      }
      const numbers = await client.query(`SELECT ln.phone_number_id FROM ai_calling_lane_numbers ln JOIN phone_numbers p ON p.id = ln.phone_number_id
        WHERE ln.lane_id = $1 AND ln.enabled = true AND ln.health_status = 'healthy'
          AND p.tenant_id = $2 AND p.status = 'active' AND p.provider = 'signalwire'`, [laneId, tenantId]);
      if (numbers.rowCount !== 2) {
        await client.query('ROLLBACK'); return reply.code(422).send({ error: 'Lane requires two enabled, active and healthy numbers.', code: 'INSUFFICIENT_NUMBERS' });
      }
      const busy = await client.query(`SELECT 1 FROM ai_call_sessions WHERE lane_id = $1 AND (ended_at IS NULL OR result_finalized_at IS NULL) LIMIT 1`, [laneId]);
      if (busy.rowCount && lane.status !== 'running') {
        await client.query('ROLLBACK'); return reply.code(409).send({ error: 'The previous call is still ending or its result needs finalization.', code: 'CALL_PENDING' });
      }
      await client.query(`UPDATE ai_calling_lanes SET status = 'running', last_error = NULL WHERE id = $1 AND tenant_id = $2`, [laneId, tenantId]);
      await client.query('COMMIT');
      return { success: true, laneId, alreadyRunning: lane.status === 'running' };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  });

  fastify.post('/v1/multi-calling/lanes/:laneId/pause', {
    preHandler: [fastify.authenticate]
  }, async (req: any, reply) => {
    const { laneId } = req.params;
    await fastify.db.query(`UPDATE ai_calling_lanes SET status = 'paused' WHERE id = $1 AND tenant_id = $2`, [laneId, req.tenant.tenantId]);
    return { success: true };
  });

  fastify.post('/v1/multi-calling/lanes/:laneId/drain', {
    preHandler: [fastify.authenticate]
  }, async (req: any, reply) => {
    const { laneId } = req.params;
    await fastify.db.query(`UPDATE ai_calling_lanes SET status = 'draining' WHERE id = $1 AND tenant_id = $2`, [laneId, req.tenant.tenantId]);
    return { success: true };
  });

  fastify.post('/v1/multi-calling/lanes/:laneId/stop', {
    preHandler: [fastify.authenticate]
  }, async (req: any, reply) => {
    const { laneId } = req.params;
    const tenantId = req.tenant.tenantId;

    const changed = await fastify.db.query(`UPDATE ai_calling_lanes SET status = 'paused' WHERE id = $1 AND tenant_id = $2 RETURNING id`, [laneId, tenantId]);
    if (!changed.rowCount) return reply.code(404).send({ error: 'Lane not found' });
    const sessions = await fastify.db.query(`SELECT id, signalwire_call_sid FROM ai_call_sessions WHERE lane_id = $1 AND tenant_id = $2 AND ended_at IS NULL`, [laneId, tenantId]);
    if (sessions.rows.length && !signalwireClient) return reply.code(503).send({ error: 'Lane paused, but SignalWire is unavailable for hangup.' });
    for (const session of sessions.rows) {
      if (!session.signalwire_call_sid) continue;
      await fastify.db.query(`UPDATE ai_call_sessions SET call_state = 'ending', hangup_reason = COALESCE(hangup_reason, 'user-stop') WHERE id = $1 AND ended_at IS NULL`, [session.id]);
      try {
        const terminalStates = ['completed', 'failed', 'busy', 'no-answer', 'canceled'];
        // Stop is also safe to retry when a lost webhook left an ended provider
        // call looking active in our database.
        let call = await signalwireClient!.calls(session.signalwire_call_sid).fetch();
        if (!terminalStates.includes(call.status)) {
          call = await signalwireClient!.calls(session.signalwire_call_sid).update({ status: 'completed' });
        }
        if (terminalStates.includes(call.status)) {
          await fastify.db.query(`UPDATE ai_call_sessions SET provider_terminated_at = COALESCE(provider_terminated_at, NOW()) WHERE id = $1`, [session.id]);
          await finalizeUnstreamedCall({ sessionId: session.id, status: call.status, durationSec: Number(call.duration || 0) });
        }
      } catch (error: any) {
        await fastify.db.query('UPDATE ai_call_sessions SET last_error = $1 WHERE id = $2', [error.message, session.id]);
        return reply.code(502).send({ error: 'Lane is paused. Provider hangup failed; retry Stop.', code: 'HANGUP_FAILED' });
      }
    }
    return { success: true, laneId, status: 'paused', callsStopping: sessions.rows.length };
  });

  fastify.delete('/v1/multi-calling/lanes/:laneId', {
    preHandler: [fastify.authenticate]
  }, async (req: any, reply) => {
    const { laneId } = req.params;
    const tenantId = req.tenant.tenantId;
    
    // Check for active calls
    const activeSessions = await fastify.db.query(`SELECT id FROM ai_call_sessions WHERE lane_id = $1 AND ended_at IS NULL LIMIT 1`, [laneId]);
    if (activeSessions.rowCount > 0) {
      return reply.code(409).send({ error: 'Cannot delete a lane with active calls. Drain or pause first.', code: 'ACTIVE_CALLS' });
    }
    
    // Queue items state updates? Handled by CASCADE or set null. Spec says "remove one lane".
    await fastify.db.query(`DELETE FROM ai_calling_lanes WHERE id = $1 AND tenant_id = $2`, [laneId, tenantId]);
    
    return { success: true };
  });
}
