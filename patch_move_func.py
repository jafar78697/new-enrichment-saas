import re

with open('apps/api/src/routes/multi-calling.ts', 'r') as f:
    content = f.read()

# Extract the function
match = re.search(r"  const mapZodErrorsToIssues = .*?};", content, re.DOTALL)
if match:
    func_text = match.group(0)
    # Remove it from its current position
    content = content.replace(func_text, "")
    
    # Insert it right after `export default async function multiCallingRoutes(fastify: FastifyInstance) {`
    insert_pos = content.find("export default async function multiCallingRoutes(fastify: FastifyInstance) {\n")
    if insert_pos != -1:
        insert_idx = insert_pos + len("export default async function multiCallingRoutes(fastify: FastifyInstance) {\n")
        content = content[:insert_idx] + func_text + "\n" + content[insert_idx:]
        print("Moved mapZodErrorsToIssues to top")
    else:
        print("Could not find insert pos")
else:
    print("Could not find mapZodErrorsToIssues")

with open('apps/api/src/routes/multi-calling.ts', 'w') as f:
    f.write(content)
