import dotenv from 'dotenv';
import { consumer, ENR_WEBHOOK_QUEUE } from '@enrichment-saas/queue';
import { WebhookJobPayload } from '@enrichment-saas/contracts';
import { WebhookService } from './services/webhook-service';
import { createPool } from '@enrichment-saas/db';

dotenv.config();

const webhookService = new WebhookService();
const pool = createPool({
  connectionString: process.env.DATABASE_URL
});

async function processMessage(msg: any) {
  try {
    const payload = JSON.parse(msg.Body) as WebhookJobPayload;
    
    // 1. Get endpoint details from DB
    const { rows } = await pool.query(
      'SELECT url, secret FROM webhook_endpoints WHERE id = $1 AND tenant_id = $2 AND active = true',
      [payload.endpoint_id, payload.tenant_id]
    );

    if (rows.length === 0) {
      console.warn(`[Webhook] Endpoint ${payload.endpoint_id} not found or inactive`);
      await consumer.deleteMessage(ENR_WEBHOOK_QUEUE, msg.ReceiptHandle);
      return;
    }

    const { url, secret } = rows[0];

    // 2. Deliver Webhook
    const success = await webhookService.deliver(url, secret, payload.event, payload.payload);

    if (success) {
      // Update delivery record
      await pool.query(
        'UPDATE webhook_deliveries SET status = $1, delivered_at = now() WHERE id = $2',
        ['delivered', payload.delivery_id]
      );
      await consumer.deleteMessage(ENR_WEBHOOK_QUEUE, msg.ReceiptHandle);
    } else {
       // Optional: Retry with backoff or let SQS visibility timeout handle it
       // For now, let it return so SQS re-queues after visibility timeout
       console.error(`[Webhook] Delivery failed for delivery_id: ${payload.delivery_id}`);
    }

  } catch (err) {
    console.error('[Webhook] Worker error', err);
  }
}

async function start() {
  console.log('🚀 Webhook Worker started...');
  while (true) {
    const messages = await consumer.receiveMessages(ENR_WEBHOOK_QUEUE);
    for (const msg of messages) {
      await processMessage(msg);
    }
  }
}

start().catch(console.error);
