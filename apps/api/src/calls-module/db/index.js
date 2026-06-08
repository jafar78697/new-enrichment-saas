import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { env } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const databasePath = path.resolve(process.cwd(), env.DATABASE_PATH);

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

export const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

let initialized = false;

function normalizeSql(text) {
  const orderedParams = [];
  const normalizedSql = text.replace(/\$(\d+)/g, (_, index) => {
    orderedParams.push(Number(index) - 1);
    return '?';
  });

  return { normalizedSql, orderedParams };
}

function runStatement(sql, params) {
  const { normalizedSql, orderedParams } = normalizeSql(sql);
  const statement = db.prepare(normalizedSql);
  const boundParams = orderedParams.map((index) => serializeValue(params[index]));
  const isReadQuery =
    /^\s*(select|with|pragma)/i.test(sql) || /\breturning\b/i.test(sql);

  if (isReadQuery) {
    const rows = statement.all(boundParams);
    return {
      rows,
      rowCount: rows.length
    };
  }

  const result = statement.run(boundParams);
  return {
    rows: [],
    rowCount: result.changes,
    lastInsertRowid: result.lastInsertRowid
  };
}

async function seedIfEmpty() {
  const agentsCount = db.prepare('SELECT COUNT(*) AS count FROM agents').get().count;
  if (agentsCount > 0) {
    return;
  }

  const seedPath = path.resolve(__dirname, '../../../database/seed.sql');
  const seedSql = await fsp.readFile(seedPath, 'utf8');
  db.exec(seedSql);
}

function columnExists(tableName, columnName) {
  return db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .some((column) => column.name === columnName);
}

function migrateExistingDatabase() {
  // Create niches table first (before adding niche_id to contacts)
  db.exec(`CREATE TABLE IF NOT EXISTS niches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    assigned_agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  
  if (!columnExists('contacts', 'assigned_agent_id')) {
    db.exec('ALTER TABLE contacts ADD COLUMN assigned_agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL');
  }
  if (!columnExists('contacts', 'source')) {
    db.exec('ALTER TABLE contacts ADD COLUMN source TEXT');
  }
  if (!columnExists('contacts', 'niche_id')) {
    db.exec('ALTER TABLE contacts ADD COLUMN niche_id INTEGER REFERENCES niches(id) ON DELETE SET NULL');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_contacts_assigned_agent_id ON contacts(assigned_agent_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_contacts_niche_id ON contacts(niche_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_niches_assigned_agent_id ON niches(assigned_agent_id)');
  
  // Create employee_niches table for many-to-many relationship
  db.exec(`CREATE TABLE IF NOT EXISTS employee_niches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    niche_id INTEGER NOT NULL REFERENCES niches(id) ON DELETE CASCADE,
    assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(agent_id, niche_id)
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_employee_niches_agent ON employee_niches(agent_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_employee_niches_niche ON employee_niches(niche_id)');
}

export async function initializeDatabase() {
  if (initialized) {
    return;
  }

  const schemaPath = path.resolve(__dirname, '../../../database/schema.sql');
  const schemaSql = await fsp.readFile(schemaPath, 'utf8');
  db.exec(schemaSql);
  migrateExistingDatabase();
  await seedIfEmpty();
  initialized = true;
}

export async function query(text, params = []) {
  return runStatement(text, params);
}

function serializeValue(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  if (value === undefined) {
    return null;
  }

  return value;
}
