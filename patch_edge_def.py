import re

with open('apps/api/src/services/multi-calling/script-validator.ts', 'r') as f:
    content = f.read()

content = content.replace("adjReverseEdges = new Map<string, Edge[]>()", "adjReverseEdges = new Map<string, EdgeDefinition[]>()")
content = content.replace("incomingEdge?: Edge", "incomingEdge?: EdgeDefinition")

with open('apps/api/src/services/multi-calling/script-validator.ts', 'w') as f:
    f.write(content)

print("EdgeDefinition patched")
