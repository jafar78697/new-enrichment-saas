import { FastifyInstance } from 'fastify';
import { AIMediaService } from '../services/ai-media.service';

export default async function aiMediaRoutes(fastify: FastifyInstance) {
  fastify.post('/v1/ai/generate-post', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any, reply) => {
    const { prompt, platform } = request.body;
    if (!prompt || !platform) return reply.code(400).send({ error: 'Prompt and platform required' });
    
    try {
      const text = await AIMediaService.generateText(prompt, platform);
      return { success: true, text };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to generate text' });
    }
  });

  fastify.post('/v1/ai/generate-image', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any, reply) => {
    const { prompt } = request.body;
    if (!prompt) return reply.code(400).send({ error: 'Prompt required' });
    
    try {
      const imageUrl = await AIMediaService.generateImage(prompt);
      // Optional: Insert into media_assets table here as well
      const { tenantId, userId } = request.tenant;
      const { rows } = await fastify.db.query(
        `INSERT INTO media_assets (tenant_id, user_id, title, media_type, media_url, generation_status, prompt)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [tenantId, userId, 'Generated Image', 'image', imageUrl, 'completed', prompt]
      );
      
      return { success: true, imageUrl, assetId: rows[0].id };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to generate image' });
    }
  });

  fastify.post('/v1/ai/generate-video', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any, reply) => {
    const { prompt } = request.body;
    if (!prompt) return reply.code(400).send({ error: 'Prompt required' });
    
    try {
      const videoUrl = await AIMediaService.generateVideo(prompt);
      
      const { tenantId, userId } = request.tenant;
      const { rows } = await fastify.db.query(
        `INSERT INTO media_assets (tenant_id, user_id, title, media_type, media_url, generation_status, prompt)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [tenantId, userId, 'Generated Reel', 'video', videoUrl, 'completed', prompt]
      );

      return { success: true, videoUrl, assetId: rows[0].id };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to generate video' });
    }
  });
  
  fastify.get('/v1/media', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any, reply) => {
    const { tenantId } = request.tenant;
    const { rows } = await fastify.db.query(
      `SELECT * FROM media_assets WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );
    return { assets: rows };
  });
}
