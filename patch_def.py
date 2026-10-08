import re

with open('apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx', 'r') as f:
    content = f.read()

getscript_old = """    nodes: nodes.map(n => {
      const textVal = (n.data?.text || '').toString().trim();
      return { 
        id: n.id, 
        type: n.data.nodeType,
        position: n.position,
        data: {
          ...n.data,
          text: textVal || (n.data.nodeType === 'outcome_action' ? n.data.outcome : undefined),"""

getscript_new = """    nodes: nodes.map(n => {
      const textVal = (n.data?.text || '').toString().trim();
      let extraData: any = {};
      if (n.data.nodeType === 'qualifying_questions') {
        extraData = { questions: textVal.split('\\n').filter(Boolean).map(q => ({ text: q.trim() })) };
      } else if (n.data.nodeType === 'objection_router') {
        extraData = { 
          cases: textVal.split('\\n').filter(Boolean).map((c: string, i: number) => {
            const parts = c.split('|');
            const intent = parts[0]?.trim() || `Objection ${i+1}`;
            const response = parts.slice(1).join('|').trim() || 'Please handle this objection.';
            return { intent, response };
          }) 
        };
      }
      return { 
        id: n.id, 
        type: n.data.nodeType,
        position: n.position,
        data: {
          ...n.data,
          ...extraData,
          text: textVal || (n.data.nodeType === 'outcome_action' ? n.data.outcome : undefined),"""

if getscript_old in content:
    content = content.replace(getscript_old, getscript_new)
else:
    print("WARNING: getScriptDefinition block not found")

with open('apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx', 'w') as f:
    f.write(content)

print("getScriptDefinition patched.")
