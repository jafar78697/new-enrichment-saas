import re

with open('apps/api/src/routes/multi-calling.ts', 'r') as f:
    content = f.read()

# Fix PUT route
put_old = """      if (draftRes.rowCount > 0) {
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
      return { success: true };"""

put_new = """      let newDraftId = null;
      if (draftRes.rowCount > 0) {
        newDraftId = draftRes.rows[0].id;
        if (expectedDraftId && expectedDraftId !== newDraftId) {
          await client.query('ROLLBACK');
          return reply.code(409).send({ error: 'Draft conflict: expected draft does not match.' });
        }
        await client.query(
          `UPDATE ai_calling_script_versions SET definition = $1 WHERE id = $2 AND tenant_id = $3 AND status = 'draft'`,
          [JSON.stringify(parsed), newDraftId, tenantId]
        );
      } else {
        const maxVerRes = await client.query(
          `SELECT MAX(version) as v FROM ai_calling_script_versions WHERE script_id = $1`,
          [scriptId]
        );
        const nextVer = (maxVerRes.rows[0].v || 0) + 1;
        const insertRes = await client.query(
          `INSERT INTO ai_calling_script_versions (script_id, tenant_id, version, status, definition, created_by)
           VALUES ($1, $2, $3, 'draft', $4, $5) RETURNING id`,
          [scriptId, tenantId, nextVer, JSON.stringify(parsed), (typeof req.tenant.userId === 'string' && req.tenant.userId.length === 36 ? req.tenant.userId : null)]
        );
        newDraftId = insertRes.rows[0].id;
      }

      await client.query('COMMIT');
      return { success: true, draftId: newDraftId };"""

content = content.replace(put_old, put_new)

with open('apps/api/src/routes/multi-calling.ts', 'w') as f:
    f.write(content)

# Fix frontend builder to use returned draftId
with open('apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx', 'r') as f:
    front_content = f.read()

front_old = """      if (scriptId && scriptId !== 'new') {
        await api.put(`/multi-calling/scripts/${scriptId}`, {
          name: scriptName,
          definition,
          nicheId: nicheId || null,
          expectedDraftId: draftId
        });
      } else {"""
front_new = """      if (scriptId && scriptId !== 'new') {
        const updateRes = await api.put(`/multi-calling/scripts/${scriptId}`, {
          name: scriptName,
          definition,
          nicheId: nicheId || null,
          expectedDraftId: draftId
        });
        if (updateRes.data?.draftId) {
          setDraftId(updateRes.data.draftId);
        }
      } else {"""

front_content = front_content.replace(front_old, front_new)

with open('apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx', 'w') as f:
    f.write(front_content)

print("conflict fix applied")
