import re

with open('apps/api/src/services/multi-calling/script-validator.ts', 'r') as f:
    content = f.read()

sched_old = """        if (curr.type === 'meeting_cta' && (curr.data?.collectDate || curr.data?.collectTime || (curr.data?.text || '').toLowerCase().includes('time') || (curr.data?.text || '').toLowerCase().includes('date'))) {"""
sched_new = """        if (curr.type === 'meeting_cta' && (curr.data?.collectDate && curr.data?.collectTime)) {"""

content = content.replace(sched_old, sched_new)

with open('apps/api/src/services/multi-calling/script-validator.ts', 'w') as f:
    f.write(content)

print("Scheduling validation patched")
