import re

with open('apps/api/src/workers/multi-lane-outbound-caller.js', 'r') as f:
    content = f.read()

lock_old = """      // Fetch Compiled Prompt and Hash
      const { rows: scriptRes } = await client.query(
        `SELECT definition, compiled_prompt, compiled_hash FROM ai_calling_script_versions WHERE id = $1`,
        [lane.active_script_version_id]
      );
      const scriptSnapshot = scriptRes[0] || {};
      const settings = scriptSnapshot.definition?.settings || {};"""

lock_new = """      // Fetch latest lane version under lock
      const { rows: lockedLanes } = await client.query(
        `SELECT active_script_version_id FROM ai_calling_lanes WHERE id = $1 FOR SHARE`,
        [lane.id]
      );
      const currentScriptVersionId = lockedLanes[0]?.active_script_version_id || lane.active_script_version_id;

      // Fetch Compiled Prompt and Hash
      const { rows: scriptRes } = await client.query(
        `SELECT definition, compiled_prompt, compiled_hash FROM ai_calling_script_versions WHERE id = $1`,
        [currentScriptVersionId]
      );
      const scriptSnapshot = scriptRes[0] || {};
      const settings = scriptSnapshot.definition?.settings || {};"""

content = content.replace(lock_old, lock_new)

# we also need to update the INSERT statement to use currentScriptVersionId instead of lane.active_script_version_id
insert_old = """         ) VALUES ($1, $2, $3, $4, $5, $6, 'starting', $7, $8, $9) RETURNING id`,
        [lane.tenant_id, lane.id, queueItem.id, queueItem.lead_id, selectedNumber.phone_number_id, lane.active_script_version_id, JSON.stringify(agentSnapshot), scriptSnapshot.compiled_prompt || null, scriptSnapshot.compiled_hash || null]"""

insert_new = """         ) VALUES ($1, $2, $3, $4, $5, $6, 'starting', $7, $8, $9) RETURNING id`,
        [lane.tenant_id, lane.id, queueItem.id, queueItem.lead_id, selectedNumber.phone_number_id, currentScriptVersionId, JSON.stringify(agentSnapshot), scriptSnapshot.compiled_prompt || null, scriptSnapshot.compiled_hash || null]"""

content = content.replace(insert_old, insert_new)

with open('apps/api/src/workers/multi-lane-outbound-caller.js', 'w') as f:
    f.write(content)

print("Lane lock patched")
