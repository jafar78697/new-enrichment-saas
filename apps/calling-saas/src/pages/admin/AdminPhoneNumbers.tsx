import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
  CheckCircle2,
  Phone,
  Radio,
  RefreshCw,
  Search,
  ShoppingCart,
  UserRound,
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface Customer {
  tenant_id: string;
  customer_name: string;
  username: string;
  max_phone_numbers?: number;
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
  assigned_username?: string;
}

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

export default function AdminPhoneNumbers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [availableNumbers, setAvailableNumbers] = useState<AvailableNumber[]>([]);
  const [assignedNumbers, setAssignedNumbers] = useState<AssignedNumber[]>([]);
  const [areaCode, setAreaCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [purchasingNumber, setPurchasingNumber] = useState<string | null>(null);
  const [enablingIncomingId, setEnablingIncomingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.tenant_id === selectedCustomerId),
    [customers, selectedCustomerId],
  );

  async function loadCustomers() {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/v1/admin/customers`, {
        headers: authHeaders(),
        params: { limit: 100 },
      });
      const nextCustomers = (response.data.customers || []).filter(
        (customer: Customer) => !customer.username?.startsWith('mock'),
      );
      setCustomers(nextCustomers);
      setSelectedCustomerId((current) => current || nextCustomers[0]?.tenant_id || '');
    } catch (error) {
      console.error('Failed to load customers', error);
      setNotice('Unable to load customers. Refresh the page and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function loadAssignedNumbers(customerId: string) {
    if (!customerId) {
      setAssignedNumbers([]);
      return;
    }

    try {
      const response = await axios.get(
        `${API_URL}/v1/admin/customers/${customerId}/phone-numbers`,
        { headers: authHeaders() },
      );
      setAssignedNumbers(response.data.phoneNumbers || []);
    } catch (error) {
      console.error('Failed to load assigned numbers', error);
      setAssignedNumbers([]);
    }
  }

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    loadAssignedNumbers(selectedCustomerId);
    setAvailableNumbers([]);
    setNotice('');
  }, [selectedCustomerId]);

  async function searchNumbers(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedCustomerId) return;

    setSearching(true);
    setAvailableNumbers([]);
    setNotice('');
    try {
      const response = await axios.get(
        `${API_URL}/v1/admin/customers/${selectedCustomerId}/phone-numbers/search`,
        {
          headers: authHeaders(),
          params: { countryCode: 'US', areaCode: areaCode || undefined },
        },
      );
      const numbers = response.data.availablePhoneNumbers || [];
      setAvailableNumbers(numbers);
      if (numbers.length === 0) {
        setNotice('No phone numbers are currently available for this area code. Clear the area code and try again.');
      }
    } catch (error: any) {
      setNotice('Unable to search for phone numbers.');
    } finally {
      setSearching(false);
    }
  }

  async function purchaseAndAssign(phoneNumber: string) {
    if (!selectedCustomerId) return;

    setPurchasingNumber(phoneNumber);
    setNotice('');
    try {
      await axios.post(
        `${API_URL}/v1/admin/customers/${selectedCustomerId}/phone-numbers/purchase`,
        { phoneNumber, charge_setup_fee: true },
        { headers: authHeaders() },
      );
      setAvailableNumbers((numbers) => numbers.filter((number) => number.phoneNumber !== phoneNumber));
      await loadAssignedNumbers(selectedCustomerId);
      setNotice(`${phoneNumber} was purchased and assigned to ${selectedCustomer?.customer_name || selectedCustomer?.username}.`);
    } catch (error: any) {
      setNotice('Unable to purchase the phone number.');
    } finally {
      setPurchasingNumber(null);
    }
  }

  async function enableIncomingCalls(number: AssignedNumber) {
    if (!selectedCustomerId) return;
    setEnablingIncomingId(number.id);
    setNotice('');
    try {
      await axios.post(
        `${API_URL}/v1/admin/customers/${selectedCustomerId}/phone-numbers/${number.id}/enable-incoming`,
        {},
        { headers: authHeaders() },
      );
      setNotice(`Incoming calls are now enabled for ${number.phone_number}.`);
    } catch (error) {
      console.error('Failed to enable incoming calls', error);
      setNotice('Unable to enable incoming calls for this number.');
    } finally {
      setEnablingIncomingId(null);
    }
  }

  return (
    <div className="max-w-6xl space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center">
              <ShoppingCart size={20} className="text-emerald-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Purchase USA Number</h1>
              <p className="text-textMuted mt-1">SignalWire number khareed kar selected customer ke calling account ko assign karein.</p>
            </div>
          </div>
        </div>
        <button onClick={loadCustomers} disabled={loading} className="btn-secondary inline-flex items-center justify-center gap-2">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh Customers
        </button>
      </header>

      {notice && (
        <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          {notice}
        </div>
      )}

      <section className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.8fr)]">
        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-6">
            <Search size={19} className="text-primary" />
            <h2 className="text-lg font-semibold text-white">Find a SignalWire USA Number</h2>
          </div>

          <form onSubmit={searchNumbers} className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_150px_auto]">
            <select
              value={selectedCustomerId}
              onChange={(event) => setSelectedCustomerId(event.target.value)}
              disabled={loading || customers.length === 0}
              className="input-field"
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
              onChange={(event) => setAreaCode(event.target.value.replace(/\D/g, '').slice(0, 3))}
              placeholder="US area code"
              className="input-field"
            />
            <button
              type="submit"
              disabled={!selectedCustomerId || searching}
              className="btn-primary inline-flex items-center justify-center gap-2"
            >
              {searching ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Search size={16} />}
              Search Numbers
            </button>
          </form>

          <p className="mt-3 text-xs text-textMuted">Area code optional hai. Setup fee customer ke calling wallet se deduct hoti hai.</p>

          <div className="mt-6 border-t border-border/60 pt-5 space-y-3">
            {availableNumbers.length === 0 ? (
              <div className="py-8 text-center text-sm text-textMuted">
                Customer select karke `Search Numbers` dabayein.
              </div>
            ) : (
              availableNumbers.map((number) => (
                <div key={number.phoneNumber} className="flex flex-col gap-4 border-b border-border/60 pb-4 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-mono text-base font-semibold text-white">{number.phoneNumber}</div>
                    <div className="mt-1 text-xs text-textMuted">
                      {number.locality || 'US local number'}{number.region ? `, ${number.region}` : ''}
                      {number.capabilities?.voice ? ' / Voice enabled' : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => purchaseAndAssign(number.phoneNumber)}
                    disabled={purchasingNumber !== null}
                    className="btn-primary inline-flex shrink-0 items-center justify-center gap-2"
                  >
                    {purchasingNumber === number.phoneNumber ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <ShoppingCart size={16} />
                    )}
                    Purchase & Assign
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <aside className="glass-card p-6">
          <div className="flex items-center gap-2 mb-5">
            <UserRound size={19} className="text-secondary" />
            <h2 className="text-lg font-semibold text-white">Assigned Numbers</h2>
          </div>

          {selectedCustomer ? (
            <div className="mb-5 border-b border-border/60 pb-4">
              <div className="text-sm font-medium text-white">{selectedCustomer.customer_name || selectedCustomer.username}</div>
              <div className="mt-1 text-xs text-textMuted">Limit: {selectedCustomer.max_phone_numbers || 1} active number(s)</div>
            </div>
          ) : null}

          <div className="space-y-3">
            {assignedNumbers.length === 0 ? (
              <div className="py-6 text-sm text-textMuted">Is customer ko abhi koi number assign nahin hua.</div>
            ) : (
              assignedNumbers.map((number) => (
                <div key={number.id} className="border-b border-border/60 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-mono font-semibold text-white">
                      <Phone size={16} className="text-emerald-400" />
                      {number.phone_number}
                    </div>
                    <button
                      type="button"
                      title="Enable incoming calls"
                      aria-label={`Enable incoming calls for ${number.phone_number}`}
                      onClick={() => enableIncomingCalls(number)}
                      disabled={enablingIncomingId !== null}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-textMuted transition hover:border-emerald-400/50 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Radio size={15} className={enablingIncomingId === number.id ? 'animate-pulse' : ''} />
                    </button>
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-xs text-textMuted">
                    <CheckCircle2 size={13} className="text-emerald-400" />
                    {number.status} {number.assigned_username ? `/ ${number.assigned_username}` : ''}
                  </div>
                </div>
              ))
            )}
          </div>

          <Link to="/admin/customers/new" className="mt-6 inline-flex text-sm text-primary hover:text-primary/80">
            Create a new customer
          </Link>
        </aside>
      </section>
    </div>
  );
}
