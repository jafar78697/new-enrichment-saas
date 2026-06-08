import { createPool } from '@enrichment-saas/db';

let pool;

export function getPool() {
  if (!pool) {
    pool = createPool({
      connectionString: process.env.DATABASE_URL
    });
  }
  return pool;
}

export async function query(text, params = []) {
  const p = getPool();
  
  // Quick hack to convert SQLite ? parameters to PostgreSQL $1, $2 parameters safely enough
  // Note: For string literals containing ?, it's safer to use $1 directly in the query.
  // But since we are refactoring, we'll ensure our queries use $1, $2 natively.
  
  const result = await p.query(text, params);
  
  return {
    rows: result.rows,
    rowCount: result.rowCount,
    // Provide a mocked lastInsertRowid if the query was an INSERT ... RETURNING *
    lastInsertRowid: (result.rows && result.rows.length > 0 && result.rows[0].id) ? result.rows[0].id : null
  };
}

export async function initializeDatabase() {
  // Database schema is managed via the pg migration script
  return Promise.resolve();
}

// Keep a dummy db export for compatibility with any missed requires, though it will crash if used synchronously.
export const db = {
  prepare: () => { throw new Error('Synchronous db.prepare is no longer supported. Use await query().'); },
  exec: () => { throw new Error('Synchronous db.exec is no longer supported.'); }
};
