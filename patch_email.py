import re

with open('apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js', 'r') as f:
    content = f.read()

pattern = r"          const capturedEmail = reconcileEmailWithLeadDomain\(\n            extractEmailFromTranscript\(session\?\.transcript\),\n            session\?\.lead_domain,\n          \);\n          if \(capturedEmail\) \{\n            await query\(\n              `WITH updated_session AS \(\n                 UPDATE ai_call_sessions\n                 SET outcome = CASE WHEN outcome IN \('not_interested', 'called'\) OR outcome IS NULL THEN 'interested' ELSE outcome END,\n                     summary = CASE\n                       WHEN outcome IN \('not_interested', 'called'\) OR outcome IS NULL\n                         THEN 'Prospect provided an email for information or management follow-up.'\n                       ELSE summary\n                     END\n                 WHERE id = \$1\n                 RETURNING lead_id, tenant_id\n               \), updated_lead AS \(\n                 UPDATE enrichment_results er\n                 SET primary_email = \$2,\n                     raw_data = COALESCE\(er\.raw_data, '\{\}'::jsonb\)\n                       \|\| jsonb_build_object\('email', \$2::text, 'email_source', 'ai_transcript'\),\n                     ai_updated_at = NOW\(\)\n                 FROM updated_session s\n                 WHERE er\.id = s\.lead_id AND er\.tenant_id = s\.tenant_id\n                 RETURNING er\.id, er\.tenant_id, COALESCE\(er\.company_name, er\.domain, 'Lead'\) AS display_name\n               \), email_task AS \(\n                 INSERT INTO tasks \(tenant_id, lead_id, title, description, task_type, due_at, status, priority\)\n                 SELECT l\.tenant_id, l\.id, 'Email follow-up: ' \|\| l\.display_name,\n                        'Prospect provided ' \|\| \$2::text \|\| ' for information or management follow-up.',\n                        'followup', NOW\(\), 'open', 'high'\n                 FROM updated_lead l\n                 WHERE NOT EXISTS \(\n                   SELECT 1 FROM tasks t\n                   WHERE t\.lead_id = l\.id AND t\.task_type = 'followup' AND t\.status = 'open'\n                     AND t\.title = 'Email follow-up: ' \|\| l\.display_name\n                 \)\n                 RETURNING id\n               \)\n               SELECT EXISTS\(SELECT 1 FROM updated_lead\) AS saved`,\n              \[sessionId, capturedEmail\],\n            \);"

replacement = """          const capturedEmail = reconcileEmailWithLeadDomain(
            extractEmailFromTranscript(session?.transcript),
            session?.lead_domain,
          );
          if (capturedEmail) {
            await query(
              `WITH session_lock AS (
                 SELECT outcome, tenant_id, lead_id FROM ai_call_sessions WHERE id = $1 FOR UPDATE
               ), updated_lead AS (
                 UPDATE enrichment_results er
                 SET primary_email = $2,
                     raw_data = COALESCE(er.raw_data, '{}'::jsonb)
                       || jsonb_build_object('email', $2::text, 'email_source', 'ai_transcript'),
                     ai_updated_at = NOW()
                 FROM session_lock s
                 WHERE er.id = s.lead_id AND er.tenant_id = s.tenant_id
                 RETURNING er.id, er.tenant_id, COALESCE(er.company_name, er.domain, 'Lead') AS display_name, s.outcome, er.do_not_call AS final_dnc
               ), email_task AS (
                 INSERT INTO tasks (tenant_id, lead_id, title, description, task_type, due_at, status, priority)
                 SELECT l.tenant_id, l.id, 'Email follow-up: ' || l.display_name,
                        'Prospect provided ' || $2::text || ' for information or management follow-up.',
                        'followup', NOW(), 'open', 'high'
                 FROM updated_lead l
                 WHERE l.outcome NOT IN ('not_interested', 'do_not_call')
                   AND l.final_dnc = false
                   AND NOT EXISTS (
                     SELECT 1 FROM tasks t
                     WHERE t.lead_id = l.id AND t.task_type = 'followup' AND t.status = 'open'
                   )
                 RETURNING id
               )
               SELECT EXISTS(SELECT 1 FROM email_task) AS saved`,
              [sessionId, capturedEmail],
            );"""

new_content, count = re.subn(pattern, replacement, content, flags=re.DOTALL)
if count == 0:
    print("FAILED TO MATCH PATTERN EMAIL")

with open('apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js', 'w') as f:
    f.write(new_content)

print("Email capture patched!")
