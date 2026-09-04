import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createPool } from '@enrichment-saas/db';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(scriptDir, '../src/db/migrations/011_deepgram_ai_agents.sql');

if (process.env.CONFIRM_DEEPGRAM_AGENT_MIGRATION !== 'true') {
  console.error('Refusing to modify the database. Set CONFIRM_DEEPGRAM_AGENT_MIGRATION=true after verifying DATABASE_URL.');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required. No database changes were made.');
  process.exit(1);
}

const pool = createPool({ connectionString: process.env.DATABASE_URL });
let client;

try {
  const migrationSql = await readFile(migrationPath, 'utf8');
  client = await pool.connect();
  await client.query('BEGIN');
  await client.query(migrationSql);
  await client.query('COMMIT');
  console.log('Deepgram AI-agent migration applied successfully.');
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  console.error('Deepgram AI-agent migration failed:', error.message);
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end().catch(() => undefined);
}
