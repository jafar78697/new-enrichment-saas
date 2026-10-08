import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Older files contain transaction wrappers. The runner owns the transaction;
// remove only standalone transaction lines, leaving PL/pgSQL BEGIN blocks intact.
function migrationBody(sql) {
  return sql.replace(/^\s*(?:BEGIN|COMMIT)\s*;\s*$/gm, '');
}

export async function verifyBaseline(client, migrations) {
  const tables = new Map();
  const indexes = new Set();
  const constraints = new Map();
  for (const { sql } of migrations) {
    const clean = sql.replace(/--[^\n]*/g, '');
    for (const match of clean.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([\s\S]*?)\);/gi)) {
      const columns = tables.get(match[1]) || new Set();
      for (const line of match[2].split('\n')) {
        const column = line.trim().match(/^(\w+)\s+(?:UUID|TEXT|VARCHAR|INT|INTEGER|SMALLINT|BIGINT|SERIAL|BOOLEAN|JSONB?|TIMESTAMP|TIMESTAMPTZ|DATE|NUMERIC|DECIMAL|REAL|DOUBLE)/i);
        if (column) columns.add(column[1]);
      }
      tables.set(match[1], columns);
    }
    for (const match of clean.matchAll(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(\w+)\s+([\s\S]*?);/gi)) {
      const columns = tables.get(match[1]) || new Set();
      for (const col of match[2].matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi)) columns.add(col[1]);
      for (const col of match[2].matchAll(/DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?(\w+)/gi)) columns.delete(col[1]);
      if (columns.size) tables.set(match[1], columns);
      for (const c of match[2].matchAll(/ADD\s+CONSTRAINT\s+(\w+)/gi)) constraints.set(c[1], match[1]);
      for (const c of match[2].matchAll(/DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?(\w+)/gi)) constraints.delete(c[1]);
    }
    for (const match of clean.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi)) indexes.add(match[1]);
    for (const match of clean.matchAll(/DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?(\w+)/gi)) indexes.delete(match[1]);
  }
  if (!tables.size) throw new Error('No schema assertions available for this baseline.');
  const missing = [];
  for (const [table, columns] of tables) {
    const result = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`, [table]);
    const existing = new Set(result.rows.map(r => r.column_name));
    if (!existing.size) missing.push(table);
    else for (const col of columns) if (!existing.has(col)) missing.push(`${table}.${col}`);
  }
  for (const index of indexes) {
    if (!(await client.query('SELECT to_regclass($1) AS object', [`public.${index}`])).rows[0].object) missing.push(`index ${index}`);
  }
  for (const [constraint, table] of constraints) {
    if (!(await client.query(`SELECT 1 FROM pg_constraint WHERE conname = $1 AND conrelid = to_regclass($2)`, [constraint, `public.${table}`])).rowCount) missing.push(`constraint ${table}.${constraint}`);
  }
  if (missing.length) throw new Error(`Legacy baseline is incomplete. Repair missing schema first: ${missing.join(', ')}`);
}

export async function runMigrations(client, directory, { baselineThrough = null, acknowledgeLegacyData = false } = {}) {
  await client.query('SELECT pg_advisory_lock(714032035)');
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS migration_ledger (
      id SERIAL PRIMARY KEY, filename TEXT NOT NULL UNIQUE, applied_at TIMESTAMP DEFAULT NOW(), checksum TEXT
    )`);
    await client.query('ALTER TABLE migration_ledger ADD COLUMN IF NOT EXISTS checksum TEXT');
    const files = (await fs.readdir(directory)).filter(f => /^\d+.*\.sql$/.test(f)).sort();
    const migrations = await Promise.all(files.map(async filename => {
      const sql = await fs.readFile(path.join(directory, filename), 'utf8');
      return { filename, sql, checksum: crypto.createHash('sha256').update(sql).digest('hex') };
    }));
    if (!baselineThrough && !(await client.query('SELECT 1 FROM migration_ledger LIMIT 1')).rowCount) {
      const existing = (await client.query("SELECT to_regclass('public.ai_calling_lanes') AS lanes")).rows[0];
      if (existing?.lanes) throw new Error('Existing calling database has no migration ledger. Verify and explicitly adopt its baseline before applying new migrations.');
    }
    if (baselineThrough) {
      if (!acknowledgeLegacyData) throw new Error('Baseline adoption requires explicit acknowledgement of legacy data migrations.');
      const baseline = migrations.filter(m => m.filename.slice(0, 3) <= String(baselineThrough).slice(0, 3));
      if (!baseline.some(m => m.filename.startsWith(String(baselineThrough).slice(0, 3)))) throw new Error('Unknown baseline migration.');
      await verifyBaseline(client, baseline);
      await client.query('BEGIN');
      try {
        for (const m of baseline) await client.query(`INSERT INTO migration_ledger(filename, checksum) VALUES ($1, $2)
          ON CONFLICT (filename) DO NOTHING`, [m.filename, m.checksum]);
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; }
      console.log(`Verified schema baseline adopted through ${baselineThrough}. Legacy data effects were acknowledged by operator.`);
    }
    for (const m of migrations) {
      const applied = (await client.query('SELECT checksum FROM migration_ledger WHERE filename = $1', [m.filename])).rows[0];
      if (applied) {
        if (applied.checksum && applied.checksum !== m.checksum) throw new Error(`Applied migration changed: ${m.filename}. Add a new migration instead.`);
        console.log(`[skip] ${m.filename}`);
        continue;
      }
      console.log(`Applying ${m.filename}`);
      await client.query('BEGIN');
      try {
        await client.query(migrationBody(m.sql));
        await client.query('INSERT INTO migration_ledger(filename, checksum) VALUES ($1, $2)', [m.filename, m.checksum]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${m.filename} failed: ${e.message}. Existing untracked schemas need an explicitly verified baseline, not duplicate-error skipping.`);
      }
    }
  } finally { await client.query('SELECT pg_advisory_unlock(714032035)'); }
}
