// SQL is planned, never executed. No calls, contact edits, or provider requests.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import pg from 'pg';
import { acquireOutboundLock } from '../src/utils/outbound-lock.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const id = '00000000-0000-0000-0000-000000000001';
const sources = ['../src/voice-agent/orchestrator/deepgram-signalwire-bridge.js', '../src/workers/outbound-caller.js', '../src/routes/crm.ts'];
let checked = 0;
try {
  for (const filename of sources) {
    const file = ts.createSourceFile(filename, await readFile(new URL(filename, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
    const queries = [];
    function visit(node) {
      if (ts.isNoSubstitutionTemplateLiteral(node)) {
        const sql = node.text;
        if (sql.includes('WITH session AS')) queries.push([sql, ['do_not_call', 'Smoke test note', id, true]]);
        else if (sql.includes('FROM ai_call_sessions s') && sql.includes('s.outcome')) queries.push([sql, [id, 3]]);
        else if (sql.includes('AS preview_cost')) queries.push([sql, [id, 10, 1]]);
        else if (sql.includes("AT TIME ZONE 'UTC' AT TIME ZONE $2") && sql.includes('AS cost')) queries.push([sql, [id, 'America/New_York']]);
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
    for (const [sql, args] of queries) {
      await pool.query(`EXPLAIN ${sql}`, args);
      checked++;
    }
  }
  assert.ok(checked >= 7, `Expected all lifecycle and budget queries, got ${checked}`);
  const release = await acquireOutboundLock(pool, id);
  assert.ok(release);
  try { assert.equal(await acquireOutboundLock(pool, id), null); }
  finally { await release(); }
  const reacquired = await acquireOutboundLock(pool, id);
  assert.ok(reacquired);
  await reacquired();
  console.log(JSON.stringify({ ok: true, plannedQueries: checked, crossConnectionLock: 'passed' }));
} finally {
  await pool.end();
}
