import re

with open('apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js', 'r') as f:
    content = f.read()

tool2_old = """               RETURNING er.id, er.tenant_id, COALESCE(er.company_name, er.domain, 'Lead') AS display_name,
                         er.raw_data->>'source_contact_id' AS contact_id
             ), followup_task AS (
               INSERT INTO tasks (tenant_id, lead_id, title, description, task_type, due_at, status, priority)
               SELECT l.tenant_id, l.id,
                      CASE WHEN $9::text IS NOT NULL THEN 'Email follow-up: ' || l.display_name ELSE 'AI follow-up: ' || l.display_name END,
                      $2, 'followup',
                      CASE WHEN $1 = 'followup' THEN $5::timestamptz ELSE NOW() END,
                      'open', 'high'
               FROM lead l
               WHERE (($1 = 'followup' AND $5::timestamptz IS NOT NULL) OR $9::text IS NOT NULL)"""

tool2_new = """               RETURNING er.id, er.tenant_id, COALESCE(er.company_name, er.domain, 'Lead') AS display_name,
                         er.raw_data->>'source_contact_id' AS contact_id, s.final_outcome
             ), followup_task AS (
               INSERT INTO tasks (tenant_id, lead_id, title, description, task_type, due_at, status, priority)
               SELECT l.tenant_id, l.id,
                      CASE WHEN $9::text IS NOT NULL THEN 'Email follow-up: ' || l.display_name ELSE 'AI follow-up: ' || l.display_name END,
                      $2, 'followup',
                      CASE WHEN l.final_outcome = 'followup' THEN $5::timestamptz ELSE NOW() END,
                      'open', 'high'
               FROM lead l
               WHERE ((l.final_outcome = 'followup' AND $5::timestamptz IS NOT NULL) OR ($9::text IS NOT NULL AND l.final_outcome NOT IN ('not_interested', 'do_not_call')))"""

if tool2_old in content:
    content = content.replace(tool2_old, tool2_new)
else:
    print("WARNING: tool2_old not found!")

with open('apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js', 'w') as f:
    f.write(content)

print("tool2 patched")
