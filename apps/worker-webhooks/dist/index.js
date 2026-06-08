"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const queue_1 = require("@enrichment-saas/queue");
const webhook_service_1 = require("./services/webhook-service");
const db_1 = require("@enrichment-saas/db");
dotenv_1.default.config();
const webhookService = new webhook_service_1.WebhookService();
const pool = (0, db_1.createPool)({
    connectionString: process.env.DATABASE_URL
});
async function processMessage(msg) {
    try {
        const payload = JSON.parse(msg.Body);
        // 1. Get endpoint details from DB
        const { rows } = await pool.query('SELECT url, secret FROM webhook_endpoints WHERE id = $1 AND tenant_id = $2 AND active = true', [payload.endpoint_id, payload.tenant_id]);
        if (rows.length === 0) {
            console.warn(`[Webhook] Endpoint ${payload.endpoint_id} not found or inactive`);
            await queue_1.consumer.deleteMessage(queue_1.ENR_WEBHOOK_QUEUE, msg.ReceiptHandle);
            return;
        }
        const { url, secret } = rows[0];
        // 2. Deliver Webhook
        const success = await webhookService.deliver(url, secret, payload.event, payload.payload);
        if (success) {
            // Update delivery record
            await pool.query('UPDATE webhook_deliveries SET status = $1, delivered_at = now() WHERE id = $2', ['delivered', payload.delivery_id]);
            await queue_1.consumer.deleteMessage(queue_1.ENR_WEBHOOK_QUEUE, msg.ReceiptHandle);
        }
        else {
            // Optional: Retry with backoff or let SQS visibility timeout handle it
            // For now, let it return so SQS re-queues after visibility timeout
            console.error(`[Webhook] Delivery failed for delivery_id: ${payload.delivery_id}`);
        }
    }
    catch (err) {
        console.error('[Webhook] Worker error', err);
    }
}
async function start() {
    console.log('🚀 Webhook Worker started...');
    while (true) {
        const messages = await queue_1.consumer.receiveMessages(queue_1.ENR_WEBHOOK_QUEUE);
        for (const msg of messages) {
            await processMessage(msg);
        }
    }
}
start().catch(console.error);
//# sourceMappingURL=index.js.map