-- Migration: Global Lead Cache
-- Created at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

CREATE TABLE IF NOT EXISTS global_lead_cache (
    id SERIAL PRIMARY KEY,
    search_query TEXT NOT NULL, -- e.g., "plumber in new york" (lowercase, trimmed)
    name TEXT NOT NULL,
    phone TEXT,
    website TEXT,
    address TEXT,
    category TEXT,
    place_id TEXT,
    raw_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Unique index to prevent duplicates for the same search query + phone combination
CREATE UNIQUE INDEX IF NOT EXISTS global_lead_cache_query_phone_idx 
    ON global_lead_cache (search_query, phone) 
    WHERE phone IS NOT NULL AND phone != '';

-- Index for fast lookup by search query
CREATE INDEX IF NOT EXISTS global_lead_cache_query_idx 
    ON global_lead_cache (search_query);

