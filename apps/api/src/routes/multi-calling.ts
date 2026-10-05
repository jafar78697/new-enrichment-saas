import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ScriptSchema } from '../services/multi-calling/script-schema.js';
import { compileScript } from '../services/multi-calling/script-compiler.js';
import { validateScriptGraph } from '../services/multi-calling/script-validator.js';
import { populateLaneQueue } from '../services/multi-calling/queue-service.js';
import { signalwireClient } from '../calls-module/config/signalwire.js';

export default async function (fastify: FastifyInstance) {
  
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
         WHERE s.lane_id = $1 AND s.ended_at IS NULL AND s.call_state IN ('starting', 'ringing', 'in-progress', 'streaming', 'answered', 'wait', 'identify', 'listening') 
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
    const tenantId = req.tenant.tenantId;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const { rows } = await fastify.db.query(`
      SELECT 
        s.id as session_id,
        s.created_at,
        s.duration_sec,
        s.outcome,
        s.hangup_reason,
        s.transcript,
        s.signalwire_call_sid,
        s.call_state,
        l.slot_number as lane_slot,
        l.name as lane_name,
        er.person_name,
        er.company_name,
        er.primary_email,
        er.primary_phone,
        er.lead_stage,
        er.lead_notes
      FROM ai_call_sessions s
      LEFT JOIN ai_calling_lanes l ON s.lane_id = l.id
      LEFT JOIN enrichment_results er ON s.lead_id = er.id
      WHERE s.tenant_id = $1
      ORDER BY s.created_at DESC
      LIMIT $2 OFFSET $3
    `, [tenantId, limit, offset]);

    const { rows: countRows } = await fastify.db.query(`
      SELECT COUNT(*) as total FROM ai_call_sessions WHERE tenant_id = $1
    `, [tenantId]);

    return { 
      history: rows,
      total: parseInt(countRows[0].total)
    };
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

      // Check capacity
      if (nicheId) {
        const otherLanes = await client.query(`SELECT id FROM ai_calling_lanes WHERE tenant_id = $1 AND slot_number != $2 AND status != 'empty'`, [tenantId, slot]);
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

      await client.query(`DELETE FROM ai_calling_lane_numbers WHERE lane_id = $1`, [laneId]);
      await client.query(`INSERT INTO ai_calling_lane_numbers (lane_id, phone_number_id, position) VALUES ($1, $2, 0), ($1, $3, 1)`, [laneId, phoneNumberIds[0], phoneNumberIds[1]]);

      await client.query('COMMIT');
      
      let queuedCount = 0;
      if (nicheId && agentConfigId && autoQueueNewNicheLeads) {
        try {
           queuedCount = await populateLaneQueue(tenantId, laneId, nicheId, agentConfigId);
        } catch(e) {
           console.error('Failed to populate queue', e);
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
    const { name, definition, nicheId, expectedDraftId } = req.body;

    const parsed = ScriptSchema.parse(definition);
    
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
        `SELECT id FROM ai_calling_script_versions WHERE script_id = $1 AND tenant_id = $2 AND status = 'draft'`,
        [scriptId, tenantId]
      );
      
      if (draftRes.rowCount > 0) {
        const draftId = draftRes.rows[0].id;
        if (expectedDraftId && expectedDraftId !== draftId) {
          await client.query('ROLLBACK');
          return reply.code(409).send({ error: 'Draft conflict: expected draft does not match.' });
        }
        await client.query(
          `UPDATE ai_calling_script_versions SET definition = $1 WHERE id = $2 AND tenant_id = $3 AND status = 'draft'`,
          [JSON.stringify(parsed), draftId, tenantId]
        );
      } else {
        const maxVerRes = await client.query(
          `SELECT MAX(version) as v FROM ai_calling_script_versions WHERE script_id = $1`,
          [scriptId]
        );
        const nextVer = (maxVerRes.rows[0].v || 0) + 1;
        await client.query(
          `INSERT INTO ai_calling_script_versions (script_id, tenant_id, version, status, definition, created_by)
           VALUES ($1, $2, $3, 'draft', $4, $5)`,
          [scriptId, tenantId, nextVer, JSON.stringify(parsed), (typeof req.tenant.userId === 'string' && req.tenant.userId.length === 36 ? req.tenant.userId : null)]
        );
      }

      await client.query('COMMIT');
      return { success: true };
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

    const parsed = ScriptSchema.parse(definition);
    const client = await fastify.db.connect();
    
    let scriptId;
    try {
      await client.query('BEGIN');
      const scriptRes = await client.query(
        `INSERT INTO ai_calling_scripts (tenant_id, name, niche_id, created_by) VALUES ($1, $2, $3, $4) RETURNING id`,
        [tenantId, name, nicheId || null, (typeof req.tenant.userId === 'string' && req.tenant.userId.length === 36 ? req.tenant.userId : null)]
      );
      scriptId = scriptRes.rows[0].id;

      await client.query(
        `INSERT INTO ai_calling_script_versions (script_id, tenant_id, version, status, definition, created_by)
         VALUES ($1, $2, 1, 'draft', $3, $4)`,
        [scriptId, tenantId, JSON.stringify(parsed), (typeof req.tenant.userId === 'string' && req.tenant.userId.length === 36 ? req.tenant.userId : null)]
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    return { success: true, scriptId };
  });

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

      await client.query(
        `INSERT INTO ai_calling_script_versions (script_id, tenant_id, version, status, definition, created_by)
         VALUES ($1, $2, $3, 'draft', $4, $5)`,
        [scriptId, tenantId, pubRes.rows[0].version + 1, JSON.stringify(draft.definition), (typeof req.tenant.userId === 'string' && req.tenant.userId.length === 36 ? req.tenant.userId : null)]
      );

      // Update lanes to use the new version
      // The worker takes a snapshot of this active_script_version_id upon starting a call
      await client.query(
        `UPDATE ai_calling_lanes 
         SET active_script_version_id = $1, updated_at = NOW() 
         WHERE active_script_version_id IN (
           SELECT id FROM ai_calling_script_versions WHERE script_id = $2
         ) AND tenant_id = $3`,
        [pubRes.rows[0].id, scriptId, tenantId]
      );
      
      versionId = pubRes.rows[0].id;
      finalPrompt = prompt;
      
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    return { success: true, versionId, prompt: finalPrompt };
  });

  fastify.post('/v1/multi-calling/lanes/:laneId/start', {
    preHandler: [fastify.authenticate]
  }, async (req: any, reply) => {
    const { laneId } = req.params;
    const tenantId = req.tenant.tenantId;
    
    // Start gate check
    const laneRes = await fastify.db.query(`SELECT active_script_version_id, agent_config_id FROM ai_calling_lanes WHERE id = $1 AND tenant_id = $2`, [laneId, tenantId]);
    if (laneRes.rowCount === 0) return reply.code(404).send({ error: 'Lane not found' });
    const lane = laneRes.rows[0];
    
    if (!lane.active_script_version_id || !lane.agent_config_id) {
       return reply.code(422).send({ error: 'Lane must have an agent and a script assigned to start', code: 'INCOMPLETE_CONFIGURATION' });
    }
    
    const numRes = await fastify.db.query(`SELECT lane_id FROM ai_calling_lane_numbers WHERE lane_id = $1 AND health_status = 'healthy'`, [laneId]);
    if (numRes.rowCount !== 2) {
       return reply.code(422).send({ error: 'Lane must have exactly 2 healthy numbers to start', code: 'INSUFFICIENT_NUMBERS' });
    }

    await fastify.db.query(`UPDATE ai_calling_lanes SET status = 'running' WHERE id = $1 AND tenant_id = $2`, [laneId, tenantId]);
    return { success: true };
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

    await fastify.db.query(`UPDATE ai_calling_lanes SET status = 'paused' WHERE id = $1 AND tenant_id = $2`, [laneId, tenantId]);

    const activeCallRes = await fastify.db.query(
      `SELECT signalwire_call_sid FROM ai_call_sessions 
       WHERE lane_id = $1 AND call_state IN ('starting', 'ringing', 'in-progress', 'streaming', 'answered', 'wait', 'identify', 'listening') 
       ORDER BY created_at DESC LIMIT 1`,
      [laneId]
    );

    if (activeCallRes.rowCount > 0 && activeCallRes.rows[0].signalwire_call_sid) {
      const callSid = activeCallRes.rows[0].signalwire_call_sid;
      if (!signalwireClient) {
        return reply.code(503).send({ error: 'SignalWire client not initialized' });
      }
      
      try {
        await signalwireClient.calls(callSid).update({ status: 'completed' });
      } catch (err: any) {
        if (err.status !== 404 && !err.message?.includes('already')) {
          throw err;
        }
      }
    }
    return { success: true };
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
