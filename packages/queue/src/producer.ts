import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { HttpJobPayload, BrowserJobPayload, WebhookJobPayload, ExportJobPayload } from '@enrichment-saas/contracts';
import { ENR_HTTP_QUEUE, ENR_BROWSER_QUEUE, ENR_WEBHOOK_QUEUE, ENR_EXPORT_QUEUE } from './names';

const sqs = new SQSClient({});

export async function sendToQueue<T>(queueUrl: string, payload: T, delaySeconds?: number) {
  const command = new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(payload),
    DelaySeconds: delaySeconds || 0
  });
  return sqs.send(command);
}

export const producer = {
  sendToHttpQueue: (payload: HttpJobPayload) => sendToQueue(ENR_HTTP_QUEUE, payload),
  sendToBrowserQueue: (payload: BrowserJobPayload) => sendToQueue(ENR_BROWSER_QUEUE, payload),
  sendToWebhookQueue: (payload: WebhookJobPayload) => sendToQueue(ENR_WEBHOOK_QUEUE, payload),
  sendToExportQueue: (payload: ExportJobPayload) => sendToQueue(ENR_EXPORT_QUEUE, payload)
};
