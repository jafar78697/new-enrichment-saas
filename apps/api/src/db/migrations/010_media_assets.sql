CREATE TABLE IF NOT EXISTS media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title varchar(255),
  description text,
  media_type varchar(50), -- 'video', 'image', 'text'
  media_url text, -- Cloud storage URL
  generation_status varchar(50) DEFAULT 'pending', -- 'pending', 'completed', 'failed'
  prompt text,
  platform_status jsonb DEFAULT '{}'::jsonb, -- e.g., {"youtube": "published", "linkedin": "failed"}
  created_at timestamp DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp DEFAULT CURRENT_TIMESTAMP
);
