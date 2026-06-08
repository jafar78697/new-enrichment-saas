export declare class WebhookService {
    constructor();
    deliver(url: string, secret: string, event: string, payload: any): Promise<boolean>;
    private sign;
}
//# sourceMappingURL=webhook-service.d.ts.map