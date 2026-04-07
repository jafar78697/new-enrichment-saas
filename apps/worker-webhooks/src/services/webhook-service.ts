import axios from 'axios';
import crypto from 'crypto';

export class WebhookService {
  constructor() {}

  async deliver(url: string, secret: string, event: string, payload: any): Promise<boolean> {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = this.sign(secret, timestamp, payload);

      await axios.post(url, payload, {
        headers: {
          'X-Enrichment-Event': event,
          'X-Enrichment-Timestamp': timestamp.toString(),
          'X-Enrichment-Signature': signature
        },
        timeout: 10000 // 10s timeout
      });
      return true;
    } catch (err) {
      console.error(`[Webhook] Delivery failed to ${url}`, err);
      return false;
    }
  }

  private sign(secret: string, timestamp: number, payload: any): string {
    const rawBody = JSON.stringify(payload);
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${timestamp}.${rawBody}`);
    return hmac.digest('hex');
  }
}
