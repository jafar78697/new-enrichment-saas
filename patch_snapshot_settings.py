import re

with open('apps/api/src/workers/multi-lane-outbound-caller.js', 'r') as f:
    content = f.read()

snapshot_old = """      // Fetch Compiled Prompt and Hash
      const { rows: scriptRes } = await client.query(
        `SELECT compiled_prompt, compiled_hash FROM ai_calling_script_versions WHERE id = $1`,
        [lane.active_script_version_id]
      );
      const scriptSnapshot = scriptRes[0] || {};

      // 7. Create Session Snapshot"""

snapshot_new = """      // Fetch Compiled Prompt and Hash
      const { rows: scriptRes } = await client.query(
        `SELECT definition, compiled_prompt, compiled_hash FROM ai_calling_script_versions WHERE id = $1`,
        [lane.active_script_version_id]
      );
      const scriptSnapshot = scriptRes[0] || {};
      const settings = scriptSnapshot.definition?.settings || {};
      
      if (settings.agentDisplayName) agentSnapshot.name = settings.agentDisplayName;
      if (settings.offerName) agentSnapshot.offer_name = settings.offerName;
      if (settings.meetingDuration) agentSnapshot.meeting_length = settings.meetingDuration;

      // 7. Create Session Snapshot"""

content = content.replace(snapshot_old, snapshot_new)

with open('apps/api/src/workers/multi-lane-outbound-caller.js', 'w') as f:
    f.write(content)

print("Agent snapshot enriched with script settings")
