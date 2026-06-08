import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { tasksApi, Task } from '../services/crmApi';

// Unified task / follow-up queue across all leads.
export default function TasksPage() {
  const nav = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'open' | 'done' | 'all'>('open');
  const [err, setErr] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDue, setNewDue] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params = filter === 'all' ? {} : { status: filter };
      const res = await tasksApi.list(params);
      setTasks(res.tasks);
      setErr('');
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Failed to load tasks');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (t: Task) => {
    const next = t.status === 'open' ? 'done' : 'open';
    const res = await tasksApi.update(t.id, { status: next });
    setTasks(tasks.map((x) => (x.id === t.id ? res.task : x)));
  };

  const remove = async (t: Task) => {
    if (!confirm('Delete this task?')) return;
    await tasksApi.remove(t.id);
    setTasks(tasks.filter((x) => x.id !== t.id));
  };

  const add = async () => {
    if (!newTitle.trim()) return;
    const res = await tasksApi.create({
      title: newTitle.trim(),
      due_at: newDue || null,
    });
    setTasks([res.task, ...tasks]);
    setNewTitle(''); setNewDue('');
  };

  const overdue = (t: Task) => t.status === 'open' && t.due_at && new Date(t.due_at) < new Date();

  return (
    <div style={{ fontFamily: 'Manrope, sans-serif', maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#14202B', margin: 0 }}>Tasks & Follow-ups</h1>
          <p style={{ fontSize: 13, color: '#52606D', margin: '4px 0 0' }}>
            {tasks.length} {filter === 'all' ? 'total' : filter} tasks
          </p>
        </div>
        <div style={{ display: 'flex', gap: 4, background: '#F3F4F6', padding: 3, borderRadius: 8 }}>
          {(['open', 'done', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6,
                border: 'none', cursor: 'pointer',
                background: filter === f ? '#0F766E' : 'transparent',
                color: filter === f ? '#fff' : '#52606D',
                textTransform: 'capitalize',
              }}
            >{f}</button>
          ))}
        </div>
      </div>

      {err && (
        <div style={{ padding: 10, marginBottom: 12, background: '#FEE2E2', color: '#991B1B', borderRadius: 8, fontSize: 12 }}>{err}</div>
      )}

      <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 10, padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#52606D', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>New task</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="What needs doing?"
            style={{ flex: 1, padding: '8px 10px', border: '1px solid #D8E1D7', borderRadius: 6, fontSize: 13 }}
          />
          <input
            type="datetime-local"
            value={newDue}
            onChange={(e) => setNewDue(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid #D8E1D7', borderRadius: 6, fontSize: 12 }}
          />
          <button onClick={() => void add()}
            style={{ padding: '8px 16px', background: '#0F766E', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Add
          </button>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 10 }}>
        {loading && <div style={{ padding: 20, color: '#7B8794' }}>Loading…</div>}
        {!loading && tasks.length === 0 && (
          <div style={{ padding: 30, textAlign: 'center', color: '#B0BEC5', fontSize: 13 }}>No tasks.</div>
        )}
        {tasks.map((t) => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: 12, borderBottom: '1px solid #F0F1EC',
          }}>
            <input
              type="checkbox"
              checked={t.status === 'done'}
              onChange={() => void toggle(t)}
              style={{ width: 16, height: 16 }}
            />
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: 14,
                fontWeight: 500,
                color: t.status === 'done' ? '#B0BEC5' : '#14202B',
                textDecoration: t.status === 'done' ? 'line-through' : undefined,
              }}>{t.title}</div>
              <div style={{ fontSize: 11, color: overdue(t) ? '#B91C1C' : '#7B8794', marginTop: 2 }}>
                {t.due_at ? `Due ${new Date(t.due_at).toLocaleString()}` : 'No due date'}
                {t.task_type && t.task_type !== 'followup' && ` · ${t.task_type}`}
                {overdue(t) && ' · OVERDUE'}
              </div>
            </div>
            {t.lead_id && (
              <button
                onClick={() => nav(`/pipeline/${t.lead_id}`)}
                style={{ fontSize: 11, color: '#0F766E', background: 'none', border: 'none', cursor: 'pointer' }}
              >Open lead →</button>
            )}
            <button
              onClick={() => void remove(t)}
              style={{ fontSize: 11, color: '#B91C1C', background: 'none', border: 'none', cursor: 'pointer' }}
              title="Delete"
            >✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}
