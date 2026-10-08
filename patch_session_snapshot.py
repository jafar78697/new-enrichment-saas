import re

with open('apps/api/src/workers/multi-lane-outbound-caller.js', 'r') as f:
    content = f.read()

snapshot_old = """      // 7. Create Session Snapshot
      const { rows: sessionRes } = await client.query(
        `INSERT INTO ai_call_sessions (
           tenant_id, lane_id, queue_item_id, lead_id, phone_number_id, script_version_id, call_state, agent_config_snapshot
         ) VALUES ($1, $2, $3, $4, $5, $6, 'starting', $7) RETURNING id`,
        [lane.tenant_id, lane.id, queueItem.id, queueItem.lead_id, selectedNumber.phone_number_id, lane.active_script_version_id, JSON.stringify(agentSnapshot)]
      );"""

snapshot_new = """      // Fetch Compiled Prompt and Hash
      const { rows: scriptRes } = await client.query(
        `SELECT compiled_prompt, compiled_hash FROM ai_calling_script_versions WHERE id = $1`,
        [lane.active_script_version_id]
      );
      const scriptSnapshot = scriptRes[0] || {};

      // 7. Create Session Snapshot
      const { rows: sessionRes } = await client.query(
        `INSERT INTO ai_call_sessions (
           tenant_id, lane_id, queue_item_id, lead_id, phone_number_id, script_version_id, call_state, agent_config_snapshot, compiled_script_prompt, script_compiled_hash
         ) VALUES ($1, $2, $3, $4, $5, $6, 'starting', $7, $8, $9) RETURNING id`,
        [lane.tenant_id, lane.id, queueItem.id, queueItem.lead_id, selectedNumber.phone_number_id, lane.active_script_version_id, JSON.stringify(agentSnapshot), scriptSnapshot.compiled_prompt || null, scriptSnapshot.compiled_hash || null]
      );"""

content = content.replace(snapshot_old, snapshot_new)

with open('apps/api/src/workers/multi-lane-outbound-caller.js', 'w') as f:
    f.write(content)

print("Session snapshot patched to include compiled prompt/hash")
