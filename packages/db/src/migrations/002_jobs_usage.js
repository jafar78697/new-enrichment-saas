/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('usage_counters', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants' },
    billing_period_start: { type: 'date', notNull: true },
    http_enrichments_used: { type: 'int', notNull: true, default: 0 },
    browser_credits_used: { type: 'int', notNull: true, default: 0 },
    browser_credits_remaining: { type: 'int', notNull: true, default: 0 },
    http_limit: { type: 'int', notNull: true },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.createIndex('usage_counters', ['tenant_id', 'billing_period_start'], { unique: true });

  pgm.createTable('enrichment_jobs', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants' },
    workspace_id: { type: 'uuid', references: 'workspaces' },
    created_by: { type: 'uuid', references: 'users' },
    source_type: { type: 'text', notNull: true },
    mode: { type: 'text', notNull: true },
    status: { type: 'text', notNull: true, default: 'queued' },
    total_items: { type: 'int', notNull: true, default: 0 },
    completed_items: { type: 'int', notNull: true, default: 0 },
    failed_items: { type: 'int', notNull: true, default: 0 },
    partial_items: { type: 'int', notNull: true, default: 0 },
    http_completed: { type: 'int', notNull: true, default: 0 },
    browser_completed: { type: 'int', notNull: true, default: 0 },
    idempotency_key: { type: 'text' },
    webhook_url: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    started_at: { type: 'timestamptz' },
    finished_at: { type: 'timestamptz' },
    expires_at: { type: 'timestamptz' }
  });
  pgm.createIndex('enrichment_jobs', ['tenant_id', 'status']);
  pgm.createIndex('enrichment_jobs', 'idempotency_key', { unique: true });

  pgm.createTable('enrichment_job_items', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    job_id: { type: 'uuid', notNull: true, references: 'enrichment_jobs' },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants' },
    raw_input: { type: 'text', notNull: true },
    normalized_domain: { type: 'text', notNull: true },
    status: { type: 'text', notNull: true, default: 'queued' },
    http_attempts: { type: 'int', notNull: true, default: 0 },
    browser_attempts: { type: 'int', notNull: true, default: 0 },
    last_error: { type: 'text' },
    shard_index: { type: 'int' },
    queued_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    started_at: { type: 'timestamptz' },
    finished_at: { type: 'timestamptz' }
  });
  pgm.createIndex('enrichment_job_items', 'job_id');
  pgm.createIndex('enrichment_job_items', ['tenant_id', 'status']);
};

exports.down = (pgm) => {
  pgm.dropTable('enrichment_job_items');
  pgm.dropTable('enrichment_jobs');
  pgm.dropTable('usage_counters');
};
