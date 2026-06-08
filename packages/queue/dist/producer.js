import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { ENR_HTTP_QUEUE, ENR_BROWSER_QUEUE, ENR_WEBHOOK_QUEUE, ENR_EXPORT_QUEUE, ENR_HTTP_QUEUE_PRIORITY, ENR_BROWSER_QUEUE_PRIORITY } from './names.js';
const sqs = new SQSClient({});
export async function sendToQueue(queueUrl, payload, delaySeconds) {
    const command = new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(payload),
        DelaySeconds: delaySeconds || 0
    });
    return sqs.send(command);
}
export const producer = {
    sendToHttpQueue: (payload, priority = false) => sendToQueue(priority ? ENR_HTTP_QUEUE_PRIORITY : ENR_HTTP_QUEUE, payload),
    sendToBrowserQueue: (payload, priority = false) => sendToQueue(priority ? ENR_BROWSER_QUEUE_PRIORITY : ENR_BROWSER_QUEUE, payload),
    sendToWebhookQueue: (payload) => sendToQueue(ENR_WEBHOOK_QUEUE, payload),
    sendToExportQueue: (payload) => sendToQueue(ENR_EXPORT_QUEUE, payload)
};
//# sourceMappingURL=producer.js.map