import re

with open('apps/api/src/routes/multi-calling.ts', 'r') as f:
    content = f.read()

pub_old = """  fastify.post('/v1/multi-calling/scripts/:scriptId/publish', {
    preHandler: [fastify.authenticate]
  }, async (req: any, reply) => {
    const tenantId = req.tenant.tenantId;
    const { scriptId } = req.params;

    const client = await fastify.db.connect();
    let versionId;
    let finalPrompt;
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

      const draft = draftRes.rows[0];"""

pub_new = """  fastify.post('/v1/multi-calling/scripts/:scriptId/publish', {
    preHandler: [fastify.authenticate]
  }, async (req: any, reply) => {
    const tenantId = req.tenant.tenantId;
    const { scriptId } = req.params;
    const { expectedDraftId, expectedRevision } = req.body || {};

    const client = await fastify.db.connect();
    let versionId;
    let finalPrompt;
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
      if (expectedDraftId && expectedDraftId !== draft.id) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'Draft conflict: expected draft does not match.' });
      }
      if (expectedRevision && expectedRevision !== draft.draft_revision) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'Draft conflict: someone else has modified this draft.' });
      }"""

content = content.replace(pub_old, pub_new)

with open('apps/api/src/routes/multi-calling.ts', 'w') as f:
    f.write(content)

print("Publish route patched for draft validation")
