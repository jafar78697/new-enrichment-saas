import { useEffect, useState, useRef, useCallback } from 'react';
import StatusBadge from '../components/StatusBadge';
import SkeletonLoader from '../components/SkeletonLoader';
import Timeline from '../components/Timeline';
import DialerPopup from '../components/DialerPopup';
import type { FunnelLead, FunnelCampaign, FunnelStats, LeadEvent } from '../types';
import { funnelApi, FUNNEL_API_BASE } from '../services/funnelApi';

const CALLS_URL = (import.meta.env.VITE_CALLS_URL as string | undefined) || '';
const SOFTPHONE_ENABLED = !!CALLS_URL;

// ─── SVG Icons ────────────────────────────────────────────────────────
const Icons = {
  Email: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>,
  Call: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>,
  SMS: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>,
  WhatsApp: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>,
  Instagram: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>,
  Facebook: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>,
  LinkedIn: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg>,
  X: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4l16 16M4 20L20 4"></path></svg>,
};

// Funnel API client lives in services/funnelApi.ts (uses VITE_MAILER_URL)

// ─── Utility ──────────────────────────────────────────────────────────
export const getScoreBadgeColor = (score: number) => {
  if (score >= 70) return 'green';
  if (score >= 40) return 'yellow';
  return 'red';
};

export const parseOpportunityFlags = (websiteDataStr?: string) => {
  if (!websiteDataStr) return {};
  try {
    const data = JSON.parse(websiteDataStr);
    return {
      noChatbot: !data.chatbot,
      noBookingSystem: !data.booking_system,
      noEmailCapture: !data.email_capture,
      noReviewsAutomation: !data.reviews_automation,
      hasInstagram: !!data.instagram,
      hasFacebook: !!data.facebook,
      hasFacebookAds: !!data.facebook_pixel,
      noSSL: data.ssl === false,
      outdatedWebsite: !!data.outdated_website
    };
  } catch {
    return {};
  }
};

// ─── Lead Detail Panel ────────────────────────────────────────────────
function LeadDetailPanel({ leadId, onClose, onUpdate }: { leadId: string; onClose: () => void; onUpdate: () => void }) {
  const [lead, setLead] = useState<FunnelLead | null>(null);
  const [timeline, setTimeline] = useState<LeadEvent[]>([]);
  const [activeTab, setActiveTab] = useState<'info' | 'timeline' | 'notes'>('info');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [l, t] = await Promise.all([
        funnelApi.lead(leadId),
        fetch(`${FUNNEL_API_BASE}/leads/${leadId}/timeline`).then(r => r.json())
      ]);
      setLead(l);
      setTimeline(t);
      setNotes(l.last_call_notes || l.notes || '');
    } catch (err) {
      console.error('Failed to load lead detail:', err);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => { load(); }, [load]);

  const handleStageChange = async (newStage: string) => {
    setSaving(true);
    try {
      await funnelApi.stage(leadId, newStage);
      await load();
      onUpdate();
    } catch (err) {
      alert('Failed to update stage');
    } finally {
      setSaving(false);
    }
  };

  const saveNotes = async () => {
    setSaving(true);
    try {
      await funnelApi.callLog(leadId, { outcome: lead?.last_call_outcome || 'voicemail', notes });
      alert('Notes saved');
      onUpdate();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="detail-panel p-6">Loading...</div>;
  if (!lead) return null;

  const flags = parseOpportunityFlags(lead.website_data);

  return (
    <div className="fixed inset-y-0 right-0 w-[450px] bg-white border-l border-slate-200 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
      <div className="p-6 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{lead.salon_name}</h2>
          <div className="flex items-center gap-3 mt-1">
            <StatusBadge status={lead.funnel_stage} />
            <span className="text-xs text-slate-500 font-medium">Score: {lead.lead_score}</span>
          </div>
        </div>
        <button className="p-2 hover:bg-slate-50 rounded-full transition-colors" onClick={onClose}>✕</button>
      </div>

      <div className="flex border-b border-slate-100 px-6">
        {['info', 'timeline', 'notes'].map((tab) => (
          <button
            key={tab}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === tab ? 'border-violet-600 text-violet-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
            onClick={() => setActiveTab(tab as any)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {activeTab === 'info' && (
          <>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Funnel Stage</label>
              <select 
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                value={lead.funnel_stage} 
                onChange={(e) => handleStageChange(e.target.value)}
                disabled={saving}
              >
                {[
                  'scraped', 'enriched', 'qualified', 'email_sent', 'follow_up_1',
                  'follow_up_2', 'call_attempted', 'voicemail_left', 'replied',
                  'booked', 'closed', 'lost', 'dnc'
                ].map(s => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <InfoRow label="Website" value={lead.website} isLink />
              <InfoRow label="Email" value={lead.contact_email} />
              <InfoRow label="Phone" value={lead.phone} />
              <InfoRow label="Niche" value={lead.niche} />
            </div>

            {lead.website_data && (
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 block">Opportunity Signals</label>
                <div className="flex flex-wrap gap-2">
                  {flags.noChatbot && <SignalBadge label="No Chatbot" type="warning" />}
                  {flags.noBookingSystem && <SignalBadge label="No Booking System" type="warning" />}
                  {flags.noEmailCapture && <SignalBadge label="No Email Capture" type="warning" />}
                  {flags.noReviewsAutomation && <SignalBadge label="No Reviews Automation" type="warning" />}
                  {flags.noSSL && <SignalBadge label="No SSL" type="warning" />}
                  {flags.outdatedWebsite && <SignalBadge label="Outdated Site" type="warning" />}
                  {flags.hasInstagram && <SignalBadge label="Has Instagram" type="success" />}
                  {flags.hasFacebook && <SignalBadge label="Has Facebook" type="success" />}
                  {flags.hasFacebookAds && <SignalBadge label="Has Ads" type="success" />}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'timeline' && <Timeline events={timeline} />}

        {activeTab === 'notes' && (
          <div className="space-y-4">
            <textarea 
              className="w-full h-48 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              placeholder="Add notes about this lead..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <button 
              className="w-full py-3 bg-violet-600 text-white font-bold rounded-xl hover:bg-violet-700 transition-colors disabled:opacity-50"
              onClick={saveNotes} 
              disabled={saving}
            >
              Save Notes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value, isLink }: { label: string; value?: string; isLink?: boolean }) {
  return (
    <div>
      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">{label}</label>
      <div className="text-sm font-medium text-slate-700 truncate">
        {value ? (
          isLink ? <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noreferrer" className="text-violet-600 hover:underline">{value}</a> : value
        ) : <span className="text-slate-300">—</span>}
      </div>
    </div>
  );
}

function SignalBadge({ label, type }: { label: string; type: 'success' | 'warning' }) {
  const styles = type === 'success' 
    ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
    : 'bg-amber-50 text-amber-700 border-amber-100';
  return <span className={`px-2 py-1 rounded text-[10px] font-bold border uppercase tracking-tight ${styles}`}>{label}</span>;
}

// ─── Email Modal ──────────────────────────────────────────────────────
function EmailModal({ lead, onClose, onSent }: { lead: FunnelLead; onClose: () => void; onSent: () => void }) {
  const [subject, setSubject] = useState(`Quick Question for ${lead.salon_name}`);
  const [body, setBody] = useState(`Hi there,\n\nI noticed your salon ${lead.salon_name} is doing great, but you're missing a booking system on your website. We've helped other local businesses increase bookings by 20% with our tools.\n\nWould you be open to a quick 5-minute chat?\n\nBest,\nJento AI Team`);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    setSending(true);
    try {
      const res = await funnelApi.sendManualEmail(lead.id, { subject, body });
      if (res.ok) {
        alert('Email sent successfully!');
        onSent();
        onClose();
      } else {
        alert('Error: ' + res.error);
      }
    } catch (err) {
      alert('Failed to send email');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Manual Outreach</h3>
            <p className="text-xs text-slate-500 font-medium">To: {lead.contact_email}</p>
          </div>
          <button className="p-2 hover:bg-slate-200 rounded-full transition-colors" onClick={onClose}>✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Subject Line</label>
            <input 
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              value={subject}
              onChange={e => setSubject(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Message Body</label>
            <textarea 
              className="w-full h-48 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 resize-none"
              value={body}
              onChange={e => setBody(e.target.value)}
            />
          </div>
          <button 
            className="w-full py-4 bg-violet-600 text-white font-bold rounded-xl hover:bg-violet-700 transition-all shadow-lg shadow-violet-200 flex items-center justify-center gap-2 disabled:opacity-50"
            onClick={handleSend}
            disabled={sending}
          >
            {sending ? 'Sending...' : 'Send Manual Email'}
            {!sending && <Icons.Email />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main View ────────────────────────────────────────────────────────
export default function FunnelScreen() {
  const [leads, setLeads] = useState<FunnelLead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<FunnelStats | null>(null);
  const [campaigns, setCampaigns] = useState<FunnelCampaign[]>([]);
  
  const [filters, setFilters] = useState({
    stage: '',
    campaign_id: '',
    niche: '',
    q: '',
    min_score: '',
    max_score: ''
  });

  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [emailModalLead, setEmailModalLead] = useState<FunnelLead | null>(null);
  const [socialModal, setSocialModal] = useState<{ lead: FunnelLead, platform: string, color: string } | null>(null);
  const [callModal, setCallModal] = useState<{ lead: FunnelLead } | null>(null);
  const [dialerLead, setDialerLead] = useState<FunnelLead | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteAllText, setDeleteAllText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const data = await funnelApi.leads({ ...filters, page, per_page: 50 });
      setLeads(data.leads);
      setTotal(data.total);
    } catch (err) {
      console.error('Failed to load funnel leads:', err);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  const loadStats = useCallback(async () => {
    try {
      const s = await funnelApi.stats();
      setStats(s);
    } catch {}
  }, []);

  const loadCampaigns = useCallback(async () => {
    try {
      const c = await funnelApi.campaigns();
      setCampaigns(c);
    } catch {}
  }, []);

  useEffect(() => {
    loadLeads();
    loadStats();
    loadCampaigns();
  }, [loadLeads, loadStats, loadCampaigns]);

  const handleSocialLog = async (leadId: string, platform: string, status: string) => {
    try {
      await funnelApi.socialLog(leadId, { platform, status });
      setSocialModal(null);
      loadLeads();
    } catch (err) {
      console.error('Failed to log social', err);
    }
  };

  const handleCallLog = async (leadId: string, outcome: string, notes = '') => {
    try {
      await funnelApi.callLog(leadId, { outcome, notes });
      setCallModal(null);
      loadLeads();
    } catch (err) {
      console.error('Failed to log call', err);
    }
  };

  const openCallAction = (e: React.MouseEvent, lead: FunnelLead) => {
    e.stopPropagation();
    if (SOFTPHONE_ENABLED && lead.phone) {
      // Open in-app Twilio dialer popup; outcome modal will open after hang up.
      setDialerLead(lead);
      return;
    }
    if (lead.phone) window.open(`tel:${lead.phone.replace(/\s+/g, '')}`, '_self');
    setCallModal({ lead });
  };

  const openSmsAction = (e: React.MouseEvent, lead: FunnelLead) => {
    e.stopPropagation();
    if (lead.phone) {
      const phone = lead.phone.replace(/\s+/g, '');
      window.open(`sms:${phone}`, '_self');
    }
    setSocialModal({ lead, platform: 'sms', color: '#8b5cf6' });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      if (prev.size === leads.length && leads.length > 0) return new Set();
      return new Set(leads.map(l => String(l.id)));
    });
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Permanently delete ${selectedIds.size} lead(s)? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await funnelApi.deleteSelected(Array.from(selectedIds));
      setSelectedIds(new Set());
      await loadLeads();
      await loadStats();
    } catch (err) {
      console.error('Delete selected failed', err);
      alert('Delete failed. See console for details.');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAll = async () => {
    if (deleteAllText !== 'DELETE ALL') return;
    setDeleting(true);
    try {
      await funnelApi.deleteAll();
      setDeleteAllOpen(false);
      setDeleteAllText('');
      setSelectedIds(new Set());
      await loadLeads();
      await loadStats();
    } catch (err) {
      console.error('Delete all failed', err);
      alert('Delete all failed. See console for details.');
    } finally {
      setDeleting(false);
    }
  };

  const openSocialAction = (e: React.MouseEvent, lead: FunnelLead, platform: string, color: string) => {
    e.stopPropagation();
    try {
      const rawData = lead.website_data ? JSON.parse(lead.website_data) : {};
      let url = '';
      if (platform === 'instagram' && rawData.instagram) url = rawData.instagram;
      else if (platform === 'facebook' && rawData.facebook) url = rawData.facebook;
      else if (platform === 'whatsapp' && lead.phone) url = `https://wa.me/${lead.phone.replace(/\D/g, '')}`;
      
      if (url) window.open(url, '_blank');
    } catch (err) {}
    setSocialModal({ lead, platform, color });
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-4 p-6">
        {stats && (
          <>
            <StatCard label="Total Leads" value={stats.total_leads} />
            <StatCard label="Qualified" value={stats.stage_counts.qualified || 0} color="text-violet-600" />
            <StatCard label="Manual Emails" value={stats.email_sent_count} color="text-blue-600" />
            <StatCard label="Calls Logged" value={stats.call_attempted_count} color="text-emerald-600" />
            <StatCard label="Meetings" value={stats.stage_counts.booked || 0} color="text-amber-600" />
          </>
        )}
      </div>

      {/* Filter Bar */}
      <div className="mx-6 mb-6 p-4 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
        <div className="flex-1">
          <input 
            className="w-full bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            placeholder="Search leads by name..."
            value={filters.q}
            onChange={e => setFilters(prev => ({ ...prev, q: e.target.value }))}
          />
        </div>
        <select 
          className="bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-sm font-medium"
          value={filters.stage}
          onChange={e => setFilters(prev => ({ ...prev, stage: e.target.value }))}
        >
          <option value="">All Stages</option>
          {['scraped', 'enriched', 'qualified', 'email_sent', 'follow_up_1', 'follow_up_2', 'replied', 'booked', 'closed', 'lost', 'dnc'].map(s => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <button 
          className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-100 transition-colors"
          onClick={() => setFilters({ stage: '', campaign_id: '', niche: '', q: '', min_score: '', max_score: '' })}
        >
          Reset
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-hidden px-6 pb-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 h-full overflow-y-auto">
          {/* Delete toolbar */}
          <div className="sticky top-0 z-20 bg-white border-b border-slate-100 px-6 py-3 flex items-center gap-3">
            <span className="text-xs font-bold text-slate-500">
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : `${leads.length} on this page`}
            </span>
            <div className="flex-1" />
            <button
              disabled={selectedIds.size === 0 || deleting}
              onClick={handleDeleteSelected}
              className="px-4 py-2 rounded-xl text-sm font-bold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
            >
              {deleting && selectedIds.size > 0 ? 'Deleting...' : `Delete Selected${selectedIds.size ? ` (${selectedIds.size})` : ''}`}
            </button>
            <button
              disabled={deleting}
              onClick={() => setDeleteAllOpen(true)}
              className="px-4 py-2 rounded-xl text-sm font-bold bg-rose-600 text-white hover:bg-rose-700 transition-colors disabled:opacity-40"
            >
              Delete All Leads
            </button>
          </div>
          <table className="w-full text-left">
            <thead className="sticky top-[49px] bg-white border-b border-slate-100 z-10">
              <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <th className="px-4 py-4 w-10">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-rose-600 cursor-pointer"
                    checked={leads.length > 0 && selectedIds.size === leads.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-6 py-4">Lead Info</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-center">Score</th>
                <th className="px-6 py-4">Outreach Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={5} className="p-12 text-center text-slate-400">Loading leads...</td></tr>
              ) : (
                leads.map(lead => (
                  <tr 
                    key={lead.id} 
                    className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${selectedLeadId === lead.id ? 'bg-violet-50/50' : ''} ${selectedIds.has(String(lead.id)) ? 'bg-rose-50/40' : ''}`}
                    onClick={() => setSelectedLeadId(lead.id)}
                  >
                    <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-rose-600 cursor-pointer"
                        checked={selectedIds.has(String(lead.id))}
                        onChange={() => toggleSelect(String(lead.id))}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{lead.salon_name}</div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase mt-0.5 tracking-tight">{lead.contact_email || 'No email found'}</div>
                    </td>
                    <td className="px-6 py-4"><StatusBadge status={lead.funnel_stage} /></td>
                    <td className="px-6 py-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold border-2 mx-auto ${
                        lead.lead_score >= 70 ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 
                        lead.lead_score >= 40 ? 'bg-amber-50 text-amber-700 border-amber-100' : 
                        'bg-rose-50 text-rose-700 border-rose-100'
                      }`}>
                        {lead.lead_score}
                      </div>
                    </td>
                    <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-2 items-center">
                        <ActionButton icon={Icons.Call} color="#0f766e" title="Call" onClick={(e: any) => openCallAction(e, lead)} disabled={!lead.phone} />
                        <ActionButton icon={Icons.SMS} color="#8b5cf6" title="SMS / Message" onClick={(e: any) => openSmsAction(e, lead)} disabled={!lead.phone} />
                        <ActionButton icon={Icons.Email} color="#3b82f6" title="Manual Email" onClick={() => setEmailModalLead(lead)} disabled={!lead.contact_email} isDone={lead.funnel_stage === 'email_sent'} />
                        <ActionButton icon={Icons.Instagram} color="#e1306c" title="Instagram" onClick={(e: any) => openSocialAction(e, lead, 'instagram', '#e1306c')} />
                        <ActionButton icon={Icons.Facebook} color="#1877f2" title="Facebook" onClick={(e: any) => openSocialAction(e, lead, 'facebook', '#1877f2')} />
                        <ActionButton icon={Icons.WhatsApp} color="#22c55e" title="WhatsApp" onClick={(e: any) => openSocialAction(e, lead, 'whatsapp', '#22c55e')} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {selectedLeadId && <LeadDetailPanel leadId={selectedLeadId} onClose={() => setSelectedLeadId(null)} onUpdate={() => { loadLeads(); loadStats(); }} />}
      {emailModalLead && <EmailModal lead={emailModalLead} onClose={() => setEmailModalLead(null)} onSent={() => { loadLeads(); loadStats(); }} />}
      {socialModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={() => setSocialModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200 border-t-4" style={{ borderTopColor: socialModal.color }} onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="text-lg font-bold text-slate-900 mb-2">{socialModal.platform.toUpperCase()} Action</h3>
              <p className="text-sm text-slate-500 mb-6">Did you reach out to <span className="font-bold text-slate-700">{socialModal.lead.salon_name}</span>?</p>
              <div className="grid grid-cols-1 gap-2">
                <button className="py-3 bg-slate-50 text-slate-700 font-bold rounded-xl hover:bg-slate-100 transition-colors border border-slate-200" onClick={() => handleSocialLog(socialModal.lead.id, socialModal.platform, 'sent')}>Log Outreach Sent</button>
                <button className="py-3 bg-violet-600 text-white font-bold rounded-xl hover:bg-violet-700 transition-colors shadow-lg shadow-violet-200" onClick={() => handleSocialLog(socialModal.lead.id, socialModal.platform, 'replied')}>Log Reply Received</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {dialerLead && (
        <DialerPopup
          phone={dialerLead.phone || ''}
          contactName={dialerLead.salon_name}
          contactCompany={dialerLead.niche || null}
          onClose={() => setDialerLead(null)}
          onEnded={(ctx) => {
            const lead = dialerLead;
            setDialerLead(null);
            if (lead) {
              // Auto-open outcome modal so the user can log outcome + notes
              setCallModal({ lead });
              if (ctx.connected) {
                // Pre-log a 'connected' event if call had audio
                funnelApi.callLog(lead.id, { outcome: 'connected', notes: `Call duration ${ctx.seconds}s` }).catch(() => {});
              }
            }
          }}
        />
      )}
      {callModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={() => setCallModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200 border-t-4" style={{ borderTopColor: '#0f766e' }} onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="text-lg font-bold text-slate-900 mb-1">Log Call Outcome</h3>
              <p className="text-sm text-slate-500 mb-1"><span className="font-bold text-slate-700">{callModal.lead.salon_name}</span></p>
              <p className="text-xs text-slate-400 font-mono mb-5">{callModal.lead.phone || 'No phone on file'}</p>
              <div className="grid grid-cols-2 gap-2">
                <button className="py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200" onClick={() => handleCallLog(callModal.lead.id, 'connected')}>Connected</button>
                <button className="py-3 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600 transition-colors" onClick={() => handleCallLog(callModal.lead.id, 'voicemail')}>Voicemail</button>
                <button className="py-3 bg-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-300 transition-colors" onClick={() => handleCallLog(callModal.lead.id, 'no_answer')}>No Answer</button>
                <button className="py-3 bg-rose-500 text-white font-bold rounded-xl hover:bg-rose-600 transition-colors" onClick={() => handleCallLog(callModal.lead.id, 'busy')}>Busy</button>
              </div>
              <button className="mt-3 w-full py-2 text-sm text-slate-500 hover:text-slate-700" onClick={() => setCallModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {deleteAllOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[250] flex items-center justify-center p-4" onClick={() => !deleting && setDeleteAllOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border-t-4 border-rose-600" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="text-xl font-black text-rose-700 mb-2">Delete ALL leads?</h3>
              <p className="text-sm text-slate-600 mb-1">
                This will permanently remove <span className="font-bold">every lead in the database</span>, including their timeline events.
              </p>
              <p className="text-sm text-slate-600 mb-4">
                This action cannot be undone.
              </p>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Type <span className="text-rose-700">DELETE ALL</span> to confirm</p>
              <input
                className="w-full bg-rose-50 border-2 border-rose-200 px-4 py-3 rounded-xl text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                value={deleteAllText}
                onChange={e => setDeleteAllText(e.target.value)}
                placeholder="DELETE ALL"
                autoFocus
              />
              <div className="grid grid-cols-2 gap-3 mt-5">
                <button
                  className="py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors"
                  onClick={() => { setDeleteAllOpen(false); setDeleteAllText(''); }}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  className="py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={handleDeleteAll}
                  disabled={deleteAllText !== 'DELETE ALL' || deleting}
                >
                  {deleting ? 'Deleting...' : 'Delete Everything'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</span>
      <span className={`text-2xl font-bold ${color || 'text-slate-900'}`}>{value}</span>
    </div>
  );
}

function ActionButton({ icon: Icon, color, isDone, disabled, title, onClick }: any) {
  return (
    <button
      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all border ${
        disabled ? 'opacity-30 cursor-not-allowed grayscale' : 'hover:scale-110 active:scale-95'
      }`}
      style={{
        background: isDone ? `${color}15` : '#fff',
        borderColor: isDone ? `${color}30` : '#e2e8f0',
        color: isDone ? color : '#64748b'
      }}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      <Icon />
      {isDone && <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 text-white rounded-full flex items-center justify-center text-[8px] border-2 border-white">✓</span>}
    </button>
  );
}
