import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import {
  CalendarDays,
  Phone,
  RefreshCw,
  Shield,
  UserPlus,
  Wallet,
  Trash2,
  Settings
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface Customer {
  tenant_id: string;
  customer_name: string;
  username: string;
  status: string;
  plan: string;
  max_phone_numbers?: number;
  max_seats?: number;
  subscription_end_date?: string | null;
  total_calls?: number;
  connected_calls?: number;
  billable_seconds?: number;
  created_at?: string;
}

interface PaymentRequest {
  id: string;
  customer_name?: string;
  tenant_name?: string;
  plan_name: string;
  order_ref: string;
  amount_pkr: number;
  transaction_reference?: string;
  sender_name?: string;
  sender_number?: string;
  proof_url?: string;
  created_at: string;
}

interface AvailableNumber {
  phoneNumber: string;
  locality?: string;
  region?: string;
  capabilities?: Record<string, unknown>;
}

interface AssignedNumber {
  id: string;
  phone_number: string;
  status: string;
  provider_sid?: string;
  assigned_username?: string;
  purchased_at?: string;
  source?: 'purchased' | 'demo';
}

function subscriptionDaysRemaining(endDate?: string | null) {
  if (!endDate) return null;
  return Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

export default function AdminDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [payments, setPayments] = useState<PaymentRequest[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(searchParams.get('customer') || '');
  const [assignedNumbers, setAssignedNumbers] = useState<AssignedNumber[]>([]);
  const [unassignedNumbers, setUnassignedNumbers] = useState<AssignedNumber[]>([]);
  const [selectedPoolNumber, setSelectedPoolNumber] = useState('');
  const [availableNumbers, setAvailableNumbers] = useState<AvailableNumber[]>([]);
  const [areaCode, setAreaCode] = useState('');
  const [loading, setLoading] = useState(true);

  const [searchingNumbers, setSearchingNumbers] = useState(false);
  const [notice, setNotice] = useState('');
  const [customerDetail, setCustomerDetail] = useState<any>(null);
  const [poolNotice, setPoolNotice] = useState('');
  
  // New state variables for manual editing
  const [settingsForm, setSettingsForm] = useState({
    days_remaining: '',
    members: '',
    dollars: '',
    selectedNumber: '',
    call_recording_enabled: false,
    employee_access_enabled: true,
  });
  const [formDirty, setFormDirty] = useState(false);
  const [upgradeBusy, setUpgradeBusy] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [subscriptionBusy, setSubscriptionBusy] = useState(false);

  const demoSignupCount = useMemo(
    () => customers.filter((customer) => customer.plan === 'demo').length,
    [customers]
  );

  async function fetchDashboard() {
    setLoading(true);
    try {
      const [customerRes, pendingRes, reviewRes] = await Promise.all([
        axios.get(`${API_URL}/v1/admin/customers`, {
          headers: authHeaders(),
          params: { limit: 100 },
        }),
        axios.get(`${API_URL}/v1/admin/payments`, {
          headers: authHeaders(),
          params: { status: 'pending' },
        }),
        axios.get(`${API_URL}/v1/admin/payments`, {
          headers: authHeaders(),
          params: { status: 'under_review' },
        }),
      ]);

      const nextCustomers = (customerRes.data.customers || []).filter((c: Customer) => !c.username?.startsWith('mock'));
      setCustomers(nextCustomers);
      setPayments([...(pendingRes.data.requests || []), ...(reviewRes.data.requests || [])]);

      if (!selectedCustomerId && nextCustomers[0]) {
        selectCustomer(nextCustomers[0].tenant_id);
      }
    } catch (err) {
      console.error('Failed to load admin dashboard', err);
      setNotice('Unable to load the admin dashboard.');
    } finally {
      setLoading(false);
    }
  }

  async function fetchCustomerNumbers(customerId = selectedCustomerId) {
    if (!customerId) return;
    try {
      const res = await axios.get(`${API_URL}/v1/admin/customers/${customerId}/phone-numbers`, {
        headers: authHeaders(),
      });
      setAssignedNumbers(res.data.phoneNumbers || []);
    } catch (err) {
      console.error('Failed to load customer numbers', err);
      setAssignedNumbers([]);
    }
  }

  async function fetchUnassignedNumbers() {
    try {
      const res = await axios.get(`${API_URL}/v1/admin/unassigned-phone-numbers`, { headers: authHeaders() });
      setUnassignedNumbers(res.data.phoneNumbers || []);
    } catch (err) {
      console.error('Failed to load unassigned numbers', err);
      setUnassignedNumbers([]);
    }
  }

  async function assignSpecificPoolNumber(number: AssignedNumber) {
    if (!selectedCustomerId || !number) return;
    if (!number) return;
    setUpgradeBusy(true);
    setPoolNotice('');
    setNotice('');
    try {
      // Keep the number allowance in sync with the seats shown in this form
      // before assigning, even if the user has not clicked Upgrade yet.
      const desiredSeats = Number(settingsForm.members || 1);
      if (desiredSeats > 0) {
        await axios.put(`${API_URL}/v1/admin/customers/${selectedCustomerId}/limits`, {
          max_seats: desiredSeats,
          max_phone_numbers: desiredSeats,
        }, { headers: authHeaders() });
      }
      await axios.post(`${API_URL}/v1/admin/customers/${selectedCustomerId}/phone-numbers/${number.id}/reassign`, { source: number.source }, { headers: authHeaders() });
      setSelectedPoolNumber('');
      await Promise.all([fetchCustomerNumbers(selectedCustomerId), fetchCustomerDetails(selectedCustomerId), fetchUnassignedNumbers(), fetchDashboard()]);
      setPoolNotice(`${number.phone_number} assign ho gaya hai. Yeh number ab available list mein nahi hai.`);
    } catch (err: any) {
      const message = err.response?.data?.error || 'Unable to assign this phone number.';
      setPoolNotice(message);
      setNotice(message);
    } finally {
      setUpgradeBusy(false);
    }
  }

  async function assignPoolNumber() {
    if (!selectedPoolNumber) return;
    const number = unassignedNumbers.find((item) => `${item.source}:${item.id}` === selectedPoolNumber);
    if (number) await assignSpecificPoolNumber(number);
  }

  async function assignNextSeat() {
    setPoolNotice('');
    let pool = unassignedNumbers;
    if (!pool.length) {
      try {
        const res = await axios.get(`${API_URL}/v1/admin/unassigned-phone-numbers`, { headers: authHeaders() });
        pool = res.data.phoneNumbers || [];
        setUnassignedNumbers(pool);
      } catch (err) {
        setPoolNotice('Available numbers load nahi ho sake. Refresh list press karein.');
        return;
      }
    }
    if (pool[0]) await assignSpecificPoolNumber(pool[0]);
    else setPoolNotice('Koi unassigned number available nahi hai.');
  }

  async function fetchCustomerDetails(customerId = selectedCustomerId) {
    if (!customerId) return;
    try {
      const res = await axios.get(`${API_URL}/v1/admin/customers/${customerId}`, {
        headers: authHeaders(),
      });
      setCustomerDetail(res.data);
      setSettingsForm({
        days_remaining: res.data.subscription?.days_remaining?.toString() || '0',
        members: res.data.limits?.max_seats?.toString() || '1',
        dollars: '',
        selectedNumber: '',
        call_recording_enabled: Boolean(res.data.limits?.call_recording_enabled),
        employee_access_enabled: res.data.limits?.employee_access_enabled !== false,
      });
      setFormDirty(false);
    } catch (err) {
      console.error('Failed to load customer details', err);
      setCustomerDetail(null);
    }
  }

  function selectCustomer(customerId: string) {
    setSelectedCustomerId(customerId);
    setAvailableNumbers([]);
    setCustomerDetail(null);
    setSearchParams(customerId ? { customer: customerId } : {});
    fetchCustomerNumbers(customerId);
    fetchCustomerDetails(customerId);
  }

  useEffect(() => {
    fetchDashboard();
    fetchUnassignedNumbers();
  }, []);

  useEffect(() => {
    if (selectedCustomerId) {
      fetchCustomerNumbers(selectedCustomerId);
      fetchCustomerDetails(selectedCustomerId);
      fetchUnassignedNumbers();
    }
  }, [selectedCustomerId]);

  async function handleUpgradeAccount() {
    if (!selectedCustomerId) return;
    setUpgradeBusy(true);
    setNotice('');
    
    try {
      const promises = [];
      
      if (settingsForm.members) {
        promises.push(axios.put(`${API_URL}/v1/admin/customers/${selectedCustomerId}/limits`, {
          max_seats: Number(settingsForm.members),
          max_phone_numbers: Number(settingsForm.members),
        }, { headers: authHeaders() }));
      }
      
      if (settingsForm.days_remaining) {
        promises.push(axios.post(`${API_URL}/v1/admin/customers/${selectedCustomerId}/subscription/extend`, {
          set_days: Number(settingsForm.days_remaining)
        }, { headers: authHeaders() }));
      }
      
      if (settingsForm.dollars && Number(settingsForm.dollars) > 0) {
        promises.push(axios.post(`${API_URL}/v1/admin/customers/${selectedCustomerId}/wallet/topup`, {
          unit: 'maps_credits',
          amount: Number(settingsForm.dollars) * 750,
          description: `Added via admin dashboard $${settingsForm.dollars}`
        }, { headers: authHeaders() }));
      }
      
      if (settingsForm.selectedNumber) {
        promises.push(axios.post(`${API_URL}/v1/admin/customers/${selectedCustomerId}/phone-numbers/purchase`, {
          phoneNumber: settingsForm.selectedNumber
        }, { headers: authHeaders() }));
      }

      promises.push(axios.put(`${API_URL}/v1/admin/customers/${selectedCustomerId}/limits`, {
        call_recording_enabled: settingsForm.call_recording_enabled,
        employee_access_enabled: settingsForm.employee_access_enabled,
      }, { headers: authHeaders() }));

      // Convert the customer out of demo mode when Platform Admin uses the
      // Upgrade Account action.
      promises.push(axios.patch(`${API_URL}/v1/admin/customers/${selectedCustomerId}`, {
        plan: 'starter',
      }, { headers: authHeaders() }));
      
      await Promise.all(promises);
      
      setNotice('Account successfully upgraded and updated.');
      
      await fetchCustomerDetails(selectedCustomerId);
      if (settingsForm.selectedNumber) {
        await fetchCustomerNumbers(selectedCustomerId);
        setAvailableNumbers([]);
      }
      await fetchUnassignedNumbers();
      
      setFormDirty(false);
      setSettingsForm(prev => ({ ...prev, dollars: '', selectedNumber: '' }));
      
    } catch (err) {
      console.error(err);
      setNotice('Failed to upgrade account. Please try again.');
    } finally {
      setUpgradeBusy(false);
    }
  }

  async function searchNumbers(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCustomerId) return;

    setSearchingNumbers(true);
    setAvailableNumbers([]);
    setNotice('');
    try {
      const res = await axios.get(`${API_URL}/v1/admin/customers/${selectedCustomerId}/phone-numbers/search`, {
        headers: authHeaders(),
        params: { areaCode: areaCode || undefined, countryCode: 'US' },
      });
      setAvailableNumbers(res.data.availablePhoneNumbers || []);
    } catch (err: any) {
      setNotice('Unable to search for phone numbers.');
    } finally {
      setSearchingNumbers(false);
    }
  }

  async function deleteCustomer() {
    if (!selectedCustomerId) return;
    
    setSubscriptionBusy(true);
    try {
      const res = await axios.delete(`${API_URL}/v1/admin/customers/${selectedCustomerId}`, { headers: authHeaders() });
      if (res.data.success) {
        setNotice('Customer deleted successfully.');
        fetchDashboard();
        setSelectedCustomerId('');
        setShowDeleteModal(false);
      }
    } catch (err: any) {
      setNotice(err.response?.data?.error || 'Failed to delete customer');
    } finally {
      setSubscriptionBusy(false);
      setShowDeleteModal(false);
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Shield size={30} className="text-amber-400" />
            Admin Dashboard
          </h1>
          <p className="text-textMuted mt-1">Monitor new signups, approve payments, and manage calling access.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={fetchDashboard} className="btn-secondary inline-flex items-center gap-2">
            <RefreshCw size={17} />
            Refresh
          </button>
          <Link to="/admin/customers/new" className="btn-primary inline-flex items-center gap-2">
            <UserPlus size={17} />
            New Customer
          </Link>
        </div>
      </header>

      {notice && (
        <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          {notice}
        </div>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="glass-card p-5">
          <div className="text-sm text-textMuted">Customers</div>
          <div className="text-3xl font-bold text-white mt-2">{customers.length}</div>
        </div>
        <div className="glass-card p-5 border-primary/30">
          <div className="text-sm text-textMuted">Free Demo Signups</div>
          <div className="text-3xl font-bold text-primary mt-2">{demoSignupCount}</div>
        </div>
        <div className="glass-card p-5">
          <div className="text-sm text-textMuted">Pending Payments</div>
          <div className="text-3xl font-bold text-white mt-2">{payments.length}</div>
        </div>
        <div className="glass-card p-5">
          <div className="text-sm text-textMuted">Selected Customer Numbers</div>
          <div className="text-3xl font-bold text-white mt-2">{assignedNumbers.length}</div>
        </div>
        <div className="glass-card p-5">
          <div className="text-sm text-textMuted">Selected Customer Calls</div>
          <div className="text-3xl font-bold text-white mt-2">{customerDetail?.call_usage?.total_calls || 0}</div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="glass-card p-6 xl:col-span-1">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-white">Customers</h2>
            <Link to="/admin/customers" className="text-sm text-primary hover:text-primary/80">
              View all
            </Link>
          </div>

          <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
            {loading ? (
              <div className="py-10 flex justify-center">
                <div className="w-7 h-7 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : customers.length === 0 ? (
              <div className="text-sm text-textMuted border border-dashed border-border rounded-lg p-5 text-center">
                No customers yet.
              </div>
            ) : (
              customers.map((customer) => (
                <button
                  key={customer.tenant_id}
                  onClick={() => selectCustomer(customer.tenant_id)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedCustomerId === customer.tenant_id
                      ? 'border-primary/50 bg-primary/10'
                      : 'border-border/50 bg-background/30 hover:bg-surface/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-white">{customer.customer_name || customer.username}</div>
                      <div className="text-xs text-textMuted font-mono mt-1">{customer.username}</div>
                    </div>
                    <span className="text-xs text-textMuted capitalize">{customer.status}</span>
                  </div>
                  {customer.plan === 'demo' && (
                    <div className="inline-flex mt-2 rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      SELF-SERVICE DEMO
                    </div>
                  )}
                  <div className="text-xs text-textMuted mt-2">
                    {customer.max_seats || 1} seats, {customer.max_phone_numbers || 1} numbers
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-2 text-xs">
                    <span className={subscriptionDaysRemaining(customer.subscription_end_date) === 0 ? 'text-red-400' : 'text-amber-400'}>
                      {subscriptionDaysRemaining(customer.subscription_end_date) === null
                        ? 'No calling subscription'
                        : `${subscriptionDaysRemaining(customer.subscription_end_date)} days calling left`}
                    </span>
                    <span className="text-textMuted">{customer.total_calls || 0} calls</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="xl:col-span-2 space-y-8">

          {customerDetail && (
            <div className="glass-card p-6">
              
              {/* Usage Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="bg-background/40 p-4 rounded-xl border border-border/50">
                  <div className="text-sm font-semibold text-textMuted mb-1">Total Calling Usage</div>
                  <div className="text-2xl font-bold text-white">
                    {customerDetail.call_usage?.total_calls || 0} <span className="text-sm text-textMuted font-normal">calls</span>
                  </div>
                  <div className="text-xs text-textMuted mt-1">
                    {Math.ceil((customerDetail.call_usage?.billable_seconds || 0) / 60)} minutes total
                  </div>
                </div>
                
                <div className="bg-background/40 p-4 rounded-xl border border-border/50">
                  <div className="text-sm font-semibold text-textMuted mb-1">Total Leads Extracted</div>
                  <div className="text-2xl font-bold text-primary">
                    {customerDetail.enrichment_usage?.total_leads || 0} <span className="text-sm text-textMuted font-normal">leads</span>
                  </div>
                  <div className="text-xs text-textMuted mt-1">
                    Added to global database
                  </div>
                </div>

                <div className="bg-background/40 p-4 rounded-xl border border-border/50">
                  <div className="text-sm font-semibold text-textMuted mb-1">Keywords Scraped</div>
                  <div className="text-2xl font-bold text-emerald-400">
                    {customerDetail.enrichment_usage?.total_keywords || 0} <span className="text-sm text-textMuted font-normal">keywords</span>
                  </div>
                  <div className="text-xs text-textMuted mt-1">
                    Searched by this user
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 border-b border-border/50 pb-6">
                <div className="flex items-center gap-3">
                  <Settings size={24} className="text-white" />
                  <div>
                    <h2 className="text-xl font-bold text-white">Customer Account Settings</h2>
                    <p className="text-sm text-textMuted">Configure limits, balances, and phone numbers.</p>
                  </div>
                </div>
                <button
                  onClick={handleUpgradeAccount}
                  disabled={!formDirty || upgradeBusy}
                  className={`px-8 py-2.5 rounded-xl font-bold transition-all duration-300 ${
                    formDirty
                      ? 'bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] hover:bg-blue-500'
                      : 'bg-black text-gray-600 border border-gray-800 cursor-not-allowed'
                  }`}
                >
                  {upgradeBusy ? 'Updating...' : 'Upgrade Account'}
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-8">
                {/* Left Column: Core Limits */}
                <div className="space-y-6">
                  <div className="bg-background/40 p-5 rounded-xl border border-border/50">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settingsForm.call_recording_enabled}
                        onChange={(e) => { setSettingsForm({ ...settingsForm, call_recording_enabled: e.target.checked }); setFormDirty(true); }}
                        className="mt-1 h-4 w-4 rounded border-gray-600 text-primary focus:ring-primary bg-background"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-white">Enable Voice Recording</span>
                        <span className="mt-1 block text-xs leading-5 text-textMuted">Customer Admin and Platform Admin can listen to employee call recordings.</span>
                      </span>
                    </label>
                  </div>
                  <div className="bg-background/40 p-5 rounded-xl border border-border/50">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settingsForm.employee_access_enabled}
                        onChange={(e) => { setSettingsForm({ ...settingsForm, employee_access_enabled: e.target.checked }); setFormDirty(true); }}
                        className="mt-1 h-4 w-4 rounded border-gray-600 text-primary focus:ring-primary bg-background"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-white">Enable Employee Access</span>
                        <span className="mt-1 block text-xs leading-5 text-textMuted">Allow the Customer Admin to create, manage, and give login access to employees.</span>
                      </span>
                    </label>
                  </div>
                  <div className="bg-background/40 p-5 rounded-xl border border-border/50">
                    <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                      <CalendarDays size={16} className="text-amber-400" />
                      Calling Subscription
                    </h3>
                    <div className="space-y-1">
                      <label className="text-xs text-textMuted uppercase tracking-wider font-semibold">Days Remaining</label>
                      <input
                        type="number"
                        value={settingsForm.days_remaining}
                        onChange={(e) => { setSettingsForm({ ...settingsForm, days_remaining: e.target.value }); setFormDirty(true); }}
                        className="input-field w-full text-lg font-bold"
                      />
                      <p className="text-xs text-textMuted mt-1">
                        Current expiry: {customerDetail.subscription?.end_date ? new Date(customerDetail.subscription.end_date).toLocaleDateString() : 'None'}
                      </p>
                    </div>
                  </div>

                  <div className="bg-background/40 p-5 rounded-xl border border-border/50">
                    <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                      <UserPlus size={16} className="text-emerald-400" />
                      Team Seats
                    </h3>
                    <div className="space-y-1">
                      <label className="text-xs text-textMuted uppercase tracking-wider font-semibold">Members (Seats)</label>
                      <input
                        type="number"
                        value={settingsForm.members}
                        onChange={(e) => { setSettingsForm({ ...settingsForm, members: e.target.value }); setFormDirty(true); }}
                        className="input-field w-full text-lg font-bold"
                      />
                      <p className="text-xs text-textMuted mt-1">One member uses one assigned number.</p>
                      {Number(settingsForm.members || 1) > assignedNumbers.length && (
                        <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3">
                          <p className="text-xs text-amber-200">
                            {Number(settingsForm.members || 1) - assignedNumbers.length} seat{Number(settingsForm.members || 1) - assignedNumbers.length === 1 ? '' : 's'} need a phone number.
                          </p>
                          <button
                            type="button"
                            onClick={assignNextSeat}
                            disabled={upgradeBusy}
                            className="btn-primary mt-2 w-full text-sm disabled:opacity-50"
                          >
                            {upgradeBusy ? 'Assigning...' : 'Assign Number to Next Seat'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Column: Balances & Numbers */}
                <div className="space-y-6">
                  <div className="bg-background/40 p-5 rounded-xl border border-border/50">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Wallet size={16} className="text-primary" />
                        Leads Extraction Balance
                      </h3>
                      <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded">
                        Current: {customerDetail.balances?.maps_credits?.available || 0} leads
                      </span>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-textMuted uppercase tracking-wider font-semibold">Add Balance (in $ Dollars)</label>
                      <input
                        type="number"
                        placeholder="e.g. 10"
                        value={settingsForm.dollars}
                        onChange={(e) => { setSettingsForm({ ...settingsForm, dollars: e.target.value }); setFormDirty(true); }}
                        className="input-field w-full text-lg font-bold text-emerald-400 placeholder:text-gray-700"
                      />
                      <div className="text-sm font-medium text-emerald-400 mt-2 bg-emerald-400/10 p-2 rounded-lg border border-emerald-400/20">
                        ✓ Grants {(Number(settingsForm.dollars || 0) * 750).toLocaleString()} lead extractions
                      </div>
                      {customerDetail.wallet_activity?.filter((entry: any) => entry.unit === 'maps_credits').slice(0, 3).map((entry: any, index: number) => (
                        <div key={`${entry.created_at}-${index}`} className="mt-2 rounded-lg border border-border/40 bg-background/40 px-3 py-2 text-xs text-textMuted">
                          <span className="font-semibold text-emerald-400">{entry.operation_type === 'credit' ? '+' : '-'}{Number(entry.amount || 0).toLocaleString()} leads</span>
                          <span className="ml-2">{entry.description || 'Lead balance update'}</span>
                          <span className="ml-2">· {new Date(entry.created_at).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-background/40 p-5 rounded-xl border border-border/50">
                    <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                      <Phone size={16} className="text-blue-400" />
                      Assign Phone Number
                    </h3>
                    
                    {Number(settingsForm.members || 1) > assignedNumbers.length ? (
                      <div className="mb-4 text-xs font-medium text-red-400 bg-red-400/10 p-2.5 rounded-lg border border-red-400/20 flex gap-2 items-start">
                        <span className="text-sm">⚠️</span>
                        <span>
                          <strong>Action Required:</strong> You have allocated {Number(settingsForm.members || 1)} members but only assigned {assignedNumbers.length} number{assignedNumbers.length !== 1 ? 's' : ''}. Please assign more numbers.
                        </span>
                      </div>
                    ) : (
                      <div className="mb-4 text-xs font-medium text-emerald-400 bg-emerald-400/10 p-2.5 rounded-lg border border-emerald-400/20 flex items-center gap-2">
                        <span className="text-sm">✓</span>
                        <span>All members have assigned numbers.</span>
                      </div>
                    )}

                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Area Code, ZIP, or State (e.g. 212, 10001, NY)"
                          value={areaCode}
                          onChange={(e) => setAreaCode(e.target.value)}
                          className="input-field flex-1"
                        />
                        <button 
                          onClick={searchNumbers} 
                          disabled={searchingNumbers || !areaCode}
                          className="btn-secondary whitespace-nowrap"
                        >
                          {searchingNumbers ? 'Searching...' : 'Search'}
                        </button>
                      </div>
                      
                      {availableNumbers.length > 0 && (
                        <div className="mt-3">
                          <label className="text-xs text-textMuted mb-1 block">Select Number to Assign</label>
                          <select
                            value={settingsForm.selectedNumber}
                            onChange={(e) => { setSettingsForm({ ...settingsForm, selectedNumber: e.target.value }); setFormDirty(true); }}
                            className="input-field w-full text-sm"
                          >
                            <option value="">-- Choose a number --</option>
                            {availableNumbers.map((num) => (
                              <option key={num.phoneNumber} value={num.phoneNumber}>
                                {num.phoneNumber} {num.locality ? `(${num.locality})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      
                      {assignedNumbers.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-border/30">
                          <p className="text-xs text-textMuted mb-2">Currently Assigned Numbers:</p>
                          <ol className="list-decimal list-inside space-y-1 text-sm text-white">
                            {assignedNumbers.map((n: AssignedNumber) => (
                              <li key={n.phone_number}>
                                <span className="ml-1">{n.phone_number}</span>
                                <span className="ml-2 text-xs text-emerald-400">Assigned</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}

                      <div className="mt-5 border-t border-border/30 pt-4">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-xs text-textMuted">Not Assigned Numbers (including unused demo numbers)</p>
                          <button type="button" onClick={fetchUnassignedNumbers} className="text-xs text-primary hover:text-white">Refresh list</button>
                        </div>
                        {unassignedNumbers.length > 0 ? (
                          <div className="flex gap-2">
                            <select value={selectedPoolNumber} onChange={(e) => setSelectedPoolNumber(e.target.value)} className="input-field flex-1 text-sm">
                              <option value="">-- Select available number --</option>
                              {unassignedNumbers.map((number) => <option key={`${number.source}:${number.id}`} value={`${number.source}:${number.id}`}>{number.phone_number} ({number.source === 'demo' ? 'Demo pool' : 'Purchased'})</option>)}
                            </select>
                            <button type="button" onClick={assignPoolNumber} disabled={!selectedPoolNumber || upgradeBusy} className="btn-secondary whitespace-nowrap">Assign</button>
                          </div>
                        ) : <p className="text-xs text-textMuted">No unassigned numbers available.</p>}
                        {poolNotice && (
                          <p className={`mt-3 rounded-lg border px-3 py-2 text-xs ${poolNotice.includes('assign ho gaya') ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400' : 'border-red-400/30 bg-red-400/10 text-red-400'}`}>
                            {poolNotice}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="mt-8 flex justify-end border-t border-border/50 pt-6">
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="text-xs text-red-500 hover:text-red-400 transition-colors flex items-center gap-1"
                >
                  <Trash2 size={14} /> Delete Customer
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface border border-border/50 rounded-xl p-6 max-w-md w-full shadow-2xl relative">
            <h3 className="text-xl font-semibold mb-2 text-white">Delete Customer</h3>
            <p className="text-textMuted mb-6">
              Are you sure you want to delete this customer? This will suspend their access and mark them as deleted.
              <br/><br/>
              <span className="text-red-400 font-medium">This action cannot be easily undone.</span>
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowDeleteModal(false)}
                disabled={subscriptionBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary !bg-red-500 hover:!bg-red-600 !text-white !border-red-600 inline-flex items-center justify-center gap-2"
                onClick={deleteCustomer}
                disabled={subscriptionBusy}
              >
                {subscriptionBusy ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
