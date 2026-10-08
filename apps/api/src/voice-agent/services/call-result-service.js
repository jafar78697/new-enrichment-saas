import { getClient } from '../../calls-module/db/index.js';

const knownResults = new Set(['called', 'interested', 'not_interested', 'followup', 'do_not_call', 'voicemail', 'no_answer', 'technical_error']);
const machineResults = new Set(['voicemail', 'no_answer', 'technical_error']);
// Stages a closer (or a human) moved forward; neutral AI results never undo them.
const advancedStages = new Set(['demo_scheduled', 'proposal_sent', 'closed_won']);
export const CLOSE_OUTCOMES = ['meeting_booked', 'verbal_yes', 'needs_human'];

function acceptedOutcome(previous, requested, optedOut, fallback) {
  if (optedOut || previous === 'do_not_call' || requested === 'do_not_call') return 'do_not_call';
  if (fallback && previous && previous !== 'called') return previous;
  if (previous === 'not_interested') return previous;
  if (requested === 'not_interested') return requested;
  if (machineResults.has(previous)) return previous;
  if (requested === 'called' && ['interested', 'followup'].includes(previous)) return previous;
  if (previous === 'followup' && requested === 'interested') return previous;
  return requested || previous || 'called';
}

// All writers take the lead lock before the session lock, including cleanup.
// This serializes result transitions and task creation across calls on one lead.
export async function saveCallResult({ sessionId, outcome, note = '', email = null,
  contactName = null, callbackPhone = null, followupAt = null, followupTimezone = null,
  source = 'live_tool', fallback = false, durationSec = null }) {
  if (outcome && !knownResults.has(outcome)) throw new Error('Invalid call result.');
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const identity = (await client.query('SELECT lead_id, tenant_id FROM ai_call_sessions WHERE id = $1', [sessionId])).rows[0];
    if (!identity) throw new Error('Call session not found.');
    const lead = (await client.query('SELECT * FROM enrichment_results WHERE id = $1 AND tenant_id = $2 FOR UPDATE', [identity.lead_id, identity.tenant_id])).rows[0];
    const session = (await client.query('SELECT * FROM ai_call_sessions WHERE id = $1 FOR UPDATE', [sessionId])).rows[0];
    if (!session) throw new Error('Call session no longer exists.');
    const latest = (await client.query('SELECT id FROM ai_call_sessions WHERE lead_id = $1 AND tenant_id = $2 ORDER BY created_at DESC, id DESC LIMIT 1', [identity.lead_id, identity.tenant_id])).rows[0];
    const isLatest = latest?.id === sessionId;
    const finalOutcome = acceptedOutcome(session.outcome, outcome, Boolean(lead?.do_not_call), fallback);
    const prior = session.result_details || {};
    const acceptsRequested = finalOutcome === outcome && (!fallback || !session.outcome);
    let effectiveTime = finalOutcome === 'followup' && session.outcome === 'followup' ? (prior.followup_at || (isLatest ? lead?.next_followup_at : null)) : null;
    let effectiveZone = finalOutcome === 'followup' && session.outcome === 'followup' ? (prior.followup_timezone || (isLatest ? lead?.raw_data?.followup_timezone : null)) : null;
    if (finalOutcome === 'followup' && acceptsRequested && followupAt) {
      const date = new Date(followupAt);
      if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now() || !followupTimezone) throw new Error('Confirm a future follow-up date, time and timezone.');
      try { new Intl.DateTimeFormat('en', { timeZone: followupTimezone }); } catch { throw new Error('Invalid follow-up timezone.'); }
      effectiveTime = date.toISOString();
      effectiveZone = followupTimezone;
    }
    if (effectiveTime) effectiveTime = new Date(effectiveTime).toISOString();
    const effectiveNote = acceptsRequested && note ? note : (session.summary || note);
    const details = { ...prior, outcome: finalOutcome, followup_at: effectiveTime, followup_timezone: effectiveZone };
    await client.query('UPDATE ai_call_sessions SET outcome = $1, summary = $2, result_details = $3 WHERE id = $4', [finalOutcome, effectiveNote, JSON.stringify(details), sessionId]);

    let taskCreated = false;
    // Late session finalizers cannot rewrite a newer lead. Explicit opt-out is
    // person-level and is honored even when its originating call is older.
    const canUpdateLead = Boolean(lead && (isLatest || outcome === 'do_not_call'));
    if (canUpdateLead) {
      const raw = { ...(lead.raw_data || {}), ai_outcome: finalOutcome,
        ai_outcome_source: source, followup_at: effectiveTime, followup_timezone: effectiveZone };
      if (email) { raw.email = email; raw.email_source = source; }
      if (contactName) raw.contact_name = contactName;
      if (callbackPhone) raw.callback_phone = callbackPhone;
      if (durationSec !== null && isLatest) {
        delete raw.active_call_sid;
        raw.call_duration_seconds = durationSec;
        raw.call_ended_at = session.ended_at || new Date().toISOString();
      }
      const dnc = finalOutcome === 'do_not_call' || Boolean(lead.do_not_call);
      let stage = dnc || finalOutcome === 'not_interested' ? 'closed_lost'
        : finalOutcome === 'interested' ? 'interested' : finalOutcome === 'followup' ? 'followup'
          : machineResults.has(finalOutcome) ? 'no_answer' : durationSec !== null ? 'called' : lead.lead_stage;
      // Closer calls re-contact warm leads. An unanswered or neutral closer
      // attempt must keep the lead warm, and a closer must never downgrade a
      // stage it (or a human) already advanced.
      const isCloserSession = session.call_role === 'closer';
      if (isCloserSession && !dnc && finalOutcome !== 'not_interested') {
        if (advancedStages.has(lead.lead_stage) && finalOutcome !== 'followup') stage = lead.lead_stage;
        else if (machineResults.has(finalOutcome) || finalOutcome === 'called') stage = lead.lead_stage;
      }
      const nextFollowupAt = isCloserSession && stage === lead.lead_stage && !effectiveTime
        ? lead.next_followup_at : effectiveTime;
      // Repeated tool responses do not append the same note repeatedly.
      const existingNotes = String(lead.lead_notes || '');
      const notes = [existingNotes];
      if (effectiveNote && !( '\n' + existingNotes + '\n').includes('\n' + effectiveNote + '\n')) notes.push(effectiveNote);
      await client.query(`UPDATE enrichment_results SET lead_stage = $1, next_followup_at = $2,
        do_not_call = $3, ai_voice_consent = COALESCE(ai_voice_consent, false) AND NOT $3,
        raw_data = $4, primary_email = COALESCE($5, primary_email), ai_summary = $6,
        lead_notes = $7, last_contacted_at = NOW(), ai_updated_at = NOW()
        WHERE id = $8 AND tenant_id = $9`,
      [stage, nextFollowupAt, dnc, JSON.stringify(raw), email, effectiveNote, notes.filter(Boolean).join('\n'), lead.id, lead.tenant_id]);
      if (dnc || finalOutcome === 'not_interested') {
        // Only cancel tasks created by AI calling; leave unrelated CRM tasks alone.
        await client.query(`UPDATE tasks SET status = 'cancelled' WHERE lead_id = $1 AND tenant_id = $2 AND status = 'open'
          AND (title LIKE 'AI follow-up:%' OR title LIKE 'Email follow-up:%')`, [lead.id, lead.tenant_id]);
      }
      if (dnc && raw.source_contact_id) {
        await client.query('UPDATE contacts SET do_not_call = true, ai_voice_consent = false WHERE id::text = $1 AND tenant_id = $2', [raw.source_contact_id, lead.tenant_id]);
      }
      // A captured address alone is not authorization. Interested is required
      // for email outreach; scheduled follow-up always keeps its confirmed time.
      const due = finalOutcome === 'followup' ? effectiveTime : finalOutcome === 'interested' && email ? new Date().toISOString() : null;
      if (!dnc && due) {
        const title = `${finalOutcome === 'followup' ? 'AI' : 'Email'} follow-up: ${lead.company_name || lead.domain || 'Lead'}`;
        const existing = (await client.query(`SELECT id FROM tasks WHERE tenant_id = $1 AND lead_id = $2 AND task_type = 'followup'
          AND status = 'open' AND title = $3 ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [lead.tenant_id, lead.id, title])).rows[0];
        if (existing) await client.query('UPDATE tasks SET due_at = $1, description = $2 WHERE id = $3', [due, effectiveNote, existing.id]);
        else {
          await client.query(`INSERT INTO tasks (tenant_id, lead_id, title, description, task_type, due_at, status, priority)
            VALUES ($1, $2, $3, $4, 'followup', $5, 'open', 'high')`, [lead.tenant_id, lead.id, title, effectiveNote, due]);
          taskCreated = true;
        }
      }
    }
    await client.query('COMMIT');
    return { ok: true, saved: true, lead_updated: canUpdateLead, outcome: finalOutcome,
      followup_at: effectiveTime, followup_timezone: effectiveZone, followup_task_created: taskCreated };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

/**
 * Closer-only dispositions. These never claim an external calendar booking or
 * payment: they move the CRM stage, store the agreed details, write an audit
 * event and open a high-priority task so a human (or a later integration)
 * completes the action.
 *
 *  - meeting_booked: prospect confirmed an exact future meeting time + timezone.
 *  - verbal_yes:     prospect verbally agreed to buy / start.
 *  - needs_human:    prospect wants to speak with a person before deciding.
 */
export async function saveCloseResult({ sessionId, closeOutcome, note = '', meetingAt = null,
  meetingTimezone = null, email = null, contactName = null, dealValue = null }) {
  if (!CLOSE_OUTCOMES.includes(closeOutcome)) throw new Error('Invalid close outcome.');
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const identity = (await client.query('SELECT lead_id, tenant_id, call_role FROM ai_call_sessions WHERE id = $1', [sessionId])).rows[0];
    if (!identity) throw new Error('Call session not found.');
    if (identity.call_role !== 'closer') throw new Error('Close results are only available on closer calls.');
    const lead = (await client.query('SELECT * FROM enrichment_results WHERE id = $1 AND tenant_id = $2 FOR UPDATE', [identity.lead_id, identity.tenant_id])).rows[0];
    if (!lead) throw new Error('Lead not found.');
    if (lead.do_not_call) throw new Error('This lead opted out. Do not record a sale or meeting.');
    const session = (await client.query('SELECT * FROM ai_call_sessions WHERE id = $1 FOR UPDATE', [sessionId])).rows[0];
    if (session.outcome === 'do_not_call' || session.outcome === 'not_interested') {
      throw new Error('This call already has a refusal or opt-out result. Do not record a sale or meeting.');
    }

    let meetingIso = null;
    if (closeOutcome === 'meeting_booked') {
      const date = meetingAt ? new Date(meetingAt) : null;
      if (!date || !Number.isFinite(date.getTime()) || date.getTime() <= Date.now() + 60000 || !meetingTimezone) {
        throw new Error('Meeting not saved. Confirm an exact future date, time and timezone, then call save_close_result again.');
      }
      try { new Intl.DateTimeFormat('en', { timeZone: meetingTimezone }); } catch { throw new Error('Invalid meeting timezone.'); }
      meetingIso = date.toISOString();
    }
    const value = dealValue === null || dealValue === undefined || dealValue === '' ? null : Number(dealValue);
    const safeValue = Number.isFinite(value) && value >= 0 && value < 1e7 ? Math.round(value * 100) / 100 : null;
    const cleanNote = String(note || '').slice(0, 2000);

    // Stage: meeting -> demo_scheduled. Verbal yes / needs human stay "interested"
    // (no proposal or payment has been sent yet); never downgrade an advanced stage.
    const advanced = advancedStages.has(lead.lead_stage);
    const stage = closeOutcome === 'meeting_booked'
      ? (lead.lead_stage === 'proposal_sent' || lead.lead_stage === 'closed_won' ? lead.lead_stage : 'demo_scheduled')
      : (advanced ? lead.lead_stage : 'interested');

    const raw = { ...(lead.raw_data || {}), ai_outcome: 'interested', ai_outcome_source: 'closer_tool',
      close_status: closeOutcome, close_status_at: new Date().toISOString() };
    if (email) { raw.email = email; raw.email_source = 'closer_tool'; }
    if (contactName) raw.contact_name = contactName;

    const existingNotes = String(lead.lead_notes || '');
    const notes = [existingNotes];
    const tagged = cleanNote ? `[AI Closer · ${closeOutcome}] ${cleanNote}` : `[AI Closer · ${closeOutcome}]`;
    if (!('\n' + existingNotes + '\n').includes('\n' + tagged + '\n')) notes.push(tagged);

    await client.query(`UPDATE enrichment_results SET lead_stage = $1, raw_data = $2,
        primary_email = COALESCE($3, primary_email), lead_notes = $4,
        meeting_at = COALESCE($5, meeting_at), meeting_timezone = COALESCE($6, meeting_timezone),
        deal_value = COALESCE($7, deal_value), deal_currency = CASE WHEN $7::numeric IS NULL THEN deal_currency ELSE COALESCE(deal_currency, 'USD') END,
        ai_summary = $8, last_contacted_at = NOW(), ai_updated_at = NOW()
      WHERE id = $9 AND tenant_id = $10`,
    [stage, JSON.stringify(raw), email, notes.filter(Boolean).join('\n'), meetingIso, meetingTimezone || null,
      safeValue, cleanNote || lead.ai_summary, lead.id, lead.tenant_id]);

    const details = { ...(session.result_details || {}), outcome: 'interested', close_outcome: closeOutcome,
      meeting_at: meetingIso, meeting_timezone: meetingTimezone || null, deal_value: safeValue };
    // Session outcome stays in the shared vocabulary so finalizers keep "interested".
    await client.query(`UPDATE ai_call_sessions SET outcome = CASE WHEN outcome = 'followup' THEN outcome ELSE 'interested' END,
        summary = COALESCE(NULLIF($1, ''), summary), result_details = $2 WHERE id = $3`,
    [cleanNote, JSON.stringify(details), sessionId]);

    await client.query(`INSERT INTO ai_close_events (tenant_id, lead_id, session_id, event_type, payload)
      VALUES ($1, $2, $3, $4, $5)`,
    [lead.tenant_id, lead.id, sessionId, closeOutcome === 'meeting_booked' ? 'meeting_booked' : 'close_result',
      JSON.stringify({ close_outcome: closeOutcome, meeting_at: meetingIso, meeting_timezone: meetingTimezone || null,
        deal_value: safeValue, note: cleanNote, email: email || null })]);

    const company = lead.company_name || lead.domain || 'Lead';
    const taskTitle = closeOutcome === 'meeting_booked' ? `AI Closer meeting: ${company}`
      : closeOutcome === 'verbal_yes' ? `AI Closer verbal yes — send agreement/payment: ${company}`
        : `AI Closer — human callback requested: ${company}`;
    const due = meetingIso || new Date().toISOString();
    const existing = (await client.query(`SELECT id FROM tasks WHERE tenant_id = $1 AND lead_id = $2 AND status = 'open' AND title = $3 LIMIT 1 FOR UPDATE`,
      [lead.tenant_id, lead.id, taskTitle])).rows[0];
    if (existing) await client.query('UPDATE tasks SET due_at = $1, description = $2 WHERE id = $3', [due, tagged, existing.id]);
    else await client.query(`INSERT INTO tasks (tenant_id, lead_id, title, description, task_type, due_at, status, priority)
      VALUES ($1, $2, $3, $4, 'followup', $5, 'open', 'high')`, [lead.tenant_id, lead.id, taskTitle, tagged, due]);

    await client.query('COMMIT');
    const spoken = closeOutcome === 'meeting_booked'
      ? 'Meeting time saved in the CRM. You may confirm the time back to the prospect and say the team will send the calendar invite. Do not say an invite was already sent.'
      : closeOutcome === 'verbal_yes'
        ? 'Decision saved. Say the team will send the agreement and payment details shortly. Do not say anything was already sent or charged.'
        : 'Request saved. Say a team member will call them back personally. Do not promise an exact time unless the prospect confirmed one.';
    return { ok: true, saved: true, close_outcome: closeOutcome, stage, meeting_at: meetingIso, instructions: spoken };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
