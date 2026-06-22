import { FastifyInstance } from 'fastify';
// import { OutreachSenderService } from '../services/outreach-sender.service';
import { OutreachImapService } from '../services/outreach-imap.service';

export default async function outreachRoutes(fastify: FastifyInstance) {
  // const senderService = new OutreachSenderService(fastify.db); // Disabled (OpenAI)
  const imapService = new OutreachImapService(fastify.db);

  // Background Task: Process Email Queue every 1 minute (Disabled - Using DeepSeek)
  /*
  setInterval(async () => {
    try {
      await senderService.processQueue();
    } catch (err) {
      console.error('Error in Outreach Sender Queue', err);
    }
  }, 60 * 1000);
  */

  // Background Task: Sync IMAP Replies every 5 minutes
  setInterval(async () => {
    try {
      await imapService.syncReplies();
    } catch (err) {
      console.error('Error in Outreach IMAP Sync', err);
    }
  }, 5 * 60 * 1000);

  // 1. Email Tracking Pixel Route
  // Whenever an email is opened, the hidden 1x1 image triggers this endpoint
  fastify.get('/v1/outreach/track', async (request, reply) => {
    const query = request.query as { log_id: string };
    
    if (query.log_id) {
      try {
        await fastify.db.query(`
          UPDATE outreach_logs 
          SET status = 'opened', opened_at = now(), open_count = open_count + 1 
          WHERE id = $1 AND status = 'sent'
        `, [query.log_id]);
      } catch (e) {
        console.error('Error tracking pixel for log ' + query.log_id, e);
      }
    }

    // Return a 1x1 transparent GIF pixel
    const pixel = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64'
    );
    
    reply.header('Content-Type', 'image/gif');
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    return reply.send(pixel);
  });

  // 2. Fetch all configured accounts for the UI
  fastify.get('/v1/outreach/accounts', { preHandler: [fastify.authenticate] }, async (request: any, reply) => {
    const { rows } = await fastify.db.query(`
      SELECT id, email, provider, daily_limit, sent_today, is_active, status
      FROM outreach_accounts
      WHERE tenant_id = $1
    `, [request.tenant.tenantId]);
    return reply.send({ accounts: rows });
  });

  // 3. Fetch Unified Inbox (Replies)
  fastify.get('/v1/outreach/inbox', { preHandler: [fastify.authenticate] }, async (request: any, reply) => {
    const { rows } = await fastify.db.query(`
      SELECT u.*, er.company_name, er.primary_email as lead_email 
      FROM unified_inbox u
      LEFT JOIN enrichment_results er ON u.lead_id = er.id
      WHERE u.tenant_id = $1
      ORDER BY u.received_at DESC LIMIT 100
    `, [request.tenant.tenantId]);
    return reply.send({ inbox: rows });
  });

  // --- FACEBOOK EXTENSION ENDPOINTS ---
  
  // Custom auth handler for the Extension (uses API Key)
  const authenticateApiKey = async (request: any, reply: any) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing API Key' });
    }
    const key = authHeader.split(' ')[1];
    const prefix = key.split('_')[1]?.substring(0, 8); // jen_prefix...
    
    if (!prefix) return reply.code(401).send({ error: 'Invalid API Key format' });

    const { rows } = await fastify.db.query(
      'SELECT tenant_id, key_hash FROM api_keys WHERE key_prefix = $1 AND revoked_at IS NULL',
      [prefix]
    );

    if (rows.length === 0) return reply.code(401).send({ error: 'Invalid or revoked API Key' });

    const { ApiKeyManager } = await import('@enrichment-saas/auth');
    const keyManager = new ApiKeyManager();
    
    const isValid = keyManager.verifyKey(key, rows[0].key_hash);
    if (!isValid) return reply.code(401).send({ error: 'Invalid API Key' });

    request.tenant = { tenantId: rows[0].tenant_id };
  };

  // 4. Extension polls for pending Facebook messages
  fastify.get('/v1/outreach/facebook/pending', { preHandler: [authenticateApiKey] }, async (request: any, reply) => {
    const { tenantId } = request.tenant;
    const { rows } = await fastify.db.query(`
      SELECT ol.id as "logId", er.facebook_url as "facebookUrl", 
             oc.body as "textBody"
      FROM outreach_logs ol
      JOIN outreach_campaigns oc ON ol.campaign_id = oc.id
      JOIN enrichment_results er ON ol.lead_id = er.id
      WHERE ol.tenant_id = $1 AND ol.status = 'pending' AND ol.channel = 'facebook'
      LIMIT 1
    `, [tenantId]);

    if (rows.length === 0) return reply.send({ pending: [] });

    // Extract profile ID from URL (simple parsing)
    const facebookUrl = rows[0].facebookUrl || '';
    const parts = facebookUrl.split('/');
    const profileId = parts[parts.length - 1] || parts[parts.length - 2];

    return reply.send({
      pending: [{
        logId: rows[0].logId,
        facebookProfileId: profileId,
        textBody: rows[0].textBody
      }]
    });
  });

  // 5. Extension marks a message as sent
  fastify.post('/v1/outreach/facebook/status', { preHandler: [authenticateApiKey] }, async (request: any, reply) => {
    const { tenantId } = request.tenant;
    const { log_id, status, error } = request.body;

    await fastify.db.query(`
      UPDATE outreach_logs 
      SET status = $1, error_message = $2, sent_at = CASE WHEN $1 = 'sent' THEN now() ELSE sent_at END
      WHERE id = $3 AND tenant_id = $4
    `, [status, error || null, log_id, tenantId]);

    return reply.send({ success: true });
  });

  // 5a. Extension fetches tasks (dashboard)
  fastify.get('/v1/outreach/facebook/tasks', { preHandler: [authenticateApiKey] }, async (request: any, reply) => {
    const { tenantId } = request.tenant;
    
    const { rows } = await fastify.db.query(`
      SELECT ol.id, ol.status, ol.channel, er.company_name
      FROM outreach_logs ol
      JOIN enrichment_results er ON ol.lead_id = er.id
      WHERE ol.tenant_id = $1 AND ol.channel IN ('facebook', 'instagram')
      ORDER BY ol.created_at DESC
      LIMIT 50
    `, [tenantId]);

    return reply.send({ tasks: rows });
  });

  // 5b. Extension syncs reply from DOM scraping
  fastify.post('/v1/outreach/facebook/sync-reply', { preHandler: [authenticateApiKey] }, async (request: any, reply) => {
    const { tenantId } = request.tenant;
    const { profileUrl, messageText, platform } = request.body;

    if (!profileUrl || !messageText) {
      return reply.code(400).send({ error: 'Missing profileUrl or messageText' });
    }

    // Find a lead with a matching social URL who we sent a message to
    const urlPattern = `%${profileUrl.split('?')[0].replace(/\/$/, '')}%`;
    const urlColumn = platform === 'instagram' ? 'instagram_url' : 'facebook_url';
    
    const { rows } = await fastify.db.query(`
      SELECT ol.id as log_id, ol.lead_id, oa.id as account_id
      FROM outreach_logs ol
      JOIN enrichment_results er ON ol.lead_id = er.id
      JOIN outreach_accounts oa ON ol.account_id = oa.id
      WHERE ol.tenant_id = $1 
        AND ol.status = 'sent' 
        AND er.${urlColumn} LIKE $2
      LIMIT 1
    `, [tenantId, urlPattern]);

    if (rows.length > 0) {
      const log = rows[0];

      // Mark log as replied
      await fastify.db.query(`
        UPDATE outreach_logs SET status = 'replied' WHERE id = $1
      `, [log.log_id]);

      await fastify.db.query(`
        UPDATE contacts SET stage = 'replied' WHERE id = $1
      `, [log.lead_id]);

      // Insert into unified_inbox
      await fastify.db.query(`
        INSERT INTO unified_inbox 
        (tenant_id, account_id, lead_id, msg_id, subject, body_text)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT DO NOTHING
      `, [
        tenantId, 
        log.account_id, 
        log.lead_id, 
        `ext_${Date.now()}`, 
        `${platform === 'instagram' ? 'Instagram' : 'Facebook'} Reply`, 
        messageText
      ]);

      return reply.send({ success: true, matched: true });
    }

    return reply.send({ success: true, matched: false });
  });

  // --- META PROFILE MANAGEMENT ---

  // GET /v1/outreach/meta/profiles — list all connected FB/IG profiles
  fastify.get('/v1/outreach/meta/profiles', { preHandler: [fastify.authenticate as any] }, async (request: any, reply) => {
    const { tenantId } = request.tenant;
    const { platform } = request.query as any;
    
    const whereClause = platform
      ? `WHERE tenant_id = $1 AND platform = $2 ORDER BY created_at ASC`
      : `WHERE tenant_id = $1 ORDER BY created_at ASC`;
    const params = platform ? [tenantId, platform] : [tenantId];
    
    try {
      const { rows } = await fastify.db.query(
        `SELECT * FROM meta_profiles ${whereClause}`,
        params
      );
      return reply.send({ profiles: rows });
    } catch (err) {
      // Table may not exist yet — return empty list gracefully
      return reply.send({ profiles: [] });
    }
  });

  // POST /v1/outreach/meta/profiles — add a new profile
  fastify.post('/v1/outreach/meta/profiles', { preHandler: [fastify.authenticate as any] }, async (request: any, reply) => {
    const { tenantId } = request.tenant;
    const { name, platform, username, profile_url } = request.body as any;
    
    if (!name) return reply.code(400).send({ error: 'name is required' });
    
    const { rows } = await fastify.db.query(`
      INSERT INTO meta_profiles (tenant_id, name, platform, username, profile_url)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [tenantId, name, platform || 'facebook', username || null, profile_url || null]);
    
    return reply.code(201).send({ profile: rows[0] });
  });

  // DELETE /v1/outreach/meta/profiles/:id
  fastify.delete('/v1/outreach/meta/profiles/:id', { preHandler: [fastify.authenticate as any] }, async (request: any, reply) => {
    const { tenantId } = request.tenant;
    const { id } = request.params as any;
    
    await fastify.db.query(
      `DELETE FROM meta_profiles WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    return reply.send({ success: true });
  });

  // --- META DAILY STATS ---

  // GET /v1/outreach/meta/daily-stats?profile_id=&date=
  fastify.get('/v1/outreach/meta/daily-stats', { preHandler: [fastify.authenticate as any] }, async (request: any, reply) => {
    const { tenantId } = request.tenant;
    const { profile_id, date } = request.query as any;
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    try {
      const where: string[] = ['tenant_id = $1', 'date = $2'];
      const params: any[] = [tenantId, targetDate];
      
      if (profile_id) {
        params.push(profile_id);
        where.push(`profile_id = $${params.length}`);
      }
      
      const { rows } = await fastify.db.query(
        `SELECT action_type, SUM(count)::int as count FROM meta_daily_actions 
         WHERE ${where.join(' AND ')} GROUP BY action_type`,
        params
      );
      
      // Return structured stats
      const stats: Record<string, number> = {};
      for (const row of rows) stats[row.action_type] = row.count;
      
      return reply.send({
        date: targetDate,
        likes_comments: stats['like'] || 0,
        friend_requests: stats['friend_req'] || 0,
        dms_sent: stats['dm'] || 0,
        group_joins: stats['group_join'] || 0,
        posts: stats['post'] || 0,
      });
    } catch (err) {
      return reply.send({
        date: targetDate,
        likes_comments: 0, friend_requests: 0,
        dms_sent: 0, group_joins: 0, posts: 0,
      });
    }
  });

  // POST /v1/outreach/meta/actions/log — log a manual action
  fastify.post('/v1/outreach/meta/actions/log', { preHandler: [fastify.authenticate as any] }, async (request: any, reply) => {
    const { tenantId } = request.tenant;
    const { profile_id, action_type, count } = request.body as any;
    
    if (!profile_id || !action_type) {
      return reply.code(400).send({ error: 'profile_id and action_type required' });
    }
    
    const today = new Date().toISOString().split('T')[0];
    
    await fastify.db.query(`
      INSERT INTO meta_daily_actions (tenant_id, profile_id, date, action_type, count)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (tenant_id, profile_id, date, action_type)
      DO UPDATE SET count = meta_daily_actions.count + EXCLUDED.count
    `, [tenantId, profile_id, today, action_type, count || 1]);
    
    return reply.send({ success: true });
  });

  // --- META PIPELINE ---

  // GET /v1/outreach/meta/pipeline?profile_id=&platform=
  fastify.get('/v1/outreach/meta/pipeline', { preHandler: [fastify.authenticate as any] }, async (request: any, reply) => {
    const { tenantId } = request.tenant;
    const { profile_id, platform } = request.query as any;
    
    try {
      const where: string[] = ['tenant_id = $1'];
      const params: any[] = [tenantId];
      
      if (profile_id) { params.push(profile_id); where.push(`profile_id = $${params.length}`); }
      if (platform) { params.push(platform); where.push(`platform = $${params.length}`); }
      
      const { rows } = await fastify.db.query(
        `SELECT * FROM meta_pipeline WHERE ${where.join(' AND ')} ORDER BY stage_updated_at DESC`,
        params
      );
      
      // Group by stage
      const pipeline: Record<string, any[]> = {
        find_mine: [], engaged: [], hot_dm: [], active_conv: []
      };
      for (const row of rows) {
        const stage = row.stage as string;
        if (pipeline[stage]) pipeline[stage].push(row);
      }
      
      return reply.send({ pipeline });
    } catch (err) {
      return reply.send({ pipeline: { find_mine: [], engaged: [], hot_dm: [], active_conv: [] } });
    }
  });

  // POST /v1/outreach/meta/pipeline — add a lead to pipeline
  fastify.post('/v1/outreach/meta/pipeline', { preHandler: [fastify.authenticate as any] }, async (request: any, reply) => {
    const { tenantId } = request.tenant;
    const { profile_id, name, source_group, platform, avatar_url, stage } = request.body as any;
    
    if (!name) return reply.code(400).send({ error: 'name required' });
    
    const { rows } = await fastify.db.query(`
      INSERT INTO meta_pipeline (tenant_id, profile_id, name, source_group, platform, avatar_url, stage)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [tenantId, profile_id || null, name, source_group || null, platform || 'facebook', avatar_url || null, stage || 'find_mine']);
    
    return reply.code(201).send({ lead: rows[0] });
  });

  // PATCH /v1/outreach/meta/pipeline/:id — move stage or update last message
  fastify.patch('/v1/outreach/meta/pipeline/:id', { preHandler: [fastify.authenticate as any] }, async (request: any, reply) => {
    const { tenantId } = request.tenant;
    const { id } = request.params as any;
    const { stage, last_message, engagement_level } = request.body as any;
    
    const updates: string[] = ['stage_updated_at = now()'];
    const params: any[] = [];
    
    if (stage) { params.push(stage); updates.push(`stage = $${params.length}`); }
    if (last_message !== undefined) { params.push(last_message); updates.push(`last_message = $${params.length}`); }
    if (engagement_level) { params.push(engagement_level); updates.push(`engagement_level = $${params.length}`); }
    
    if (params.length === 0) return reply.code(400).send({ error: 'Nothing to update' });
    
    params.push(id); params.push(tenantId);
    const { rows } = await fastify.db.query(
      `UPDATE meta_pipeline SET ${updates.join(', ')} WHERE id = $${params.length - 1} AND tenant_id = $${params.length} RETURNING *`,
      params
    );
    
    return reply.send({ lead: rows[0] });
  });

  // DELETE /v1/outreach/meta/pipeline/:id
  fastify.delete('/v1/outreach/meta/pipeline/:id', { preHandler: [fastify.authenticate as any] }, async (request: any, reply) => {
    const { tenantId } = request.tenant;
    const { id } = request.params as any;
    await fastify.db.query(`DELETE FROM meta_pipeline WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    return reply.send({ success: true });
  });

  // --- META CAMPAIGNS ---

  // GET /v1/outreach/meta/campaigns?platform=
  fastify.get('/v1/outreach/meta/campaigns', { preHandler: [fastify.authenticate as any] }, async (request: any, reply) => {
    const { tenantId } = request.tenant;
    const { platform } = request.query as any;
    
    try {
      const where: string[] = ['tenant_id = $1'];
      const params: any[] = [tenantId];
      if (platform) { params.push(platform); where.push(`platform = $${params.length}`); }
      
      const { rows } = await fastify.db.query(
        `SELECT * FROM meta_campaigns WHERE ${where.join(' AND ')} ORDER BY created_at DESC`,
        params
      );
      return reply.send({ campaigns: rows });
    } catch (err) {
      return reply.send({ campaigns: [] });
    }
  });

  // POST /v1/outreach/meta/campaigns
  fastify.post('/v1/outreach/meta/campaigns', { preHandler: [fastify.authenticate as any] }, async (request: any, reply) => {
    const { tenantId } = request.tenant;
    const { name, platform, message_template, daily_limit, target_groups, profile_id } = request.body as any;
    
    if (!name || !message_template) {
      return reply.code(400).send({ error: 'name and message_template required' });
    }
    
    const { rows } = await fastify.db.query(`
      INSERT INTO meta_campaigns (tenant_id, profile_id, name, platform, message_template, daily_limit, target_groups)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [tenantId, profile_id || null, name, platform || 'facebook', message_template, daily_limit || 10, target_groups || null]);
    
    return reply.code(201).send({ campaign: rows[0] });
  });

  // PATCH /v1/outreach/meta/campaigns/:id
  fastify.patch('/v1/outreach/meta/campaigns/:id', { preHandler: [fastify.authenticate as any] }, async (request: any, reply) => {
    const { tenantId } = request.tenant;
    const { id } = request.params as any;
    const { status, name, message_template, daily_limit } = request.body as any;
    
    const updates: string[] = [];
    const params: any[] = [];
    
    if (status) { params.push(status); updates.push(`status = $${params.length}`); }
    if (name) { params.push(name); updates.push(`name = $${params.length}`); }
    if (message_template) { params.push(message_template); updates.push(`message_template = $${params.length}`); }
    if (daily_limit) { params.push(daily_limit); updates.push(`daily_limit = $${params.length}`); }
    
    if (!updates.length) return reply.code(400).send({ error: 'Nothing to update' });
    
    params.push(id); params.push(tenantId);
    const { rows } = await fastify.db.query(
      `UPDATE meta_campaigns SET ${updates.join(', ')} WHERE id = $${params.length - 1} AND tenant_id = $${params.length} RETURNING *`,
      params
    );
    return reply.send({ campaign: rows[0] });
  });

  // DELETE /v1/outreach/meta/campaigns/:id
  fastify.delete('/v1/outreach/meta/campaigns/:id', { preHandler: [fastify.authenticate as any] }, async (request: any, reply) => {
    const { tenantId } = request.tenant;
    const { id } = request.params as any;
    await fastify.db.query(`DELETE FROM meta_campaigns WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    return reply.send({ success: true });
  });

  // --- META TASK QUEUE ---

  // GET /v1/outreach/meta/queue?profile_id=&status=
  fastify.get('/v1/outreach/meta/queue', { preHandler: [fastify.authenticate as any] }, async (request: any, reply) => {
    const { tenantId } = request.tenant;
    const { profile_id, status } = request.query as any;
    
    try {
      const where: string[] = ['q.tenant_id = $1'];
      const params: any[] = [tenantId];
      if (profile_id) { params.push(profile_id); where.push(`q.profile_id = $${params.length}`); }
      if (status) { params.push(status); where.push(`q.status = $${params.length}`); }
      
      const { rows } = await fastify.db.query(`
        SELECT q.*, p.name as pipeline_lead_name, mp.name as profile_name
        FROM meta_task_queue q
        LEFT JOIN meta_pipeline p ON q.pipeline_id = p.id
        LEFT JOIN meta_profiles mp ON q.profile_id = mp.id
        WHERE ${where.join(' AND ')}
        ORDER BY q.created_at DESC LIMIT 100
      `, params);
      return reply.send({ tasks: rows });
    } catch (err) {
      return reply.send({ tasks: [] });
    }
  });

  // POST /v1/outreach/meta/queue — add task
  fastify.post('/v1/outreach/meta/queue', { preHandler: [fastify.authenticate as any] }, async (request: any, reply) => {
    const { tenantId } = request.tenant;
    const { profile_id, pipeline_id, task_type, target_url, message_body } = request.body as any;
    
    if (!profile_id || !task_type) {
      return reply.code(400).send({ error: 'profile_id and task_type required' });
    }
    
    const { rows } = await fastify.db.query(`
      INSERT INTO meta_task_queue (tenant_id, profile_id, pipeline_id, task_type, target_url, message_body)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [tenantId, profile_id, pipeline_id || null, task_type, target_url || null, message_body || null]);
    
    return reply.code(201).send({ task: rows[0] });
  });

  // PATCH /v1/outreach/meta/queue/:id — update task status (used by Extension)
  fastify.patch('/v1/outreach/meta/queue/:id', { preHandler: [authenticateApiKey] }, async (request: any, reply) => {
    const { tenantId } = request.tenant;
    const { id } = request.params as any;
    const { status } = request.body as any;
    
    const { rows } = await fastify.db.query(`
      UPDATE meta_task_queue 
      SET status = $1, processed_at = CASE WHEN $1 IN ('done','failed') THEN now() ELSE processed_at END
      WHERE id = $2 AND tenant_id = $3
      RETURNING *
    `, [status, id, tenantId]);
    
    return reply.send({ task: rows[0] });
  });

  // --- META GRAPH API (WEBHOOKS) ---

  const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'jento_meta_webhook_secret';

  // 6. Meta Webhook Verification
  fastify.get('/v1/outreach/facebook/webhook', async (request: any, reply) => {
    const mode = request.query['hub.mode'];
    const token = request.query['hub.verify_token'];
    const challenge = request.query['hub.challenge'];

    if (mode === 'subscribe' && token === META_VERIFY_TOKEN) {
      return reply.code(200).send(challenge);
    } else {
      return reply.code(403).send('Forbidden');
    }
  });

  // 7. Receive incoming message from Meta
  fastify.post('/v1/outreach/facebook/webhook', async (request: any, reply) => {
    const body = request.body;
    
    // Check if it's a page event
    if (body.object === 'page') {
      for (const entry of body.entry) {
        // Facebook Page ID receiving the message
        const pageId = entry.id;
        
        // Find which tenant owns this page
        const { rows: accounts } = await fastify.db.query(
          `SELECT id, tenant_id FROM outreach_accounts WHERE provider = 'facebook' AND email = $1 LIMIT 1`,
          [pageId]
        );

        if (accounts.length === 0) continue;
        const account = accounts[0];

        const webhookEvent = entry.messaging[0];
        const senderPsid = webhookEvent.sender.id; // PSID of the person who sent the message
        const messageText = webhookEvent.message?.text;

        if (messageText) {
          // Store in unified inbox
          await fastify.db.query(
            `INSERT INTO unified_inbox 
             (tenant_id, account_id, msg_id, from_email, subject, body_text)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT DO NOTHING`,
             [
               account.tenant_id, 
               account.id, 
               webhookEvent.message.mid, 
               senderPsid, 
               'Facebook Message', 
               messageText
             ]
          );
        }
      }
      return reply.code(200).send('EVENT_RECEIVED');
    }

    return reply.code(404).send();
  });

  // ── EXTENSION API KEY (shared secret) ──
  const EXTENSION_API_KEY = 'jento-ext-2026-secure-key-change-in-production';

  // ── SYNC PROGRESS FROM EXTENSION ──
  fastify.post('/v1/outreach/meta/actions/sync-progress', async (request: any, reply) => {
    // Allow both JWT auth AND extension API key
    const apiKey = request.headers['x-api-key'];
    let tenantId = null;
    
    if (apiKey === EXTENSION_API_KEY) {
      // Extension key: use default tenant
      const tenantRes = await fastify.db.query(`SELECT id FROM tenants LIMIT 1`);
      tenantId = tenantRes.rows[0]?.id;
    } else {
      // Try JWT auth
      try {
        await fastify.authenticate(request, reply);
        tenantId = request.tenant?.tenantId;
      } catch (e) {
        return reply.code(401).send({ error: 'Unauthorized. Provide x-api-key or valid JWT.' });
      }
    }
    
    if (!tenantId) {
      return reply.code(500).send({ error: 'No tenant found' });
    }
    
    const { profileEmail, dailyProgress, weeklyProgress, date } = request.body as any;

    if (!profileEmail || !dailyProgress) {
      return reply.code(400).send({ error: 'profileEmail and dailyProgress required' });
    }

    try {
      // Find or create profile by email
      let profileRes = await fastify.db.query(
        `SELECT id FROM meta_profiles WHERE tenant_id = $1 AND username = $2`,
        [tenantId, profileEmail]
      );

      let profileId: number;
      if (profileRes.rows.length === 0) {
        // Auto-create profile if not exists
        const newProfile = await fastify.db.query(
          `INSERT INTO meta_profiles (tenant_id, name, username, platform) VALUES ($1, $2, $3, $4) RETURNING id`,
          [tenantId, profileEmail.split('@')[0], profileEmail, 'facebook']
        );
        profileId = newProfile.rows[0].id;
      } else {
        profileId = profileRes.rows[0].id;
      }

      // Sync daily actions
      for (const [actionType, count] of Object.entries(dailyProgress)) {
        if ((count as number) > 0) {
          await fastify.db.query(`
            INSERT INTO meta_daily_actions (tenant_id, profile_id, date, action_type, count)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (tenant_id, profile_id, date, action_type)
            DO UPDATE SET count = GREATEST(meta_daily_actions.count, EXCLUDED.count)
          `, [tenantId, profileId, date || new Date().toISOString().split('T')[0], actionType, count]);
        }
      }

      return reply.send({ success: true, profileId });
    } catch (err) {
      fastify.log.error(err);
      return reply.send({ success: true }); // Non-fatal
    }
  });

  // ── LAUNCH PROFILES (triggers Python script on server) ──
  fastify.post('/v1/outreach/meta/launch-profiles', { preHandler: [fastify.authenticate as any] }, async (request: any, reply) => {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      // Try to run the launch script
      await execAsync('python3 ~/launch_accounts.py');
      return reply.send({ success: true, message: 'Profiles launched' });
    } catch (err: any) {
      fastify.log.error(err, 'Launch profiles error');
      return reply.code(500).send({ 
        success: false, 
        error: 'Could not launch profiles. Run manually: python3 ~/launch_accounts.py',
        detail: err.message
      });
    }
  });
}
