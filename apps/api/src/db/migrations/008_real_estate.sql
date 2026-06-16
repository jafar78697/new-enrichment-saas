-- 008_real_estate.sql
-- Add real estate specific fields to agents and enrichment_results (contacts)

-- Agents might not have property_specialty, so we add it.
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS property_specialty TEXT;

-- Contacts (enrichment_results) need specific real estate lead fields.
ALTER TABLE enrichment_results
  ADD COLUMN IF NOT EXISTS re_property_type TEXT,
  ADD COLUMN IF NOT EXISTS re_budget TEXT,
  ADD COLUMN IF NOT EXISTS re_timeframe TEXT,
  ADD COLUMN IF NOT EXISTS re_assigned_agent_id INT; -- references agents(id)
