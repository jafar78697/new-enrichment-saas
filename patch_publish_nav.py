import re

with open('apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx', 'r') as f:
    content = f.read()

guard_pattern = r"  const handleSaveDraft = async \(\) => \{\n    setSaving\(true\);"
guard_replacement = r"""  const handleSaveDraft = async () => {
    if (saving || publishing) return;
    setSaving(true);"""

content = re.sub(guard_pattern, guard_replacement, content)

guard_publish_pattern = r"  const handlePublish = async \(\) => \{\n    setPublishing\(true\);"
guard_publish_replacement = r"""  const handlePublish = async () => {
    if (saving || publishing) return;
    setPublishing(true);"""

content = re.sub(guard_publish_pattern, guard_publish_replacement, content)

nav_pattern = r"        resId = res\.data\.scriptId;\n        if \(res\.data\.draftId\) \{\n          currentDraftId = res\.data\.draftId;\n          setDraftId\(currentDraftId\);\n        \}\n        if \(res\.data\.revision\) \{\n          currentRevision = res\.data\.revision;\n          setDraftRevision\(currentRevision\);\n        \}\n      \}\n\n      const publishRes = await api\.post\(`/multi-calling/scripts/\$\{resId\}/publish`, \{"

nav_replacement = r"""        resId = res.data.scriptId;
        if (res.data.draftId) {
          currentDraftId = res.data.draftId;
          setDraftId(currentDraftId);
        }
        if (res.data.revision) {
          currentRevision = res.data.revision;
          setDraftRevision(currentRevision);
        }
        if (scriptId === 'new') {
          window.history.replaceState(null, '', `/multi-ai-calling/builder/${resId}`);
        }
      }

      const publishRes = await api.post(`/multi-calling/scripts/${resId}/publish`, {"""

content = re.sub(nav_pattern, nav_replacement, content)

with open('apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx', 'w') as f:
    f.write(content)

print("Publish nav and guards patched")
