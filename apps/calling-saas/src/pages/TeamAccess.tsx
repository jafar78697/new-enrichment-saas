import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Phone,
  Power,
  PowerOff,
  RefreshCw,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { useNotifications } from '../components/Notifications';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

type Employee = {
  id: string;
  display_name: string;
  username: string;
  email?: string | null;
  account_status: 'active' | 'suspended';
  phone_number?: string | null;
  created_at: string;
};

type Capacity = {
  active_numbers: number;
  employee_limit: number;
  employees_used: number;
  employees_available: number;
};

type TeamAccessData = {
  enabled: boolean;
  capacity: Capacity;
  employees: Employee[];
};

type Credentials = {
  username: string;
  temporary_password: string;
  login_url: string;
  must_change_password: boolean;
};

const emptyForm = { first_name: '', last_name: '', email: '' };

export default function TeamAccess() {
  const { notify, confirm } = useNotifications();
  const [data, setData] = useState<TeamAccessData | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [copied, setCopied] = useState(false);

  async function loadTeam() {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/v1/team-access`);
      setData(response.data);
    } catch (error: any) {
      notify(error?.response?.data?.error || 'Team Access could not be loaded.', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTeam();
  }, []);

  async function createEmployee(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await axios.post(`${API_URL}/v1/team-access/employees`, form);
      setCredentials(response.data.credentials);
      setForm(emptyForm);
      notify(`${response.data.employee.display_name} now has employee access.`, 'success');
      await loadTeam();
    } catch (error: any) {
      notify(error?.response?.data?.error || 'Employee access could not be created.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword(employee: Employee) {
    setBusyId(employee.id);
    try {
      const response = await axios.post(`${API_URL}/v1/team-access/employees/${employee.id}/reset-password`);
      setCredentials(response.data.credentials);
      notify(`A new temporary password was generated for ${employee.display_name}.`, 'success');
      await loadTeam();
    } catch (error: any) {
      notify(error?.response?.data?.error || 'Password could not be reset.', 'error');
    } finally {
      setBusyId('');
    }
  }

  async function toggleStatus(employee: Employee) {
    const nextStatus = employee.account_status === 'active' ? 'suspended' : 'active';
    const approved = nextStatus === 'active' || await confirm({
      title: 'Suspend employee access?',
      message: `${employee.display_name} will be signed out and will not be able to use the workspace.`,
      confirmLabel: 'Suspend access',
      destructive: true,
    });
    if (!approved) return;

    setBusyId(employee.id);
    try {
      await axios.patch(`${API_URL}/v1/team-access/employees/${employee.id}/status`, { status: nextStatus });
      notify(nextStatus === 'active' ? 'Employee access restored.' : 'Employee access suspended.', 'success');
      await loadTeam();
    } catch (error: any) {
      notify(error?.response?.data?.error || 'Employee status could not be updated.', 'error');
    } finally {
      setBusyId('');
    }
  }

  async function deleteEmployee(employee: Employee) {
    const approved = await confirm({
      title: 'Delete employee access?',
      message: `${employee.display_name}'s login will be permanently removed. Their phone number will return to your available team pool.`,
      confirmLabel: 'Delete employee',
      destructive: true,
    });
    if (!approved) return;

    setBusyId(employee.id);
    try {
      await axios.delete(`${API_URL}/v1/team-access/employees/${employee.id}`);
      notify('Employee access deleted.', 'success');
      await loadTeam();
    } catch (error: any) {
      notify(error?.response?.data?.error || 'Employee access could not be deleted.', 'error');
    } finally {
      setBusyId('');
    }
  }

  async function copyCredentials() {
    if (!credentials) return;
    await navigator.clipboard.writeText(
      `JentoAI Employee Access\nUsername: ${credentials.username}\nTemporary Password: ${credentials.temporary_password}\nLogin: ${credentials.login_url}\n\nYou will be asked to change your password after signing in.`
    );
    setCopied(true);
    notify('Employee credentials copied.', 'success');
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (loading && !data) {
    return <div className="flex min-h-[50vh] items-center justify-center"><RefreshCw className="animate-spin text-primary" /></div>;
  }

  const capacity = data?.capacity || { active_numbers: 0, employee_limit: 0, employees_used: 0, employees_available: 0 };

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
            <Users size={17} /> Customer Admin
          </div>
          <h1 className="text-3xl font-bold text-white">Team Access</h1>
          <p className="mt-2 text-textMuted">Create secure employee logins and assign one calling number to each person.</p>
        </div>
        <button onClick={loadTeam} className="btn-secondary inline-flex items-center justify-center gap-2" title="Refresh team access">
          <RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </header>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Team capacity">
        <div className="rounded-lg border border-border bg-surface/50 p-4">
          <div className="text-sm text-textMuted">Active numbers</div>
          <div className="mt-1 text-2xl font-bold text-white">{capacity.active_numbers}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface/50 p-4">
          <div className="text-sm text-textMuted">Employee access</div>
          <div className="mt-1 text-2xl font-bold text-white">{capacity.employees_used} / {capacity.employee_limit}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface/50 p-4">
          <div className="text-sm text-textMuted">Available slots</div>
          <div className="mt-1 text-2xl font-bold text-emerald-400">{capacity.employees_available}</div>
        </div>
      </section>

      {!data?.enabled ? (
        <section className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-6">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 shrink-0 text-amber-400" size={22} />
            <div>
              <h2 className="font-semibold text-amber-200">Team Access unlocks with 2 phone numbers</h2>
              <p className="mt-1 text-sm leading-6 text-textMuted">This account currently has {capacity.active_numbers}. Add a second active number to create employee logins. Every active number provides one employee access slot.</p>
            </div>
          </div>
        </section>
      ) : (
        <section className="border-y border-border py-6">
          <div className="mb-5">
            <h2 className="flex items-center gap-2 text-xl font-semibold text-white"><UserPlus size={20} className="text-secondary" /> Add Employee</h2>
            <p className="mt-1 text-sm text-textMuted">Username and temporary password are generated automatically.</p>
          </div>
          <form onSubmit={createEmployee} className="grid gap-4 md:grid-cols-[1fr_1fr_1.3fr_auto] md:items-end">
            <label className="text-sm text-textMuted">First name
              <input className="input-field mt-2" value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} required maxLength={60} />
            </label>
            <label className="text-sm text-textMuted">Last name
              <input className="input-field mt-2" value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} required maxLength={60} />
            </label>
            <label className="text-sm text-textMuted">Email <span className="text-xs">(optional)</span>
              <input className="input-field mt-2" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="employee@company.com" />
            </label>
            <button className="btn-primary inline-flex h-[42px] items-center justify-center gap-2 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50" disabled={saving || capacity.employees_available < 1}>
              {saving ? <RefreshCw size={17} className="animate-spin" /> : <UserPlus size={17} />} Add Employee
            </button>
          </form>
        </section>
      )}

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Employees</h2>
          <span className="text-sm text-textMuted">{data?.employees.length || 0} total</span>
        </div>
        {!data?.employees.length ? (
          <div className="rounded-lg border border-dashed border-border px-5 py-12 text-center text-textMuted">No employee access has been created yet.</div>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border bg-surface/30">
            {data.employees.map((employee) => (
              <div key={employee.id} className="grid gap-4 p-4 lg:grid-cols-[1.2fr_1fr_1fr_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-white">{employee.display_name}</div>
                  <div className="mt-1 truncate text-sm text-textMuted">@{employee.username}{employee.email ? ` · ${employee.email}` : ''}</div>
                </div>
                <div className="flex items-center gap-2 text-sm text-textMuted"><Phone size={15} /> {employee.phone_number || 'No number assigned'}</div>
                <div>
                  <span className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-semibold ${employee.account_status === 'active' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${employee.account_status === 'active' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    {employee.account_status === 'active' ? 'Active' : 'Suspended'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button className="rounded-lg border border-border p-2.5 text-textMuted hover:border-primary/50 hover:text-primary disabled:opacity-40" onClick={() => resetPassword(employee)} disabled={busyId === employee.id} title="Generate new password"><KeyRound size={17} /></button>
                  <button className="rounded-lg border border-border p-2.5 text-textMuted hover:border-amber-500/50 hover:text-amber-400 disabled:opacity-40" onClick={() => toggleStatus(employee)} disabled={busyId === employee.id} title={employee.account_status === 'active' ? 'Suspend access' : 'Restore access'}>
                    {employee.account_status === 'active' ? <PowerOff size={17} /> : <Power size={17} />}
                  </button>
                  <button className="rounded-lg border border-border p-2.5 text-textMuted hover:border-red-500/50 hover:text-red-400 disabled:opacity-40" onClick={() => deleteEmployee(employee)} disabled={busyId === employee.id} title="Delete employee"><Trash2 size={17} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {credentials && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={() => setCredentials(null)}>
          <div className="w-full max-w-lg rounded-lg border border-emerald-500/30 bg-surface p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="credentials-title">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 id="credentials-title" className="text-xl font-bold text-white">Employee Access Ready</h2>
                <p className="mt-1 text-sm text-textMuted">Copy these details now. The temporary password is shown only once.</p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400"><Check size={21} /></div>
            </div>
            <div className="space-y-3 rounded-lg border border-border bg-background/60 p-4 font-mono text-sm">
              <div><div className="mb-1 text-xs text-textMuted">USERNAME</div><div className="break-all text-white">{credentials.username}</div></div>
              <div><div className="mb-1 text-xs text-textMuted">TEMPORARY PASSWORD</div><div className="break-all text-amber-300">{credentials.temporary_password}</div></div>
              <div><div className="mb-1 text-xs text-textMuted">LOGIN LINK</div><div className="break-all text-primary">{credentials.login_url}</div></div>
            </div>
            <div className="mt-5 flex gap-3">
              <button onClick={copyCredentials} className="btn-primary flex flex-1 items-center justify-center gap-2">{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? 'Copied' : 'Copy Access Details'}</button>
              <button onClick={() => setCredentials(null)} className="btn-secondary">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
