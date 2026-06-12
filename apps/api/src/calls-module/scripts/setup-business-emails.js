import { query } from '../db/index.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env.production') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function setup() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS business_emails (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        gmail_account_id INTEGER REFERENCES email_accounts(id) ON DELETE CASCADE,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log("business_emails table created successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Error creating table:", err);
    process.exit(1);
  }
}

setup();
