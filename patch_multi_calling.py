import re
import sys

with open('apps/api/src/routes/multi-calling.ts', 'r') as f:
    content = f.read()

# 1. Update PUT route to use transaction and FOR UPDATE lock
put_route_old = """
  fastify.put('/v1/multi-calling/scripts/:scriptId', {
    preHandler: [fastify.authenticate]
  }, async (req: any, reply) => {
    const tenantId = req.tenant.tenantId;
    const { scriptId } = req.params;
    const { name, definition, nicheId } = req.body;

    const parsed = ScriptSchema.parse(definition);
    
    // Update script metadata
    await fastify.db.query(
      `UPDATE ai_calling_scripts SET name = $1, niche_id = $2, updated_at = NOW() WHERE id = $3 AND tenant_id = $4`,
      [name, nicheId || null, scriptId, tenantId]
    );

    // Update or create draft
    const draftRes = await fastify.db.query(
      `SELECT id FROM ai_calling_script_versions WHERE script_id = $1 AND tenant_id = $2 AND status = 'draft'`,
      [scriptId, tenantId]
    );
    
    if (draftRes.rowCount > 0) {
      await fastify.db.query(
        `UPDATE ai_calling_script_versions SET definition = $1 WHERE id = $2 AND tenant_id = $3`,
        [JSON.stringify(parsed), draftRes.rows[0].id, tenantId]
      );
    } else {
      // Find latest version to increment
      const maxVerRes = await fastify.db.query(
        `SELECT MAX(version) as v FROM ai_calling_script_versions WHERE script_id = $1`,
        [scriptId]
      );
      const nextVer = (maxVerRes.rows[0].v || 0) + 1;
      await fastify.db.query(
        `INSERT INTO ai_calling_script_versions (script_id, tenant_id, version, status, definition, created_by)
         VALUES ($1, $2, $3, 'draft', $4, $5)`,
        [scriptId, tenantId, nextVer, JSON.stringify(parsed), (typeof req.tenant.userId === 'string' && req.tenant.userId.length === 36 ? req.tenant.userId : null)]
      );
    }

    return { success: true };
  });
"""

put_route_new = """
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
"""

# 2. Update POST route for create scripts to use transaction
post_create_old = """
  fastify.post('/v1/multi-calling/scripts', {
    preHandler: [fastify.authenticate]
  }, async (req: any, reply) => {
    const tenantId = req.tenant.tenantId;
    const { name, definition, nicheId } = req.body;

    const parsed = ScriptSchema.parse(definition);
    const scriptRes = await fastify.db.query(
      `INSERT INTO ai_calling_scripts (tenant_id, name, niche_id, created_by) VALUES ($1, $2, $3, $4) RETURNING id`,
      [tenantId, name, nicheId || null, (typeof req.tenant.userId === 'string' && req.tenant.userId.length === 36 ? req.tenant.userId : null)]
    );
    const scriptId = scriptRes.rows[0].id;

    await fastify.db.query(
      `INSERT INTO ai_calling_script_versions (script_id, tenant_id, version, status, definition, created_by)
       VALUES ($1, $2, 1, 'draft', $3, $4)`,
      [scriptId, tenantId, JSON.stringify(parsed), (typeof req.tenant.userId === 'string' && req.tenant.userId.length === 36 ? req.tenant.userId : null)]
    );

    return { success: true, scriptId };
  });
"""

post_create_new = """
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
"""

# 3. Update POST /publish to use parent script lock and update lanes explicitly
post_publish_old = """
    try {
      await client.query('BEGIN');
      
      const draftRes = await client.query(
"""

post_publish_new = """
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
"""

content = content.replace(put_route_old.strip(), put_route_new.strip())
content = content.replace(post_create_old.strip(), post_create_new.strip())
content = content.replace(post_publish_old.strip(), post_publish_new.strip())


# In POST /publish we also need to update lanes active_script_version_id
lane_activation_old = """
      const pubRes = await client.query(
        `UPDATE ai_calling_script_versions 
         SET status = 'published', compiled_prompt = $1, compiled_hash = $2, published_at = NOW()
         WHERE id = $3 RETURNING id, version`,
        [prompt, hash, draft.id]
      );

      await client.query(
        `INSERT INTO ai_calling_script_versions (script_id, tenant_id, version, status, definition, created_by)
         VALUES ($1, $2, $3, 'draft', $4, $5)`,
        [scriptId, tenantId, pubRes.rows[0].version + 1, JSON.stringify(draft.definition), (typeof req.tenant.userId === 'string' && req.tenant.userId.length === 36 ? req.tenant.userId : null)]
      );
"""

lane_activation_new = """
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
"""

content = content.replace(lane_activation_old.strip(), lane_activation_new.strip())

with open('apps/api/src/routes/multi-calling.ts', 'w') as f:
    f.write(content)

print("Backend API patched.")
