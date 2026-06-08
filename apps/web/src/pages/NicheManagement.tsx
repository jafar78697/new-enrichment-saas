import React, { useEffect, useState } from 'react';
import { nichesApi, type Niche } from '../services/nichesApi';
import { employeesApi, type Employee } from '../services/employeesApi';

export default function NicheManagementPage() {
  const [niches, setNiches] = useState<Niche[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const refresh = async () => {
    try {
      const [{ niches: nList }, { employees: eList }] = await Promise.all([
        nichesApi.list(),
        employeesApi.list().catch(() => ({ employees: [] }))
      ]);
      setNiches(nList);
      setEmployees(eList);
    } catch (err: any) {
      setStatus({ kind: 'err', msg: err?.message || 'Failed to load niches' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleAssign = async (nicheId: number, agentId: string) => {
    try {
      await nichesApi.assign(nicheId, agentId === 'none' ? null : Number(agentId));
      setStatus({ kind: 'ok', msg: 'Assignment updated' });
      refresh();
    } catch (err: any) {
      setStatus({ kind: 'err', msg: err?.message || 'Assignment failed' });
    }
  };

  const handleDelete = async (niche: Niche) => {
    if (!confirm(`Delete niche "${niche.name}"? Leads will remain but become unassigned to any niche.`)) return;
    try {
      await nichesApi.delete(niche.id);
      setStatus({ kind: 'ok', msg: 'Niche deleted' });
      refresh();
    } catch (err: any) {
      setStatus({ kind: 'err', msg: err?.message || 'Delete failed' });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: '#14202B', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700 }}>
            Niche Management
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#52606D' }}>
            Organize leads into niches and assign them to employees.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          style={{
            padding: '9px 16px', borderRadius: 8, border: 'none',
            background: '#0F766E', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer'
          }}
        >
          + Create Niche
        </button>
      </div>

      {status && (
        <div style={{
          padding: 10, background: status.kind === 'ok' ? '#F0FDF4' : '#FEF2F2',
          border: '1px solid ' + (status.kind === 'ok' ? '#BBF7D0' : '#FECACA'),
          borderRadius: 8, color: status.kind === 'ok' ? '#166534' : '#B91C1C', fontSize: 13,
          display: 'flex', justifyContent: 'space-between'
        }}>
          <span>{status.msg}</span>
          <button onClick={() => setStatus(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }}>×</button>
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 10, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#7B8794' }}>Loading niches...</div>
        ) : niches.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#7B8794' }}>No niches found.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#FBFBF8', textAlign: 'left', color: '#52606D', borderBottom: '1px solid #EEF2EA' }}>
                <th style={th}>Niche Name</th>
                <th style={th}>Assigned Employee</th>
                <th style={th}>Leads</th>
                <th style={th}>Status</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {niches.map((n) => (
                <tr key={n.id} style={{ borderBottom: '1px solid #EEF2EA' }}>
                  <td style={td}>
                    <div style={{ fontWeight: 600, color: '#14202B' }}>{n.name}</div>
                    <div style={{ fontSize: 11, color: '#7B8794' }}>{n.description || 'No description'}</div>
                  </td>
                  <td style={td}>
                    <select
                      value={n.assigned_agent_id || 'none'}
                      onChange={(e) => handleAssign(n.id, e.target.value)}
                      style={{
                        padding: '4px 8px', borderRadius: 6, border: '1px solid #D8E1D7',
                        fontSize: 12, background: '#fff', color: '#14202B'
                      }}
                    >
                      <option value="none">Unassigned</option>
                      {employees.map(e => (
                        <option key={e.id} value={e.id}>{e.name} ({e.email})</option>
                      ))}
                    </select>
                  </td>
                  <td style={td}>
                    <span style={{ fontWeight: 600 }}>{n.contact_count}</span> leads
                  </td>
                  <td style={td}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                      background: n.assigned_agent_id ? '#F0FDF4' : '#FEF2F2',
                      color: n.assigned_agent_id ? '#166534' : '#B91C1C',
                      textTransform: 'uppercase'
                    }}>
                      {n.assigned_agent_id ? 'Active' : 'Unassigned'}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <button onClick={() => handleDelete(n)} style={btnDanger}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <AddNicheModal
          employees={employees}
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            setStatus({ kind: 'ok', msg: 'Niche created successfully' });
            refresh();
          }}
        />
      )}
    </div>
  );
}

function AddNicheModal({ employees, onClose, onCreated }: { employees: Employee[], onClose: () => void, onCreated: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [agentId, setAgentId] = useState<string>('none');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) return setErr('Name is required');
    setBusy(true);
    try {
      await nichesApi.create({
        name: name.trim(),
        description: description.trim() || undefined,
        assigned_agent_id: agentId === 'none' ? null : Number(agentId)
      });
      onCreated();
    } catch (e: any) {
      setErr(e?.message || 'Failed to create niche');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalContent} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 16px', fontSize: 18, color: '#14202B' }}>Create New Niche</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={label}>
            <span>Niche Name</span>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Hair Salons" style={input} />
          </label>
          <label style={label}>
            <span>Description (Optional)</span>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description of this target niche..." style={{ ...input, height: 60 }} />
          </label>
          <label style={label}>
            <span>Assign Employee</span>
            <select value={agentId} onChange={e => setAgentId(e.target.value)} style={input}>
              <option value="none">Keep Unassigned</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </label>
          {err && <div style={{ color: '#B91C1C', fontSize: 12 }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button onClick={onClose} style={btnGhost}>Cancel</button>
            <button onClick={submit} disabled={busy} style={btnPrimary}>
              {busy ? 'Creating...' : 'Create Niche'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: '12px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3 };
const td: React.CSSProperties = { padding: '12px', verticalAlign: 'middle' };
const btnDanger: React.CSSProperties = {
  padding: '5px 10px', borderRadius: 6, border: '1px solid #FECACA',
  background: '#fff', color: '#B91C1C', fontSize: 11, cursor: 'pointer'
};
const btnGhost: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 8, border: '1px solid #D8E1D7',
  background: '#fff', color: '#52606D', fontSize: 13, cursor: 'pointer'
};
const btnPrimary: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 8, border: 'none',
  background: '#0F766E', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer'
};
const modalOverlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
};
const modalContent: React.CSSProperties = {
  background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 20px 50px rgba(0,0,0,0.2)'
};
const label: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#52606D', fontWeight: 600 };
const input: React.CSSProperties = {
  padding: '9px 12px', borderRadius: 8, border: '1px solid #D8E1D7', fontSize: 13, outline: 'none'
};
