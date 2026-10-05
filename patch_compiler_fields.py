import re

with open('apps/api/src/services/multi-calling/script-compiler.ts', 'r') as f:
    content = f.read()

# Fix getNodeText to not fallback to label
get_text_old = "const getNodeText = (node: NodeDefinition) => (node.data?.text || node.data?.label || '').toString().trim();"
get_text_new = "const getNodeText = (node: NodeDefinition) => (node.data?.text || '').toString().trim();"
content = content.replace(get_text_old, get_text_new)

# Fix pricing text fallback
pricing_old = 'prompt += `Provide pricing details: "${node.data?.pricingText || text}"\\n`;'
pricing_new = 'prompt += `Provide pricing details: "${node.data?.text || node.data?.pricingText || text}"\\n`;'
content = content.replace(pricing_old, pricing_new)

# Fix instructions fallback
instructions_old = 'prompt += `Instructions: ${node.data?.instructions || text}\\n`;'
instructions_new = 'prompt += `Instructions: ${node.data?.text || node.data?.instructions || text}\\n`;'
content = content.replace(instructions_old, instructions_new)

# Fix goodbye fallback
goodbye_old = 'prompt += `Conclude the conversation politely: "${node.data?.genericText || text || \'Thank you for your time. Have a great day.\'}"\\n`;'
goodbye_new = 'prompt += `Conclude the conversation politely: "${node.data?.text || node.data?.genericText || text || \'Thank you for your time. Have a great day.\'}"\\n`;'
content = content.replace(goodbye_old, goodbye_new)

# Fix followup fallback
followup_old = 'prompt += `Ask for date and time: "${node.data?.askDateText || text}" and "${node.data?.askTimeText || \'preferred time\'}".\\n`;'
followup_new = 'prompt += `Ask for date and time: "${node.data?.text || node.data?.askDateText || text}" and "${node.data?.askTimeText || \'preferred time\'}".\\n`;'
content = content.replace(followup_old, followup_new)

with open('apps/api/src/services/multi-calling/script-compiler.ts', 'w') as f:
    f.write(content)

print("Compiler fields patched")
