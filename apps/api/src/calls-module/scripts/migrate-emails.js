import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { createPool } from '@enrichment-saas/db';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env.production') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Since the old SQLite database will be copied to the VM
const sqlitePath = '/home/ubuntu/enrichment-saas/mailer.db';

async function migrateEmails() {
  if (!fs.existsSync(sqlitePath)) {
    console.log('No old SQLite database found at ' + sqlitePath);
    return;
  }

  const sqliteDb = new Database(sqlitePath);
  const pgPool = createPool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('Connecting to PostgreSQL...');
    await pgPool.query('SELECT 1');
    console.log('PostgreSQL connected.');

    const gmailRows = sqliteDb.prepare(`SELECT * FROM gmail_accounts`).all();
    console.log(`Found ${gmailRows.length} gmail_accounts in SQLite.`);
    
    const defaultUserId = null;
    
    // Map old sqlite id to new pg id
    const idMap = {};

    for (const row of gmailRows) {
      // Check if email already exists
      const exists = await pgPool.query('SELECT id FROM email_accounts WHERE email = $1', [row.email]);
      let pgId;
      if (exists.rowCount === 0) {
        // Find max id + 1 to avoid sequence conflicts later
        const res = await pgPool.query(`
          INSERT INTO email_accounts (email, app_password, user_id, daily_limit, sent_today, status, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
        `, [
          row.email, 
          row.app_password, 
          defaultUserId, 
          row.daily_limit || 25, 
          row.sent_today || 0, 
          row.active === 1 ? 'active' : 'paused', 
          row.created_at || new Date().toISOString()
        ]);
        pgId = res.rows[0].id;
      } else {
        pgId = exists.rows[0].id;
      }
      idMap[row.id] = pgId;
    }
    
    console.log(`Migrated gmail_accounts.`);

    // Now migrate business_emails
    const bizRows = sqliteDb.prepare(`SELECT * FROM business_emails`).all();
    console.log(`Found ${bizRows.length} business_emails in SQLite.`);
    
    for (const row of bizRows) {
      const exists = await pgPool.query('SELECT id FROM business_emails WHERE email = $1', [row.email]);
      if (exists.rowCount === 0) {
        const mappedPgId = idMap[row.gmail_id];
        if (mappedPgId) {
          await pgPool.query(`
            INSERT INTO business_emails (email, gmail_account_id, active, created_at)
            VALUES ($1, $2, $3, $4)
          `, [
            row.email,
            mappedPgId,
            row.active === 1,
            row.created_at || new Date().toISOString()
          ]);
        }
      }
    }
    
    console.log(`Migrated business_emails.`);

  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    sqliteDb.close();
    await pgPool.end();
  }
}

migrateEmails();
