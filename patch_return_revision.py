import re

with open('apps/api/src/routes/multi-calling.ts', 'r') as f:
    content = f.read()

ret_old = """      await client.query('COMMIT');
      return { success: true, draftId: newDraftId };"""
ret_new = """      await client.query('COMMIT');
      return { success: true, draftId: newDraftId, revision: newRevision };"""

content = content.replace(ret_old, ret_new)

with open('apps/api/src/routes/multi-calling.ts', 'w') as f:
    f.write(content)

print("Added revision to return object")
