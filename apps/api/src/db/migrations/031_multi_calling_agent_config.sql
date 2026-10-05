-- 031_multi_calling_agent_config.sql

ALTER TABLE ai_agent_configs
  ADD COLUMN IF NOT EXISTS speech_speed NUMERIC,
  ADD COLUMN IF NOT EXISTS listen_eot_threshold NUMERIC,
  ADD COLUMN IF NOT EXISTS listen_eot_timeout_ms INTEGER;

-- We already added niche_id to enrichment_results in 030, but in case it's missed
ALTER TABLE enrichment_results
  ADD COLUMN IF NOT EXISTS niche_id INTEGER;
