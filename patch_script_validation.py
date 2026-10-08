import re

with open('apps/api/src/routes/multi-calling.ts', 'r') as f:
    content = f.read()

# POST /scripts
post_old = """  fastify.post('/v1/multi-calling/scripts', {
    preHandler: [fastify.authenticate]
  }, async (req: any, reply) => {
    const tenantId = req.tenant.tenantId;
    const { name, definition, nicheId } = req.body;

    const parsed = ScriptSchema.parse(definition);
    const client = await fastify.db.connect();"""

post_new = """  fastify.post('/v1/multi-calling/scripts', {
    preHandler: [fastify.authenticate]
  }, async (req: any, reply) => {
    const tenantId = req.tenant.tenantId;
    const { name, definition, nicheId } = req.body;

    let parsed;
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

content = content.replace(post_old, post_new)

# PUT /scripts/:scriptId
put_old = """  fastify.put('/v1/multi-calling/scripts/:scriptId', {
    preHandler: [fastify.authenticate]
  }, async (req: any, reply) => {
    const tenantId = req.tenant.tenantId;
    const { scriptId } = req.params;
    const { name, definition, nicheId, expectedDraftId } = req.body;

    const parsed = ScriptSchema.parse(definition);
    const client = await fastify.db.connect();"""

put_new = """  fastify.put('/v1/multi-calling/scripts/:scriptId', {
    preHandler: [fastify.authenticate]
  }, async (req: any, reply) => {
    const tenantId = req.tenant.tenantId;
    const { scriptId } = req.params;
    const { name, definition, nicheId, expectedDraftId } = req.body;

    let parsed;
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

print("Added safe Zod parsing for scripts POST/PUT")
