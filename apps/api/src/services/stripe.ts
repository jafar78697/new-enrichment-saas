import Stripe from 'stripe';

export class StripeService {
  private stripe: Stripe;

  constructor(apiKey: string) {
    this.stripe = new Stripe(apiKey, {
      apiVersion: '2023-10-16' as any
    });
  }

  async createCheckoutSession(params: {
    tenantId: string;
    customerEmail: string;
    amount: number;
    credits: number;
    successUrl: string;
    cancelUrl: string;
  }) {
    return this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${params.credits} Enrichment Credits`,
              description: 'Credits for Browser-based enrichment tasks'
            },
            unit_amount: params.amount
          },
          quantity: 1
        }
      ],
      mode: 'payment',
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      customer_email: params.customerEmail,
      metadata: {
        tenant_id: params.tenantId,
        credits: params.credits.toString()
      }
    });
  }

  constructEvent(payload: string, signature: string, secret: string) {
    return this.stripe.webhooks.constructEvent(payload, signature, secret);
  }
}
