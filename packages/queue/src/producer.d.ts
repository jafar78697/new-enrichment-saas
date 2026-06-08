import { HttpJobPayload, BrowserJobPayload, WebhookJobPayload, ExportJobPayload } from '@enrichment-saas/contracts';
export declare function sendToQueue<T>(queueUrl: string, payload: T, delaySeconds?: number): Promise<import("@aws-sdk/client-sqs").SendMessageCommandOutput>;
export declare const producer: {
    sendToHttpQueue: (payload: HttpJobPayload, priority?: boolean) => Promise<import("@aws-sdk/client-sqs").SendMessageCommandOutput>;
    sendToBrowserQueue: (payload: BrowserJobPayload, priority?: boolean) => Promise<import("@aws-sdk/client-sqs").SendMessageCommandOutput>;
    sendToWebhookQueue: (payload: WebhookJobPayload) => Promise<import("@aws-sdk/client-sqs").SendMessageCommandOutput>;
    sendToExportQueue: (payload: ExportJobPayload) => Promise<import("@aws-sdk/client-sqs").SendMessageCommandOutput>;
};
//# sourceMappingURL=producer.d.ts.map