/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('enrichment_results', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    job_item_id: { type: 'uuid', notNull: true, references: 'enrichment_job_items' },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants' },
    domain: { type: 'text', notNull: true },

    // Contact fields
    primary_email: { type: 'text' },
    additional_emails: { type: 'text[]' },
    primary_phone: { type: 'text' },
    additional_phones: { type: 'text[]' },
    contact_page_url: { type: 'text' },
    contact_form_url: { type: 'text' },

    // Social fields
    linkedin_url: { type: 'text' },
    facebook_url: { type: 'text' },
    instagram_url: { type: 'text' },
    twitter_url: { type: 'text' },
    youtube_url: { type: 'text' },
    tiktok_url: { type: 'text' },
    whatsapp_link: { type: 'text' },
    telegram_link: { type: 'text' },

    // Company intelligence
    company_name: { type: 'text' },
    brand_name: { type: 'text' },
    page_title: { type: 'text' },
    meta_description: { type: 'text' },
    one_line_pitch: { type: 'text' },
    long_summary: { type: 'text' },
    services_list: { type: 'text[]' },
    products_list: { type: 'text[]' },
    industry_guess: { type: 'text' },
    target_audience: { type: 'text' },
    language: { type: 'text' },
    address: { type: 'text' },
    city: { type: 'text' },
    country: { type: 'text' },
    about_page_url: { type: 'text' },
    careers_page_url: { type: 'text' },
    support_page_url: { type: 'text' },

    // Technical signals
    cms_guess: { type: 'text' },
    framework_guess: { type: 'text' },
    ecommerce_signal: { type: 'boolean', default: false },
    saas_signal: { type: 'boolean', default: false },
    booking_signal: { type: 'boolean', default: false },
    analytics_hints: { type: 'text[]' },
    cta_type: { type: 'text' },

    // Quality
    confidence_level: { type: 'text', notNull: true, default: 'low_confidence' },
    enrichment_lane: { type: 'text' },
    verified_data: { type: 'jsonb' },
    inferred_data: { type: 'jsonb' },
    raw_result: { type: 'jsonb' },

    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    expires_at: { type: 'timestamptz' }
  });

  pgm.createIndex('enrichment_results', 'job_item_id');
  pgm.createIndex('enrichment_results', ['tenant_id', 'domain']);
};

exports.down = (pgm) => {
  pgm.dropTable('enrichment_results');
};
