import re

with open('apps/api/src/routes/multi-calling.ts', 'r') as f:
    content = f.read()

pub_old = """      const newDraftRes = await client.query(
        `INSERT INTO ai_calling_script_versions (script_id, tenant_id, version, status, definition, created_by)
         VALUES ($1, $2, $3, 'draft', $4, $5) RETURNING id`,
        [scriptId, tenantId, pubRes.rows[0].version + 1, JSON.stringify(draft.definition), (typeof req.tenant.userId === 'string' && req.tenant.userId.length === 36 ? req.tenant.userId : null)]
      );"""

pub_new = """      const newDraftRes = await client.query(
        `INSERT INTO ai_calling_script_versions (script_id, tenant_id, version, status, definition, created_by, draft_revision)
         VALUES ($1, $2, $3, 'draft', $4, $5, 1) RETURNING id`,
        [scriptId, tenantId, pubRes.rows[0].version + 1, JSON.stringify(draft.definition), (typeof req.tenant.userId === 'string' && req.tenant.userId.length === 36 ? req.tenant.userId : null)]
      );"""

content = content.replace(pub_old, pub_new)

with open('apps/api/src/routes/multi-calling.ts', 'w') as f:
    f.write(content)

print("Publish route draft_revision patched")
