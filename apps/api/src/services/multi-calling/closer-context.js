/**
 * AI Closer — shared queue eligibility and opener→closer handoff context.
 *
 * Used by the multi-lane worker (JS) and the multi-calling routes (TS).
 * A closer lane re-calls warm leads that an opener lane already qualified.
 * It never dials leads that are DNC, recently contacted, or out of attempts.
 */

export const CLOSER_SOURCE_STAGES = ['interested', 'followup', 'demo_scheduled', 'proposal_sent'];
const ACTIVE_QUEUE_STATES = ['queued', 'claimed', 'dialing', 'ringing', 'streaming'];
const MAX_TRANSCRIPT_CHARS = 1400;
const MAX_FIELD_CHARS = 400;

function clip(value, max = MAX_FIELD_CHARS) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function normalizeCloserStages(stages) {
  const list = Array.isArray(stages) ? stages : [];
  const valid = list.filter((stage) => CLOSER_SOURCE_STAGES.includes(stage));
  return valid.length ? Array.from(new Set(valid)) : ['interested'];
}

/**
 * Insert eligible warm leads for one closer lane. Idempotent through the
 * existing one-active-queue-item-per-lead unique index.
 * @returns {Promise<number>} inserted row count
 */
export async function populateCloserQueue(db, lane, limit = 25) {
  const stages = normalizeCloserStages(lane.closer_source_stages);
  const result = await db.query(
    `INSERT INTO ai_call_queue_items (tenant_id, lane_id, lead_id, state, priority, scheduled_at)
     SELECT er.tenant_id, $2, er.id, 'queued',
            CASE WHEN er.lead_stage = 'followup' THEN 10 ELSE 50 END,
            CASE WHEN er.lead_stage = 'followup' AND er.next_followup_at IS NOT NULL
                 THEN GREATEST(er.next_followup_at, NOW()) ELSE NOW() END
     FROM enrichment_results er
     WHERE er.tenant_id = $1
       AND ($3::integer IS NULL OR er.niche_id = $3)
       AND er.do_not_call = false
       AND er.primary_phone IS NOT NULL
       AND er.lead_stage = ANY($4::text[])
       AND COALESCE(er.close_attempts, 0) < $5
       AND (er.last_contacted_at IS NULL OR er.last_contacted_at <= NOW() - ($6 * INTERVAL '1 minute'))
       AND (er.lead_stage <> 'followup' OR er.next_followup_at IS NOT NULL)
       -- Warm = an opener (or legacy) AI call already produced this stage.
       AND EXISTS (SELECT 1 FROM ai_call_sessions s WHERE s.lead_id = er.id AND s.tenant_id = er.tenant_id)
       AND NOT EXISTS (
         SELECT 1 FROM ai_call_queue_items q
         WHERE q.lead_id = er.id AND q.state = ANY($7::text[])
       )
     ORDER BY CASE WHEN er.lead_stage = 'followup' THEN 0 ELSE 1 END, er.last_contacted_at ASC NULLS FIRST
     LIMIT $8
     ON CONFLICT (tenant_id, lead_id) WHERE state IN ('queued', 'claimed', 'dialing', 'ringing', 'streaming')
     DO NOTHING
     RETURNING id`,
    [
      lane.tenant_id, lane.id, lane.niche_id ?? null, stages,
      Number(lane.max_close_attempts) || 3, Number(lane.closer_min_delay_minutes) || 0,
      ACTIVE_QUEUE_STATES, limit,
    ],
  );
  return result.rowCount || 0;
}

/**
 * Validate that a claimed lead is still eligible for a closer call.
 * Returns null when eligible, otherwise a short reason.
 */
export function closerIneligibleReason(lead, lane) {
  if (!lead) return 'Lead missing';
  if (lead.do_not_call) return 'Lead is do-not-call';
  const stages = normalizeCloserStages(lane.closer_source_stages);
  if (!stages.includes(lead.lead_stage)) return `Lead stage ${lead.lead_stage} is not a closer source stage`;
  if ((Number(lead.close_attempts) || 0) >= (Number(lane.max_close_attempts) || 3)) return 'Close attempts exhausted';
  return null;
}

function transcriptExcerpt(transcript) {
  const turns = Array.isArray(transcript) ? transcript : [];
  const lines = turns
    .filter((turn) => turn && typeof turn.text === 'string' && turn.text.trim())
    .map((turn) => `${turn.role === 'assistant' ? 'Agent' : 'Prospect'}: ${turn.text.trim()}`);
  // Keep the end of the conversation; it holds the decision and next step.
  let excerpt = '';
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const next = `${lines[i]}\n${excerpt}`;
    if (next.length > MAX_TRANSCRIPT_CHARS) break;
    excerpt = next;
  }
  return excerpt.trim() || null;
}

/**
 * Build the immutable handoff snapshot a closer call receives. Only data that
 * belongs to this tenant and this lead is read, so no context can leak across
 * leads or companies.
 */
export async function buildCloserContext(db, tenantId, leadId) {
  const lead = (await db.query(
    `SELECT id, company_name, primary_email, lead_stage, lead_notes, ai_summary, next_followup_at,
            close_attempts, raw_data
     FROM enrichment_results WHERE id = $1 AND tenant_id = $2`,
    [leadId, tenantId],
  )).rows[0];
  if (!lead) return null;

  const sessions = (await db.query(
    `SELECT id, call_role, outcome, summary, transcript, result_details, started_at, created_at, duration_sec
     FROM ai_call_sessions
     WHERE lead_id = $1 AND tenant_id = $2 AND ended_at IS NOT NULL
     ORDER BY created_at DESC LIMIT 5`,
    [leadId, tenantId],
  )).rows;

  const raw = lead.raw_data || {};
  const lastHuman = sessions.find((s) => ['interested', 'followup', 'called'].includes(s.outcome)) || sessions[0] || null;
  const lastOpener = sessions.find((s) => s.call_role !== 'closer') || null;
  const priorCloserAttempts = sessions.filter((s) => s.call_role === 'closer').length;
  const when = lastHuman?.started_at || lastHuman?.created_at || null;

  return {
    version: 1,
    lead_id: lead.id,
    company_name: clip(lead.company_name, 160),
    contact_name: clip(raw.contact_name || [raw.first_name, raw.last_name].filter(Boolean).join(' '), 120),
    email: clip(lead.primary_email || raw.email, 160),
    callback_phone: clip(raw.callback_phone, 40),
    stage_at_handoff: lead.lead_stage,
    followup_at: lead.next_followup_at ? new Date(lead.next_followup_at).toISOString() : null,
    followup_timezone: clip(raw.followup_timezone, 64),
    last_call_at: when ? new Date(when).toISOString() : null,
    last_call_outcome: lastHuman?.outcome || null,
    last_call_note: clip(lastHuman?.summary || lead.ai_summary),
    last_opener_session_id: lastOpener?.id || null,
    prior_closer_attempts: priorCloserAttempts,
    transcript_excerpt: lastHuman ? transcriptExcerpt(lastHuman.transcript) : null,
  };
}

/** Human-readable day for spoken reference, e.g. "Tuesday". */
export function spokenDay(isoDate, timeZone = 'America/New_York') {
  if (!isoDate) return null;
  const date = new Date(isoDate);
  if (!Number.isFinite(date.getTime())) return null;
  const ageDays = (Date.now() - date.getTime()) / 86400000;
  if (ageDays < 1) return 'earlier today';
  if (ageDays < 2) return 'yesterday';
  try {
    const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone }).format(date);
    return ageDays < 7 ? `on ${weekday}` : 'recently';
  } catch {
    return 'recently';
  }
}

/** Prompt block appended for closer calls only. */
export function renderCloserContextPrompt(summary) {
  if (!summary) return '';
  const lines = [
    '',
    '',
    'CLOSER CALL CONTEXT (this is a follow-up call to a warm lead, NOT a cold call):',
    `- Company: ${summary.company_name || 'unknown'}`,
  ];
  if (summary.contact_name) lines.push(`- Contact name: ${summary.contact_name}`);
  if (summary.last_call_at) lines.push(`- Previous call: ${spokenDay(summary.last_call_at, summary.followup_timezone || undefined) || 'recently'} (result: ${summary.last_call_outcome || 'unknown'})`);
  if (summary.last_call_note) lines.push(`- Previous call note: ${summary.last_call_note}`);
  if (summary.email) lines.push(`- Email already on file: ${summary.email} (confirm before using)`);
  if (summary.followup_at) lines.push(`- Agreed callback time: ${summary.followup_at}${summary.followup_timezone ? ` (${summary.followup_timezone})` : ''}`);
  if (summary.prior_closer_attempts) lines.push(`- Previous closer attempts: ${summary.prior_closer_attempts}`);
  if (summary.transcript_excerpt) {
    lines.push('- End of previous conversation (reference only, never read aloud):');
    lines.push(summary.transcript_excerpt.split('\n').map((line) => `    ${line}`).join('\n'));
  }
  lines.push(
    'CLOSER RULES:',
    '- Reference the previous conversation briefly and naturally in your first turn. Do not re-pitch from scratch.',
    '- If the person does not remember the call, give a one-sentence reminder and ask permission to continue.',
    '- Use only facts listed above. Never invent details about the previous call, prices, discounts, or guarantees.',
    '- Your goal is a concrete next step: a confirmed meeting time, a confirmed purchase decision, or a confirmed callback.',
    '- Call save_close_result as soon as the decision is clear. Never claim something was booked, sent, or paid unless a tool returned ok=true.',
  );
  return lines.join('\n');
}

/** Template variables available to closer scripts. */
export function closerTemplateVars(summary) {
  if (!summary) return {};
  return {
    prospect_name: summary.contact_name || '',
    last_call_day: spokenDay(summary.last_call_at, summary.followup_timezone || undefined) || 'recently',
    last_call_note: summary.last_call_note || '',
  };
}
