import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { createPool } from '@enrichment-saas/db';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
dotenv.config({ path: path.resolve(__dirname, '../../../.env.production') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const sqlitePath = path.resolve(process.cwd(), process.env.DATABASE_PATH || './storage/cold-calling.sqlite');

async function migrate() {
  if (!fs.existsSync(sqlitePath)) {
    console.log('No SQLite database found to migrate. Fresh install.');
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

    // 1. Run schema script to create tables
    const schemaSql = fs.readFileSync(path.resolve(__dirname, '../../../database/calls-schema-pg.sql'), 'utf8');
    await pgPool.query(schemaSql);
    console.log('PostgreSQL schema created.');

    const tables = [
      'teams',
      'agents',
      'niches',
      'contacts',
      'calls',
      'employee_niches',
      'meta_connections'
    ];

    // Truncate tables before inserting to avoid duplicates if run multiple times
    for (const table of [...tables].reverse()) {
      await pgPool.query(`TRUNCATE TABLE ${table} CASCADE;`);
    }
    console.log('Cleared existing PostgreSQL tables.');

    // 2. Copy data
    for (const table of tables) {
      console.log(`Migrating table: ${table}...`);
      
      // Check if table exists in SQLite
      const tableExists = sqliteDb.prepare(`SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name=?`).get(table);
      if (tableExists.count === 0) {
        console.log(`Table ${table} does not exist in SQLite, skipping.`);
        continue;
      }

      const rows = sqliteDb.prepare(`SELECT * FROM ${table}`).all();
      if (rows.length === 0) {
        console.log(`Table ${table} is empty.`);
        continue;
      }

      const columns = Object.keys(rows[0]);
      
      // Build parameterized insert query for Postgres
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
      const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;

      for (const row of rows) {
        const values = columns.map(col => {
          let val = row[col];
          // SQLite uses 1/0 for booleans, Postgres prefers true/false (though 1/0 works often, better to cast or let node-postgres handle it).
          // But actually SQLite stores boolean as 1/0, and Postgres expects boolean for 'is_available'.
          if (table === 'agents' && col === 'is_available') return val === 1;
          if (table === 'calls' && col === 'recording_enabled') return val === 1;
          return val;
        });
        await pgPool.query(query, values);
      }

      console.log(`Migrated ${rows.length} rows to ${table}.`);

      // Update the sequence for the id column
      await pgPool.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), true);`);
    }

    console.log('Migration completed successfully!');

  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    sqliteDb.close();
    await pgPool.end();
  }
}

migrate();
