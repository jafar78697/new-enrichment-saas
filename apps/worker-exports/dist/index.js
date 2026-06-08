"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const queue_1 = require("@enrichment-saas/queue");
const db_1 = require("@enrichment-saas/db");
const client_s3_1 = require("@aws-sdk/client-s3");
const sync_1 = require("csv-stringify/sync");
dotenv_1.default.config();
const s3 = new client_s3_1.S3Client({});
const pool = (0, db_1.createPool)({
    connectionString: process.env.DATABASE_URL
});
async function processMessage(msg) {
    try {
        const payload = JSON.parse(msg.Body);
        // 1. Fetch results from DB
        const { rows } = await pool.query('SELECT * FROM enrichment_results WHERE job_id = (SELECT job_id FROM enrichment_job_items WHERE job_id = $1) AND tenant_id = $2', [payload.job_id, payload.tenant_id]);
        if (rows.length === 0) {
            console.warn(`[Export] No results found for job ${payload.job_id}`);
            await queue_1.consumer.deleteMessage(queue_1.ENR_EXPORT_QUEUE, msg.ReceiptHandle);
            return;
        }
        // 2. Format Data
        let fileContent;
        let contentType;
        let fileExtension;
        if (payload.format === 'csv') {
            fileContent = (0, sync_1.stringify)(rows, { header: true });
            contentType = 'text/csv';
            fileExtension = 'csv';
        }
        else {
            fileContent = JSON.stringify(rows, null, 2);
            contentType = 'application/json';
            fileExtension = 'json';
        }
        // 3. Upload to S3
        const s3Key = `exports/${payload.tenant_id}/${payload.job_id}_${Date.now()}.${fileExtension}`;
        await s3.send(new client_s3_1.PutObjectCommand({
            Bucket: process.env.EXPORTS_S3_BUCKET,
            Key: s3Key,
            Body: fileContent,
            ContentType: contentType
        }));
        // 4. Update Export Record
        await pool.query('UPDATE exports SET status = $1, s3_key = $2, created_at = now() WHERE id = $3', ['completed', s3Key, payload.export_id]);
        await queue_1.consumer.deleteMessage(queue_1.ENR_EXPORT_QUEUE, msg.ReceiptHandle);
        console.log(`[Export] Successfully exported job ${payload.job_id} to S3`);
    }
    catch (err) {
        console.error('[Export] Worker error', err);
    }
}
async function start() {
    console.log('🚀 Export Worker started...');
    while (true) {
        const messages = await queue_1.consumer.receiveMessages(queue_1.ENR_EXPORT_QUEUE);
        for (const msg of messages) {
            await processMessage(msg);
        }
    }
}
start().catch(console.error);
//# sourceMappingURL=index.js.map