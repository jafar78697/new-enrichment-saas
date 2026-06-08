/**
 * Extends the billing webhook to track affiliate conversions.
 * Call processAffiliateConversion() from the LemonSqueezy webhook handler
 * after a successful order_created or subscription_created event.
 */
import { FastifyInstance } from 'fastify';
export declare function processAffiliateConversion(fastify: FastifyInstance, opts: {
    stripeEventId: string;
    promoCode?: string;
    saleAmount: number;
    planType: string;
    tenantId: string;
}): Promise<void>;
export declare function reverseAffiliateCommission(fastify: FastifyInstance, stripeEventId: string): Promise<void>;
//# sourceMappingURL=affiliate-webhooks.d.ts.map