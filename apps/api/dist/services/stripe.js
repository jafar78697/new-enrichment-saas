"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StripeService = void 0;
const stripe_1 = __importDefault(require("stripe"));
class StripeService {
    stripe;
    constructor(apiKey) {
        this.stripe = new stripe_1.default(apiKey, {
            apiVersion: '2023-10-16'
        });
    }
    async createCheckoutSession(params) {
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
    constructEvent(payload, signature, secret) {
        return this.stripe.webhooks.constructEvent(payload, signature, secret);
    }
}
exports.StripeService = StripeService;
//# sourceMappingURL=stripe.js.map