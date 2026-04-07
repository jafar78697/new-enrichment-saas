import dotenv from 'dotenv';
import { consumer, ENR_EXPORT_QUEUE } from '@enrichment-saas/queue';
import { ExportJobPayload } from '@enrichment-saas/contracts';
import { createPool } from '@enrichment-saas/db';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { stringify } from 'csv-stringify/sync';

dotenv.config();

const s3 = new S3Client({});
const pool = createPool({
  connectionString: process.env.DATABASE_URL
});

async function processMessage(msg: any) {
  try {
    const payload = JSON.parse(msg.Body) as ExportJobPayload;
    
    // 1. Fetch results from DB
    const { rows } = await pool.query(
      'SELECT * FROM enrichment_results WHERE job_id = (SELECT job_id FROM enrichment_job_items WHERE job_id = $1) AND tenant_id = $2',
      [payload.job_id, payload.tenant_id]
    );

    if (rows.length === 0) {
      console.warn(`[Export] No results found for job ${payload.job_id}`);
      await consumer.deleteMessage(ENR_EXPORT_QUEUE, msg.ReceiptHandle);
      return;
    }

    // 2. Format Data
    let fileContent: string;
    let contentType: string;
    let fileExtension: string;

    if (payload.format === 'csv') {
      fileContent = stringify(rows, { header: true });
      contentType = 'text/csv';
      fileExtension = 'csv';
    } else {
      fileContent = JSON.stringify(rows, null, 2);
      contentType = 'application/json';
      fileExtension = 'json';
    }

    // 3. Upload to S3
    const s3Key = `exports/${payload.tenant_id}/${payload.job_id}_${Date.now()}.${fileExtension}`;
    await s3.send(new PutObjectCommand({
      Bucket: process.env.EXPORTS_S3_BUCKET,
      Key: s3Key,
      Body: fileContent,
      ContentType: contentType
    }));

    // 4. Update Export Record
    await pool.query(
      'UPDATE exports SET status = $1, s3_key = $2, created_at = now() WHERE id = $3',
      ['completed', s3Key, payload.export_id]
    );

    await consumer.deleteMessage(ENR_EXPORT_QUEUE, msg.ReceiptHandle);
    console.log(`[Export] Successfully exported job ${payload.job_id} to S3`);

  } catch (err) {
    console.error('[Export] Worker error', err);
  }
}

async function start() {
  console.log('🚀 Export Worker started...');
  while (true) {
    const messages = await consumer.receiveMessages(ENR_EXPORT_QUEUE);
    for (const msg of messages) {
      await processMessage(msg);
    }
  }
}

start().catch(console.error);
