import re

with open('apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx', 'r') as f:
    content = f.read()

# Fix loading: prefer canonical arrays, preserve ids
load_pattern = r"text: n\.data\?\.text \|\| \n                  \(n\.type === 'qualifying_questions' \? \(n\.data\?\.questions\?\.map\(\(q: any\) => q\.text\)\.join\('\\n'\) \|\| ''\) :\n                   n\.type === 'objection_router' \? \(n\.data\?\.cases\?\.map\(\(c: any\) => `\$\{c\.intent\} \| \$\{c\.response\}`\)\.join\('\\n'\) \|\| ''\) : ''\)"

load_replacement = r"""text: n.type === 'qualifying_questions' && n.data?.questions?.length ? n.data.questions.map((q: any) => q.text).join('\n') :
                   n.type === 'objection_router' && n.data?.cases?.length ? n.data.cases.map((c: any) => `${c.intent} | ${c.response}`).join('\n') :
                   n.data?.text || ''"""

new_content, count = re.subn(load_pattern, load_replacement, content, flags=re.DOTALL)
if count == 0:
    print("FAILED TO MATCH LOAD")

# Fix saving: don't invent content, preserve IDs
save_pattern = r"      const textVal = \(n\.data\?\.text \|\| ''\)\.toString\(\)\.trim\(\);\n      let extraData: any = \{\};\n      if \(n\.data\.nodeType === 'qualifying_questions'\) \{\n        extraData = \{ questions: textVal\.split\('\\n'\)\.filter\(Boolean\)\.map\(q => \(\{ text: q\.trim\(\) \}\)\) \};\n      \} else if \(n\.data\.nodeType === 'objection_router'\) \{\n        extraData = \{ \n          cases: textVal\.split\('\\n'\)\.filter\(Boolean\)\.map\(\(c: string, i: number\) => \{\n            const parts = c\.split\('\|'\);\n            const intent = parts\[0\]\?\.trim\(\) \|\| `Objection \$\{i\+1\}`;\n            const response = parts\.slice\(1\)\.join\('\|'\)\.trim\(\) \|\| 'Please handle this objection.';\n            return \{ intent, response \};\n          \}\) \n        \};\n      \}"

save_replacement = """      const textVal = (n.data?.text || '').toString().trim();
      let extraData: any = {};
      let hasError = false;
      let errorMessage = null;

      if (n.data.nodeType === 'qualifying_questions') {
        const oldQuestions = n.data?.questions || [];
        extraData = { 
          questions: textVal.split('\\n').filter(Boolean).map((q, i) => ({ 
            id: oldQuestions[i]?.id,
            text: q.trim() 
          })) 
        };
      } else if (n.data.nodeType === 'objection_router') {
        const oldCases = n.data?.cases || [];
        const lines = textVal.split('\\n').filter(Boolean);
        const cases = [];
        for (let i = 0; i < lines.length; i++) {
          const c = lines[i];
          const parts = c.split('|');
          if (parts.length < 2 || !parts[0].trim() || !parts.slice(1).join('|').trim()) {
            hasError = true;
            errorMessage = 'Malformed objection row. Format: Intent | Response';
          }
          const intent = parts[0]?.trim() || '';
          const response = parts.slice(1).join('|').trim() || '';
          cases.push({ id: oldCases[i]?.id, intent, response });
        }
        extraData = { cases };
      }"""

new_content, count2 = re.subn(save_pattern, save_replacement, new_content, flags=re.DOTALL)
if count2 == 0:
    print("FAILED TO MATCH SAVE")

# Fix node assignment
node_pattern = r"          \.\.\.n\.data,\n          \.\.\.extraData,\n          text: textVal \|\| \(n\.data\.nodeType === 'outcome_action' \? n\.data\.outcome : undefined\),\n          label: n\.data\?\.label \|\| textVal,\n          hasError: false,\n          errorMessage: null"

node_replacement = """          ...n.data,
          ...extraData,
          text: textVal || (n.data.nodeType === 'outcome_action' ? n.data.outcome : undefined),
          label: n.data?.label || textVal,
          hasError: hasError,
          errorMessage: errorMessage"""

new_content, count3 = re.subn(node_pattern, node_replacement, new_content, flags=re.DOTALL)
if count3 == 0:
    print("FAILED TO MATCH NODE ASSIGNMENT")

with open('apps/web/src/pages/multi-ai/VisualScriptBuilder.tsx', 'w') as f:
    f.write(new_content)

print(f"Patched array parser. counts: load={count}, save={count2}, node={count3}")
