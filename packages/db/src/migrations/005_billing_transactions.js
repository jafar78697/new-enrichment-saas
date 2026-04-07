/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('billing_transactions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants' },
    stripe_session_id: { type: 'text', unique: true },
    amount: { type: 'int', notNull: true }, // in cents
    currency: { type: 'text', notNull: true, default: 'usd' },
    status: { type: 'text', notNull: true, default: 'pending' }, // pending, completed, failed
    credits_added: { type: 'int', notNull: true, default: 0 },
    type: { type: 'text', notNull: true }, // 'topup', 'subscription'
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    completed_at: { type: 'timestamptz' }
  });

  pgm.createIndex('billing_transactions', 'tenant_id');
  pgm.createIndex('billing_transactions', 'stripe_session_id');
};

exports.down = (pgm) => {
  pgm.dropTable('billing_transactions');
};
