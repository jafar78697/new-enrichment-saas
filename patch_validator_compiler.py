import re

with open('apps/api/src/services/multi-calling/script-validator.ts', 'r') as f:
    content = f.read()

val_old = """    const data = node.data || {};
    const textContent = (data.text || data.label || '').toString().trim();"""
val_new = """    const data = node.data || {};
    const textContent = (data.text || '').toString().trim();"""

if val_old in content:
    content = content.replace(val_old, val_new)
else:
    print("WARNING: script-validator text check not found!")

with open('apps/api/src/services/multi-calling/script-validator.ts', 'w') as f:
    f.write(content)

with open('apps/api/src/services/multi-calling/script-compiler.ts', 'r') as f:
    content = f.read()

comp_old = """  prompt += `- Speak in short turns. No more than ${script.settings.maxSentencesPerTurn} sentences at a time.\\n`;"""
comp_new = """  prompt += `- Speak in short turns. No more than ${script.settings.maxSentencesPerTurn} sentences at a time.\\n`;
  prompt += `- Do not attempt to overcome the same objection more than ${script.settings.maxObjectionAttempts} time(s). If they still refuse, respect their decision and end.\\n`;"""

if comp_old in content:
    content = content.replace(comp_old, comp_new)
else:
    print("WARNING: script-compiler settings not found!")

with open('apps/api/src/services/multi-calling/script-compiler.ts', 'w') as f:
    f.write(content)

print("Validator and Compiler patched for empty speech and settings.")
