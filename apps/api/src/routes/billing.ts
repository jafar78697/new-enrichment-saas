import { FastifyInstance } from 'fastify';
import { StripeService } from '../services/stripe';

export default async function billingRoutes(fastify: FastifyInstance) {
  const stripeService = new StripeService(process.env.STRIPE_SECRET_KEY || '');
  const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

  // 1. Create Checkout Session
  fastify.post('/v1/billing/checkout', {
    preHandler: [fastify.authenticate]
  }, async (request: any, reply) => {
    const { amount, credits } = request.body as any;
    const tenantId = request.tenant.id;

    // TODO: Get user email from DB if not in request
    const session = await stripeService.createCheckoutSession({
      tenantId,
      customerEmail: request.tenant.email || 'customer@example.com',
      amount,
      credits,
      successUrl: `${process.env.DASHBOARD_URL}/billing/success`,
      cancelUrl: `${process.env.DASHBOARD_URL}/billing/cancel`
    });

    // Create pending transaction
    await fastify.db.query(
      'INSERT INTO billing_transactions (tenant_id, stripe_session_id, amount, credits_added, type) VALUES ($1, $2, $3, $4, $5)',
      [tenantId, session.id, amount, credits, 'topup']
    );

    return { url: session.url };
  });

  // 2. Webhook Handler
  fastify.post('/v1/billing/webhook', {
    config: { rawBody: true }
  }, async (request: any, reply) => {
    const sig = request.headers['stripe-signature'];
    let event;

    try {
      event = stripeService.constructEvent(request.rawBody, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err: any) {
      reply.code(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      const tenantId = session.metadata.tenant_id;
      const credits = parseInt(session.metadata.credits);

      // Update Transaction
      await fastify.db.query(
        'UPDATE billing_transactions SET status = $1, completed_at = now() WHERE stripe_session_id = $2',
        ['completed', session.id]
      );

      // Add Credits to Usage Counters
      // Find current billing period for tenant
      await fastify.db.query(
        'UPDATE usage_counters SET browser_credits_remaining = browser_credits_remaining + $1 WHERE tenant_id = $2 AND billing_period_start = (SELECT MAX(billing_period_start) FROM usage_counters WHERE tenant_id = $2)',
        [credits, tenantId]
      );

      fastify.log.info(`[Billing] Added ${credits} credits to tenant ${tenantId}`);
    }

    return { received: true };
  });
}
