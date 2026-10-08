import re

with open('apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx', 'r') as f:
    content = f.read()

cases_load_old = """                   n.type === 'objection_router' ? (n.data?.cases?.map((c: any) => c.trigger).join('\\n') || '') : '')"""
cases_load_new = """                   n.type === 'objection_router' ? (n.data?.cases?.map((c: any) => `${c.intent} | ${c.response}`).join('\\n') || '') : '')"""

cases_save_old = """        } else if (n.data?.nodeType === 'objection_router') {
          extraData = { cases: textVal.split('\\n').filter(Boolean).map((c, i) => ({ trigger: c.trim(), instructions: '' })) };
        }"""
cases_save_new = """        } else if (n.data?.nodeType === 'objection_router') {
          extraData = { 
            cases: textVal.split('\\n').filter(Boolean).map((c, i) => {
              const parts = c.split('|');
              const intent = parts[0]?.trim() || `Objection ${i+1}`;
              const response = parts.slice(1).join('|').trim() || 'Please handle this objection.';
              return { intent, response };
            }) 
          };
        }"""

if cases_load_old in content:
    content = content.replace(cases_load_old, cases_load_new)
if cases_save_old in content:
    content = content.replace(cases_save_old, cases_save_new)

with open('apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx', 'w') as f:
    f.write(content)

print("VisualScriptBuilder array grammar patched")
