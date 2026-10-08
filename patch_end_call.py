import re

with open('apps/api/src/services/multi-calling/script-compiler.ts', 'r') as f:
    content = f.read()

dnc_old = """        if (rawOutcome === 'dnc' || rawOutcome === 'do_not_call') {
          toolCallInstruction = `You MUST call the "mark_do_not_call" tool with reason="${node.data?.note || 'Prospect requested do not call'}" and then call "end_call".`;"""
dnc_new = """        if (rawOutcome === 'dnc' || rawOutcome === 'do_not_call') {
          toolCallInstruction = `You MUST call the "mark_do_not_call" tool with reason="${node.data?.note || 'Prospect requested do not call'}".`;"""

not_interested_old = """        } else if (rawOutcome === 'not_interested') {
          toolCallInstruction = `You MUST call the "save_call_note" tool with outcome="not_interested" and note="${node.data?.note || 'Prospect not interested'}", then call "end_call".`;"""
not_interested_new = """        } else if (rawOutcome === 'not_interested') {
          toolCallInstruction = `You MUST call the "save_call_note" tool with outcome="not_interested" and note="${node.data?.note || 'Prospect not interested'}".`;"""

content = content.replace(dnc_old, dnc_new)
content = content.replace(not_interested_old, not_interested_new)

with open('apps/api/src/services/multi-calling/script-compiler.ts', 'w') as f:
    f.write(content)

print("Removed explicit end_call from outcomes")
