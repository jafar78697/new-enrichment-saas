-- 005_crm_pipeline.sql
-- CRM pipeline, tasks/follow-ups, audit log, AI summary cache.
-- All data is scoped by tenant_id. Run after 004_affiliate_system.sql.

-- ------------------------------------------------------------------
-- Pipeline fields on enrichment_results (treated as "leads")
-- ------------------------------------------------------------------
ALTER TABLE enrichment_results
  ADD COLUMN IF NOT EXISTS lead_stage TEXT NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS lead_owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_priority TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS lead_notes TEXT,
  ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_followup_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_summary TEXT,
  ADD COLUMN IF NOT EXISTS ai_pain_points TEXT,
  ADD COLUMN IF NOT EXISTS ai_score INT,
  ADD COLUMN IF NOT EXISTS ai_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_results_stage ON enrichment_results (tenant_id, lead_stage);
CREATE INDEX IF NOT EXISTS idx_results_owner ON enrichment_results (tenant_id, lead_owner_id);
CREATE INDEX IF NOT EXISTS idx_results_followup ON enrichment_results (tenant_id, next_followup_at)
  WHERE next_followup_at IS NOT NULL;

-- ------------------------------------------------------------------
-- Lead stage history (for pipeline analytics)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lead_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES enrichment_results(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stagehist_lead ON lead_stage_history (lead_id, created_at DESC);

-- ------------------------------------------------------------------
-- Tasks / follow-up queue
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES enrichment_results(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT NOT NULL DEFAULT 'followup',
    -- followup | call | email | social | note | custom
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open',
    -- open | done | cancelled
  priority TEXT NOT NULL DEFAULT 'medium',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_due ON tasks (tenant_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks (assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_tasks_lead ON tasks (lead_id);

-- ------------------------------------------------------------------
-- Audit log (who did what, when)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
    -- lead.stage_changed | lead.owner_changed | lead.note_added
    -- task.created | task.completed | ai.summary_generated | etc.
  entity_type TEXT,
  entity_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log (entity_type, entity_id);
