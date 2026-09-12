/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('phone_numbers', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants' },
    phone_number: { type: 'text', notNull: true, unique: true },
    provider: { type: 'text', notNull: true }, // e.g., twilio, signalwire
    provider_sid: { type: 'text', notNull: true, unique: true }, // provider's ID for this number
    capabilities: { type: 'jsonb', default: '{}' }, // sms, mms, voice
    status: { type: 'text', notNull: true, default: 'active' }, // active, released
    monthly_cost: { type: 'int', notNull: true, default: 0 }, // in cents
    purchased_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    released_at: { type: 'timestamptz' }
  });

  pgm.createIndex('phone_numbers', 'tenant_id');
};

exports.down = (pgm) => {
  pgm.dropTable('phone_numbers');
};
