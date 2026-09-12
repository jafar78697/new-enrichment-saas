import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import {
  CheckCircle,
  CalendarDays,
  CreditCard,
  Clock3,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Shield,
  UserPlus,
  XCircle,
  Wallet,
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
}

function subscriptionDaysRemaining(endDate?: string | null) {
  if (!endDate) return null;
  return Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

function formatCallMinutes(seconds?: number) {
  return Math.ceil(Number(seconds || 0) / 60);
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
  const [availableNumbers, setAvailableNumbers] = useState<AvailableNumber[]>([]);
  const [areaCode, setAreaCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [paymentBusy, setPaymentBusy] = useState<string | null>(null);
  const [numberBusy, setNumberBusy] = useState<string | null>(null);
  const [searchingNumbers, setSearchingNumbers] = useState(false);
  const [notice, setNotice] = useState('');
  const [customerDetail, setCustomerDetail] = useState<any>(null);
  const [topupForm, setTopupForm] = useState({ unit: 'maps_credits', amount: 0, description: '' });
  const [topupBusy, setTopupBusy] = useState(false);
  const [subscriptionBusy, setSubscriptionBusy] = useState(false);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.tenant_id === selectedCustomerId),
    [customers, selectedCustomerId]
  );
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

  async function fetchCustomerDetails(customerId = selectedCustomerId) {
    if (!customerId) return;
    try {
      const res = await axios.get(`${API_URL}/v1/admin/customers/${customerId}`, {
        headers: authHeaders(),
      });
      setCustomerDetail(res.data);
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
  }, []);

  useEffect(() => {
    if (selectedCustomerId) {
      fetchCustomerNumbers(selectedCustomerId);
      fetchCustomerDetails(selectedCustomerId);
    }
  }, [selectedCustomerId]);

  async function approvePayment(payment: PaymentRequest) {
    const actualRef = window.prompt('Verified JazzCash transaction reference', payment.transaction_reference || '');
    if (!actualRef) return;

    setPaymentBusy(payment.id);
    try {
      await axios.post(
        `${API_URL}/v1/admin/payments/${payment.id}/approve`,
        {
          actual_transaction_ref: actualRef,
          actual_amount_pkr: Number(payment.amount_pkr),
        },
        { headers: authHeaders() }
      );
      setPayments((items) => items.filter((item) => item.id !== payment.id));
      setNotice('Payment approved. Credits have been added to the wallet.');
    } catch (err: any) {
      setNotice('Unable to approve payment.');
    } finally {
      setPaymentBusy(null);
    }
  }

  async function rejectPayment(payment: PaymentRequest) {
    const reason = window.prompt('Reject reason', 'Invalid or unverified payment proof');
    if (!reason) return;

    setPaymentBusy(payment.id);
    try {
      await axios.post(
        `${API_URL}/v1/admin/payments/${payment.id}/reject`,
        { reason },
        { headers: authHeaders() }
      );
      setPayments((items) => items.filter((item) => item.id !== payment.id));
      setNotice('Payment rejected.');
    } catch (err: any) {
      setNotice('Unable to reject payment.');
    } finally {
      setPaymentBusy(null);
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

  async function purchaseNumber(phoneNumber: string) {
    if (!selectedCustomerId) return;

    setNumberBusy(phoneNumber);
    setNotice('');
    try {
      await axios.post(
        `${API_URL}/v1/admin/customers/${selectedCustomerId}/phone-numbers/purchase`,
        { phoneNumber, charge_setup_fee: true },
        { headers: authHeaders() }
      );
      setAvailableNumbers((items) => items.filter((item) => item.phoneNumber !== phoneNumber));
      await fetchCustomerNumbers(selectedCustomerId);
      setNotice('Phone number purchased and assigned to the customer calling account.');
    } catch (err: any) {
      setNotice('Unable to purchase the phone number.');
    } finally {
      setNumberBusy(null);
    }
  }

  async function handleTopup(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCustomerId || topupForm.amount === 0) return;
    
    setTopupBusy(true);
    setNotice('');
    try {
      await axios.post(`${API_URL}/v1/admin/customers/${selectedCustomerId}/wallet/topup`, 
        topupForm, 
        { headers: authHeaders() }
      );
      setNotice('Wallet successfully updated.');
      setTopupForm({ unit: 'maps_credits', amount: 0, description: '' });
      fetchCustomerDetails(selectedCustomerId);
    } catch (err: any) {
      setNotice('Unable to top up the wallet.');
    } finally {
      setTopupBusy(false);
    }
  }

  async function extendSubscription() {
    if (!selectedCustomerId) return;

    setSubscriptionBusy(true);
    setNotice('');
    try {
      const response = await axios.post(
        `${API_URL}/v1/admin/customers/${selectedCustomerId}/subscription/extend`,
        { duration_days: 30 },
        { headers: authHeaders() }
      );
      const endDate = new Date(response.data.subscription.end_date).toLocaleDateString();
      setNotice(`30-day calling access extended. New expiry: ${endDate}.`);
      await Promise.all([fetchCustomerDetails(selectedCustomerId), fetchDashboard()]);
    } catch (err: any) {
      setNotice('Unable to extend the calling subscription.');
    } finally {
      setSubscriptionBusy(false);
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
          <div className="glass-card p-6">
            <div className="flex items-center gap-2 mb-5">
              <CreditCard size={19} className="text-primary" />
              <h2 className="text-lg font-semibold text-white">JazzCash Payment Queue</h2>
            </div>

            <div className="space-y-3">
              {payments.length === 0 ? (
                <div className="text-sm text-textMuted border border-dashed border-border rounded-lg p-6 text-center">
                  No pending payment proofs.
                </div>
              ) : (
                payments.map((payment) => (
                  <div key={payment.id} className="rounded-lg border border-border/60 bg-background/35 p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="font-medium text-white">
                          {payment.customer_name || payment.tenant_name || 'Customer'} - Rs {Number(payment.amount_pkr).toLocaleString()}
                        </div>
                        <div className="text-xs text-textMuted mt-1">
                          {payment.plan_name} / {payment.order_ref} / Ref: {payment.transaction_reference || 'missing'}
                        </div>
                        <div className="text-xs text-textMuted mt-1">
                          {payment.sender_name || 'Unknown sender'} {payment.sender_number ? `(${payment.sender_number})` : ''}
                        </div>
                        {payment.proof_url && (
                          <a href={payment.proof_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:text-primary/80 mt-2 inline-block">
                            Open screenshot
                          </a>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => approvePayment(payment)}
                          disabled={paymentBusy !== null}
                          className="btn-secondary inline-flex items-center gap-2 text-emerald-400 hover:text-white hover:bg-emerald-500/20"
                        >
                          <CheckCircle size={16} />
                          Approve
                        </button>
                        <button
                          onClick={() => rejectPayment(payment)}
                          disabled={paymentBusy !== null}
                          className="btn-secondary inline-flex items-center gap-2 text-red-400 hover:text-white hover:bg-red-500/20"
                        >
                          <XCircle size={16} />
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {customerDetail && (
            <div className="glass-card p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-5">
                <div className="flex items-center gap-2">
                  <CalendarDays size={19} className="text-amber-400" />
                  <h2 className="text-lg font-semibold text-white">Calling Subscription & Usage</h2>
                </div>
                <button
                  onClick={extendSubscription}
                  disabled={subscriptionBusy}
                  className="btn-primary inline-flex items-center justify-center gap-2"
                >
                  <CalendarDays size={16} />
                  {subscriptionBusy ? 'Extending...' : 'Extend 30 Days'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="bg-background/40 border border-border/50 rounded-xl p-4">
                  <div className="text-sm text-textMuted mb-1">Calling Status</div>
                  <div className={`font-semibold ${customerDetail.subscription?.calling_active ? 'text-emerald-400' : 'text-red-400'}`}>
                    {customerDetail.subscription?.calling_active ? 'Active' : 'Expired / inactive'}
                  </div>
                </div>
                <div className="bg-background/40 border border-border/50 rounded-xl p-4">
                  <div className="text-sm text-textMuted mb-1">Days Remaining</div>
                  <div className="text-2xl font-bold text-white">{customerDetail.subscription?.days_remaining ?? 0}</div>
                  <div className="text-xs text-textMuted mt-1">
                    {customerDetail.subscription?.end_date
                      ? `Ends ${new Date(customerDetail.subscription.end_date).toLocaleDateString()}`
                      : 'No subscription date'}
                  </div>
                </div>
                <div className="bg-background/40 border border-border/50 rounded-xl p-4">
                  <div className="text-sm text-textMuted mb-1">Outbound Calls</div>
                  <div className="text-2xl font-bold text-white">{customerDetail.call_usage?.total_calls || 0}</div>
                  <div className="text-xs text-textMuted mt-1">{customerDetail.call_usage?.connected_calls || 0} connected</div>
                </div>
                <div className="bg-background/40 border border-border/50 rounded-xl p-4">
                  <div className="text-sm text-textMuted mb-1 flex items-center gap-1"><Clock3 size={13} /> Billable Minutes</div>
                  <div className="text-2xl font-bold text-white">{formatCallMinutes(customerDetail.call_usage?.billable_seconds)}</div>
                  <div className="text-xs text-textMuted mt-1">
                    {customerDetail.call_usage?.last_call_at
                      ? `Last call ${new Date(customerDetail.call_usage.last_call_at).toLocaleDateString()}`
                      : 'No calls yet'}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="glass-card p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-5">
              <div className="flex items-center gap-2">
                <Phone size={19} className="text-secondary" />
                <h2 className="text-lg font-semibold text-white">Quick Purchase & Assign</h2>
              </div>
              {selectedCustomer && (
                <div className="text-sm text-textMuted">
                  {selectedCustomer.customer_name || selectedCustomer.username}
                </div>
              )}
            </div>

            <form onSubmit={searchNumbers} className="flex flex-col sm:flex-row gap-3 mb-5">
              <select
                value={selectedCustomerId}
                onChange={(e) => selectCustomer(e.target.value)}
                className="input-field sm:max-w-xs"
              >
                <option value="">Select customer</option>
                {customers.map((customer) => (
                  <option key={customer.tenant_id} value={customer.tenant_id}>
                    {customer.customer_name || customer.username}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={areaCode}
                onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
                placeholder="US area code"
                className="input-field sm:max-w-[160px]"
              />
              <button type="submit" disabled={!selectedCustomerId || searchingNumbers} className="btn-primary inline-flex items-center justify-center gap-2">
                {searchingNumbers ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Search size={16} />}
                Search
              </button>
            </form>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-textMuted uppercase tracking-wider">Available</h3>
                {availableNumbers.length === 0 ? (
                  <div className="text-sm text-textMuted border border-dashed border-border rounded-lg p-5 text-center">
                    Search available numbers.
                  </div>
                ) : (
                  availableNumbers.map((number) => (
                    <div key={number.phoneNumber} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/35 p-3">
                      <div>
                        <div className="font-mono font-semibold text-white">{number.phoneNumber}</div>
                        <div className="text-xs text-textMuted">{number.locality || 'Local'}{number.region ? `, ${number.region}` : ''}</div>
                      </div>
                      <button
                        onClick={() => purchaseNumber(number.phoneNumber)}
                        disabled={numberBusy !== null}
                        className="btn-secondary inline-flex items-center gap-2 text-sm"
                      >
                        {numberBusy === number.phoneNumber ? (
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>
                            <Plus size={15} />
                            Purchase & Assign
                          </>
                        )}
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-textMuted uppercase tracking-wider">Assigned</h3>
                {assignedNumbers.length === 0 ? (
                  <div className="text-sm text-textMuted border border-dashed border-border rounded-lg p-5 text-center">
                    No assigned numbers.
                  </div>
                ) : (
                  assignedNumbers.map((number) => (
                    <div key={number.id} className="rounded-lg border border-border bg-surface/40 p-3">
                      <div className="font-mono font-semibold text-white">{number.phone_number}</div>
                      <div className="text-xs text-textMuted mt-1">
                        {number.status} {number.assigned_username ? `/ ${number.assigned_username}` : ''}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {customerDetail && (
            <div className="glass-card p-6">
              <div className="flex items-center gap-2 mb-5">
                <Wallet size={19} className="text-emerald-400" />
                <h2 className="text-lg font-semibold text-white">Wallet & Balances</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-background/40 border border-border/50 rounded-xl p-4">
                  <div className="text-sm text-textMuted mb-1">Calling Cents</div>
                  <div className="text-2xl font-bold text-white">
                    {customerDetail.balances?.calling_cents?.available || 0}
                  </div>
                </div>
                <div className="bg-background/40 border border-border/50 rounded-xl p-4">
                  <div className="text-sm text-textMuted mb-1">Google Maps Credits</div>
                  <div className="text-2xl font-bold text-emerald-400">
                    {customerDetail.balances?.maps_credits?.available || 0}
                  </div>
                </div>
              </div>

              <form onSubmit={handleTopup} className="bg-surface/30 p-4 rounded-xl border border-border/30">
                <h3 className="text-sm font-semibold text-white mb-3">Manual Top-up / Deduct</h3>
                <div className="flex flex-col sm:flex-row gap-3">
                  <select
                    value={topupForm.unit}
                    onChange={(e) => setTopupForm({ ...topupForm, unit: e.target.value })}
                    className="input-field sm:max-w-[180px]"
                  >
                    <option value="maps_credits">Maps Credits</option>
                    <option value="calling_cents">Calling Cents</option>
                  </select>
                  <input
                    type="number"
                    value={topupForm.amount || ''}
                    onChange={(e) => setTopupForm({ ...topupForm, amount: parseInt(e.target.value) || 0 })}
                    placeholder="Amount (Use - to deduct)"
                    className="input-field sm:max-w-[150px]"
                  />
                  <input
                    type="text"
                    value={topupForm.description}
                    onChange={(e) => setTopupForm({ ...topupForm, description: e.target.value })}
                    placeholder="Reason (Optional)"
                    className="input-field flex-1"
                  />
                  <button type="submit" disabled={topupBusy || topupForm.amount === 0} className="btn-primary">
                    {topupBusy ? 'Processing...' : 'Apply'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
