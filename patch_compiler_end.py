import re

with open('apps/api/src/services/multi-calling/script-compiler.ts', 'r') as f:
    content = f.read()

skip_old = """    if (!node || node.type === 'start' || node.type === 'end') continue;"""
skip_new = """    if (!node || node.type === 'start') continue;"""

end_old = """      case 'goodbye':
        prompt += `Say: "${text}"\\n`;
        break;"""
end_new = """      case 'goodbye':
        prompt += `Say: "${text}"\\n`;
        break;
        
      case 'end':
        prompt += `You MUST call the "end_call" tool to hang up and terminate the call.\\n`;
        break;"""

if skip_old in content:
    content = content.replace(skip_old, skip_new)
if end_old in content:
    content = content.replace(end_old, end_new)

with open('apps/api/src/services/multi-calling/script-compiler.ts', 'w') as f:
    f.write(content)

print("End node compiler patched")
