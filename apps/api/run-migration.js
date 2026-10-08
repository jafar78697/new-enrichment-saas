import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';
import { runMigrations } from './scripts/migration-runner.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(directory, '.env') });
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await runMigrations(client, path.join(directory, 'src/db/migrations'), {
    baselineThrough: process.env.MIGRATION_BASELINE_THROUGH || null,
    acknowledgeLegacyData: process.env.MIGRATION_ACKNOWLEDGE_LEGACY_DATA === 'true',
  });
  console.log('Migrations completed.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { await client.end(); }
