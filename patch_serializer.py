import re

with open('apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx', 'r') as f:
    content = f.read()

textval_old = """      const textVal = (n.data?.text || n.data?.label || '').toString().trim();"""
textval_new = """      const textVal = (n.data?.text || '').toString().trim();"""

content = content.replace(textval_old, textval_new)

with open('apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx', 'w') as f:
    f.write(content)

print("Serializer fixed to not fallback text to label")
