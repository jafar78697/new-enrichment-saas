import re

with open('apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx', 'r') as f:
    content = f.read()

toolbox_old = """                { id: 'meeting_cta', label: 'Meeting CTA' },
                { id: 'send_information', label: 'Send Info' },"""
toolbox_new = """                { id: 'meeting_cta', label: 'Meeting CTA' },
                { id: 'followup', label: 'Follow-up' },
                { id: 'send_information', label: 'Send Info' },"""

content = content.replace(toolbox_old, toolbox_new)

with open('apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx', 'w') as f:
    f.write(content)

print("Added followup to toolbox")
