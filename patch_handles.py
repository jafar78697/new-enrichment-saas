import re

with open('apps/api/src/services/multi-calling/template-registry.ts', 'r') as f:
    content = f.read()

# Implement normalizeHandle
normalize_handle = """
export function normalizeHandle(nodeType: string, handleId?: string | null): string {
  if (!handleId || handleId === 'default') return 'default';
  const declared = NODE_DECLARED_HANDLES[nodeType] || [];
  const direct = declared.find(h => h.id === handleId);
  if (direct) return direct.id;

  for (const h of declared) {
    const aliases = HANDLE_ALIASES[h.id];
    if (aliases && aliases.includes(handleId)) return h.id;
  }
  return handleId;
}
"""

content = content + normalize_handle

with open('apps/api/src/services/multi-calling/template-registry.ts', 'w') as f:
    f.write(content)
print("normalizeHandle added")
