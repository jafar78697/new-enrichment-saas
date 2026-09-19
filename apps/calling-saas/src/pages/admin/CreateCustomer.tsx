import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { UserPlus, Copy, AlertCircle, Check, FileUp } from 'lucide-react';
import { normalizeUSPhone } from '../../utils/phone';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') { value += '"'; i += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === ',' && !quoted) { values.push(value.trim()); value = ''; continue; }
    value += char;
  }
  values.push(value.trim());
  return values;
}

function parseBulkCsv(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('CSV mein header aur kam az kam ek customer row honi chahiye.');
  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase().replace(/\s+/g, '_'));
  if (!headers.includes('customer_name') && !headers.includes('name')) {
    throw new Error('CSV header mein customer_name zaroor hona chahiye.');
  }
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || undefined]));
  });
}

export default function CreateCustomer() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    customer_name: '',
    contact_phone: '',
    username: '',
    email: '',
    max_phone_numbers: 1,
    max_seats: 1,
    max_concurrent_calls: 1,
    max_daily_unique_destinations: 50,
    max_daily_call_attempts: 200,
    max_call_seconds: 1800,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [credentials, setCredentials] = useState<{ username: string; temporary_password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [bulkCsv, setBulkCsv] = useState('customer_name,contact_phone,email,username,max_seats,max_phone_numbers\nAcme Sales,+1 212 555 0100,owner@acme.example,acme_sales,3,3');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [bulkResult, setBulkResult] = useState<any>(null);
  const [bulkCopied, setBulkCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const normalizedPhone = form.contact_phone ? normalizeUSPhone(form.contact_phone) : undefined;
      
      if (form.contact_phone && !normalizedPhone) {
        throw new Error('Please enter a valid US/Canada contact phone number.');
      }

      const res = await axios.post(`${API_URL}/v1/admin/customers`, {
        customer_name: form.customer_name,
        contact_phone: normalizedPhone,
        username: form.username || undefined,
        email: form.email || undefined,
        limits: {
          max_phone_numbers: form.max_phone_numbers,
          max_seats: form.max_seats,
          max_concurrent_calls: form.max_concurrent_calls,
          max_daily_unique_destinations: form.max_daily_unique_destinations,
          max_daily_call_attempts: form.max_daily_call_attempts,
          max_call_seconds: form.max_call_seconds,
        },
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setCredentials(res.data.credentials);
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Failed to create customer');
    } finally {
      setLoading(false);
    }
  }

  function copyCredentials() {
    if (!credentials) return;
    const text = `Username: ${credentials.username}\nTemporary Password: ${credentials.temporary_password}\nLogin URL: ${window.location.origin}/login\n\nPlease change your password on first login.`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleBulkSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBulkError('');
    setBulkLoading(true);
    try {
      const customers = parseBulkCsv(bulkCsv);
      const idempotencyKey = crypto.randomUUID();
      const res = await axios.post(`${API_URL}/v1/admin/customers/bulk`, { customers }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Idempotency-Key': idempotencyKey },
      });
      setBulkResult(res.data);
    } catch (err: any) {
      setBulkError(err?.response?.data?.error || err?.message || 'Bulk customer provisioning failed.');
    } finally {
      setBulkLoading(false);
    }
  }

  function copyBulkCredentials() {
    if (!bulkResult?.credentials) return;
    const text = bulkResult.credentials.map((entry: any) => {
      const customer = bulkResult.customers?.find((item: any) => item.row === entry.row)?.customer;
      return `${customer?.customer_name || `Row ${entry.row}`}\nUsername: ${entry.username}\nTemporary Password: ${entry.temporary_password}\nLogin URL: ${entry.login_url}`;
    }).join('\n\n');
    navigator.clipboard.writeText(text);
    setBulkCopied(true);
    setTimeout(() => setBulkCopied(false), 2000);
  }

  // If credentials are shown, display them
  if (credentials) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-surface/40 backdrop-blur-xl border border-emerald-500/30 rounded-2xl p-8">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-400 mx-auto mb-6">
            <Check size={32} />
          </div>
          <h2 className="text-2xl font-bold text-center mb-2">Customer Created!</h2>
          <p className="text-textMuted text-center text-sm mb-8">
            Share these credentials securely with the customer. They will be asked to change their password on first login.
          </p>

          <div className="bg-background/80 rounded-xl p-5 mb-6 space-y-3 font-mono text-sm">
            <div className="flex justify-between items-center">
              <span className="text-textMuted">Username:</span>
              <span className="font-semibold text-text">{credentials.username}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-textMuted">Password:</span>
              <span className="font-semibold text-amber-400 break-all">{credentials.temporary_password}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-textMuted">Login URL:</span>
              <span className="text-primary text-xs">{window.location.origin}/login</span>
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 px-4 py-3 rounded-xl text-xs mb-6">
            ⚠️ This password is shown <strong>ONCE</strong>. It cannot be retrieved later. Copy it now!
          </div>

          <div className="flex gap-3">
            <button
              onClick={copyCredentials}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 transition-all"
            >
              {copied ? <Check size={18} /> : <Copy size={18} />}
              {copied ? 'Copied!' : 'Copy Credentials'}
            </button>
            <button
              onClick={() => navigate('/admin/customers')}
              className="flex-1 py-3 rounded-xl bg-surface/60 border border-border/50 text-text font-semibold hover:bg-surface transition-all"
            >
              Back to List
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (bulkResult) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-surface/40 backdrop-blur-xl border border-emerald-500/30 rounded-2xl p-8">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-400 mx-auto mb-6"><Check size={32} /></div>
          <h2 className="text-2xl font-bold text-center mb-2">{bulkResult.count} Customers Created</h2>
          <p className="text-textMuted text-center text-sm mb-6">Ye credentials sirf ab dikh rahe hain. Inhein copy karke securely customers ko bhej dein.</p>
          <div className="overflow-x-auto rounded-xl border border-border/40 mb-6">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border/40 text-textMuted"><th className="text-left p-3">Customer</th><th className="text-left p-3">Username</th><th className="text-left p-3">Temporary password</th><th className="text-left p-3">Login URL</th></tr></thead>
              <tbody>{(bulkResult.credentials || []).map((entry: any) => {
                const customer = bulkResult.customers?.find((item: any) => item.row === entry.row)?.customer;
                return <tr key={entry.row} className="border-b border-border/20"><td className="p-3 text-slate-900">{customer?.customer_name || `Row ${entry.row}`}</td><td className="p-3 font-mono">{entry.username}</td><td className="p-3 font-mono text-amber-400">{entry.temporary_password}</td><td className="p-3 text-primary whitespace-nowrap">{entry.login_url}</td></tr>;
              })}</tbody>
            </table>
          </div>
          <div className="flex gap-3"><button onClick={copyBulkCredentials} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-white font-semibold">{bulkCopied ? <Check size={18} /> : <Copy size={18} />}{bulkCopied ? 'Copied!' : 'Copy All Credentials'}</button><button onClick={() => { setBulkResult(null); setMode('bulk'); }} className="flex-1 py-3 rounded-xl bg-surface/60 border border-border/50 text-text font-semibold">Create Another Batch</button></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold flex items-center gap-3 mb-8">
        <UserPlus size={28} className="text-primary" />
        Create New Customer
      </h1>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl mb-6 text-sm">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="flex gap-2 mb-6 rounded-xl bg-surface/30 border border-border/50 p-1 max-w-md">
        <button type="button" onClick={() => setMode('single')} className={`flex-1 py-2 rounded-lg text-sm font-semibold ${mode === 'single' ? 'bg-primary text-white' : 'text-textMuted'}`}>Single Customer</button>
        <button type="button" onClick={() => setMode('bulk')} className={`flex-1 py-2 rounded-lg text-sm font-semibold ${mode === 'bulk' ? 'bg-primary text-white' : 'text-textMuted'}`}>Bulk CSV</button>
      </div>

      {mode === 'bulk' && (
        <form onSubmit={handleBulkSubmit} className="bg-surface/30 backdrop-blur-md border border-border/50 rounded-2xl p-8 space-y-5 mb-6">
          <div><h3 className="text-lg font-semibold flex items-center gap-2"><FileUp size={19} className="text-primary" /> Bulk Customer Provisioning</h3><p className="text-textMuted text-sm mt-1">Har batch transaction mein create hota hai. Kisi row mein error ho to poora batch rollback hota hai.</p></div>
          {bulkError && <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm"><AlertCircle size={16} />{bulkError}</div>}
          <textarea value={bulkCsv} onChange={(event) => setBulkCsv(event.target.value)} rows={10} className="w-full px-4 py-3 rounded-xl bg-background/60 border border-border/50 text-text font-mono text-sm focus:outline-none focus:border-primary/50" spellCheck={false} />
          <p className="text-xs text-textMuted">Required: <code>customer_name</code>. Optional: contact_phone, email, username, max_seats, max_phone_numbers, max_concurrent_calls, max_daily_unique_destinations, max_daily_call_attempts, max_call_seconds.</p>
          <button type="submit" disabled={bulkLoading} className="w-full py-3.5 rounded-xl bg-primary text-white font-semibold disabled:opacity-50">{bulkLoading ? 'Creating secure batch...' : 'Create Customer Batch'}</button>
        </form>
      )}

      {mode === 'single' && <form onSubmit={handleSubmit} className="bg-surface/30 backdrop-blur-md border border-border/50 rounded-2xl p-8 space-y-6">
        {/* Basic Info */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold border-b border-border/30 pb-2">Basic Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-textMuted mb-2">Customer Name *</label>
              <input
                type="text" required
                value={form.customer_name}
                onChange={e => setForm({ ...form, customer_name: e.target.value })}
                placeholder="e.g. Ali Ahmed"
                className="w-full px-4 py-2.5 rounded-xl bg-background/60 border border-border/50 text-text placeholder-textMuted/50 focus:outline-none focus:border-primary/50 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-textMuted mb-2">Contact Phone</label>
              <input
                type="text"
                value={form.contact_phone}
                onChange={e => setForm({ ...form, contact_phone: e.target.value })}
                placeholder="+92 300 1234567"
                className="w-full px-4 py-2.5 rounded-xl bg-background/60 border border-border/50 text-text placeholder-textMuted/50 focus:outline-none focus:border-primary/50 transition-all"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-textMuted mb-2">Username (optional)</label>
              <input
                type="text"
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
                placeholder="Auto-generated if empty"
                className="w-full px-4 py-2.5 rounded-xl bg-background/60 border border-border/50 text-text placeholder-textMuted/50 focus:outline-none focus:border-primary/50 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-textMuted mb-2">Email (optional)</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="customer@example.com"
                className="w-full px-4 py-2.5 rounded-xl bg-background/60 border border-border/50 text-text placeholder-textMuted/50 focus:outline-none focus:border-primary/50 transition-all"
              />
            </div>
          </div>
        </div>


        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 rounded-xl bg-primary text-white font-semibold text-base hover:bg-primary/90 transition-all shadow-[0_0_20px_rgba(99,102,241,0.3)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <UserPlus size={18} />
              <span>Create Customer & Generate Password</span>
            </>
          )}
        </button>
      </form>}
    </div>
  );
}
