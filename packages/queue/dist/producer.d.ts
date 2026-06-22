export declare const producer: {
    sendToHttpQueue(payload: any, priority?: boolean): Promise<void>;
    sendToBrowserQueue(payload: any, priority?: boolean): Promise<void>;
    sendToWebhookQueue(payload: any): Promise<void>;
    sendToExportQueue(payload: any): Promise<void>;
};
//# sourceMappingURL=producer.d.ts.map