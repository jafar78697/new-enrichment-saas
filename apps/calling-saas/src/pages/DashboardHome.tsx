import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Phone, Activity, ArrowUpRight, ArrowRight, CalendarDays, Filter, Sparkles, Users, BarChart3, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { callsApi, type Call } from '../services/callsApi';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
type ActivityRange = 'weekly' | 'monthly' | 'custom';

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function DashboardHome() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [wallets, setWallets] = useState<any>(null);
  const [recentCalls, setRecentCalls] = useState<Call[]>([]);
  const [activityRange, setActivityRange] = useState<ActivityRange>('weekly');
  const [customStartDate, setCustomStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 6);
    return dateInputValue(date);
  });
  const [customEndDate, setCustomEndDate] = useState(() => dateInputValue(new Date()));
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
    callsApi.listCalls()
      .then((response) => setRecentCalls(response.calls || []))
      .catch(() => {
        // The dashboard remains usable when calling history is unavailable.
      });
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
  const canEnrich = user?.role !== 'agent' || user.can_scrape === true;
  const canCall = user?.role !== 'agent' || user.can_call === true;
  const primaryActionPath = canEnrich ? '/enrichment' : canCall ? '/leads' : '/dashboard';
  const primaryActionLabel = canEnrich ? 'New Extraction' : canCall ? 'Open Lead List' : 'View Workspace';
  const now = new Date();
  const rangeEnd = activityRange === 'custom' && customEndDate
    ? new Date(`${customEndDate}T23:59:59`)
    : now;
  const rangeStart = activityRange === 'custom' && customStartDate
    ? new Date(`${customStartDate}T00:00:00`)
    : new Date(now.getTime() - (activityRange === 'monthly' ? 29 : 6) * 24 * 60 * 60 * 1000);
  const validRangeStart = rangeStart <= rangeEnd ? rangeStart : rangeEnd;
  const totalDays = Math.max(1, Math.floor((rangeEnd.getTime() - validRangeStart.getTime()) / (24 * 60 * 60 * 1000)) + 1);
  const bucketCount = activityRange === 'monthly' ? 4 : Math.min(7, totalDays);
  const bucketSize = Math.ceil(totalDays / bucketCount);
  const activitySeries = Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = new Date(validRangeStart);
    bucketStart.setDate(bucketStart.getDate() + index * bucketSize);
    bucketStart.setHours(0, 0, 0, 0);
    const bucketEnd = new Date(validRangeStart);
    bucketEnd.setDate(bucketEnd.getDate() + Math.min(totalDays, (index + 1) * bucketSize) - 1);
    bucketEnd.setHours(23, 59, 59, 999);
    const callsForBucket = recentCalls.filter((call) => {
      if (!call.started_at) return false;
      const started = new Date(call.started_at);
      return started >= bucketStart && started <= bucketEnd;
    });
    const conversations = callsForBucket.filter((call) => call.outcome === 'connected' || call.status === 'completed').length;
    const label = activityRange === 'weekly'
      ? bucketStart.toLocaleDateString(undefined, { weekday: 'short' })
      : activityRange === 'monthly'
        ? `Week ${index + 1}`
        : totalDays <= 7
          ? bucketStart.toLocaleDateString(undefined, { weekday: 'short' })
          : bucketStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return { day: label, calls: callsForBucket.length, conversations };
  });
  const activityCallPeak = Math.max(...activitySeries.map((day) => day.calls), 1);
  const activityTotal = activitySeries.reduce((total, day) => total + day.calls, 0);

  return (
    <div className="dashboard-home animate-in fade-in duration-500">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Your daily overview</div>
          <h1>Good morning, {user?.display_name?.split(' ')[0] || user?.username}.</h1>
          <p>Here is an overview of your workspace and available resources.</p>
        </div>
        <Link to={primaryActionPath} className="primary-action">
          <Users size={16} /> {primaryActionLabel} <ArrowUpRight size={16} />
        </Link>
      </div>

      {demoUsage && (
        <section className="hero-strip">
          <div className="hero-copy">
            <div className="strip-icon"><Sparkles size={21} /></div>
            <div>
              <span className="strip-kicker">Free demo usage</span>
              <h2>Test the complete calling workflow.</h2>
              <p>Calls: {demoUsage.calls_used} of {demoUsage.call_limit} &bull; Keywords: {demoUsage.keywords_used} of {demoUsage.keyword_limit}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {demoAssignment ? (
              <div className="text-xs text-right">
                <span className="block font-semibold text-primary uppercase tracking-wide mb-1">Demo Active: {demoAssignment.phone_number}</span>
                <span className={`px-2 py-0.5 rounded-full ${timeLeft === 'Expired' ? 'bg-red-500/20 text-red-400' : 'bg-primary/20 text-primary-light'}`}>
                  {timeLeft === 'Expired' ? 'Expired' : `${timeLeft} left`}
                </span>
              </div>
            ) : (
              <div>
                {demoUsage.calls_remaining <= 0 ? (
                  <button disabled className="outline-action opacity-50 cursor-not-allowed">Demo Completed</button>
                ) : (
                <button 
                  onClick={handleStartDemo} 
                  disabled={assigning} 
                  className="primary-action"
                  style={{ backgroundColor: '#16a34a', borderColor: '#16a34a', color: 'white' }}
                >
                  {assigning ? 'Starting...' : 'Start Demo Session'} <ArrowRight size={16} />
                </button>
                )}
                {demoError && <div className="text-xs text-red-400 mt-1">{demoError}</div>}
              </div>
            )}
            <a 
              href="https://www.youtube.com/watch?v=WMafaouAjQo" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="primary-action" 
              style={{ backgroundColor: '#dc2626', borderColor: '#dc2626', color: 'white' }}
            >
              YouTube Tutorial
            </a>
            <Link to="/billing" className="primary-action">
              Upgrade Account
            </Link>
          </div>
        </section>
      )}



      <div className="metric-grid">
        <div className="metric-card stone">
          <div className="metric-heading"><span>Total Leads</span><Users size={18} /></div>
          <div className="metric-value">{Number(totalLeads).toLocaleString()}</div>
          <div className="metric-caption">Enriched in your workspace</div>
          <div className="metric-change"><span><Check size={13} /> Live data</span><small>from lead list</small></div>
        </div>

        <div className="metric-card sage">
          <div className="metric-heading"><span>Available Leads</span><BarChart3 size={18} /></div>
          <div className="metric-value">{Number(availableLeads).toLocaleString()}</div>
          <div className="metric-caption">Remaining credits</div>
          <div className="metric-change"><span><ArrowUpRight size={13} /> Ready</span><small>maps credits</small></div>
        </div>

        <div className="metric-card sand">
          <div className="metric-heading"><span>Max Phone Numbers</span><Phone size={18} /></div>
          <div className="metric-value">{limits.max_phone_numbers || 0}</div>
          <div className="metric-caption">Included in your plan</div>
          <div className="metric-change"><span><Check size={13} /> Calling</span><small>number capacity</small></div>
        </div>

        <div className="metric-card charcoal">
          <div className="metric-heading"><span>Total Calls Today</span><Activity size={18} /></div>
          <div className="metric-value">{Number(callsToday).toLocaleString()}</div>
          <div className="metric-caption">Across your workspace</div>
          <div className="metric-change"><span><ArrowUpRight size={13} /> Today</span><small>call activity</small></div>
        </div>
      </div>

      <div className="dashboard-grid dashboard-grid-single">
        <section className="panel chart-panel">
          <div className="panel-header">
            <div><span className="panel-kicker">Calling overview</span><h3>Team activity</h3></div>
            <div className="activity-filter-wrap">
              <label className="activity-filter"><Filter size={15} /><span className="sr-only">Activity range</span><select value={activityRange} onChange={(event) => setActivityRange(event.target.value as ActivityRange)}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="custom">Custom dates</option></select></label>
              {activityRange === 'custom' && <div className="activity-date-fields"><label><CalendarDays size={13} /><span className="sr-only">Start date</span><input type="date" value={customStartDate} onChange={(event) => setCustomStartDate(event.target.value)} /></label><span>to</span><label><CalendarDays size={13} /><span className="sr-only">End date</span><input type="date" value={customEndDate} onChange={(event) => setCustomEndDate(event.target.value)} /></label></div>}
            </div>
          </div>
          <div className="chart-legend"><span><i className="legend-blue" /> Calls made</span><span><i className="legend-stone" /> Connected calls</span></div>
          <div className="chart" role="img" aria-label={`${activityTotal} calls in the selected activity range.`}>
            <div className="chart-y"><span>100</span><span>75</span><span>50</span><span>25</span><span>0</span></div>
            <div className="chart-area">
              <div className="chart-grid"><i /><i /><i /><i /><i /></div>
              <div className="chart-bars">
                {activitySeries.map((day) => <div className="chart-day" key={day.day}><div className="bar-pair"><div className="call-bar" style={{ height: `${(day.calls / activityCallPeak) * 100}%` }} /><div className="conversation-bar" style={{ height: `${(day.conversations / activityCallPeak) * 100}%` }} /></div><span>{day.day}</span></div>)}
              </div>
            </div>
          </div>
          <div className="chart-footer"><span><strong>{activityTotal.toLocaleString()}</strong> calls in selected range</span><span><ArrowUpRight size={14} /> Live activity</span></div>
        </section>

      </div>

      <div className="panel plan-panel">
        <div className="panel-header">
          <div>
            <span className="panel-kicker">Active Subscription</span>
            <h3>Plan Overview</h3>
          </div>
          <Link to="/billing" className="text-sm text-primary hover:underline">Manage Billing</Link>
        </div>
        
        {profile?.subscription ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 p-6">
            <div>
              <div className="text-sm text-textMuted mb-1">Plan</div>
              <div className="font-semibold text-slate-900 capitalize">{profile.subscription.plan_name || 'Calling plan'}</div>
            </div>
            <div>
              <div className="text-sm text-textMuted mb-1">Status</div>
              <div className={`font-semibold ${hasActiveCallingSubscription ? 'text-emerald-500' : 'text-red-500'}`}>
                {hasActiveCallingSubscription ? 'Active' : 'Expired'}
              </div>
            </div>
            <div>
              <div className="text-sm text-textMuted mb-1">Calling Access</div>
              <div className="font-semibold text-slate-900">
                {subscriptionDaysRemaining === null ? 'No expiry date' : `${subscriptionDaysRemaining} days left`}
              </div>
              {profile.subscription.end_date && (
                <div className="text-xs text-textMuted mt-1">Ends {new Date(profile.subscription.end_date).toLocaleDateString()}</div>
              )}
            </div>
            <div>
              <div className="text-sm text-textMuted mb-1">Limits</div>
              <div className="text-sm text-slate-700">
                {limits.max_seats} Seats<br/>
                {limits.max_concurrent_calls > 0 ? `${limits.max_concurrent_calls} Concurrent Calls` : 'Unlimited Concurrent Calls'}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl flex items-center gap-3 m-6">
            <Activity size={20} className="text-amber-500" />
            <div>
              <div className="font-semibold">No Active Subscription</div>
              <div className="text-sm opacity-90 mt-1">Please upgrade your plan or recharge your account via the billing portal.</div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Footer ──────────────────────────────────────────────────────── */}
      <footer style={{
        marginTop: 56,
        borderTop: '1px solid #e2e8f0',
        padding: '40px 0 32px',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 32,
          marginBottom: 32,
        }}>
          {/* Brand */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10,
                background: '#2563eb', color: '#fff',
                display: 'grid', placeItems: 'center',
                fontSize: 14, fontWeight: 800,
                boxShadow: '0 4px 12px #2563eb30',
              }}>J</div>
              <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.8, color: '#0f172a' }}>
                Jento<span style={{ color: '#2563eb', fontWeight: 400 }}> AI</span>
              </span>
            </div>
            <p style={{ color: '#64748b', fontSize: 12, lineHeight: 1.6, maxWidth: 220, margin: 0 }}>
              Lead enrichment, outreach &amp; voice calling — everything your sales team needs.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase' as const, letterSpacing: 1.2, marginBottom: 14 }}>Quick Links</div>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
              <Link to="/leads" style={{ color: '#64748b', fontSize: 13, textDecoration: 'none' }}>Lead List</Link>
              <Link to="/calls" style={{ color: '#64748b', fontSize: 13, textDecoration: 'none' }}>Call History</Link>
              <Link to="/employees" style={{ color: '#64748b', fontSize: 13, textDecoration: 'none' }}>Employees</Link>
              <Link to="/settings" style={{ color: '#64748b', fontSize: 13, textDecoration: 'none' }}>Settings</Link>
            </div>
          </div>

          {/* Resources */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase' as const, letterSpacing: 1.2, marginBottom: 14 }}>Resources</div>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
              <a href="https://youtu.be/WMafaouAjQo" target="_blank" rel="noopener noreferrer" style={{ color: '#64748b', fontSize: 13, textDecoration: 'none' }}>Video Tutorial</a>
              <a href="https://jentoai.pro" target="_blank" rel="noopener noreferrer" style={{ color: '#64748b', fontSize: 13, textDecoration: 'none' }}>JentoAI Pro</a>
              <a href="https://voice.jentoai.pro" target="_blank" rel="noopener noreferrer" style={{ color: '#64748b', fontSize: 13, textDecoration: 'none' }}>Voice Platform</a>
            </div>
          </div>

          {/* Support */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase' as const, letterSpacing: 1.2, marginBottom: 14 }}>Support</div>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
              <span style={{ color: '#64748b', fontSize: 13 }}>support@jentoai.pro</span>
              <span style={{ color: '#64748b', fontSize: 13 }}>WhatsApp: +1 (203) 555-0100</span>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid #e2e8f0',
          paddingTop: 20,
          flexWrap: 'wrap' as const,
          gap: 12,
        }}>
          <span style={{ color: '#94a3b8', fontSize: 11 }}>© {new Date().getFullYear()} Jento AI. All rights reserved.</span>
          <span style={{ color: '#94a3b8', fontSize: 11 }}>Lead enrichment · Outreach · Growth</span>
        </div>
      </footer>
    </div>
  );
}
