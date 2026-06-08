export const producer = {
  async sendToHttpQueue(payload: any, priority = false) { return Promise.resolve(); },
  async sendToBrowserQueue(payload: any, priority = false) { return Promise.resolve(); },
  async sendToWebhookQueue(payload: any) { return Promise.resolve(); },
  async sendToExportQueue(payload: any) { return Promise.resolve(); }
};
