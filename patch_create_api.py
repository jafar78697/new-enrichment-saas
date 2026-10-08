import re

with open('apps/api/src/routes/multi-calling.ts', 'r') as f:
    content = f.read()

pattern = r"  fastify\.post\('/scripts',\n    \{ preHandler: \[fastify\.authenticate\] \},\n    async \(request, reply\) => \{\n      const tenantId = request\.user\.tenantId;\n      const \{ name, definition, nicheId \} = request\.body as any;\n      // TODO: Schema validation\n\n      const parent = await query\("

replacement = """  fastify.post('/scripts',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const { name, definition, nicheId } = request.body as any;
      
      const parsedDef = ScriptSchema.safeParse(definition);
      if (!parsedDef.success) {
        return reply.code(400).send({
          error: 'Invalid script definition structure',
          issues: parsedDef.error.issues
        });
      }

      const parent = await query("""

new_content, count = re.subn(pattern, replacement, content, flags=re.DOTALL)
if count == 0:
    print("FAILED TO MATCH API CREATE ROUTE")

with open('apps/api/src/routes/multi-calling.ts', 'w') as f:
    f.write(new_content)

print("API Create route patched")
