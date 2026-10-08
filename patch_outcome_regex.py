import re

with open('apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js', 'r') as f:
    content = f.read()

# Replace the save_call_note SQL logic
sql_pattern = r"`WITH session_check AS \(.*?EXISTS\(SELECT 1 FROM followup_task\) AS followup_task_created`,"

sql_replacement = r"""`WITH session_lock AS (
               SELECT outcome FROM ai_call_sessions WHERE id = $3 FOR UPDATE
             ), transition AS (
               SELECT 
                 CASE 
                   WHEN $4 = true THEN 'do_not_call'
                   WHEN (SELECT outcome FROM session_lock) IN ('do_not_call') THEN 'do_not_call'
                   WHEN $1 = 'not_interested' THEN 'not_interested'
                   WHEN (SELECT outcome FROM session_lock) IN ('not_interested') THEN 'not_interested'
                   WHEN $1 = 'followup' THEN 'followup'
                   WHEN (SELECT outcome FROM session_lock) IN ('followup') THEN 'followup'
                   ELSE $1
                 END AS final_outcome
             ), session AS (
               UPDATE ai_call_sessions 
               SET 
                 outcome = (SELECT final_outcome FROM transition),
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
                   END,
                   next_followup_at = CASE
                     WHEN s.final_outcome = 'followup' AND $5::timestamptz IS NOT NULL THEN $5::timestamptz
                     WHEN s.final_outcome IN ('not_interested', 'do_not_call') THEN NULL
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
                          'ai_outcome', s.final_outcome,
                          'ai_outcome_source', 'live_tool',
                          'followup_at', CASE WHEN s.final_outcome = 'followup' THEN COALESCE($5::text, er.raw_data->>'followup_at') ELSE NULL END,
                          'followup_timezone', CASE WHEN s.final_outcome = 'followup' THEN COALESCE(NULLIF($6::text, ''), er.raw_data->>'followup_timezone') ELSE NULL END,
                          'contact_name', $7::text,
                          'callback_phone', $8::text,
                          'email', $9::text
                        ))
               FROM session s WHERE er.id = s.lead_id AND er.tenant_id = s.tenant_id
               RETURNING er.id, er.tenant_id, COALESCE(er.company_name, er.domain, 'Lead') AS display_name,
                         er.raw_data->>'source_contact_id' AS contact_id, s.final_outcome, er.do_not_call AS final_dnc
             ), followup_task AS (
               INSERT INTO tasks (tenant_id, lead_id, title, description, task_type, due_at, status, priority)
               SELECT l.tenant_id, l.id,
                      CASE WHEN $9::text IS NOT NULL AND l.final_outcome != 'followup' THEN 'Email follow-up: ' || l.display_name ELSE 'AI follow-up: ' || l.display_name END,
                      $2, 'followup',
                      CASE WHEN l.final_outcome = 'followup' AND $5::timestamptz IS NOT NULL THEN $5::timestamptz ELSE NOW() END,
                      'open', 'high'
               FROM lead l
               WHERE ((l.final_outcome = 'followup' AND $5::timestamptz IS NOT NULL) OR ($9::text IS NOT NULL))
                 AND l.final_outcome NOT IN ('not_interested', 'do_not_call')
                 AND l.final_dnc = false
                 AND NOT EXISTS (
                   SELECT 1 FROM tasks t
                   WHERE t.lead_id = l.id AND t.task_type = 'followup' AND t.status = 'open'
                 )
               RETURNING id
             ), contact_update AS (
               UPDATE contacts SET do_not_call = true, ai_voice_consent = false
               WHERE (SELECT final_outcome FROM transition) IN ('do_not_call') AND id::text IN (SELECT contact_id FROM lead)
               RETURNING id
             )
             SELECT
               EXISTS(SELECT 1 FROM lead) AS saved,
               (SELECT final_outcome FROM transition) AS actual_outcome,
               EXISTS(SELECT 1 FROM followup_task) AS followup_task_created`,"""

new_content, count = re.subn(sql_pattern, sql_replacement, content, flags=re.DOTALL)
if count == 0:
    print("ERROR: sql_pattern not found")

json_pattern = r"const actualOutcome = rows\[0\]\?\.actual_outcome \|\| outcome;.*?followup_task_created: rows\[0\]\?\.followup_task_created === true,\n            \}\);"

json_replacement = r"""const actualOutcome = rows[0]?.actual_outcome || outcome;
            content = JSON.stringify({
              ok: rows[0]?.saved === true,
              saved: rows[0]?.saved === true,
              outcome: actualOutcome,
              followup_at: actualOutcome === 'followup' ? followupAt : null,
              followup_timezone: actualOutcome === 'followup' ? (followupTimezone || null) : null,
              followup_task_created: rows[0]?.followup_task_created === true,
            });"""

new_content, count2 = re.subn(json_pattern, json_replacement, new_content, flags=re.DOTALL)
if count2 == 0:
    print("ERROR: json_pattern not found")

with open('apps/api/src/voice-agent/orchestrator/deepgram-signalwire-bridge.js', 'w') as f:
    f.write(new_content)

print("patch success")
