import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  leadsApi, Lead, Task, PIPELINE_STAGES, STAGE_LABELS, Stage, aiApi, tasksApi,
} from '../services/crmApi';

// Detail view for a single pipeline lead. Shows enrichment data,
// social links (read-only), AI summary + generation, notes, tasks.
export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [lead, setLead] = useState<Lead | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [savingField, setSavingField] = useState<string>('');
  const [aiBusy, setAiBusy] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [msgChannel, setMsgChannel] = useState<'email' | 'call' | 'linkedin'>('email');
  const [msgText, setMsgText] = useState('');

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await leadsApi.get(id);
      setLead(res.lead);
      setTasks(res.tasks || []);
      setErr('');
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Failed to load lead');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = async (field: keyof Lead, value: any) => {
    if (!lead) return;
    setSavingField(field as string);
    try {
      const res = await leadsApi.patch(lead.id, { [field]: value } as any);
      setLead(res.lead);
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Save failed');
    } finally { setSavingField(''); }
  };

  const generateAi = async () => {
    if (!lead) return;
    setAiBusy(true);
    try {
      const res = await aiApi.leadSummary(lead.id);
      setLead({
        ...lead,
        ai_summary: res.summary,
        ai_pain_points: res.pain_points,
        ai_score: res.score,
        ai_updated_at: new Date().toISOString(),
      });
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'AI generation failed');
    } finally { setAiBusy(false); }
  };

  const generateMessage = async () => {
    if (!lead) return;
    setAiBusy(true);
    try {
      const res = await aiApi.generateMessage(lead.id, msgChannel);
      setMsgText(res.text);
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Generation failed');
    } finally { setAiBusy(false); }
  };

  const addTask = async () => {
    if (!lead || !newTaskTitle.trim()) return;
    const res = await tasksApi.create({
      lead_id: lead.id,
      title: newTaskTitle.trim(),
      due_at: newTaskDue || null,
    });
    setTasks([res.task, ...tasks]);
    setNewTaskTitle(''); setNewTaskDue('');
  };

  const toggleTask = async (t: Task) => {
    const next = t.status === 'open' ? 'done' : 'open';
    const res = await tasksApi.update(t.id, { status: next });
    setTasks(tasks.map((x) => (x.id === t.id ? res.task : x)));
  };

  if (loading) return <div style={{ padding: 20, color: '#7B8794' }}>Loading…</div>;
  if (err && !lead) return <div style={{ padding: 20, color: '#B91C1C' }}>{err}</div>;
  if (!lead) return null;

  const socials: [string, string | null][] = [
    ['LinkedIn', lead.linkedin_url],
    ['Facebook', lead.facebook_url],
    ['Instagram', lead.instagram_url],
    ['Twitter/X', lead.twitter_url],
    ['YouTube', lead.youtube_url],
    ['TikTok', lead.tiktok_url],
    ['WhatsApp', lead.whatsapp_link],
  ];

  return (
    <div style={{ fontFamily: 'Manrope, sans-serif', maxWidth: 1100 }}>
      <button
        onClick={() => nav('/pipeline')}
        style={{ background: 'none', border: 'none', fontSize: 13, color: '#0F766E', cursor: 'pointer', padding: 0, marginBottom: 12 }}
      >
        ← Back to Pipeline
      </button>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#14202B', margin: 0 }}>
            {lead.company_name || lead.domain}
          </h1>
          <div style={{ fontSize: 12, color: '#7B8794', fontFamily: 'JetBrains Mono, monospace', marginTop: 4 }}>
            {lead.domain}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 11, color: '#52606D' }}>Stage</label>
          <select
            value={lead.lead_stage}
            disabled={savingField === 'lead_stage'}
            onChange={(e) => void patch('lead_stage', e.target.value as Stage)}
            style={{ padding: '6px 8px', border: '1px solid #D8E1D7', borderRadius: 6, fontSize: 12, background: '#fff' }}
          >
            {PIPELINE_STAGES.map((s) => (
              <option key={s} value={s}>{STAGE_LABELS[s]}</option>
            ))}
          </select>
        </div>
      </div>

      {err && (
        <div style={{ padding: 10, marginBottom: 12, background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: 8, fontSize: 12 }}>
          {err}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Section title="Business">
            <Grid>
              <Field label="Company" value={lead.company_name} />
              <Field label="Industry" value={lead.industry_guess} />
              <Field label="Email" value={lead.primary_email} mono />
              <Field label="Phone" value={lead.primary_phone} mono />
              <Field label="CMS" value={(lead as any).cms_guess} />
              <Field label="Confidence" value={lead.confidence_level} />
            </Grid>
            {lead.one_line_pitch && (
              <div style={{ marginTop: 10, padding: 10, background: '#F8FAF7', borderRadius: 8, fontSize: 13, color: '#14202B', fontStyle: 'italic' }}>
                "{lead.one_line_pitch}"
              </div>
            )}
          </Section>

          <Section title="Social Profiles (collect-only)">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {socials.map(([label, url]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#F8FAF7', border: '1px solid #D8E1D7', borderRadius: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#52606D' }}>{label}</span>
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#0F766E', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {url.replace(/^https?:\/\//, '')}
                    </a>
                  ) : (
                    <span style={{ fontSize: 11, color: '#B0BEC5' }}>—</span>
                  )}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10, color: '#7B8794', marginTop: 8 }}>
              Social profiles and emails are collected for context only — this platform does not auto-send social or email messages.
            </div>
          </Section>

          <Section title="AI Sales Intelligence">
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button onClick={generateAi} disabled={aiBusy} style={btnPrimary}>
                {aiBusy ? '…' : lead.ai_summary ? 'Regenerate summary' : 'Generate summary'}
              </button>
              {lead.ai_score != null && (
                <div style={{ padding: '6px 10px', background: '#EEF2EA', borderRadius: 6, fontSize: 11, fontWeight: 700, color: '#0F766E' }}>
                  Score: {lead.ai_score}/100
                </div>
              )}
            </div>
            {lead.ai_summary && (
              <div style={{ padding: 10, background: '#F8FAF7', borderRadius: 8, fontSize: 12, color: '#14202B', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Summary</div>
                {lead.ai_summary}
                {lead.ai_pain_points && (
                  <>
                    <div style={{ fontWeight: 700, marginTop: 10, marginBottom: 4 }}>Pain points</div>
                    {lead.ai_pain_points}
                  </>
                )}
              </div>
            )}
            <div style={{ marginTop: 12, padding: 10, border: '1px dashed #D8E1D7', borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#52606D', marginBottom: 6 }}>Draft message</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                {(['email', 'call', 'linkedin'] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setMsgChannel(c)}
                    style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      border: '1px solid #D8E1D7',
                      background: msgChannel === c ? '#0F766E' : '#fff',
                      color: msgChannel === c ? '#fff' : '#52606D',
                      cursor: 'pointer',
                    }}
                  >{c}</button>
                ))}
                <button onClick={generateMessage} disabled={aiBusy} style={{ ...btnSecondary, marginLeft: 'auto' }}>
                  Draft
                </button>
              </div>
              {msgText && (
                <textarea
                  value={msgText}
                  onChange={(e) => setMsgText(e.target.value)}
                  rows={6}
                  style={{ width: '100%', padding: 8, border: '1px solid #D8E1D7', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', resize: 'vertical' }}
                />
              )}
            </div>
          </Section>

          <Section title="Notes">
            <textarea
              defaultValue={lead.lead_notes || ''}
              rows={5}
              onBlur={(e) => void patch('lead_notes', e.target.value)}
              placeholder="Call notes, observations, next steps…"
              style={{ width: '100%', padding: 10, border: '1px solid #D8E1D7', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
            />
            <div style={{ fontSize: 10, color: '#7B8794', marginTop: 4 }}>Saves on blur.</div>
          </Section>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Section title="Tasks & Follow-ups">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              <input
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="New task…"
                style={{ padding: '6px 8px', border: '1px solid #D8E1D7', borderRadius: 6, fontSize: 12 }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="datetime-local"
                  value={newTaskDue}
                  onChange={(e) => setNewTaskDue(e.target.value)}
                  style={{ flex: 1, padding: '6px 8px', border: '1px solid #D8E1D7', borderRadius: 6, fontSize: 11 }}
                />
                <button onClick={() => void addTask()} style={btnPrimary}>Add</button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {tasks.length === 0 && (
                <div style={{ fontSize: 11, color: '#B0BEC5' }}>No tasks yet.</div>
              )}
              {tasks.map((t) => (
                <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 6, background: '#F8FAF7', borderRadius: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={t.status === 'done'}
                    onChange={() => void toggleTask(t)}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: t.status === 'done' ? '#B0BEC5' : '#14202B', textDecoration: t.status === 'done' ? 'line-through' : undefined }}>
                      {t.title}
                    </div>
                    {t.due_at && (
                      <div style={{ fontSize: 10, color: '#7B8794' }}>
                        Due {new Date(t.due_at).toLocaleString()}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </Section>

          <Section title="Next follow-up">
            <input
              type="datetime-local"
              defaultValue={lead.next_followup_at ? lead.next_followup_at.slice(0, 16) : ''}
              onBlur={(e) => void patch('next_followup_at', e.target.value || null)}
              style={{ width: '100%', padding: '6px 8px', border: '1px solid #D8E1D7', borderRadius: 6, fontSize: 12 }}
            />
          </Section>

          <Section title="Priority">
            <select
              value={lead.lead_priority || 'medium'}
              onChange={(e) => void patch('lead_priority', e.target.value)}
              style={{ width: '100%', padding: '6px 8px', border: '1px solid #D8E1D7', borderRadius: 6, fontSize: 12, background: '#fff' }}
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#52606D', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>{children}</div>;
}

function Field({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#7B8794', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#14202B', fontFamily: mono ? 'JetBrains Mono, monospace' : 'inherit' }}>
        {value ?? '—'}
      </div>
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  padding: '6px 12px', background: '#0F766E', color: '#fff',
  border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
};
const btnSecondary: React.CSSProperties = {
  padding: '4px 12px', background: '#fff', color: '#0F766E',
  border: '1px solid #0F766E', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
};
