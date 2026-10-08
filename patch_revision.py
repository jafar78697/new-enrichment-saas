import re

with open('apps/api/src/routes/multi-calling.ts', 'r') as f:
    content = f.read()

put_old = """      const draftRes = await client.query(
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
      }"""

put_new = """      const draftRes = await client.query(
        `SELECT id, draft_revision FROM ai_calling_script_versions WHERE script_id = $1 AND tenant_id = $2 AND status = 'draft'`,
        [scriptId, tenantId]
      );
      
      let newDraftId = null;
      let newRevision = 1;
      
      if (draftRes.rowCount > 0) {
        const draftId = draftRes.rows[0].id;
        const currentRevision = draftRes.rows[0].draft_revision || 1;
        if (expectedDraftId && expectedDraftId !== draftId) {
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
          [JSON.stringify(parsed), newRevision, draftId, tenantId]
        );
        newDraftId = draftId;
      }"""

content = content.replace(put_old, put_new)

with open('apps/api/src/routes/multi-calling.ts', 'w') as f:
    f.write(content)

# And fix frontend to send and receive expectedRevision
with open('apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx', 'r') as f:
    front = f.read()

front_old1 = """  const [draftId, setDraftId] = useState<string | null>(null);"""
front_new1 = """  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftRevision, setDraftRevision] = useState<number>(1);"""

front = front.replace(front_old1, front_new1)

front_old2 = """      if (res.data.version?.id && res.data.version?.status === 'draft') {
        setDraftId(res.data.version.id);
      }"""
front_new2 = """      if (res.data.version?.id && res.data.version?.status === 'draft') {
        setDraftId(res.data.version.id);
        if (res.data.version.draft_revision) {
          setDraftRevision(res.data.version.draft_revision);
        }
      }"""

front = front.replace(front_old2, front_new2)

front_old3 = """          name: scriptName,
          definition,
          nicheId: nicheId || null,
          expectedDraftId: draftId
        });
        if (updateRes.data?.draftId) {
          setDraftId(updateRes.data.draftId);
        }"""
front_new3 = """          name: scriptName,
          definition,
          nicheId: nicheId || null,
          expectedDraftId: draftId,
          expectedRevision: draftRevision
        });
        if (updateRes.data?.draftId) {
          setDraftId(updateRes.data.draftId);
        }
        if (updateRes.data?.revision) {
          setDraftRevision(updateRes.data.revision);
        }"""

front = front.replace(front_old3, front_new3)

with open('apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx', 'w') as f:
    f.write(front)

print("Revision patched")
