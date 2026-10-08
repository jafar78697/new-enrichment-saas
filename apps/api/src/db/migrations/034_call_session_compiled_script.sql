ALTER TABLE ai_call_sessions
ADD COLUMN IF NOT EXISTS compiled_script_prompt TEXT;
