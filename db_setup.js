import { query } from './apps/api/src/calls-module/db/index.js';

async function setup() {
  await query(`
    CREATE TABLE IF NOT EXISTS contact_emails_history (
      id SERIAL PRIMARY KEY,
      contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
      subject TEXT,
      body TEXT,
      from_email TEXT,
      sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);
  console.log('Table created!');
  process.exit(0);
}

setup();
