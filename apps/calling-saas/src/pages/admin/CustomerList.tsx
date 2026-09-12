import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Users, Plus, Search, Shield, Ban, CheckCircle } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface Customer {
  tenant_id: string;
  customer_name: string;
  username: string;
  email?: string;
  status: string;
  plan: string;
  created_at: string;
  max_phone_numbers?: number;
  max_seats?: number;
  subscription_plan_name?: string | null;
  subscription_end_date?: string | null;
  total_calls?: number;
  connected_calls?: number;
  billable_seconds?: number;
}

function daysRemaining(endDate?: string | null) {
  if (!endDate) return null;
  return Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

export default function CustomerList() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);

  async function fetchCustomers() {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/v1/admin/customers`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { search: search || undefined },
      });
      const realCustomers = (res.data.customers || []).filter((c: Customer) => !c.username?.startsWith('mock'));
      setCustomers(realCustomers);
      setTotal(res.data.total ? (res.data.total - (res.data.customers.length - realCustomers.length)) : 0);
    } catch (err) {
      console.error('Failed to fetch customers', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchCustomers(); }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchCustomers();
  }

  const statusColors: Record<string, string> = {
    active: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    suspended: 'text-red-400 bg-red-500/10 border-red-500/30',
    pending: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    expired: 'text-gray-400 bg-gray-500/10 border-gray-500/30',
  };
  const demoSignupCount = customers.filter((customer) => customer.plan === 'demo').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Shield size={28} className="text-primary" />
            Customer Management
          </h1>
          <p className="text-textMuted mt-1">{total} customers total, {demoSignupCount} free demo signup{demoSignupCount === 1 ? '' : 's'} shown</p>
        </div>
        <Link
          to="/admin/customers/new"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 transition-all shadow-[0_0_15px_rgba(99,102,241,0.3)]"
        >
          <Plus size={18} />
          New Customer
        </Link>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="relative max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, username, or email..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface/40 border border-border/50 text-text placeholder-textMuted/50 focus:outline-none focus:border-primary/50 transition-all"
          />
        </div>
      </form>

      {/* Table */}
      <div className="bg-surface/30 backdrop-blur-md border border-border/50 rounded-2xl overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-textMuted">
            <Users size={48} className="mb-4 opacity-30" />
            <p>No customers found</p>
          </div>
        ) : (
          <table className="w-full min-w-[980px]">
            <thead>
              <tr className="border-b border-border/30 text-textMuted text-sm">
                <th className="text-left px-6 py-4 font-medium">Customer</th>
                <th className="text-left px-6 py-4 font-medium">Username</th>
                <th className="text-left px-6 py-4 font-medium">Status</th>
                <th className="text-left px-6 py-4 font-medium">Plan</th>
                <th className="text-left px-6 py-4 font-medium">Calling Access</th>
                <th className="text-left px-6 py-4 font-medium">Outbound Calls</th>
                <th className="text-left px-6 py-4 font-medium">Limits</th>
                <th className="text-left px-6 py-4 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {customers.map(c => (
                <tr key={c.tenant_id} className="border-b border-border/20 hover:bg-surface/20 transition-colors">
                  <td className="px-6 py-4">
                    <Link to={`/admin?customer=${c.tenant_id}`} className="font-medium text-text hover:text-primary transition-colors">
                      {c.customer_name || c.username}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-textMuted font-mono text-sm">{c.username}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${statusColors[c.status] || statusColors.pending}`}>
                      {c.status === 'active' ? <CheckCircle size={12} /> : c.status === 'suspended' ? <Ban size={12} /> : null}
                      {c.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2.5 py-1 rounded border text-xs font-semibold uppercase ${
                      c.plan === 'demo'
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-border/50 bg-surface/50 text-textMuted'
                    }`}>
                      {c.plan === 'demo' ? 'Free demo' : c.plan}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {daysRemaining(c.subscription_end_date) === null ? (
                      <span className="text-red-400">No subscription</span>
                    ) : daysRemaining(c.subscription_end_date) === 0 ? (
                      <span className="text-red-400">Expired</span>
                    ) : (
                      <div>
                        <div className="text-amber-400 font-medium">{daysRemaining(c.subscription_end_date)} days left</div>
                        <div className="text-xs text-textMuted mt-1">Ends {new Date(c.subscription_end_date as string).toLocaleDateString()}</div>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div className="text-text font-medium">{c.total_calls || 0} total</div>
                    <div className="text-xs text-textMuted mt-1">
                      {c.connected_calls || 0} connected, {Math.ceil(Number(c.billable_seconds || 0) / 60)} min
                    </div>
                  </td>
                  <td className="px-6 py-4 text-textMuted text-sm">
                    {c.max_seats || 1} seats, {c.max_phone_numbers || 1} numbers
                  </td>
                  <td className="px-6 py-4 text-textMuted text-sm">
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
