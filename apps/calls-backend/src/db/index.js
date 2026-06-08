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

  const seedPath = path.resolve(__dirname, '../../database/seed.sql');
  const seedSql = await fsp.readFile(seedPath, 'utf8');
  db.exec(seedSql);
}

export async function initializeDatabase() {
  if (initialized) {
    return;
  }

  const schemaPath = path.resolve(__dirname, '../../database/schema.sql');
  const schemaSql = await fsp.readFile(schemaPath, 'utf8');
  db.exec(schemaSql);
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
