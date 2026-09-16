import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Phone, Activity, ArrowUpRight, Sparkles, Users, BarChart3 } from 'lucide-react';
import { Link } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function DashboardHome() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [wallets, setWallets] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [demoAssignment, setDemoAssignment] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [assigning, setAssigning] = useState(false);
  const [demoError, setDemoError] = useState('');

  useEffect(() => {
    async function loadData() {
      try {
        const token = localStorage.getItem('token');
        const [profileRes, walletRes] = await Promise.all([
          axios.get(`${API_URL}/v1/me`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${API_URL}/v1/wallets`, { headers: { Authorization: `Bearer ${token}` } })
        ]);
        setProfile(profileRes.data);
        setWallets(walletRes.data.balances);
        if (profileRes.data.demo_assignment) {
          setDemoAssignment(profileRes.data.demo_assignment);
        }
      } catch (err) {
        console.error('Failed to load dashboard data', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    if (!demoAssignment?.expires_at) return;
    
    // Immediate update
    const updateTime = () => {
      const now = new Date().getTime();
      const expires = new Date(demoAssignment.expires_at).getTime();
      const diff = expires - now;
      
      if (diff <= 0) {
        setTimeLeft('Expired');
        return false;
      }
      
      const totalMinutes = Math.floor(diff / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft(`${totalMinutes}:${seconds.toString().padStart(2, '0')}`);
      return true;
    };
    
    updateTime();
    const interval = setInterval(() => {
      if (!updateTime()) {
        clearInterval(interval);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [demoAssignment]);

  const handleStartDemo = async () => {
    setAssigning(true);
    setDemoError('');
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API_URL}/v1/phone-numbers/demo-assign`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success && res.data.assignment) {
        setDemoAssignment(res.data.assignment);
      }
    } catch (err: any) {
      setDemoError(err.response?.data?.error || err.message || 'Failed to assign demo number');
    } finally {
      setAssigning(false);
    }
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>;
  }

  const limits = profile?.limits || {};
  const availableLeads = wallets?.maps_credits?.available || 0;
  const totalLeads = profile?.dashboard_stats?.total_leads || 0;
  const callsToday = profile?.dashboard_stats?.calls_today || 0;
  const subscriptionEndsAt = profile?.subscription?.end_date
    ? new Date(profile.subscription.end_date).getTime()
    : null;
  const subscriptionDaysRemaining = subscriptionEndsAt === null
    ? null
    : Math.max(0, Math.ceil((subscriptionEndsAt - Date.now()) / (24 * 60 * 60 * 1000)));
  const hasActiveCallingSubscription = Boolean(
    profile?.subscription?.status === 'active'
      && (subscriptionEndsAt === null || subscriptionEndsAt > Date.now())
  );
  const demoUsage = profile?.demo_usage;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex justify-between items-end mb-10">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Welcome back, {user?.display_name?.split(' ')[0] || user?.username}</h1>
          <p className="text-textMuted">Here is an overview of your workspace and available resources.</p>
        </div>
        <Link to="/enrichment" className="btn-primary flex items-center gap-2">
          New Extraction <ArrowUpRight size={18} />
        </Link>
      </header>

      {demoUsage && (
        <section className="rounded-lg border border-primary/30 bg-primary/10 p-5 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <Sparkles size={20} className="text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Free demo usage</h2>
              <p className="text-sm text-textMuted mt-1">Test the complete calling and lead enrichment workflow before upgrading.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-lg border border-border/60 bg-background/45 px-4 py-2.5">
              <div className="text-xs text-textMuted">Calls Used</div>
              <div className="font-bold text-white mt-0.5">{demoUsage.calls_used} of {demoUsage.call_limit}</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/45 px-4 py-2.5">
              <div className="text-xs text-textMuted">Keywords Used</div>
              <div className="font-bold text-white mt-0.5">{demoUsage.keywords_used} of {demoUsage.keyword_limit}</div>
            </div>

            {demoAssignment ? (
              <div className="rounded-lg border border-primary/40 bg-primary/20 px-4 py-2.5 flex flex-col justify-center">
                <div className="text-xs font-semibold text-primary/80 uppercase tracking-wide">Demo Number Active</div>
                <div className="text-sm font-bold text-white mt-0.5 flex items-center gap-2">
                  <span className="font-mono">{demoAssignment.phone_number}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${timeLeft === 'Expired' ? 'bg-red-500/20 text-red-400' : 'bg-primary/20 text-primary-light'}`}>
                    {timeLeft === 'Expired' ? 'Expired' : `${timeLeft} left`}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1 max-w-[200px]">
                {demoUsage.calls_remaining <= 0 ? (
                  <button disabled className="btn-primary inline-flex items-center justify-center gap-2 opacity-75 cursor-not-allowed">
                    Demo Completed
                  </button>
                ) : (
                  <button 
                    onClick={handleStartDemo} 
                    disabled={assigning}
                    className="btn-primary inline-flex items-center justify-center gap-2"
                  >
                    {assigning ? 'Starting...' : 'Start Demo Session'}
                  </button>
                )}
                {demoError && <span className="text-xs text-red-400 leading-tight">{demoError}</span>}
              </div>
            )}

            <Link to="/billing" className="btn-secondary inline-flex items-center gap-2 bg-surface hover:bg-surface-light border border-border/60">
              Upgrade Account <ArrowUpRight size={17} />
            </Link>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="glass-card p-6 flex flex-col relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><Users size={24} className="text-primary" /></div>
          <div className="w-12 h-12 rounded-xl bg-surface border border-border/50 flex items-center justify-center mb-4 shadow-inner"><Users size={24} className="text-primary" /></div>
          <div className="text-textMuted text-sm font-medium mb-1">Total Leads</div>
          <div className="text-3xl font-bold text-white">{Number(totalLeads).toLocaleString()}</div>
        </div>

        <div className="glass-card p-6 flex flex-col relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><BarChart3 size={24} className="text-secondary" /></div>
          <div className="w-12 h-12 rounded-xl bg-surface border border-border/50 flex items-center justify-center mb-4 shadow-inner"><BarChart3 size={24} className="text-secondary" /></div>
          <div className="text-textMuted text-sm font-medium mb-1">Available Leads</div>
          <div className="text-3xl font-bold text-white">{Number(availableLeads).toLocaleString()}</div>
        </div>

        <div className="glass-card p-6 flex flex-col relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><Phone size={24} className="text-amber-400" /></div>
          <div className="w-12 h-12 rounded-xl bg-surface border border-border/50 flex items-center justify-center mb-4 shadow-inner"><Phone size={24} className="text-amber-400" /></div>
          <div className="text-textMuted text-sm font-medium mb-1">Max Phone Numbers</div>
          <div className="text-3xl font-bold text-white">{limits.max_phone_numbers || 0}</div>
        </div>

        <div className="glass-card p-6 flex flex-col relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><Activity size={24} className="text-purple-400" /></div>
          <div className="w-12 h-12 rounded-xl bg-surface border border-border/50 flex items-center justify-center mb-4 shadow-inner"><Activity size={24} className="text-purple-400" /></div>
          <div className="text-textMuted text-sm font-medium mb-1">Total Calls Today</div>
          <div className="text-3xl font-bold text-white">{Number(callsToday).toLocaleString()}</div>
        </div>
      </div>

      <div className="mt-12 glass-card p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Active Subscription</h2>
          <Link to="/billing" className="text-sm text-primary hover:underline">Manage Billing</Link>
        </div>
        
        {profile?.subscription ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <div className="text-sm text-textMuted mb-1">Plan</div>
              <div className="font-semibold text-white capitalize">{profile.subscription.plan_name}</div>
            </div>
            <div>
              <div className="text-sm text-textMuted mb-1">Status</div>
              <div className={`font-semibold ${hasActiveCallingSubscription ? 'text-emerald-400' : 'text-red-400'}`}>
                {hasActiveCallingSubscription ? 'Active' : 'Expired'}
              </div>
            </div>
            <div>
              <div className="text-sm text-textMuted mb-1">Calling Access</div>
              <div className="font-semibold text-white">
                {subscriptionDaysRemaining === null ? 'No expiry date' : `${subscriptionDaysRemaining} days left`}
              </div>
              {profile.subscription.end_date && (
                <div className="text-xs text-textMuted mt-1">Ends {new Date(profile.subscription.end_date).toLocaleDateString()}</div>
              )}
            </div>
            <div>
              <div className="text-sm text-textMuted mb-1">Limits</div>
              <div className="text-sm text-textMuted">
                {limits.max_seats} Seats<br/>
                {limits.max_concurrent_calls > 0 ? `${limits.max_concurrent_calls} Concurrent Calls` : 'Unlimited Concurrent Calls'}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 p-4 rounded-xl flex items-center gap-3">
            <Activity size={20} />
            <div>
              <div className="font-semibold">No Active Subscription</div>
              <div className="text-sm opacity-90 mt-1">Please upgrade your plan or recharge your account via the billing portal.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
