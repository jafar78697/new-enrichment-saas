import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireOutboundLock } from '../src/utils/outbound-lock.js';

test('a busy campaign does not dial and returns its connection', async () => {
  let releases = 0;
  const pool = { connect: async () => ({ query: async () => ({ rows: [{ locked: false }] }), release: () => releases++ }) };
  assert.equal(await acquireOutboundLock(pool, 'tenant'), null);
  assert.equal(releases, 1);
});

test('a campaign reservation unlocks exactly once even after repeated cleanup', async () => {
  let releases = 0, unlocks = 0;
  const pool = { connect: async () => ({ query: async sql => { if (sql.includes('pg_advisory_unlock')) unlocks++; return { rows: [{ locked: true }] }; }, release: () => releases++ }) };
  const release = await acquireOutboundLock(pool, 'tenant');
  await release(); await release();
  assert.equal(releases, 1); assert.equal(unlocks, 1);
});
