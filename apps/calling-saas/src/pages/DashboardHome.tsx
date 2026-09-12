import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Phone, Activity, ArrowUpRight, Wallet, Map, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function DashboardHome() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [wallets, setWallets] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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
      } catch (err) {
        console.error('Failed to load dashboard data', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return <div className="flex h-64 items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>;
  }

  const limits = profile?.limits || {};
  const mapsCredits = wallets?.maps_credits?.available || 0;
  const callingBalance = (wallets?.calling_cents?.available || 0) / 100;
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
              <div className="text-xs text-textMuted">Calls remaining</div>
              <div className="font-bold text-white mt-0.5">{demoUsage.calls_remaining} of {demoUsage.call_limit}</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/45 px-4 py-2.5">
              <div className="text-xs text-textMuted">Keywords remaining</div>
              <div className="font-bold text-white mt-0.5">{demoUsage.keywords_remaining} of {demoUsage.keyword_limit}</div>
            </div>
            <Link to="/billing" className="btn-primary inline-flex items-center gap-2">
              Upgrade Account <ArrowUpRight size={17} />
            </Link>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="glass-card p-6 flex flex-col relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><Map size={24} className="text-primary" /></div>
          <div className="w-12 h-12 rounded-xl bg-surface border border-border/50 flex items-center justify-center mb-4 shadow-inner"><Map size={24} className="text-primary" /></div>
          <div className="text-textMuted text-sm font-medium mb-1">Maps Credits</div>
          <div className="text-3xl font-bold text-white">{mapsCredits.toLocaleString()}</div>
        </div>

        <div className="glass-card p-6 flex flex-col relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><Wallet size={24} className="text-emerald-400" /></div>
          <div className="w-12 h-12 rounded-xl bg-surface border border-border/50 flex items-center justify-center mb-4 shadow-inner"><Wallet size={24} className="text-emerald-400" /></div>
          <div className="text-textMuted text-sm font-medium mb-1">Calling Balance</div>
          <div className="text-3xl font-bold text-white">${callingBalance.toFixed(2)}</div>
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
          <div className="text-textMuted text-sm font-medium mb-1">Max Daily Calls</div>
          <div className="text-3xl font-bold text-white">{limits.max_daily_call_attempts || 0}</div>
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
                {limits.max_concurrent_calls} Concurrent Calls
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
