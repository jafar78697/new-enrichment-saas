import re

with open('apps/api/src/services/multi-calling/script-validator.ts', 'r') as f:
    content = f.read()

refusal_old = """          if (currNode.type === 'offer' || currNode.type === 'meeting_cta' || currNode.type === 'pricing') {"""
refusal_new = """          if (currNode.type === 'offer' || currNode.type === 'meeting_cta' || currNode.type === 'pricing' || (currNode.type === 'outcome_action' && ['interested', 'meeting_booked', 'followup'].includes(currNode.data?.outcome || ''))) {"""

content = content.replace(refusal_old, refusal_new)

with open('apps/api/src/services/multi-calling/script-validator.ts', 'w') as f:
    f.write(content)

print("Validator refusal logic patched")
