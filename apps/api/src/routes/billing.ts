import { FastifyInstance } from 'fastify';
import crypto from 'crypto';

const PLAN_VARIANT_IDS: Record<string, string> = {
  starter: process.env.LS_VARIANT_STARTER || '',
  growth: process.env.LS_VARIANT_GROWTH || '',
  pro: process.env.LS_VARIANT_PRO || '',
};

const CREDIT_VARIANT_IDS: Record<string, string> = {
  '100': process.env.LS_VARIANT_CREDITS_100 || '',
  '500': process.env.LS_VARIANT_CREDITS_500 || '',
  '1000': process.env.LS_VARIANT_CREDITS_1000 || '',
};

const PLAN_HTTP_LIMITS: Record<string, number> = { starter: 5000, growth: 25000, pro: 100000 };
const PLAN_BROWSER_CREDITS: Record<string, number> = { starter: 100, growth: 500, pro: 2000 };

async function lsRequest(path: string, method = 'GET', body?: any) {
  const res = await fetch(`https://api.lemonsqueezy.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
      'Content-Type': 'application/vnd.api+json',
      Accept: 'application/vnd.api+json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`LemonSqueezy error: ${res.status}`);
  return res.json();
}

export default async function billingRoutes(fastify: FastifyInstance) {

  // GET /v1/billing/usage
  fastify.get('/v1/billing/usage', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any) => {
    const { tenantId } = request.tenant;
    const { rows } = await fastify.db.query(
      `SELECT * FROM usage_counters WHERE tenant_id = $1 ORDER BY billing_period_start DESC LIMIT 1`,
      [tenantId]
    );
    return rows[0] || { http_enrichments_used: 0, http_limit: 5000, browser_credits_used: 0, browser_credits_remaining: 100 };
  });

  // GET /v1/billing/plan
  fastify.get('/v1/billing/plan', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any) => {
    const { tenantId } = request.tenant;
    const { rows } = await fastify.db.query(`SELECT plan, ls_subscription_id FROM tenants WHERE id = $1`, [tenantId]);
    return rows[0] || { plan: 'starter' };
  });

  // POST /v1/billing/checkout — create Lemon Squeezy checkout
  fastify.post('/v1/billing/checkout', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any, reply) => {
    const { tenantId, userId } = request.tenant;
    const { plan, credits } = request.body as any;

    let variantId: string;

    if (plan && PLAN_VARIANT_IDS[plan]) {
      variantId = PLAN_VARIANT_IDS[plan];
    } else if (credits && CREDIT_VARIANT_IDS[String(credits)]) {
      variantId = CREDIT_VARIANT_IDS[String(credits)];
    } else {
      return reply.code(400).send({ error: 'Invalid plan or credits pack' });
    }

    // Get user email
    const { rows } = await fastify.db.query(`SELECT email FROM users WHERE id = $1`, [userId]);
    const email = rows[0]?.email;

    const checkout = await lsRequest('/checkouts', 'POST', {
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            email,
            custom: { tenant_id: tenantId, user_id: userId, plan: plan || null, credits: credits || null },
          },
          product_options: {
            redirect_url: `${process.env.APP_URL}/billing?success=1`,
          },
        },
        relationships: {
          store: { data: { type: 'stores', id: process.env.LS_STORE_ID } },
          variant: { data: { type: 'variants', id: variantId } },
        },
      },
    });

    return { url: checkout.data.attributes.url };
  });

  // POST /v1/billing/portal — customer portal link
  fastify.post('/v1/billing/portal', {
    preHandler: [fastify.authenticate as any]
  }, async (request: any, reply) => {
    const { tenantId } = request.tenant;
    const { rows } = await fastify.db.query(`SELECT ls_customer_id FROM tenants WHERE id = $1`, [tenantId]);
    const customerId = rows[0]?.ls_customer_id;
    if (!customerId) return reply.code(404).send({ error: 'No billing account found' });

    const portal = await lsRequest(`/customers/${customerId}/portal`);
    return { url: portal.data.attributes.urls.customer_portal };
  });

  // POST /v1/webhooks/lemonsqueezy — Lemon Squeezy webhook
  fastify.post('/v1/webhooks/lemonsqueezy', async (request, reply) => {
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET || '';
    const signature = request.headers['x-signature'] as string;
    const rawBody = JSON.stringify(request.body);

    // Verify signature
    const hmac = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    if (hmac !== signature) return reply.code(401).send({ error: 'Invalid signature' });

    const event = request.body as any;
    const eventName = event.meta?.event_name;
    const customData = event.meta?.custom_data || {};
    const tenantId = customData.tenant_id;

    if (!tenantId) return { received: true };

    if (eventName === 'order_created') {
      const credits = customData.credits;
      const plan = customData.plan;
      const customerId = event.data?.attributes?.customer_id;

      // Save customer ID
      if (customerId) {
        await fastify.db.query(`UPDATE tenants SET ls_customer_id = $1 WHERE id = $2`, [String(customerId), tenantId]);
      }

      if (credits) {
        // Add browser credits
        await fastify.db.query(
          `UPDATE usage_counters SET browser_credits_remaining = browser_credits_remaining + $1
           WHERE tenant_id = $2 AND billing_period_start = date_trunc('month', now())::date`,
          [parseInt(credits), tenantId]
        );
      }

      if (plan) {
        // Upgrade plan
        await fastify.db.query(`UPDATE tenants SET plan = $1 WHERE id = $2`, [plan, tenantId]);
        await fastify.db.query(
          `UPDATE usage_counters SET http_limit = $1, browser_credits_remaining = $2
           WHERE tenant_id = $3 AND billing_period_start = date_trunc('month', now())::date`,
          [PLAN_HTTP_LIMITS[plan], PLAN_BROWSER_CREDITS[plan], tenantId]
        );
      }
    }

    if (eventName === 'subscription_created' || eventName === 'subscription_updated') {
      const subId = event.data?.id;
      const plan = customData.plan;
      if (subId && plan) {
        await fastify.db.query(`UPDATE tenants SET ls_subscription_id = $1, plan = $2 WHERE id = $3`, [String(subId), plan, tenantId]);
      }
    }

    if (eventName === 'subscription_cancelled') {
      await fastify.db.query(`UPDATE tenants SET plan = 'starter' WHERE id = $1`, [tenantId]);
    }

    return { received: true };
  });
}
