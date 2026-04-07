/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('webhook_endpoints', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants' },
    url: { type: 'text', notNull: true },
    secret: { type: 'text', notNull: true },
    events: { type: 'text[]' },
    active: { type: 'boolean', default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });

  pgm.createTable('webhook_deliveries', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    endpoint_id: { type: 'uuid', notNull: true, references: 'webhook_endpoints' },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants' },
    event_type: { type: 'text', notNull: true },
    payload: { type: 'jsonb', notNull: true },
    status: { type: 'text', notNull: true, default: 'pending' },
    attempts: { type: 'int', notNull: true, default: 0 },
    last_attempt_at: { type: 'timestamptz' },
    delivered_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    expires_at: { type: 'timestamptz' }
  });

  pgm.createTable('exports', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants' },
    job_id: { type: 'uuid', references: 'enrichment_jobs' },
    format: { type: 'text', notNull: true },
    status: { type: 'text', notNull: true, default: 'pending' },
    s3_key: { type: 'text' },
    download_url: { type: 'text' },
    url_expires_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });

  pgm.createTable('audit_logs', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants' },
    user_id: { type: 'uuid', references: 'users' },
    action: { type: 'text', notNull: true },
    resource: { type: 'text' },
    metadata: { type: 'jsonb' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    expires_at: { type: 'timestamptz' }
  });
};

exports.down = (pgm) => {
  pgm.dropTable('audit_logs');
  pgm.dropTable('exports');
  pgm.dropTable('webhook_deliveries');
  pgm.dropTable('webhook_endpoints');
};
