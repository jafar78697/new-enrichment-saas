import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { AuthManager } from '@enrichment-saas/auth';

const PLAN_HTTP_LIMITS: Record<string, number> = { starter: 5000, growth: 25000, pro: 100000 };
const PLAN_BROWSER_CREDITS: Record<string, number> = { starter: 100, growth: 500, pro: 2000 };

export default async function authRoutes(fastify: FastifyInstance) {
  const authManager = new AuthManager(process.env.JWT_PRIVATE_KEY || '', process.env.JWT_PUBLIC_KEY || '');

  // POST /v1/auth/signup
  fastify.post('/v1/auth/signup', async (request, reply) => {
    return reply.code(403).send({ error: 'Signups are currently disabled. This is a private system.' });
  });

  // POST /v1/auth/login
  fastify.post('/v1/auth/login', async (request, reply) => {
    const { email, password } = request.body as any;
    const { rows } = await fastify.db.query(
      `SELECT u.*, t.plan, w.id as workspace_id
       FROM users u
       JOIN tenants t ON u.tenant_id = t.id
       LEFT JOIN workspaces w ON w.tenant_id = t.id
       WHERE u.email = $1 LIMIT 1`,
      [email]
    );
    const user = rows[0];
    if (!user || !bcrypt.compareSync(password, user.password_hash))
      return reply.code(401).send({ error: 'Invalid email or password' });

    const token = authManager.signUserToken({ user_id: user.id, tenant_id: user.tenant_id, workspace_id: user.workspace_id, role: user.role, plan: user.plan });
    return { token, user: { id: user.id, email: user.email, role: user.role, plan: user.plan } };
  });

  // POST /v1/auth/refresh
  fastify.post('/v1/auth/refresh', async (request, reply) => {
    const { refresh_token } = request.body as any;
    if (!refresh_token) return reply.code(400).send({ error: 'refresh_token required' });
    try {
      const payload = authManager.verifyUserToken(refresh_token);
      const token = authManager.signUserToken(payload);
      return { token };
    } catch {
      return reply.code(401).send({ error: 'Invalid refresh token' });
    }
  });

  // POST /v1/auth/youtube/callback
  fastify.post('/v1/auth/youtube/callback', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any, reply) => {
    const { code, redirectUri } = request.body as any;
    const { tenantId, userId } = request.tenant;

    if (!code) return reply.code(400).send({ error: 'Missing code' });

    try {
      // Exchange code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID || '1071909841111-sfa36eroerh8ggr58cu6v7upcvop380g.apps.googleusercontent.com',
          client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }).toString(),
      });

      const tokens = await tokenResponse.json() as any;

      if (tokens.error) {
        fastify.log.error(tokens, 'YouTube Token Error');
        return reply.code(400).send({ error: tokens.error_description || tokens.error });
      }

      const refreshToken = tokens.refresh_token || null;
      const accessToken = tokens.access_token;
      const expiry = new Date(Date.now() + tokens.expires_in * 1000);

      // Fetch channel info using the access token
      const channelRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const channelData = await channelRes.json() as any;
      let channelId = null;
      let channelTitle = null;
      let channelLogo = null;
      let totalViews = 0;
      let totalComments = 0;
      let totalVideos = 0;
      let subscriberCount = 0;

      if (channelData.items && channelData.items.length > 0) {
        const item = channelData.items[0];
        channelId = item.id;
        channelTitle = item.snippet?.title;
        channelLogo = item.snippet?.thumbnails?.default?.url || null;
        totalViews = parseInt(item.statistics?.viewCount || '0', 10);
        subscriberCount = parseInt(item.statistics?.subscriberCount || '0', 10);
        totalVideos = parseInt(item.statistics?.videoCount || '0', 10);
      }

      // Save to Postgres Database
      await fastify.db.query(
        `INSERT INTO youtube_accounts (tenant_id, user_id, channel_id, channel_title, access_token, refresh_token, token_expiry, channel_logo, total_views, total_comments, total_videos, subscriber_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [tenantId, userId, channelId, channelTitle, accessToken, refreshToken, expiry, channelLogo, totalViews, totalComments, totalVideos, subscriberCount]
      );

      return { success: true, channelId, channelTitle };

    } catch (err: any) {
      fastify.log.error(err, 'Error in YouTube auth callback');
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });

  // POST /v1/auth/linkedin/callback
  fastify.post('/v1/auth/linkedin/callback', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any, reply) => {
    const { code, redirectUri } = request.body as any;
    const { tenantId, userId } = request.tenant;

    if (!code) return reply.code(400).send({ error: 'Missing code' });

    try {
      // 1. Exchange code for LinkedIn access token
      const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: process.env.LINKEDIN_CLIENT_ID || '',
          client_secret: process.env.LINKEDIN_CLIENT_SECRET || '',
          redirect_uri: redirectUri,
        }).toString(),
      });

      const tokens = await tokenResponse.json() as any;
      if (tokens.error) {
        fastify.log.error(tokens, 'LinkedIn Token Error');
        return reply.code(400).send({ error: tokens.error_description || tokens.error });
      }

      const accessToken = tokens.access_token;
      const refreshToken = tokens.refresh_token || null;
      const expiry = new Date(Date.now() + tokens.expires_in * 1000);

      // 2. Fetch user profile (to get URN)
      const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const profileData = await profileRes.json() as any;
      const linkedinUrn = `urn:li:person:${profileData.sub}`;
      const profileName = `${profileData.given_name} ${profileData.family_name}`;

      // 3. Save to database
      await fastify.db.query(
        `INSERT INTO linkedin_accounts (tenant_id, user_id, linkedin_urn, profile_name, access_token, refresh_token, token_expiry)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [tenantId, userId, linkedinUrn, profileName, accessToken, refreshToken, expiry]
      );

      return { success: true, linkedinUrn, profileName };

    } catch (err: any) {
      fastify.log.error(err, 'Error in LinkedIn auth callback');
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });

  // DELETE /v1/account (GDPR)
  fastify.delete('/v1/account', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any, reply) => {
    const { tenantId } = request.tenant;
    await fastify.db.query(
      `UPDATE tenants SET deleted_at = now() + interval '30 days' WHERE id = $1`,
      [tenantId]
    );
    return { message: 'Account scheduled for deletion in 30 days' };
  });
}
