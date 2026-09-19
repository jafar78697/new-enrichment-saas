import { useState } from 'react';
import { ArrowRight, ArrowUpRight, BarChart3, Check, ChevronDown, Clock3, Filter, LayoutDashboard, ListFilter, Menu, Phone, PhoneCall, Search, Settings, Target, Users, X } from 'lucide-react';
import './frontend-preview.css';

const navigation = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Lead Enrichment', icon: ListFilter },
  { label: 'Lead List', icon: Users },
  { label: 'Call History', icon: PhoneCall },
  { label: 'Phone Numbers', icon: Phone },
];
const leads = [
  { name: 'Olivia Martin', company: 'Northstar Labs', role: 'VP of Growth', status: 'Ready to call', activity: 'Today, 10:42 AM' },
  { name: 'James Wilson', company: 'Vertex Systems', role: 'Head of Sales', status: 'In progress', activity: 'Today, 9:18 AM' },
  { name: 'Mia Thompson', company: 'Cedar & Co.', role: 'Founder', status: 'Ready to call', activity: 'Yesterday' },
  { name: 'Noah Williams', company: 'Atlas Commerce', role: 'Operations Lead', status: 'Contacted', activity: 'Mon, 4:30 PM' },
];
const weeklyActivity = [
  { day: 'Mon', calls: 42, conversations: 25 }, { day: 'Tue', calls: 64, conversations: 38 },
  { day: 'Wed', calls: 53, conversations: 31 }, { day: 'Thu', calls: 79, conversations: 50 },
  { day: 'Fri', calls: 68, conversations: 44 }, { day: 'Sat', calls: 92, conversations: 60 },
  { day: 'Sun', calls: 86, conversations: 55 },
];

export default function FrontendPreview() {
  const [active, setActive] = useState('Overview');
  const [dialing, setDialing] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [readyOnly, setReadyOnly] = useState(false);
  const visibleLeads = leads.filter(lead => `${lead.name} ${lead.company} ${lead.role}`.toLowerCase().includes(query.toLowerCase()) && (!readyOnly || lead.status === 'Ready to call'));
  const selectPage = (page: string) => { setActive(page); setMobileOpen(false); };

  return (
    <div className="preview-app">
      {mobileOpen && <button className="preview-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <aside className={`preview-sidebar ${mobileOpen ? 'is-open' : ''}`}>
        <div className="preview-brand">
          <div className="preview-logo"><svg viewBox="0 0 100 100" aria-hidden="true"><path fill="currentColor" fillRule="evenodd" d="M50 10L90 30V70L50 90L10 70V30ZM50 27L28 40V60L50 73L72 60V40Z" /><circle cx="50" cy="50" r="7" fill="currentColor" /></svg></div>
          <span>Jento<small>Voice Calling</small></span>
          <button className="preview-close" aria-label="Close menu" onClick={() => setMobileOpen(false)}><X size={18} /></button>
        </div>
        <div className="preview-workspace"><div className="workspace-mark">AC</div><div><strong>Acme Calling</strong><small>Team workspace</small></div><ChevronDown size={15} /></div>
        <nav className="preview-nav" aria-label="Preview navigation">
          <small className="nav-label">Workspace</small>
          {navigation.map(({ label, icon: Icon }) => <button key={label} onClick={() => selectPage(label)} className={active === label ? 'active' : ''} aria-current={active === label ? 'page' : undefined}><Icon size={18} /><span>{label}</span>{label === 'Lead List' && <b>24</b>}</button>)}
          <small className="nav-label nav-spacer">Account</small>
          <button onClick={() => selectPage('Billing')} className={active === 'Billing' ? 'active' : ''}><BarChart3 size={18} /><span>Billing & usage</span></button>
          <button onClick={() => selectPage('Settings')} className={active === 'Settings' ? 'active' : ''}><Settings size={18} /><span>Settings</span></button>
        </nav>
        <div className="preview-upgrade"><span className="plan-label">Your workspace plan</span><strong>Room to grow.</strong><p>More leads. More conversations.<br />A little more room for your team.</p><button onClick={() => selectPage('Billing')}>Explore plans <ArrowRight size={15} /></button></div>
        <div className="preview-profile"><div className="avatar">JD</div><div><strong>John Doe</strong><small>Workspace admin</small></div></div>
      </aside>

      <main className="preview-main">
        <header className="preview-topbar"><button className="preview-menu" aria-label="Open menu" onClick={() => setMobileOpen(true)}><Menu size={21} /></button><div className="crumb">Workspace <span>/</span> <strong>{active}</strong></div><div className="top-actions"><span className="preview-sample">Design preview · Sample data</span><div className="top-avatar">JD</div></div></header>
        <div className="preview-content">
          <div className="page-heading"><div><div className="eyebrow">Your daily overview</div><h1>Good morning, John.</h1><p>A clear view of your leads, calls and team activity.</p></div><button className="primary-action" onClick={() => setDialing(!dialing)}><PhoneCall size={17} />{dialing ? 'Close dialer preview' : 'Open dialer'}<ArrowUpRight size={16} /></button></div>
          {dialing && <div className="dialer-notice" role="status"><Phone size={17} /><span>Dialer preview — calls are disabled in this design preview.</span><button onClick={() => setDialing(false)} aria-label="Close dialer preview"><X size={16} /></button></div>}
          <section className="hero-strip"><div className="hero-copy"><div className="strip-icon"><PhoneCall size={21} /></div><div><span className="strip-kicker">Next in your queue</span><h2>24 leads. Your next conversation.</h2><p>Your enriched contacts are ready to reach out to.</p></div></div><button className="outline-action" onClick={() => { setReadyOnly(true); document.getElementById('preview-leads')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>Review your leads <ArrowRight size={16} /></button></section>
          <div className="metric-grid">
            <Metric icon={Users} label="Total leads" value="1,284" change="18.4%" tone="stone" caption="in your workspace" />
            <Metric icon={Target} label="Ready to call" value="248" change="12.6%" tone="charcoal" caption="enriched & verified" />
            <Metric icon={PhoneCall} label="Calls today" value="86" change="24.8%" tone="sage" caption="across your team" />
            <Metric icon={Clock3} label="Talk time" value="4h 32m" change="8.2%" tone="sand" caption="conversations today" />
          </div>

          <div className="dashboard-grid">
            <section className="panel chart-panel"><div className="panel-header"><div><span className="panel-kicker">Team activity</span><h3>A week of conversations</h3></div><span className="period-label">Last 7 days</span></div><div className="chart-legend"><span><i className="legend-blue" /> Calls made</span><span><i className="legend-stone" /> Conversations</span></div><div className="chart" role="img" aria-label="Weekly activity: Monday 42 calls and 25 conversations; Tuesday 64 and 38; Wednesday 53 and 31; Thursday 79 and 50; Friday 68 and 44; Saturday 92 and 60; Sunday 86 and 55."><div className="chart-y"><span>100</span><span>75</span><span>50</span><span>25</span><span>0</span></div><div className="chart-area"><div className="chart-grid"><i /><i /><i /><i /><i /></div><div className="chart-bars">{weeklyActivity.map(day => <div className="chart-day" key={day.day}><div className="bar-pair"><div className="call-bar" style={{ height: `${day.calls}%` }} /><div className="conversation-bar" style={{ height: `${day.conversations}%` }} /></div><span>{day.day}</span></div>)}</div></div></div><div className="chart-footer"><span><strong>484</strong> calls this week</span><span><ArrowUpRight size={14} /> 18% over last week</span></div></section>
            <section className="panel goal-panel"><div className="panel-header"><div><span className="panel-kicker">Monthly target</span><h3>Steady progress.</h3></div><Target size={20} /></div><div className="goal-total">68<span>%</span></div><div className="goal-progress" role="progressbar" aria-label="Monthly calling goal" aria-valuenow={68} aria-valuemin={0} aria-valuemax={100}><span /></div><div className="goal-numbers"><strong>1,024 calls</strong><span>of 1,500</span></div><div className="goal-divider" /><div className="goal-remaining"><span>Remaining this month</span><strong>476 calls</strong></div><div className="goal-note"><Check size={16} /><span>14% ahead of last month</span></div></section>
          </div>

          <section className="panel leads-panel" id="preview-leads"><div className="panel-header"><div><span className="panel-kicker">Your contacts</span><h3>Pick up where you left off</h3></div><span className="lead-count">{visibleLeads.length} leads</span></div><div className="table-tools"><div className="search-box"><Search size={17} /><input aria-label="Search leads" placeholder="Search by name or company" value={query} onChange={e => setQuery(e.target.value)} /></div><button className={`filter-btn ${readyOnly ? 'selected' : ''}`} aria-pressed={readyOnly} onClick={() => setReadyOnly(!readyOnly)}><Filter size={15} />{readyOnly ? 'Ready to call' : 'Filter leads'}{readyOnly && <X size={13} />}</button></div><div className="lead-table"><div className="lead-row lead-head"><span>Name / Company</span><span>Role</span><span>Status</span><span>Last activity</span></div>{visibleLeads.map(lead => <div className="lead-row" key={lead.name}><div className="lead-name"><div className="lead-avatar">{lead.name.split(' ').map(n => n[0]).join('')}</div><div><strong>{lead.name}</strong><small>{lead.company}</small></div></div><span className="role">{lead.role}</span><span><em className={`status ${lead.status === 'Contacted' ? 'contacted' : lead.status === 'In progress' ? 'in-progress' : ''}`}><i />{lead.status}</em></span><span className="last-activity">{lead.activity}</span></div>)}</div>{visibleLeads.length === 0 && <p className="empty-leads">No matching leads. Try another name or clear the filter.</p>}<div className="table-footer">Showing {visibleLeads.length} sample contacts<span>All times in your workspace timezone</span></div></section>
          <footer className="preview-footer"><span>Jento / Voice Calling</span><span>Everything you need for the next conversation.</span></footer>
        </div>
      </main>
    </div>
  );
}

function Metric({ icon: Icon, label, value, change, tone, caption }: { icon: typeof Users; label: string; value: string; change: string; tone: string; caption: string }) {
  return <div className={`metric-card ${tone}`}><div className="metric-heading"><span>{label}</span><Icon size={18} /></div><div className="metric-value">{value}</div><div className="metric-caption">{caption}</div><div className="metric-change"><span><ArrowUpRight size={13} /> {change}</span><small>vs last week</small></div></div>;
}
