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
}
