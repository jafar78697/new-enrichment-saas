import { FastifyInstance } from 'fastify';

export default async function deepgramRoutes(fastify: FastifyInstance) {
  fastify.post('/v1/deepgram/token', {
    preHandler: [fastify.authenticate]
  }, async (request: any, reply) => {
    // Generate a short-lived token for Deepgram Voice Agent API
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      return reply.code(500).send({ error: 'DEEPGRAM_API_KEY is not configured on the server.' });
    }

    try {
      const response = await fetch("https://api.deepgram.com/v1/auth/grant", {
        method: "POST",
        headers: {
          "Authorization": `Token ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          time_to_live_in_seconds: 120 // Token valid for 2 minutes
        })
      });
      
      const data = await response.json();
      return reply.send(data);
    } catch (err: any) {
      fastify.log.error(err);
      return reply.code(500).send({ error: err.message });
    }
  });
}
