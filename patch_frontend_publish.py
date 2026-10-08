import re

with open('apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx', 'r') as f:
    content = f.read()

create_old = """      } else {
        const res = await api.post('/multi-calling/scripts', {
          name: scriptName,
          definition,
          nicheId: nicheId || null
        });
        resId = res.data.scriptId;
      }

      await api.post(`/multi-calling/scripts/${resId}/publish`);"""

create_new = """      } else {
        const res = await api.post('/multi-calling/scripts', {
          name: scriptName,
          definition,
          nicheId: nicheId || null
        });
        resId = res.data.scriptId;
        if (res.data.draftId) setDraftId(res.data.draftId);
        if (res.data.revision) setDraftRevision(res.data.revision);
      }

      const publishRes = await api.post(`/multi-calling/scripts/${resId}/publish`, {
        expectedDraftId: draftId,
        expectedRevision: draftRevision
      });
      if (publishRes.data?.draftId) setDraftId(publishRes.data.draftId);
      if (publishRes.data?.revision) setDraftRevision(publishRes.data.revision);"""

content = content.replace(create_old, create_new)

with open('apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx', 'w') as f:
    f.write(content)

print("Publish call in frontend patched")
