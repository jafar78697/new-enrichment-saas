import re

with open('apps/api/src/routes/multi-calling.ts', 'r') as f:
    content = f.read()

bad_block_regex = r"const draftRes = await client\.query\([\s\S]*?return \{ success: true, draftId: newDraftId, revision: newRevision \};"

good_block = """const draftRes = await client.query(
        `SELECT id, draft_revision FROM ai_calling_script_versions WHERE script_id = $1 AND tenant_id = $2 AND status = 'draft'`,
        [scriptId, tenantId]
      );
      
      let newDraftId = null;
      let newRevision = 1;

      if (draftRes.rowCount > 0) {
        newDraftId = draftRes.rows[0].id;
        const currentRevision = draftRes.rows[0].draft_revision || 1;
        if (expectedDraftId && expectedDraftId !== newDraftId) {
          await client.query('ROLLBACK');
          return reply.code(409).send({ error: 'Draft conflict: expected draft does not match.' });
        }
        if (req.body.expectedRevision && req.body.expectedRevision !== currentRevision) {
          await client.query('ROLLBACK');
          return reply.code(409).send({ error: 'Draft conflict: someone else has modified this draft.' });
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
      return { success: true, draftId: newDraftId, revision: newRevision };"""

content = re.sub(bad_block_regex, good_block, content)

with open('apps/api/src/routes/multi-calling.ts', 'w') as f:
    f.write(content)

print("multi-calling.ts manually patched")
