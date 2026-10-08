import re

with open('apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx', 'r') as f:
    content = f.read()

handle_save_old = """      } else {
        const res = await api.post('/multi-calling/scripts', {
          name: scriptName,
          definition,
          nicheId: nicheId || null
        });
        resId = res.data.scriptId;
      }"""
handle_save_new = """      } else {
        const res = await api.post('/multi-calling/scripts', {
          name: scriptName,
          definition,
          nicheId: nicheId || null
        });
        resId = res.data.scriptId;
        if (res.data.draftId) setDraftId(res.data.draftId);
        if (res.data.revision) setDraftRevision(res.data.revision);
      }"""
if handle_save_old in content:
    content = content.replace(handle_save_old, handle_save_new)
else:
    print("Warning: handle_save_old not found")

handle_publish_old = """  const handlePublish = async () => {
    setPublishing(true);
    try {
      const definition = getScriptDefinition();
      let resId = scriptId;
      if (scriptId && scriptId !== 'new') {
        const updateRes = await api.put(`/multi-calling/scripts/${scriptId}`, {
          name: scriptName,
          definition,
          nicheId: nicheId || null,
          expectedDraftId: draftId,
          expectedRevision: draftRevision
        });
        if (updateRes.data?.draftId) {
          setDraftId(updateRes.data.draftId);
        }
        if (updateRes.data?.revision) {
          setDraftRevision(updateRes.data.revision);
        }
      } else {
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
      });"""

handle_publish_new = """  const handlePublish = async () => {
    setPublishing(true);
    try {
      const definition = getScriptDefinition();
      let resId = scriptId;
      let currentDraftId = draftId;
      let currentRevision = draftRevision;
      
      if (scriptId && scriptId !== 'new') {
        const updateRes = await api.put(`/multi-calling/scripts/${scriptId}`, {
          name: scriptName,
          definition,
          nicheId: nicheId || null,
          expectedDraftId: currentDraftId,
          expectedRevision: currentRevision
        });
        if (updateRes.data?.draftId) {
          currentDraftId = updateRes.data.draftId;
          setDraftId(currentDraftId);
        }
        if (updateRes.data?.revision) {
          currentRevision = updateRes.data.revision;
          setDraftRevision(currentRevision);
        }
      } else {
        const res = await api.post('/multi-calling/scripts', {
          name: scriptName,
          definition,
          nicheId: nicheId || null
        });
        resId = res.data.scriptId;
        if (res.data.draftId) {
          currentDraftId = res.data.draftId;
          setDraftId(currentDraftId);
        }
        if (res.data.revision) {
          currentRevision = res.data.revision;
          setDraftRevision(currentRevision);
        }
      }

      const publishRes = await api.post(`/multi-calling/scripts/${resId}/publish`, {
        expectedDraftId: currentDraftId,
        expectedRevision: currentRevision
      });"""

if handle_publish_old in content:
    content = content.replace(handle_publish_old, handle_publish_new)
else:
    print("Warning: handle_publish_old not found")

with open('apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx', 'w') as f:
    f.write(content)

print("VisualScriptBuilder publish logic patched")
