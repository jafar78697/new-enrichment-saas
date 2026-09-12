import React, { useState } from 'react';
import { Phone, Search, ShoppingCart, CheckCircle2 } from 'lucide-react';
import axios from 'axios';
import { useNotifications } from '../components/Notifications';

export default function PhoneNumbers() {
  const { notify } = useNotifications();
  const [areaCode, setAreaCode] = useState('');
  const [searching, setSearching] = useState(false);
  const [availableNumbers, setAvailableNumbers] = useState<any[]>([]);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [myNumbers, setMyNumbers] = useState<any[]>([]);

  const getNumberValue = (number: any) => number.phoneNumber || number.phone || number.phone_number;

  // Fetch already purchased numbers on mount
  React.useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    axios.get(`${API_URL}/v1/phone-numbers`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        if (res.data?.phoneNumbers) {
          setMyNumbers(res.data.phoneNumbers.map((n: any) => ({ phone: n.phone_number, status: 'active', cost: '$1.50/mo' })));
        }
      }).catch(err => console.error(err));
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearching(true);
    
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Please log in before searching phone numbers.');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const res = await axios.get(`${API_URL}/v1/phone-numbers/search?areaCode=${areaCode}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data?.availablePhoneNumbers) {
        setAvailableNumbers(res.data.availablePhoneNumbers);
      }
    } catch (err) {
      console.error('Failed to search numbers:', err);
      notify('Failed to connect to the backend API.', 'error');
    }
    setSearching(false);
  };

  const handlePurchase = async (phone: string) => {
    setPurchasing(phone);
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Please log in before purchasing a phone number.');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const res = await axios.post(`${API_URL}/v1/phone-numbers/purchase`, { phoneNumber: phone }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data?.success) {
        setMyNumbers([{ phone, status: 'active', cost: '$1.50/mo' }, ...myNumbers]);
        setAvailableNumbers(availableNumbers.filter(n => getNumberValue(n) !== phone));
        notify(`${phone} is now assigned to your account.`, 'success');
      }
    } catch (err) {
      console.error('Failed to purchase:', err);
      notify('Failed to purchase the phone number.', 'error');
    }
    setPurchasing(null);
  };

  return (
    <div className="animate-in fade-in duration-500 max-w-5xl mx-auto pb-12">
      <header className="mb-10">
        <h1 className="text-3xl font-bold text-white mb-2">Phone Numbers</h1>
        <p className="text-textMuted">Buy and manage phone numbers for your calling agents.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-6">
            <Search size={18} className="text-primary" /> Find New Numbers
          </h2>
          
          <form onSubmit={handleSearch} className="flex gap-4 mb-6">
            <div className="flex-1">
              <input 
                type="text" 
                value={areaCode}
                onChange={(e) => setAreaCode(e.target.value)}
                placeholder="Area Code" 
                className="input-field"
                maxLength={3}
              />
            </div>
            <button type="submit" disabled={searching} className="btn-primary whitespace-nowrap min-w-[120px]">
              {searching ? 'Searching...' : 'Search'}
            </button>
          </form>

          <div className="space-y-3">
            {availableNumbers.length > 0 ? availableNumbers.map((n, i) => (
              (() => {
                const phoneValue = getNumberValue(n);
                return (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-surface/50 border border-border">
                <div>
                  <div className="text-white font-medium tracking-wider">{phoneValue}</div>
                  <div className="text-xs text-textMuted">{n.locality}, {n.region}</div>
                </div>
                <button 
                  onClick={() => handlePurchase(phoneValue)}
                  disabled={purchasing !== null}
                  className="btn-secondary text-sm py-1.5 px-3 flex items-center gap-2 hover:bg-primary hover:text-white hover:border-primary group"
                >
                  {purchasing === phoneValue ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <><ShoppingCart size={14} className="text-textMuted group-hover:text-white" /> Buy $1.50</>
                  )}
                </button>
              </div>
                );
              })()
            )) : !searching && (
              <div className="text-center py-8 text-textMuted text-sm border border-dashed border-border rounded-lg">
                Enter an area code to search for numbers.
              </div>
            )}
          </div>
        </div>

        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-6">
            <Phone size={18} className="text-secondary" /> My Active Numbers
          </h2>
          
          <div className="space-y-3">
            {myNumbers.map((n, i) => (
              <div key={i} className="flex items-center justify-between p-4 rounded-lg bg-surface border border-border">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center">
                    <Phone size={18} className="text-secondary" />
                  </div>
                  <div>
                    <div className="text-white font-medium tracking-wider">{n.phone}</div>
                    <div className="text-xs text-textMuted flex items-center gap-1 mt-0.5">
                      <CheckCircle2 size={12} className="text-green-500" /> Active • {n.cost}
                    </div>
                  </div>
                </div>
                <button className="text-xs text-textMuted hover:text-white transition-colors">
                  Configure
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
