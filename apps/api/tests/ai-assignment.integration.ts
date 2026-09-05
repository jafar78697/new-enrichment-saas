// Run from apps/api with tsx. All writes use temporary tables and are rolled back.
import 'dotenv/config';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import pg from 'pg';
import crmRoutes from '../src/routes/crm';

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const app = Fastify();
  const tenantId = '10000000-0000-4000-8000-000000000001';
  const agentId = '10000000-0000-4000-8000-000000000002';
  process.env.AI_OUTBOUND_ENABLED = 'true';
  try {
    await client.query('BEGIN');
    const tables = ['contacts', 'niches', 'enrichment_results', 'enrichment_jobs', 'enrichment_job_items', 'ai_agent_configs', 'ai_calling_controls', 'ai_call_sessions', 'ai_usage_ledger', 'audit_log'];
    for (const name of tables) {
      await client.query(`CREATE TEMP TABLE "${name}" (LIKE public."${name}" INCLUDING ALL) ON COMMIT DROP`);
    }
    // Fail closed if a fixture table did not shadow the production table.
    for (const name of tables) {
      const { rows } = await client.query('SELECT relpersistence FROM pg_class WHERE oid = to_regclass($1)', [name]);
      assert.equal(rows[0].relpersistence, 't');
    }
    app.decorate('db', client);
    app.decorate('authenticate', async (request: any) => {
      request.tenant = { tenantId, userId: tenantId, role: 'owner' };
    });
    await app.register(crmRoutes);
    await app.ready();
    await client.query("INSERT INTO niches (id, name) VALUES (900001, 'Assignment fixture')");
    await client.query("INSERT INTO ai_agent_configs (id,tenant_id,name,mode,is_active) VALUES ($1,$2,'Fixture agent','outbound',true)", [agentId, tenantId]);
    await client.query(`INSERT INTO contacts (id,niche_id,name,phone_number,ai_voice_consent,do_not_call) VALUES
      (900001,900001,'Pending fixture','+12065550123',false,false),
      (900002,900001,'DNC fixture','+14165550123',false,true),
      (900003,900001,'UK fixture','+442079460123',false,false)`);
    await client.query('INSERT INTO ai_calling_controls (tenant_id,calling_window_start_hour,calling_window_end_hour) VALUES ($1,0,24)', [tenantId]);
    const assigned = await app.inject({ method: 'POST', url: '/v1/leads/queue-ai', payload: { agent_id: agentId, niche_id: 900001, contact_ids: [900001,900002,900003] } });
    assert.equal(assigned.statusCode, 200, assigned.body);
    assert.equal(assigned.json().totalQueued, 1);
    assert.equal(assigned.json().pendingConsentCount, 1, 'Consent metadata is reported but does not block assignment');
    assert.equal(assigned.json().blockedCount, 1);
    assert.equal(assigned.json().invalidRegionCount, 1);
    let status = (await app.inject({ method: 'GET', url: '/v1/leads/ai-calling/status' })).json();
    assert.equal(status.stageCounts.assigned, 1);
    assert.equal(status.queueCount, 1);
    assert.equal(status.pendingConsentCount, 1);
    const started = await app.inject({ method: 'POST', url: '/v1/leads/ai-calling/start' });
    assert.notEqual(started.statusCode, 400, 'A pending-consent lead can start after manual enable');
    const repeated = await app.inject({ method: 'POST', url: '/v1/leads/queue-ai', payload: { agent_id: agentId, niche_id: 900001, contact_ids: [900001] } });
    assert.equal(repeated.json().createdFromContacts, 0);
    assert.equal(repeated.json().queuedExisting, 1);
    const source = await client.query('SELECT ai_voice_consent FROM contacts WHERE id=900001');
    assert.equal(source.rows[0].ai_voice_consent, false, 'Assignment must never assert consent');
    const verified = await app.inject({ method: 'POST', url: '/v1/leads/contacts/900001/voice-consent', payload: { consented: true, source: 'Synthetic fixture consent record, 2026-09-05' } });
    assert.equal(verified.statusCode, 200, verified.body);
    status = (await app.inject({ method: 'GET', url: '/v1/leads/ai-calling/status' })).json();
    assert.equal(status.queueCount, 1);
    assert.equal(status.pendingConsentCount, 0);
    assert.equal(status.isRunning, false, 'Consent must not automatically start calls');
    console.log(JSON.stringify({ ok: true, pendingAssignment: 'passed', dncAndRegionGuards: 'passed', manualStart: 'passed', duplicateAssignment: 'passed', consentMetadataOptional: 'passed', realCalls: 0 }));
  } finally {
    await app.close();
    await client.query('ROLLBACK');
    await client.end();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
