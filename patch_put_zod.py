import re

with open('apps/api/src/routes/multi-calling.ts', 'r') as f:
    content = f.read()

put_old = """    const parsed = ScriptSchema.parse(definition);
    
    const client = await fastify.db.connect();"""

put_new = """    let parsed;
    try {
      parsed = ScriptSchema.parse(definition);
    } catch (err: any) {
      return reply.code(400).send({
        error: 'Script schema validation failed',
        details: err.errors ? err.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`) : [err.message],
        issues: mapZodErrorsToIssues(err, definition)
      });
    }
    
    const client = await fastify.db.connect();"""

content = content.replace(put_old, put_new)

with open('apps/api/src/routes/multi-calling.ts', 'w') as f:
    f.write(content)

print("PUT route patched for Zod error mapping")
