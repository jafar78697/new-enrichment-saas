import re

with open('apps/api/src/routes/multi-calling.ts', 'r') as f:
    content = f.read()

create_old = """      const scriptRes = await client.query(
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

    return { success: true, scriptId };"""

create_new = """      const scriptRes = await client.query(
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
    }"""

content = content.replace(create_old, create_new)

with open('apps/api/src/routes/multi-calling.ts', 'w') as f:
    f.write(content)

print("POST route patched to return draftId and revision")
