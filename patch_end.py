import re

with open('apps/api/src/services/multi-calling/script-compiler.ts', 'r') as f:
    content = f.read()

end_old = """      case 'end':
        break;"""
end_new = """      case 'end':
        prompt += 'You MUST call the "end_call" tool to hang up.\\n';
        break;"""

content = content.replace(end_old, end_new)

with open('apps/api/src/services/multi-calling/script-compiler.ts', 'w') as f:
    f.write(content)

print("Added end_call to end node in compiler")
