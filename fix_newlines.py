import re

with open('apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx', 'r') as f:
    content = f.read()

# Fix broken newlines inside strings
content = content.replace("join('\n')", "join('\\n')")
content = content.replace("split('\n')", "split('\\n')")

with open('apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx', 'w') as f:
    f.write(content)
print("Fixed newlines")
