import { useState, useEffect } from 'react';
import axios from 'axios';
import { CreditCard, CheckCircle, PhoneCall, MapPin, Users, MessageCircle } from 'lucide-react';
import { useNotifications } from '../components/Notifications';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const WHATSAPP_NUMBER = '923004994645'; // Configured WhatsApp number

export default function Billing() {
  const { notify } = useNotifications();
  const [activeTab, setActiveTab] = useState<'build' | 'history'>('build');
  const [history, setHistory] = useState<any[]>([]);
  
  // Custom Plan State
  const [teamSize, setTeamSize] = useState<number>(0);
  const [leadsAmount, setLeadsAmount] = useState<number>(1000); // Default to 1,000 leads
  const [voiceRecording, setVoiceRecording] = useState<boolean>(false);

  // Pricing constants (USD)
  const PRICE_PER_USER_USD = 20;
  
  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const token = localStorage.getItem('token');
      const histRes = await axios.get(`${API_URL}/v1/wallets/ledger`, { headers: { Authorization: `Bearer ${token}` } });
      setHistory(histRes.data.transactions || []);
    } catch (err) {
      console.error(err);
    }
  }

  // Pricing Calculations
  const teamCostUsd = teamSize * PRICE_PER_USER_USD;
  const leadsCostUsd = Math.round(leadsAmount / 1000); // $1 per 1000 leads
  
  let recordingCostUsd = 0;
  if (voiceRecording) {
    if (teamSize === 1) recordingCostUsd = 5;
    else if (teamSize === 2) recordingCostUsd = 8;
    else if (teamSize === 3) recordingCostUsd = 11.5;
    else if (teamSize > 3) recordingCostUsd = 11.5 + (teamSize - 3) * 3;
  }
  
  const totalUsd = teamCostUsd + leadsCostUsd + recordingCostUsd;

  const handleWhatsAppCheckout = () => {
    if (totalUsd === 0) {
      notify('Please select at least 1 user or some leads to proceed.', 'error');
      return;
    }
    
    // Construct WhatsApp message with line breaks
    const text = `Hello Voice Calling Team! I want to purchase a custom package for my account:\n\n* Calling Seats:* ${teamSize} User(s)\n* Call Recording:* ${voiceRecording ? 'Yes' : 'No'}\n* Google Maps Leads:* ${leadsAmount.toLocaleString()} Leads\n* Total Price:* $${totalUsd.toLocaleString(undefined, {minimumFractionDigits: 2})}\n\nPlease guide me on how to pay via JazzCash/Bank so you can activate my account.`;
    
    // Encode for URL
    const encodedText = encodeURIComponent(text);
    const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodedText}`;
    
    // Open in new tab
    window.open(whatsappUrl, '_blank');
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="mb-10">
        <h1 className="text-4xl font-bold text-slate-900 mb-2 flex items-center gap-3">
          <CreditCard size={32} className="text-primary" />
          Billing & Plans
        </h1>
        <p className="text-textMuted">Build your custom plan and checkout instantly via WhatsApp.</p>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-border/50 mb-8">
        <button
          onClick={() => setActiveTab('build')}
          className={`px-6 py-3 font-medium text-sm transition-all border-b-2 flex items-center gap-2 ${activeTab === 'build' ? 'border-primary text-primary' : 'border-transparent text-textMuted hover:text-text'}`}
        >
          <CreditCard size={16} /> Build Your Plan
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-6 py-3 font-medium text-sm transition-all border-b-2 ${activeTab === 'history' ? 'border-primary text-primary' : 'border-transparent text-textMuted hover:text-text'}`}
        >
          Transaction History
        </button>
      </div>

      {activeTab === 'build' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-8">
          
          {/* Left Panel: Sliders & Cards */}
          <div className="space-y-6">
            
            {/* Calling Package Card */}
            <div className="glass-card p-6 border border-border/50 relative overflow-hidden group hover:border-primary/50 transition-all">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-bl-full blur-2xl -z-10 group-hover:bg-primary/20 transition-all" />
              
              <div className="flex items-start justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center">
                    <PhoneCall size={24} className="text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 mb-1">Calling Seats</h3>
                    <p className="text-sm text-textMuted">$20 / month per user</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-extrabold text-slate-900">${teamCostUsd.toLocaleString()}</div>
                  <div className="text-xs text-textMuted mt-1">Calling Cost</div>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-sm text-textMuted font-medium">How many users do you need?</span>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => setTeamSize(Math.max(0, teamSize - 1))}
                        className="w-8 h-8 rounded-lg bg-surface border border-border/50 text-slate-700 flex items-center justify-center hover:bg-primary/20 hover:text-primary transition-all font-bold"
                      >
                        -
                      </button>
                      <span className="px-4 py-1.5 bg-surface border border-border/50 rounded-lg text-slate-900 font-bold flex items-center gap-2 min-w-[100px] justify-center">
                        <Users size={16} className="text-primary" /> {teamSize}
                      </span>
                      <button 
                        onClick={() => setTeamSize(Math.min(50, teamSize + 1))}
                        className="w-8 h-8 rounded-lg bg-surface border border-border/50 text-slate-700 flex items-center justify-center hover:bg-primary/20 hover:text-primary transition-all font-bold"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  
                  <input 
                    type="number" 
                    min="0"
                    value={teamSize}
                    onChange={(e) => setTeamSize(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full bg-surface border border-border/50 rounded-lg px-4 py-2 text-slate-900 font-medium focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all mb-4"
                    placeholder="Enter number of users"
                  />

                  <div className="pt-2">
                    <label className="billing-recording-option flex items-start gap-3 cursor-pointer group p-3 rounded-lg border border-border/50 hover:border-primary/50 transition-colors bg-surface">
                      <div className="mt-0.5">
                        <input
                          type="checkbox"
                          checked={voiceRecording}
                          onChange={(e) => setVoiceRecording(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-600 text-primary focus:ring-primary focus:ring-offset-background bg-background"
                        />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-900 group-hover:text-primary transition-colors">Enable Call Recording</div>
                        <div className="text-xs text-textMuted mt-0.5">Records all inbound and outbound calls. (+$5.00 base, with volume discounts)</div>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="bg-background/40 rounded-xl p-4 border border-border/30">
                  <h4 className="text-sm font-semibold text-slate-900 mb-3">Included with Calling:</h4>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4">
                    <li className="flex items-center gap-2 text-sm text-textMuted"><CheckCircle size={14} className="text-emerald-400" /> Dedicated caller number</li>
                    <li className="flex items-center gap-2 text-sm text-textMuted"><CheckCircle size={14} className="text-emerald-400" /> Unlimited USA/Canada Calls</li>
                    <li className="flex items-center gap-2 text-sm text-textMuted"><CheckCircle size={14} className="text-emerald-400" /> Call tracking & recording</li>
                    <li className="flex items-center gap-2 text-sm text-textMuted"><CheckCircle size={14} className="text-emerald-400" /> Web Dialer Access</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Leads Package Card */}
            <div className="glass-card p-6 border border-border/50 relative overflow-hidden group hover:border-emerald-500/50 transition-all">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-bl-full blur-2xl -z-10 group-hover:bg-emerald-500/20 transition-all" />
              
              <div className="flex items-start justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                    <MapPin size={24} className="text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 mb-1">Google Maps Leads</h3>
                    <p className="text-sm text-textMuted">$1 / 1,000 Leads (One-time)</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-extrabold text-slate-900">${leadsCostUsd.toLocaleString()}</div>
                  <div className="text-xs text-textMuted mt-1">Leads Cost</div>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-sm text-textMuted font-medium">How many leads do you want?</span>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => setLeadsAmount(Math.max(0, leadsAmount - 1000))}
                        className="w-8 h-8 rounded-lg bg-surface border border-border/50 text-slate-700 flex items-center justify-center hover:bg-emerald-500/20 hover:text-emerald-400 transition-all font-bold"
                      >
                        -
                      </button>
                      <span className="px-4 py-1.5 bg-surface border border-border/50 rounded-lg text-slate-900 font-bold flex items-center gap-2 min-w-[130px] justify-center">
                        <CheckCircle size={16} className="text-emerald-400" /> {leadsAmount.toLocaleString()}
                      </span>
                      <button 
                        onClick={() => setLeadsAmount(Math.min(150000, leadsAmount + 1000))}
                        className="w-8 h-8 rounded-lg bg-surface border border-border/50 text-slate-700 flex items-center justify-center hover:bg-emerald-500/20 hover:text-emerald-400 transition-all font-bold"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  
                  <input 
                    type="number" 
                    min="0" step="1"
                    value={leadsAmount}
                    onChange={(e) => setLeadsAmount(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full bg-surface border border-border/50 rounded-lg px-4 py-2 text-slate-900 font-medium focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all"
                    placeholder="Enter number of leads"
                  />
                </div>

                <div className="bg-background/40 rounded-xl p-4 border border-border/30">
                  <h4 className="text-sm font-semibold text-slate-900 mb-3">Included with Leads:</h4>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4">
                    <li className="flex items-center gap-2 text-sm text-textMuted"><CheckCircle size={14} className="text-emerald-400" /> Live Maps Extraction</li>
                    <li className="flex items-center gap-2 text-sm text-textMuted"><CheckCircle size={14} className="text-emerald-400" /> Verified Phone Numbers</li>
                    <li className="flex items-center gap-2 text-sm text-textMuted"><CheckCircle size={14} className="text-emerald-400" /> One-time credit (never expires)</li>
                    <li className="flex items-center gap-2 text-sm text-textMuted"><CheckCircle size={14} className="text-emerald-400" /> Instant CRM sync</li>
                  </ul>
                </div>
              </div>
            </div>

          </div>
          
          {/* Right Panel: Order Summary Checkout */}
          <div className="space-y-6">
            <div className="glass-card p-6 border border-border/60 sticky top-24 bg-surface/60 shadow-xl">
              <h3 className="text-xl font-bold text-slate-900 mb-6 border-b border-border/50 pb-4">Order Summary</h3>
              
              <div className="space-y-5 mb-8">
                <div className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2 text-textMuted">
                    <Users size={16} /> Team Size ({teamSize})
                  </div>
                  <span className="text-slate-900 font-medium">${teamCostUsd.toLocaleString()}</span>
                </div>
                
                <div className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2 text-textMuted">
                    <MapPin size={16} /> Maps Leads ({leadsAmount.toLocaleString()})
                  </div>
                  <span className="text-slate-900 font-medium">${leadsCostUsd.toLocaleString()}</span>
                </div>
                
                {voiceRecording && (
                  <div className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2 text-textMuted">
                      <PhoneCall size={16} /> Call Recording Add-on
                    </div>
                    <span className="text-slate-900 font-medium">${recordingCostUsd.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                  </div>
                )}
              </div>
              
              <div className="border-t border-border/60 pt-6 mb-8">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-sm font-medium text-textMuted">Total Cost (USD)</span>
                  <span className="text-4xl font-black text-slate-900">${totalUsd.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                <div className="text-xs text-textMuted text-right">No hidden fees or taxes</div>
              </div>

              <div className="space-y-4">
                <button 
                  onClick={handleWhatsAppCheckout}
                  className="w-full py-4 rounded-xl bg-[#25D366] text-slate-900 font-bold text-lg hover:bg-[#128C7E] transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(37,211,102,0.3)] hover:shadow-[0_0_25px_rgba(37,211,102,0.5)] transform hover:-translate-y-0.5"
                >
                  <MessageCircle size={22} className="fill-current" />
                  Buy via WhatsApp
                </button>
                <p className="text-xs text-center text-textMuted leading-relaxed">
                  Clicking this will open WhatsApp directly to our admin team.<br/>
                  We accept JazzCash and EasyPaisa.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="glass-card p-6 overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border/50 text-textMuted text-sm">
                <th className="pb-3 font-medium">Date</th>
                <th className="pb-3 font-medium">Description</th>
                <th className="pb-3 font-medium">Unit</th>
                <th className="pb-3 font-medium">Amount</th>
                <th className="pb-3 font-medium">Balance After</th>
              </tr>
            </thead>
            <tbody>
              {history.map((tx, i) => (
                <tr key={i} className="border-b border-border/30 hover:bg-surface/30 transition-colors">
                  <td className="py-4 text-sm text-textMuted">{new Date(tx.created_at).toLocaleString()}</td>
                  <td className="py-4 text-sm">{tx.description}</td>
                  <td className="py-4 text-sm text-textMuted">
                    {tx.unit === 'calling_cents' ? 'Calling Balance' : tx.unit === 'maps_credits' ? 'Leads' : tx.unit}
                  </td>
                  <td className={`py-4 text-sm font-bold ${['credit', 'release'].includes(tx.operation_type) ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {['credit', 'release'].includes(tx.operation_type) ? '+' : '-'}{tx.unit === 'calling_cents' ? (tx.amount/100).toFixed(2) : tx.amount}
                  </td>
                  <td className="py-4 text-sm font-mono text-textMuted">
                    {tx.unit === 'calling_cents' ? (tx.balance_after/100).toFixed(2) : tx.balance_after}
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-textMuted">No transactions found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
