ALTER TABLE ai_calling_script_versions
ADD COLUMN IF NOT EXISTS draft_revision INTEGER NOT NULL DEFAULT 1 CHECK (draft_revision > 0);
