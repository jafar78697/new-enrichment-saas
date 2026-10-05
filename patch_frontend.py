import re

with open('apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx', 'r') as f:
    content = f.read()

# 1. Add state
state_old = """
  const [loading, setLoading] = useState(!!(scriptId && scriptId !== 'new'));
"""
state_new = """
  const [loading, setLoading] = useState(!!(scriptId && scriptId !== 'new'));
  const [draftId, setDraftId] = useState<string | null>(null);
"""
content = content.replace(state_old.strip(), state_new.strip())

# 2. Update fetchScript
fetch_old = """
      if (res.data.script?.niche_id) {
        setNicheId(res.data.script.niche_id);
      }
      
      const def = res.data.version.definition;
"""
fetch_new = """
      if (res.data.script?.niche_id) {
        setNicheId(res.data.script.niche_id);
      }
      if (res.data.version?.id && res.data.version?.status === 'draft') {
        setDraftId(res.data.version.id);
      }
      
      const def = res.data.version.definition;
"""
content = content.replace(fetch_old.strip(), fetch_new.strip())

# 3. Update saveScript put payload
put_old = """
        await api.put(`/multi-calling/scripts/${scriptId}`, {
          name: scriptName,
          definition,
          nicheId: nicheId || null
        });
"""
put_new = """
        await api.put(`/multi-calling/scripts/${scriptId}`, {
          name: scriptName,
          definition,
          nicheId: nicheId || null,
          expectedDraftId: draftId
        });
"""
content = content.replace(put_old.strip(), put_new.strip())

with open('apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx', 'w') as f:
    f.write(content)

print("Frontend TSX patched.")
