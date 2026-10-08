import re

with open('apps/api/src/routes/multi-calling.ts', 'r') as f:
    content = f.read()

put_old = """        if (expectedDraftId && expectedDraftId !== newDraftId) {
          await client.query('ROLLBACK');
          return reply.code(409).send({ error: 'Draft conflict: expected draft does not match.' });
        }
        if (req.body.expectedRevision && req.body.expectedRevision !== currentRevision) {
          await client.query('ROLLBACK');
          return reply.code(409).send({ error: 'Draft conflict: someone else has modified this draft.' });
        }"""
put_new = """        if (!expectedDraftId || expectedDraftId !== newDraftId) {
          await client.query('ROLLBACK');
          return reply.code(409).send({ error: 'Draft conflict: expected draft does not match or is missing.' });
        }
        if (!req.body.expectedRevision || req.body.expectedRevision !== currentRevision) {
          await client.query('ROLLBACK');
          return reply.code(409).send({ error: 'Draft conflict: someone else has modified this draft or revision is missing.' });
        }"""
content = content.replace(put_old, put_new)

pub_old = """      const draftRes = await client.query(
        `SELECT * FROM ai_calling_script_versions WHERE script_id = $1 AND tenant_id = $2 AND status = 'draft'`,
        [scriptId, tenantId]
      );
      if (draftRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'No draft found' });
      }

      const draft = draftRes.rows[0];
      let parsedDef;"""
pub_new = """      const draftRes = await client.query(
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
      
      let parsedDef;"""
content = content.replace(pub_old, pub_new)

with open('apps/api/src/routes/multi-calling.ts', 'w') as f:
    f.write(content)

print("Publish and PUT required revision patched")
