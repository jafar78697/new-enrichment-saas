import re

with open('apps/api/src/routes/multi-calling.ts', 'r') as f:
    content = f.read()

pub_old = """      await client.query(
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

    return { success: true, versionId, prompt: finalPrompt };"""

pub_new = """      const newDraftRes = await client.query(
        `INSERT INTO ai_calling_script_versions (script_id, tenant_id, version, status, definition, created_by)
         VALUES ($1, $2, $3, 'draft', $4, $5) RETURNING id`,
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
      return { success: true, versionId, prompt: finalPrompt, draftId: newDraftRes.rows[0].id };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
"""

content = content.replace(pub_old, pub_new)

with open('apps/api/src/routes/multi-calling.ts', 'w') as f:
    f.write(content)

# Now fix the frontend to use the draftId
with open('apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx', 'r') as f:
    front_content = f.read()

front_old = """      const res = await api.post(`/multi-calling/scripts/${resId}/publish`);

      setNodes(nds => nds.map(n => ({
        ...n,
        data: { ...n.data, hasError: false, errorMessage: null }
      })));

      alert('✓ Script saved and published successfully! It is now active for calling.');"""

front_new = """      const res = await api.post(`/multi-calling/scripts/${resId}/publish`);
      if (res.data?.draftId) {
        setDraftId(res.data.draftId);
      }

      setNodes(nds => nds.map(n => ({
        ...n,
        data: { ...n.data, hasError: false, errorMessage: null }
      })));

      alert('✓ Script saved and published successfully! It is now active for calling.');"""

front_content = front_content.replace(front_old, front_new)

with open('apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx', 'w') as f:
    f.write(front_content)

print("Publish patched to return draftId and frontend to receive it.")
