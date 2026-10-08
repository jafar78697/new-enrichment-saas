import re

with open('apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js', 'r') as f:
    content = f.read()

pattern = r"async function closePhoneCall\(\{ callSid, signalWireWs, sessionId, reason \}\) \{\n  await updateSession\(\n    sessionId,\n    `UPDATE ai_call_sessions\n     SET hangup_reason = COALESCE\(\$1, hangup_reason\),\n         call_state = 'ending',\n         ended_at = COALESCE\(ended_at, NOW\(\)\)\n     WHERE id = \$2`,\n    \[reason \|\| 'agent-ended'\],\n  \);"

replacement = """async function closePhoneCall({ callSid, signalWireWs, sessionId, reason, lastError }) {
  await updateSession(
    sessionId,
    `UPDATE ai_call_sessions
     SET hangup_reason = COALESCE($1, hangup_reason),
         last_error = COALESCE($2, last_error),
         call_state = 'ending'
     WHERE id = $3 AND ended_at IS NULL`,
    [reason || 'agent-ended', lastError || null],
  );"""

new_content, count = re.subn(pattern, replacement, content)
if count == 0:
    print("FAILED TO MATCH closePhoneCall")
else:
    print(f"Patched closePhoneCall ({count} times)")

with open('apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js', 'w') as f:
    f.write(new_content)
