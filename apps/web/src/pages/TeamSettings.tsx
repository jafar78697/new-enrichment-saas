import { useEffect, useMemo, useState } from 'react';
import {
  employeesApi,
  getCallUser,
  type Employee as CallEmployee,
  type TwilioAvailableNumber,
  type PoolNumber,
} from '../services/employeesApi';
import { nichesApi, type Niche } from '../services/nichesApi';
import EmployeeActivityModal from '../components/EmployeeActivityModal';

type Role = 'owner' | 'admin' | 'sdr' | 'analyst' | 'viewer';

const ROLE_DEFS: { key: Role; label: string; caps: string[] }[] = [
  { key: 'owner',   label: 'Owner',   caps: ['Billing', 'Manage team', 'All modules', 'Delete workspace'] },
  { key: 'admin',   label: 'Admin',   caps: ['Manage team', 'All modules'] },
  { key: 'sdr',     label: 'SDR',     caps: ['Dial leads', 'Edit own contacts', 'View own calls'] },
  { key: 'analyst', label: 'Analyst', caps: ['Read-only across modules'] },
  { key: 'viewer',  label: 'Viewer',  caps: ['Read-only'] },
];

// ─── Page ──────────────────────────────────────────────────────────────
export default function TeamSettingsPage() {
  const [employees, setEmployees] = useState<CallEmployee[]>([]);
  const [pool, setPool] = useState<PoolNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showAssign, setShowAssign] = useState<{ employee: CallEmployee } | null>(null);
  const [activityModal, setActivityModal] = useState<{ employee: CallEmployee } | null>(null);
  const [credentialModal, setCredentialModal] = useState<{
    employee: CallEmployee;
    password: string;
    title: string;
  } | null>(null);

  const callUser = getCallUser();
  const callBackendLinked = callUser?.role === 'manager';

  const refresh = async () => {
    if (!callBackendLinked) { setLoading(false); return; }
    try {
      const [{ employees: emps }, poolRes] = await Promise.all([
        employeesApi.list(),
        employeesApi.numbersPool().catch(() => ({ numbers: [] })),
      ]);
      setEmployees(emps);
      setPool(poolRes.numbers);
    } catch (err: any) {
      setStatus({ kind: 'err', msg: err?.message || 'Failed to load employees' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [callBackendLinked]);

  const counts = useMemo(() => {
    const totals = { active: 0, suspended: 0, withNumber: 0 };
    for (const e of employees) {
      if (e.status === 'active') totals.active++;
      else if (e.status === 'suspended') totals.suspended++;
      if (e.signalwire_phone_number) totals.withNumber++;
    }
    return totals;
  }, [employees]);

  // ─── Actions ───────────────────────────────────────────────────────
  const handleResetPassword = async (e: CallEmployee) => {
    if (!confirm(`Reset password for ${e.email}? The current password stops working immediately.`)) return;
    try {
      const { generatedPassword } = await employeesApi.resetPassword(e.id);
      setCredentialModal({ employee: e, password: generatedPassword, title: 'New password generated' });
    } catch (err: any) {
      setStatus({ kind: 'err', msg: err?.message || 'Reset failed' });
    }
  };

  const handleRelease = async (e: CallEmployee) => {
    if (!confirm(`Release ${e.signalwire_phone_number} from ${e.email}? It returns to your Twilio pool but stays purchased.`)) return;
    try {
      await employeesApi.releaseNumber(e.id);
      setStatus({ kind: 'ok', msg: `Number released from ${e.email}` });
      refresh();
    } catch (err: any) {
      setStatus({ kind: 'err', msg: err?.message || 'Release failed' });
    }
  };

  const handleSuspend = async (e: CallEmployee) => {
    const target = e.status === 'suspended' ? 'active' : 'suspended';
    try {
      await employeesApi.setStatus(e.id, target);
      setStatus({ kind: 'ok', msg: `${e.email} ${target === 'suspended' ? 'suspended' : 'reactivated'}` });
      refresh();
    } catch (err: any) {
      setStatus({ kind: 'err', msg: err?.message || 'Status change failed' });
    }
  };

  const handleRemove = async (e: CallEmployee) => {
    const msg = e.signalwire_phone_number
      ? `Remove ${e.email}? Their access is revoked. The Twilio number ${e.signalwire_phone_number} stays purchased and returns to your pool so you can assign it to a new employee.`
      : `Remove ${e.email}? Their access is revoked permanently.`;
    if (!confirm(msg)) return;
    try {
      const resp = await employeesApi.remove(e.id);
      const note = resp?.numberReturnedToPool
        ? ` · ${resp.numberReturnedToPool.phoneNumber} back in pool`
        : '';
      setStatus({ kind: 'ok', msg: `${e.email} removed${note}` });
      refresh();
    } catch (err: any) {
      setStatus({ kind: 'err', msg: err?.message || 'Remove failed' });
    }
  };

  const handleViewActivity = (e: CallEmployee) => {
    setActivityModal({ employee: e });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: '#14202B', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700 }}>
            Team & Permissions
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#52606D' }}>
            {employees.length} member{employees.length === 1 ? '' : 's'} ·{' '}
            {counts.active} active · {counts.withNumber} with number
            {callBackendLinked
              ? <span style={{ marginLeft: 8, padding: '2px 8px', background: '#EDE9FE', color: '#5B21B6', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>Call-center linked</span>
              : <span style={{ marginLeft: 8, padding: '2px 8px', background: '#FEF3C7', color: '#92400E', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>Sign in via /call-login first</span>
            }
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          disabled={!callBackendLinked}
          style={{
            padding: '9px 16px', borderRadius: 8, border: 'none',
            background: callBackendLinked ? '#0F766E' : '#CBD5E1', color: '#fff',
            fontSize: 13, fontWeight: 600,
            cursor: callBackendLinked ? 'pointer' : 'not-allowed',
          }}
        >
          + Add employee
        </button>
      </div>

      {status && (
        <div style={{
          padding: 10,
          background: status.kind === 'ok' ? '#F0FDF4' : '#FEF2F2',
          border: '1px solid ' + (status.kind === 'ok' ? '#BBF7D0' : '#FECACA'),
          borderRadius: 8,
          color: status.kind === 'ok' ? '#166534' : '#B91C1C',
          fontSize: 13,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
        }}>
          <span>{status.msg}</span>
          <button onClick={() => setStatus(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 16 }}>×</button>
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: 12, fontSize: 13, fontWeight: 600, color: '#14202B', borderBottom: '1px solid #EEF2EA' }}>
          Members
        </div>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#7B8794', fontSize: 13 }}>Loading…</div>
        ) : employees.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#7B8794', fontSize: 13 }}>
            No employees yet. Click <b>+ Add employee</b> to create one.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#FBFBF8', textAlign: 'left', color: '#52606D' }}>
                <th style={th}>Member</th>
                <th style={th}>Niches</th>
                <th style={th}>US Number</th>
                <th style={th}>Status</th>
                <th style={th}>Calls</th>
                <th style={th}>Last login</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id} style={{ borderTop: '1px solid #EEF2EA' }}>
                  <td style={td}>
                    <div style={{ fontWeight: 600, color: '#14202B' }}>{e.name}</div>
                    <div style={{ fontSize: 11, color: '#7B8794' }}>{e.email}</div>
                  </td>
                  <td style={td}>
                    {e.assigned_niches && e.assigned_niches.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {e.assigned_niches.map(niche => (
                          <span key={niche.id} style={{
                            fontSize: 10, padding: '2px 6px', borderRadius: 4,
                            background: '#F0FDF4', color: '#166534', fontWeight: 600
                          }}>
                            {niche.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: '#7B8794' }}>No niches</span>
                    )}
                  </td>
                  <td style={{ ...td, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
                    {e.signalwire_phone_number ? (
                      <span>{e.signalwire_phone_number}</span>
                    ) : (
                      <span style={{ color: '#B45309', fontSize: 11, fontFamily: 'Manrope, sans-serif' }}>Not assigned</span>
                    )}
                  </td>
                  <td style={td}>
                    <span style={{
                      fontSize: 11,
                      color: e.status === 'active' ? '#0F766E' : e.status === 'pending' ? '#B45309' : '#B91C1C',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: 0.4,
                    }}>
                      {e.status}
                    </span>
                  </td>
                  <td style={{ ...td, color: '#52606D', fontSize: 12 }}>
                    {e.total_calls || 0}
                    {e.connected_calls > 0 && <span style={{ color: '#7B8794' }}> ({e.connected_calls} connected)</span>}
                  </td>
                  <td style={{ ...td, color: '#7B8794', fontSize: 12 }}>
                    {e.last_login_at ? new Date(e.last_login_at).toLocaleDateString() : 'never'}
                  </td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => handleViewActivity(e)} style={btn}>Activity</button>
                    {!e.signalwire_phone_number ? (
                      <button onClick={() => setShowAssign({ employee: e })} style={btnPrimary}>Assign number</button>
                    ) : (
                      <button onClick={() => handleRelease(e)} style={btn}>Release</button>
                    )}
                    <button onClick={() => handleResetPassword(e)} style={btn}>Reset pwd</button>
                    <button onClick={() => handleSuspend(e)} style={btn}>{e.status === 'suspended' ? 'Reactivate' : 'Suspend'}</button>
                    <button onClick={() => handleRemove(e)} style={btnDanger}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 10, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#14202B' }}>
            Twilio number pool
          </div>
          <div style={{ fontSize: 12, color: '#7B8794' }}>
            {pool.length} owned · {pool.filter((n) => !n.assigned).length} unassigned
          </div>
        </div>
        {pool.length === 0 ? (
          <div style={{ padding: 14, textAlign: 'center', color: '#7B8794', fontSize: 12 }}>
            No numbers in your Twilio account yet. Click <b>Assign number</b> on an employee row → <b>Buy new</b> to purchase your first DID.
          </div>
        ) : (
          <div style={{ border: '1px solid #EEF2EA', borderRadius: 8, overflow: 'hidden' }}>
            {pool.map((n, i) => (
              <div key={n.sid} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 12px',
                borderTop: i === 0 ? 'none' : '1px solid #F3F4F6',
                background: n.assigned ? '#FBFBF8' : '#F0FDF4',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: '#14202B' }}>
                    {n.phoneNumber}
                  </span>
                  {n.friendlyName && n.friendlyName !== n.phoneNumber && (
                    <span style={{ fontSize: 11, color: '#7B8794' }}>{n.friendlyName}</span>
                  )}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600 }}>
                  {n.assigned ? (
                    <span style={{ color: '#52606D' }}>
                      → {n.assigned.name} <span style={{ color: '#7B8794', fontWeight: 400 }}>({n.assigned.email})</span>
                    </span>
                  ) : (
                    <span style={{ color: '#0F766E' }}>● Available</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#14202B', marginBottom: 12 }}>Role capabilities</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          {ROLE_DEFS.map((r) => (
            <div key={r.key} style={{ padding: 12, background: '#FBFBF8', borderRadius: 8, border: '1px solid #EEF2EA' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#14202B', marginBottom: 6 }}>{r.label}</div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: '#52606D', lineHeight: 1.6 }}>
                {r.caps.map((cap) => (<li key={cap}>{cap}</li>))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {showAdd && (
        <AddEmployeeModal
          onClose={() => setShowAdd(false)}
          onCreated={(employee, password) => {
            setShowAdd(false);
            setCredentialModal({ employee, password, title: 'Employee created' });
            refresh();
          }}
        />
      )}
      {showAssign && (
        <AssignNumberModal
          employee={showAssign.employee}
          onClose={() => setShowAssign(null)}
          onAssigned={() => {
            setShowAssign(null);
            setStatus({ kind: 'ok', msg: 'Number assigned' });
            refresh();
          }}
        />
      )}
      {credentialModal && (
        <CredentialModal
          employee={credentialModal.employee}
          password={credentialModal.password}
          title={credentialModal.title}
          onClose={() => setCredentialModal(null)}
        />
      )}
      {activityModal && (
        <EmployeeActivityModal
          employee={activityModal.employee}
          onClose={() => setActivityModal(null)}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Add employee modal
// ════════════════════════════════════════════════════════════════════════
function AddEmployeeModal({
  onClose, onCreated,
}: {
  onClose: () => void;
  onCreated: (employee: CallEmployee, password: string) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedNiches, setSelectedNiches] = useState<number[]>([]);
  const [niches, setNiches] = useState<Niche[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    nichesApi.list().then(r => setNiches(r.niches)).catch(() => {});
  }, []);

  const submit = async () => {
    setErr(null);
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedName) return setErr('Enter the employee\'s name');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) return setErr('Enter a valid email');
    setBusy(true);
    try {
      const { employee, generatedPassword } = await employeesApi.create({
        name: trimmedName, username: trimmedEmail.split('@')[0],
        nicheIds: selectedNiches.length > 0 ? selectedNiches : undefined,
      });
      onCreated(employee, generatedPassword);
    } catch (e: any) {
      setErr(e?.message || 'Failed to create employee');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title="Add employee" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={labelStyle}>
          <span style={labelHint}>Full name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sarah Khan" style={input} autoFocus />
        </label>
        <label style={labelStyle}>
          <span style={labelHint}>Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sarah@company.com" type="email" style={input} />
        </label>
        <label style={labelStyle}>
          <span style={labelHint}>Assign Niches (Optional)</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 120, overflow: 'auto', padding: 8, background: '#fff', border: '1px solid #D8E1D7', borderRadius: 6 }}>
            {niches.length === 0 ? (
              <div style={{ fontSize: 12, color: '#7B8794' }}>No niches available. Create niches first.</div>
            ) : (
              niches.map(niche => (
                <label key={niche.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                  <input 
                    type="checkbox"
                    checked={selectedNiches.includes(niche.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedNiches(prev => [...prev, niche.id]);
                      } else {
                        setSelectedNiches(prev => prev.filter(id => id !== niche.id));
                      }
                    }}
                  />
                  {niche.name} ({niche.contact_count} leads)
                </label>
              ))
            )}
          </div>
        </label>
        <div style={{ padding: 10, background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 8, fontSize: 12, color: '#075985' }}>
          A 16-character password will be generated and shown <b>once</b>. Copy it before closing — for security it cannot be retrieved later. You can always reset to a new one.
        </div>
        <div style={{ padding: 10, background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 8, fontSize: 12, color: '#92400E' }}>
          The Twilio number is assigned in the next step — no charge happens here.
        </div>
        {err && <div style={{ color: '#B91C1C', fontSize: 12 }}>{err}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button onClick={onClose} style={btnGhost} disabled={busy}>Cancel</button>
          <button onClick={submit} disabled={busy} style={btnPrimaryWide(busy)}>
            {busy ? 'Creating…' : 'Create employee'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Assign number modal — pool + buy-new in tabs
// ════════════════════════════════════════════════════════════════════════
function AssignNumberModal({
  employee, onClose, onAssigned,
}: {
  employee: CallEmployee;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [tab, setTab] = useState<'pool' | 'buy'>('pool');
  const [pool, setPool] = useState<{ sid: string; phoneNumber: string; assigned: { agent_id: number; name: string } | null }[]>([]);
  const [poolLoading, setPoolLoading] = useState(true);
  const [areaCode, setAreaCode] = useState('');
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<TwilioAvailableNumber[]>([]);
  const [picked, setPicked] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    employeesApi.numbersPool().then((r) => {
      setPool(r.numbers);
      setPoolLoading(false);
    }).catch(() => setPoolLoading(false));
  }, []);

  const unassignedPool = pool.filter((n) => !n.assigned);

  const doSearch = async () => {
    setErr(null); setSearching(true); setCandidates([]);
    try {
      const { numbers } = await employeesApi.searchNumbers({
        areaCode: areaCode.trim() || undefined, limit: 10,
      });
      setCandidates(numbers);
      if (numbers.length > 0) setPicked(numbers[0].phoneNumber);
      if (numbers.length === 0) setErr('No numbers matched. Try a different area code.');
    } catch (e: any) {
      setErr(e?.message || 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const assignFromPool = async (sid: string) => {
    setBusy(true); setErr(null);
    try {
      await employeesApi.assignNumber(employee.id, { signalwireSid: sid });
      onAssigned();
    } catch (e: any) {
      setErr(e?.message || 'Assign failed');
    } finally { setBusy(false); }
  };

  const buyAndAssign = async () => {
    if (!picked) return setErr('Pick a number first');
    setBusy(true); setErr(null);
    try {
      await employeesApi.assignNumber(employee.id, { phoneNumber: picked });
      onAssigned();
    } catch (e: any) {
      setErr(e?.message || 'Purchase + assign failed');
    } finally { setBusy(false); }
  };

  return (
    <ModalShell title={`Assign number to ${employee.name}`} onClose={onClose} wide>
      <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderBottom: '1px solid #EEF2EA' }}>
        <TabBtn active={tab === 'pool'} onClick={() => setTab('pool')}>From pool ({unassignedPool.length} free)</TabBtn>
        <TabBtn active={tab === 'buy'} onClick={() => setTab('buy')}>Buy new (~$1.15/mo)</TabBtn>
      </div>

      {tab === 'pool' ? (
        <div>
          {poolLoading ? (
            <div style={{ padding: 16, textAlign: 'center', color: '#7B8794' }}>Loading pool…</div>
          ) : unassignedPool.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: '#7B8794', fontSize: 13 }}>
              No unassigned numbers in your pool. Switch to <b>Buy new</b> to purchase one.
            </div>
          ) : (
            <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid #EEF2EA', borderRadius: 8 }}>
              {unassignedPool.map((n) => (
                <div key={n.sid} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 12px', borderBottom: '1px solid #F3F4F6',
                }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>{n.phoneNumber}</span>
                  <button onClick={() => assignFromPool(n.sid)} disabled={busy} style={btnPrimary}>
                    {busy ? '…' : 'Assign'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={areaCode}
              onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
              placeholder="Area code (e.g. 415)"
              style={{ ...input, flex: 1 }}
            />
            <button onClick={doSearch} disabled={searching} style={btnPrimary}>
              {searching ? 'Searching…' : 'Search'}
            </button>
          </div>
          {candidates.length > 0 && (
            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #EEF2EA', borderRadius: 8 }}>
              {candidates.map((n) => (
                <label key={n.phoneNumber} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                  borderBottom: '1px solid #F3F4F6',
                  background: picked === n.phoneNumber ? '#F5F3FF' : 'transparent',
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="radio" name="pick" checked={picked === n.phoneNumber} onChange={() => setPicked(n.phoneNumber)} />
                    <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{n.phoneNumber}</span>
                  </span>
                  <span style={{ fontSize: 11, color: '#7B8794' }}>
                    {[n.locality, n.region].filter(Boolean).join(', ') || 'US'}
                  </span>
                </label>
              ))}
            </div>
          )}
          {candidates.length > 0 && (
            <button onClick={buyAndAssign} disabled={busy || !picked} style={btnPrimaryWide(busy)}>
              {busy ? 'Processing…' : `Buy ${picked} & assign`}
            </button>
          )}
        </div>
      )}

      {err && <div style={{ marginTop: 12, color: '#B91C1C', fontSize: 12 }}>{err}</div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button onClick={onClose} style={btnGhost}>Close</button>
      </div>
    </ModalShell>
  );
}

// ════════════════════════════════════════════════════════════════════════
// One-time credential reveal modal
// ════════════════════════════════════════════════════════════════════════
function CredentialModal({
  employee, password, title, onClose,
}: {
  employee: CallEmployee;
  password: string;
  title: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<'pwd' | 'all' | null>(null);

  const copy = (text: string, key: 'pwd' | 'all') => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const fullBlock = `JentoAI sign-in for ${employee.name}\n\nLogin URL: https://app.jentoai.pro/call-login\nEmail:     ${employee.email}\nPassword:  ${password}\n\nThis password is shown once. Sign in and consider changing it.`;

  return (
    <ModalShell title={title} onClose={onClose} wide>
      <div style={{
        padding: 14, background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 8,
        fontSize: 13, color: '#92400E', marginBottom: 14,
      }}>
        ⚠️ <b>Copy this password now.</b> It is shown once and cannot be retrieved later. If you lose it, click <i>Reset pwd</i> on the member row to generate a new one.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 12px', fontSize: 13, marginBottom: 14 }}>
        <span style={{ color: '#7B8794' }}>Name</span><span style={{ fontWeight: 600 }}>{employee.name}</span>
        <span style={{ color: '#7B8794' }}>Email</span><span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{employee.email}</span>
        <span style={{ color: '#7B8794' }}>Login URL</span><span style={{ fontFamily: 'JetBrains Mono, monospace' }}>https://app.jentoai.pro/call-login</span>
      </div>

      <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: '#52606D' }}>Generated password</div>
      <div style={{
        display: 'flex', gap: 8, padding: 12, background: '#0F172A', borderRadius: 8,
        fontFamily: 'JetBrains Mono, monospace', fontSize: 18, color: '#86efac',
        letterSpacing: 1.5, justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>{password}</span>
        <button onClick={() => copy(password, 'pwd')} style={{
          padding: '6px 12px', borderRadius: 6, border: '1px solid #334155',
          background: '#1E293B', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>
          {copied === 'pwd' ? '✓ Copied' : 'Copy'}
        </button>
      </div>

      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => copy(fullBlock, 'all')} style={btn}>
          {copied === 'all' ? '✓ Copied full block' : 'Copy full sign-in block'}
        </button>
        <button onClick={onClose} style={btnPrimaryWide(false)}>I've saved it — close</button>
      </div>
    </ModalShell>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════════
function ModalShell({ title, onClose, children, wide }: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 12, padding: 20,
        width: '100%', maxWidth: wide ? 560 : 440,
        boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 17, color: '#14202B', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700 }}>
            {title}
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 22, color: '#7B8794' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 16px', border: 'none', background: 'transparent',
      borderBottom: '2px solid ' + (active ? '#0F766E' : 'transparent'),
      color: active ? '#0F766E' : '#52606D', fontWeight: active ? 700 : 500,
      cursor: 'pointer', fontSize: 13,
    }}>{children}</button>
  );
}

const btnPrimaryWide = (busy: boolean): React.CSSProperties => ({
  padding: '9px 18px', borderRadius: 8, border: 'none',
  background: busy ? '#6B9E9A' : '#0F766E', color: '#fff',
  fontSize: 13, fontWeight: 600,
  cursor: busy ? 'not-allowed' : 'pointer',
});

// ─── Styles ────────────────────────────────────────────────────────────
const th: React.CSSProperties = { padding: '10px 12px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3 };
const td: React.CSSProperties = { padding: '10px 12px', color: '#14202B' };
const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#14202B' };
const labelHint: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#52606D' };
const input: React.CSSProperties = {
  padding: '9px 12px', borderRadius: 8, border: '1px solid #D8E1D7',
  fontSize: 13, background: '#fff', color: '#14202B', outline: 'none',
  fontFamily: 'Manrope, sans-serif',
};
const btn: React.CSSProperties = {
  padding: '5px 10px', marginLeft: 6, borderRadius: 6,
  border: '1px solid #D8E1D7', background: '#fff', color: '#52606D',
  fontSize: 11, cursor: 'pointer',
};
const btnPrimary: React.CSSProperties = {
  ...btn, background: '#0F766E', color: '#fff', borderColor: '#0F766E',
};
const btnGhost: React.CSSProperties = {
  padding: '9px 16px', borderRadius: 8, border: '1px solid #D8E1D7',
  background: '#fff', color: '#52606D', fontSize: 13, cursor: 'pointer',
};
const btnDanger: React.CSSProperties = {
  ...btn, background: '#fff', color: '#B91C1C', borderColor: '#FECACA',
};
