export const producer = {
    async sendToHttpQueue(payload, priority = false) { return Promise.resolve(); },
    async sendToBrowserQueue(payload, priority = false) { return Promise.resolve(); },
    async sendToWebhookQueue(payload) { return Promise.resolve(); },
    async sendToExportQueue(payload) { return Promise.resolve(); }
};
//# sourceMappingURL=producer.js.map