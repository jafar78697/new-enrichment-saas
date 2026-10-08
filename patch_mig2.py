import re

with open('apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js', 'r') as f:
    bridge = f.read()

bridge_old = """       er.raw_data->>'call_origin' AS call_origin,
       sv.compiled_prompt as compiled_script_prompt,"""

bridge_new = """       er.raw_data->>'call_origin' AS call_origin,
       COALESCE(acs.compiled_script_prompt, sv.compiled_prompt) as compiled_script_prompt,"""

if bridge_old in bridge:
    bridge = bridge.replace(bridge_old, bridge_new)
else:
    print("Could not find loadSessionContext SELECT")

with open('apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js', 'w') as f:
    f.write(bridge)

print("loadSessionContext patched.")
