import re

with open('deploy-to-gcp.sh', 'r') as f:
    content = f.read()

content = content.replace("'033_call_session_agent_snapshot.sql'", "'033_call_session_agent_snapshot.sql',\n  '034_call_session_compiled_script.sql',\n  '035_script_version_revision.sql'")

with open('deploy-to-gcp.sh', 'w') as f:
    f.write(content)

print("Added 034 and 035 to deploy-to-gcp.sh")
