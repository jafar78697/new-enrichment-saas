import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import axios from 'axios';

const router = Router();

// 1. Initiate OAuth
router.get('/auth', requireAuth, (req, res) => {
  const APP_ID = process.env.FACEBOOK_APP_ID;
  const REDIRECT_URI = process.env.PUBLIC_BASE_URL + '/api/meta/callback';
  
  const agentId = req.user.userId || req.user.id;
  const state = encodeURIComponent(JSON.stringify({ agentId }));
  
  // Scopes required for Messenger and Instagram
  const scopes = 'pages_show_list,pages_messaging,pages_read_engagement,pages_manage_metadata,instagram_basic,instagram_manage_messages';
  
  const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${state}&scope=${scopes}`;
  
  res.redirect(authUrl);
});

// 2. OAuth Callback
router.get('/callback', async (req, res) => {
  const APP_ID = process.env.FACEBOOK_APP_ID;
  const APP_SECRET = process.env.FACEBOOK_APP_SECRET;
  const REDIRECT_URI = process.env.PUBLIC_BASE_URL + '/api/meta/callback';
  
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`${process.env.FRONTEND_URL}/settings?meta=error&reason=${error}`);
  }

  let agentId;
  try {
    const decodedState = JSON.parse(decodeURIComponent(state));
    agentId = decodedState.agentId;
  } catch (err) {
    return res.status(400).send('Invalid state parameter');
  }

  try {
    // Exchange code for access token
    const tokenRes = await axios.get(`https://graph.facebook.com/v19.0/oauth/access_token`, {
      params: {
        client_id: APP_ID,
        client_secret: APP_SECRET,
        redirect_uri: REDIRECT_URI,
        code
      }
    });

    const accessToken = tokenRes.data.access_token;

    // Get user info
    const meRes = await axios.get(`https://graph.facebook.com/v19.0/me?access_token=${accessToken}`);
    const facebookUserId = meRes.data.id;

    // Store in DB
    await query(`
      INSERT INTO meta_connections (agent_id, facebook_user_id, access_token, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT(agent_id) DO UPDATE SET
        facebook_user_id = excluded.facebook_user_id,
        access_token = excluded.access_token,
        updated_at = CURRENT_TIMESTAMP
    `, [agentId, facebookUserId, accessToken]);

    // Redirect back to frontend settings page
    res.redirect(`${process.env.FRONTEND_URL}/outreach?meta=success`);
  } catch (error) {
    console.error('Meta OAuth Error:', error.response?.data || error.message);
    res.redirect(`${process.env.FRONTEND_URL}/outreach?meta=error`);
  }
});

// 3. Webhook Verification
router.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = 'jento_meta_webhook_token_2026';
  
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Meta Webhook Verified!');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// 4. Webhook Receiver
router.post('/webhook', (req, res) => {
  const body = req.body;

  if (body.object === 'page' || body.object === 'instagram') {
    body.entry?.forEach((entry) => {
      // Get the webhook event
      const webhookEvent = entry.messaging?.[0];
      if (webhookEvent) {
        console.log('Received Meta Message Event:', JSON.stringify(webhookEvent));
        // TODO: Save message to DB and push via Socket.io
      }
    });
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

export default router;
