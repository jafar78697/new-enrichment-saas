import re

with open('apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js', 'r') as f:
    content = f.read()

tool_old = """            `WITH session AS (
               UPDATE ai_call_sessions SET outcome = $1, summary = $2 WHERE id = $3
               RETURNING lead_id, tenant_id
             ), lead AS (
               UPDATE enrichment_results er
               SET lead_stage = CASE
                     WHEN $1 = 'interested' THEN 'interested'
                     WHEN $1 = 'followup' THEN 'followup'
                     WHEN $1 IN ('not_interested', 'do_not_call') THEN 'closed_lost'
                     ELSE er.lead_stage
                   END,"""

tool_new = """            `WITH session_check AS (
               SELECT outcome FROM ai_call_sessions WHERE id = $3
             ), session AS (
               UPDATE ai_call_sessions 
               SET 
                 outcome = CASE 
                   WHEN (SELECT outcome FROM session_check) IN ('not_interested', 'do_not_call', 'followup') THEN (SELECT outcome FROM session_check)
                   ELSE $1
                 END,
                 summary = $2 
               WHERE id = $3
               RETURNING lead_id, tenant_id, outcome AS final_outcome
             ), lead AS (
               UPDATE enrichment_results er
               SET lead_stage = CASE
                     WHEN s.final_outcome = 'interested' THEN 'interested'
                     WHEN s.final_outcome = 'followup' THEN 'followup'
                     WHEN s.final_outcome IN ('not_interested', 'do_not_call') THEN 'closed_lost'
                     ELSE er.lead_stage
                   END,"""

if tool_old in content:
    content = content.replace(tool_old, tool_new)
else:
    print("WARNING: tool_old not found!")

# Second chunk to replace $1 with s.final_outcome and prevent task
tool2_old = """                   next_followup_at = CASE
                     WHEN $1 = 'followup' THEN $5::timestamptz
                     WHEN $1 IN ('not_interested', 'do_not_call') THEN NULL
                     ELSE er.next_followup_at
                   END,
                   last_contacted_at = NOW(),
                   ai_summary = $2,
                   primary_email = COALESCE($9::text, NULLIF(er.primary_email, '')),
                   ai_updated_at = NOW(),
                   lead_notes = CONCAT_WS(E'\\n', NULLIF(er.lead_notes, ''), $2),
                   do_not_call = er.do_not_call OR $4,
                   ai_voice_consent = er.ai_voice_consent AND NOT $4,
                   raw_data = COALESCE(er.raw_data, '{}'::jsonb)
                     || jsonb_strip_nulls(jsonb_build_object(
                          'ai_outcome', $1::text,
                          'ai_outcome_source', 'live_tool',
                          'followup_at', $5::text,
                          'followup_timezone', NULLIF($6::text, ''),
                          'contact_name', $7::text,
                          'callback_phone', $8::text,
                          'email', $9::text
                        ))
               FROM session s WHERE er.id = s.lead_id AND er.tenant_id = s.tenant_id
               RETURNING er.id, er.tenant_id, COALESCE(er.company_name, er.domain, 'Lead') AS display_name,
                         er.raw_data->>'source_contact_id' AS contact_id, s.final_outcome
             ), followup_task AS (
               INSERT INTO tasks (tenant_id, lead_id, title, description, task_type, due_at, status, priority)
               SELECT l.tenant_id, l.id,
                      CASE WHEN $9::text IS NOT NULL THEN 'Email follow-up: ' || l.display_name ELSE 'AI follow-up: ' || l.display_name END,
                      $2, 'followup',
                      CASE WHEN l.final_outcome = 'followup' THEN $5::timestamptz ELSE NOW() END,
                      'open', 'high'
               FROM lead l
               WHERE ((l.final_outcome = 'followup' AND $5::timestamptz IS NOT NULL) OR ($9::text IS NOT NULL AND l.final_outcome NOT IN ('not_interested', 'do_not_call')))
                 AND NOT EXISTS ("""

tool2_original = """                   next_followup_at = CASE
                     WHEN $1 = 'followup' THEN $5::timestamptz
                     WHEN $1 IN ('not_interested', 'do_not_call') THEN NULL
                     ELSE er.next_followup_at
                   END,
                   last_contacted_at = NOW(),
                   ai_summary = $2,
                   primary_email = COALESCE($9::text, NULLIF(er.primary_email, '')),
                   ai_updated_at = NOW(),
                   lead_notes = CONCAT_WS(E'\\n', NULLIF(er.lead_notes, ''), $2),
                   do_not_call = er.do_not_call OR $4,
                   ai_voice_consent = er.ai_voice_consent AND NOT $4,
                   raw_data = COALESCE(er.raw_data, '{}'::jsonb)
                     || jsonb_strip_nulls(jsonb_build_object(
                          'ai_outcome', $1::text,
                          'ai_outcome_source', 'live_tool',
                          'followup_at', $5::text,
                          'followup_timezone', NULLIF($6::text, ''),
                          'contact_name', $7::text,
                          'callback_phone', $8::text,
                          'email', $9::text
                        ))
               FROM session s WHERE er.id = s.lead_id AND er.tenant_id = s.tenant_id
               RETURNING er.id, er.tenant_id, COALESCE(er.company_name, er.domain, 'Lead') AS display_name,
                         er.raw_data->>'source_contact_id' AS contact_id
             ), followup_task AS (
               INSERT INTO tasks (tenant_id, lead_id, title, description, task_type, due_at, status, priority)
               SELECT l.tenant_id, l.id,
                      CASE WHEN $9::text IS NOT NULL THEN 'Email follow-up: ' || l.display_name ELSE 'AI follow-up: ' || l.display_name END,
                      $2, 'followup',
                      CASE WHEN $1 = 'followup' THEN $5::timestamptz ELSE NOW() END,
                      'open', 'high'
               FROM lead l
               WHERE (($1 = 'followup' AND $5::timestamptz IS NOT NULL) OR $9::text IS NOT NULL)
                 AND NOT EXISTS ("""

if tool2_original in content:
    content = content.replace(tool2_original, tool2_old)
else:
    print("WARNING: tool2_original not found!")

# Third chunk replacing $1 = 'followup' inside NOT EXISTS
tool3_old = """                        ($1 = 'followup' AND t.due_at = $5::timestamptz)"""
tool3_new = """                        (l.final_outcome = 'followup' AND t.due_at = $5::timestamptz)"""
content = content.replace(tool3_old, tool3_new)

with open('apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js', 'w') as f:
    f.write(content)

print("Runtime result protections patched")
