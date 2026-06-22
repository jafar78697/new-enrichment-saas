import { query } from '../db/index.js';
import dotenv from 'dotenv';
import path from 'path';

// Load env variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

async function run() {
  console.log('Adding custom_prompt column to niches table...');
  try {
    await query('ALTER TABLE niches ADD COLUMN IF NOT EXISTS custom_prompt TEXT;');
    console.log('Successfully added custom_prompt column!');
    process.exit(0);
  } catch (err) {
    console.error('Failed to add custom_prompt column:', err);
    process.exit(1);
  }
}

run();
