import { FastifyInstance } from 'fastify';
import { SocialPublisherService } from '../services/social-publisher.service';

export default async function socialRoutes(fastify: FastifyInstance) {
  fastify.get('/v1/social/accounts', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any, reply) => {
    const { tenantId } = request.tenant;
    
    // Fetch from all account tables
    const ytRows = await fastify.db.query(`SELECT channel_id, channel_title, channel_logo, total_views, total_comments, total_videos, subscriber_count FROM youtube_accounts WHERE tenant_id = $1`, [tenantId]);
    const liRows = await fastify.db.query(`SELECT linkedin_urn, profile_name FROM linkedin_accounts WHERE tenant_id = $1`, [tenantId]);
    
    return {
      youtube: ytRows.rows,
      linkedin: liRows.rows,
      instagram: [], // To be implemented
      facebook: []   // To be implemented
    };
  });

  fastify.post('/v1/social/publish', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any, reply) => {
    const { assetId, platforms, text, title } = request.body;
    const { tenantId } = request.tenant;

    if (!assetId || !platforms || platforms.length === 0) {
      return reply.code(400).send({ error: 'assetId and platforms are required' });
    }

    try {
      const assetRes = await fastify.db.query(`SELECT * FROM media_assets WHERE id = $1 AND tenant_id = $2`, [assetId, tenantId]);
      const asset = assetRes.rows[0];
      
      if (!asset) return reply.code(404).send({ error: 'Asset not found' });

      let platformStatus = asset.platform_status || {};

      if (platforms.includes('youtube') && asset.media_type === 'video') {
        const { youtubeChannelIds } = request.body;
        
        let ytAccounts = [];
        if (youtubeChannelIds && youtubeChannelIds.length > 0) {
          const accs = await fastify.db.query(`SELECT access_token, channel_title FROM youtube_accounts WHERE tenant_id = $1 AND channel_id = ANY($2)`, [tenantId, youtubeChannelIds]);
          ytAccounts = accs.rows;
        } else {
          const accs = await fastify.db.query(`SELECT access_token, channel_title FROM youtube_accounts WHERE tenant_id = $1`, [tenantId]);
          ytAccounts = accs.rows;
        }

        if (ytAccounts.length > 0) {
          for (const acc of ytAccounts) {
            await SocialPublisherService.publishToYouTube(acc.access_token, asset.media_url, title || asset.title, text || asset.description);
          }
          platformStatus['youtube'] = `published to ${ytAccounts.length} channel(s)`;
        } else {
          platformStatus['youtube'] = 'failed - no account';
        }
      }

      if (platforms.includes('linkedin')) {
        const acc = await fastify.db.query(`SELECT access_token, linkedin_urn FROM linkedin_accounts WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
        if (acc.rows.length > 0) {
          const res = await SocialPublisherService.publishToLinkedIn(acc.rows[0].access_token, acc.rows[0].linkedin_urn, text || asset.description, asset.media_url);
          platformStatus['linkedin'] = 'published';
        } else {
          platformStatus['linkedin'] = 'failed - no account';
        }
      }

      await fastify.db.query(
        `UPDATE media_assets SET platform_status = $1 WHERE id = $2`,
        [platformStatus, assetId]
      );

      return { success: true, platformStatus };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Publishing failed' });
    }
  });

  fastify.delete('/v1/social/youtube/:channelId', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any, reply) => {
    const { channelId } = request.params;
    const { tenantId } = request.tenant;

    try {
      await fastify.db.query(`DELETE FROM youtube_accounts WHERE channel_id = $1 AND tenant_id = $2`, [channelId, tenantId]);
      return { success: true };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to disconnect channel' });
    }
  });
}
