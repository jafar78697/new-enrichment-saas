export declare class StripeService {
    private stripe;
    constructor(apiKey: string);
    createCheckoutSession(params: {
        tenantId: string;
        customerEmail: string;
        amount: number;
        credits: number;
        successUrl: string;
        cancelUrl: string;
    }): Promise<any>;
    constructEvent(payload: string, signature: string, secret: string): any;
}
//# sourceMappingURL=stripe.d.ts.map