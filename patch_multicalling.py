import re

with open('apps/api/src/routes/multi-calling.ts', 'r') as f:
    content = f.read()

# 1. Move mapZodErrorsToIssues to the top
match = re.search(r"  const mapZodErrorsToIssues = .*?\n  };\n", content, re.DOTALL)
if match:
    func_text = match.group(0)
    content = content.replace(func_text, "")
    insert_pos = content.find("export default async function (fastify: FastifyInstance) {\n")
    if insert_pos != -1:
        insert_idx = insert_pos + len("export default async function (fastify: FastifyInstance) {\n")
        content = content[:insert_idx] + func_text + "\n" + content[insert_idx:]
    else:
        print("Could not find insert pos")
else:
    print("Could not find mapZodErrorsToIssues")

# 2. Patch POST route create return
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

# 3. Patch PUT route revision checks
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

put_new = """      const draftRes = await client.query(
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
content = content.replace(put_old, put_new)

# 4. Patch Publish Route expected validation and insert draft_revision
pub_old = """      const draft = draftRes.rows[0];

      let parsedDef;"""

pub_new = """      const draft = draftRes.rows[0];
      const { expectedDraftId, expectedRevision } = req.body || {};
      if (expectedDraftId && expectedDraftId !== draft.id) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'Draft conflict: expected draft does not match.' });
      }
      if (expectedRevision && expectedRevision !== draft.draft_revision) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'Draft conflict: someone else has modified this draft.' });
      }

      let parsedDef;"""
content = content.replace(pub_old, pub_new)

pub_insert_old = """      await client.query(
        `INSERT INTO ai_calling_script_versions (script_id, tenant_id, version, status, definition, created_by)
         VALUES ($1, $2, $3, 'draft', $4, $5)`,
        [scriptId, tenantId, pubRes.rows[0].version + 1, JSON.stringify(draft.definition), (typeof req.tenant.userId === 'string' && req.tenant.userId.length === 36 ? req.tenant.userId : null)]
      );"""

pub_insert_new = """      const newDraftRes = await client.query(
        `INSERT INTO ai_calling_script_versions (script_id, tenant_id, version, status, definition, created_by, draft_revision)
         VALUES ($1, $2, $3, 'draft', $4, $5, 1) RETURNING id`,
        [scriptId, tenantId, pubRes.rows[0].version + 1, JSON.stringify(draft.definition), (typeof req.tenant.userId === 'string' && req.tenant.userId.length === 36 ? req.tenant.userId : null)]
      );"""
content = content.replace(pub_insert_old, pub_insert_new)

pub_ret_old = """      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    return { success: true, versionId, prompt: finalPrompt };"""
pub_ret_new = """      await client.query('COMMIT');
      return { success: true, versionId, prompt: finalPrompt, draftId: newDraftRes.rows[0].id, revision: 1 };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }"""
content = content.replace(pub_ret_old, pub_ret_new)

# 5. Patch Zod schemas in PUT route
put_zod_old = """    const parsed = ScriptSchema.parse(definition);
    
    const client = await fastify.db.connect();"""
put_zod_new = """    let parsed;
    try {
      parsed = ScriptSchema.parse(definition);
    } catch (err: any) {
      return reply.code(400).send({
        error: 'Script schema validation failed',
        details: err.errors ? err.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`) : [err.message],
        issues: mapZodErrorsToIssues(err, definition)
      });
    }
    
    const client = await fastify.db.connect();"""
content = content.replace(put_zod_old, put_zod_new)

with open('apps/api/src/routes/multi-calling.ts', 'w') as f:
    f.write(content)

print("All multi-calling.ts patches reapplied successfully.")
