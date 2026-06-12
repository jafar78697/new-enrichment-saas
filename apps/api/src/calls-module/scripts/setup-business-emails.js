import { query } from '../db/index.js';

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
