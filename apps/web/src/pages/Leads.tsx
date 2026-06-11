import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import callsApi, { Contact } from '../services/callsApi';
import { getCallUser } from '../services/employeesApi';
import DialerPopup from '../components/DialerPopup';
import EmailPopup from '../components/EmailPopup';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';

const SvgIcons = {
  email: <svg fill="currentColor" viewBox="0 0 20 20"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" /><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" /></svg>,
  linkedin: <svg fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>,
  facebook: <svg fill="currentColor" viewBox="0 0 24 24"><path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z"/></svg>,
  instagram: <svg fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>,
  website: <svg fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
};

const platformConfig: any = {
  email: { color: '#0F766E', bg: '#F0FDFA', icon: SvgIcons.email },
  linkedin: { color: '#0A66C2', bg: '#EFF6FF', icon: SvgIcons.linkedin },
  facebook: { color: '#1877F2', bg: '#EFF6FF', icon: SvgIcons.facebook },
  instagram: { color: '#E1306C', bg: '#FDF2F8', icon: SvgIcons.instagram },
  website: { color: '#4B5563', bg: '#F3F4F6', icon: SvgIcons.website }
};

function SocialIcon({ platform, url, count, onClick, disabled, badgeText }: { platform: string; url: string | null | undefined; count?: number; onClick?: (e: React.MouseEvent) => void; disabled?: boolean; badgeText?: string }) {
  const hasUrl = Boolean(url);
  const config = platformConfig[platform];

  return (
    <div style={{ position: 'relative', display: 'inline-block', marginRight: 10 }}>
      <a 
        href={hasUrl && !onClick ? (platform === 'email' && !url?.startsWith('mailto:') ? `mailto:${url}` : url!) : '#'} 
        target={hasUrl && platform !== 'email' ? "_blank" : undefined} 
        rel="noopener noreferrer" 
        title={hasUrl ? `${platform} link` : `No ${platform} found`} 
        onClick={(e) => {
          if (onClick && hasUrl && !disabled) {
            e.preventDefault();
            onClick(e);
          } else if (disabled || !hasUrl) {
            e.preventDefault();
          }
        }}
        style={{ 
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: hasUrl ? config.bg : '#F9FAFB',
          color: hasUrl ? config.color : '#D1D5DB',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          cursor: hasUrl && !disabled ? 'pointer' : 'default',
          pointerEvents: hasUrl ? 'auto' : 'none',
          boxShadow: hasUrl ? `0 2px 8px ${config.color}25` : 'inset 0 2px 4px rgba(0,0,0,0.02)',
          transform: 'scale(1)',
          opacity: disabled ? 0.6 : 1
        }}
        onMouseEnter={(e) => {
          if (hasUrl && !disabled) {
            e.currentTarget.style.transform = 'scale(1.1)';
            e.currentTarget.style.boxShadow = `0 4px 12px ${config.color}40`;
          }
        }}
        onMouseLeave={(e) => {
          if (hasUrl && !disabled) {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = `0 2px 8px ${config.color}25`;
          }
        }}
      >
        <div style={{ width: 18, height: 18, display: 'flex' }}>
          {config.icon}
        </div>
      </a>
      {count !== undefined && count > 0 && (
        <div style={{
          position: 'absolute', top: -6, right: -6, background: '#DC2626', color: '#fff', fontSize: 10,
          fontWeight: 800, padding: '2px 6px', borderRadius: 10, border: '2px solid #fff', zIndex: 10
        }}>
          {badgeText || count}
        </div>
      )}
    </div>
  );
}

export default function LeadsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = 50;

  const [search, setSearch] = useState('');
  const [activeCall, setActiveCall] = useState<Contact | null>(null);
  const [activeEmailLead, setActiveEmailLead] = useState<Contact | null>(null);
  const [editingNoteLead, setEditingNoteLead] = useState<Contact | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [activeTab, setActiveTab] = useState<'new_lead' | 'in_progress' | 'converted_lost'>('new_lead');
  const queryClient = useQueryClient();

  const updateNoteMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes: string | null }) => callsApi.updateContact(id, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setEditingNoteLead(null);
    }
  });

  const markRepliedMutation = useMutation({
    mutationFn: (id: number) => callsApi.markContactReplied(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contacts'] })
  });

  const handleOpenNoteModal = (lead: Contact) => {
    setEditingNoteLead(lead);
    setEditingNoteText(lead.notes || '');
  };

  const updateStageMutation = useMutation({
    mutationFn: ({ id, stage, omnichannel_stage }: { id: number; stage?: string; omnichannel_stage?: string }) => callsApi.updateContact(id, { stage, omnichannel_stage }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contacts'] })
  });

  const linkedinMutation = useMutation({
    mutationFn: ({ id, task_type }: { id: number; task_type: any }) => callsApi.queueLinkedinTask(id, task_type),
    onSuccess: () => {
      toast.success('LinkedIn task queued! The background worker will process it safely.');
    },
    onError: (err: any) => {
      toast.error('Failed to queue LinkedIn task. Check settings.');
    }
  });

  const handleDragStart = (e: React.DragEvent, leadId: number) => {
    e.dataTransfer.setData('leadId', leadId.toString());
  };

  const handleDrop = (e: React.DragEvent, newStage: string) => {
    e.preventDefault();
    const leadId = parseInt(e.dataTransfer.getData('leadId'), 10);
    if (!isNaN(leadId)) {
      updateStageMutation.mutate({ id: leadId, stage: newStage });
    }
  };

  const allowDrop = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const { data, isLoading } = useQuery({
    queryKey: ['contacts'],
    queryFn: callsApi.listContacts
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => callsApi.removeContact(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contacts'] })
  });

  const clearAllMutation = useMutation({
    mutationFn: () => callsApi.clearAllContacts(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contacts'] })
  });

  const handleDelete = (id: number, name: string) => {
    if (window.confirm(`Are you sure you want to delete ${name}?`)) {
      deleteMutation.mutate(id);
    }
  };

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to delete ALL leads? This cannot be undone.')) {
      clearAllMutation.mutate();
    }
  };

  const enrichedOrManualLeads = data?.contacts.filter(lead => 
    // Keep manually added leads, hide Google Maps un-enriched, and hide social pipeline leads
    (lead.source !== 'google-maps-scraper' || (lead.score && lead.score > 0)) &&
    lead.omnichannel_stage !== 'social'
  ) || [];

  const filteredLeads = enrichedOrManualLeads.filter(lead => 
    lead.name.toLowerCase().includes(search.toLowerCase()) ||
    (lead.niche_name && lead.niche_name.toLowerCase().includes(search.toLowerCase())) ||
    (lead.company && lead.company.toLowerCase().includes(search.toLowerCase()))
  );

  const todayStr = new Date().toISOString().split('T')[0];
  const todayMeetings = filteredLeads.filter(l => l.meeting_time && l.meeting_time.startsWith(todayStr));
  const otherLeads = filteredLeads.filter(l => !(l.meeting_time && l.meeting_time.startsWith(todayStr)));

  const renderLead = (lead: Contact, isHighlighted = false) => {
    const bg = isHighlighted ? '#FEF2F2' : '#fff';
    const border = isHighlighted ? '2px solid #FCA5A5' : '1px solid #D8E1D7';
    
    return (
      <div key={lead.id} style={{
        background: bg,
        border: border,
        borderRadius: 12,
        padding: '16px 24px',
        boxShadow: '0 2px 4px -1px rgba(0, 0, 0, 0.05)',
        transition: 'transform 0.2s',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1.5fr) auto auto auto', gap: 32, alignItems: 'center' }}>
          
          {/* 1. Lead Info (Name, Company, Notes) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#14202B', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {lead.name}
              {lead.niche_name && (
                <span style={{
                  marginLeft: 10, background: '#F3E8FF', color: '#7E22CE', padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0
                }}>
                  {lead.niche_name}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {lead.notes ? (
                 <span 
                   style={{ fontWeight: 800, color: '#111827', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', letterSpacing: 0.2 }}
                   onClick={() => handleOpenNoteModal(lead)}
                   title="Click to edit note"
                 >
                   {lead.notes.split(' ').slice(0, 5).join(' ')}{lead.notes.split(' ').length > 5 ? '...' : ''}
                   <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, background: '#F0FDFA', borderRadius: '50%', color: '#0F766E', boxShadow: '0 1px 2px rgba(15,118,110,0.1)' }}>
                     <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: 12, height: 12 }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                   </span>
                 </span>
              ) : (
                 <button
                   onClick={() => handleOpenNoteModal(lead)}
                   style={{ background: '#F0FDFA', border: '1px dashed #5EEAD4', color: '#0F766E', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 10px', borderRadius: 12, fontWeight: 600, transition: 'all 0.2s ease' }}
                   onMouseEnter={(e) => { e.currentTarget.style.background = '#CCFBF1'; e.currentTarget.style.borderStyle = 'solid'; }}
                   onMouseLeave={(e) => { e.currentTarget.style.background = '#F0FDFA'; e.currentTarget.style.borderStyle = 'dashed'; }}
                 >
                   <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: 12, height: 12 }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                   Add Note
                 </button>
              )}
            </div>
          </div>

          {/* 2. Score & Phone */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: '50%',
              background: (lead.score || 0) >= 70 ? '#D1FAE5' : (lead.score || 0) >= 50 ? '#FEF3C7' : '#FEE2E2',
              color: (lead.score || 0) >= 70 ? '#065F46' : (lead.score || 0) >= 50 ? '#92400E' : '#991B1B',
              fontWeight: 800, fontSize: 14, boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
            }} title="Score">
              {lead.score || 0}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 15, color: '#14202B', fontWeight: 700, letterSpacing: 0.5 }}>
                {lead.phone_number || 'No phone'}
              </span>
              {(lead.messages_count || 0) > 0 && (
                <span style={{ fontSize: 11, color: '#047857', fontWeight: 600 }}>💬 {lead.messages_count} SMS</span>
              )}
            </div>
          </div>

          {/* 3. Social Icons */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <SocialIcon 
              platform="email" 
              url={lead.email} 
              count={lead.emails_sent} 
              badgeText={lead.emails_sent ? "A" : undefined}
              disabled={!!lead.emails_sent}
              onClick={() => {
                if (!lead.emails_sent && lead.email) {
                  setActiveEmailLead(lead);
                }
              }}
            />
            <SocialIcon platform="website" url={lead.website} />
            <SocialIcon platform="linkedin" url={lead.linkedin} />
            <SocialIcon platform="facebook" url={lead.facebook} />
            <SocialIcon platform="instagram" url={lead.instagram} />
          </div>

          {/* 4. Actions */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={lead.stage || 'new_lead'}
              onChange={(e) => updateStageMutation.mutate({ id: lead.id, stage: e.target.value })}
              disabled={updateStageMutation.isPending}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid #D8E1D7',
                background: '#F9FAFB',
                fontSize: 12,
                fontWeight: 600,
                color: '#4B5563',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              <option value="new_lead">New Lead</option>
              <option value="in_progress">In Progress</option>
              <option value="converted_lost">Converted / Lost</option>
            </select>
            {lead.email_opened ? (
               <div style={{ fontSize: 11, color: '#0F766E', fontWeight: 700, background: '#CCFBF1', padding: '4px 8px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                 <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: 12, height: 12 }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                 Seen
               </div>
            ) : null}
            {lead.emails_received ? (
               <div style={{ fontSize: 11, color: '#4338CA', fontWeight: 700, background: '#E0E7FF', padding: '4px 8px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                 <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: 12, height: 12 }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                 Replied
               </div>
            ) : (
              lead.emails_sent ? (
                <button 
                  onClick={() => markRepliedMutation.mutate(lead.id)}
                  disabled={markRepliedMutation.isPending}
                  style={{ fontSize: 10, color: '#6B7280', background: 'transparent', border: '1px solid #D1D5DB', padding: '4px 8px', borderRadius: 12, cursor: 'pointer' }}
                >
                  Mark Replied
                </button>
              ) : null
            )}
            {lead.meeting_time && (
               <div style={{ fontSize: 12, color: isHighlighted ? '#DC2626' : '#D97706', fontWeight: 700, background: isHighlighted ? '#FEE2E2' : '#FEF3C7', padding: '6px 12px', borderRadius: 20, marginRight: 8, whiteSpace: 'nowrap' }}>
                 🗓 {new Date(lead.meeting_time).toLocaleDateString()}
               </div>
            )}
            <button
              onClick={() => lead.phone_number && setActiveCall(lead)}
              disabled={!lead.phone_number}
              style={{
                background: lead.phone_number ? 'linear-gradient(135deg, #0F766E 0%, #115E59 100%)' : '#F3F4F6',
                color: lead.phone_number ? '#fff' : '#9CA3AF',
                border: 'none', padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: lead.phone_number ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: lead.phone_number ? '0 4px 10px rgba(15, 118, 110, 0.2)' : 'none',
                transition: 'all 0.2s ease', whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => {
                if (lead.phone_number) {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 6px 12px rgba(15, 118, 110, 0.3)';
                }
              }}
              onMouseLeave={(e) => {
                if (lead.phone_number) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 10px rgba(15, 118, 110, 0.2)';
                }
              }}
            >
              <svg fill="currentColor" viewBox="0 0 20 20" style={{ width: 14, height: 14 }}>
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
              </svg>
              {lead.phone_number ? 'Call Now' : 'No Phone'}
            </button>
            <button
              onClick={() => linkedinMutation.mutate({ id: lead.id, task_type: 'scrape_profile' })}
              disabled={linkedinMutation.isPending}
              style={{
                background: '#0A66C2',
                color: '#fff',
                border: 'none', padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: linkedinMutation.isPending ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 4px 10px rgba(10, 102, 194, 0.2)',
                transition: 'all 0.2s ease', whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 6px 12px rgba(10, 102, 194, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 10px rgba(10, 102, 194, 0.2)';
              }}
              title="Auto-Scrape Profile"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 14, height: 14 }}>
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
              Scrape
            </button>

            {getCallUser()?.role === 'manager' && (
              <button
                onClick={() => handleDelete(lead.id, lead.name)}
                style={{
                  background: 'transparent', color: '#9CA3AF', padding: '6px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease',
                }}
                title="Delete lead"
                onMouseEnter={(e) => { e.currentTarget.style.color = '#EF4444'; e.currentTarget.style.background = '#FEF2F2'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#9CA3AF'; e.currentTarget.style.background = 'transparent'; }}
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: 16, height: 16, strokeWidth: 2 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#7B8794' }}>Loading leads...</div>;
  }

  const tabLeads = otherLeads.filter(l => {
    if (activeTab === 'new_lead') return !l.stage || l.stage === 'new_lead';
    if (activeTab === 'in_progress') return l.stage === 'in_progress' || l.stage === 'email_sent' || l.stage === 'replied';
    if (activeTab === 'converted_lost') return l.stage === 'converted_lost';
    return false;
  });
  const totalPages = Math.ceil(tabLeads.length / pageSize);
  const paginatedLeads = tabLeads.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setSearchParams({ page: page.toString() });
    }
  };

  return (
    <div style={{ maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 28, fontWeight: 700, color: '#14202B', margin: '0 0 8px' }}>
            👥 Leads
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <p style={{ color: '#52606D', fontSize: 15, margin: 0 }}>
              {filteredLeads.length} leads enriched with detailed information
            </p>
            {getCallUser()?.role === 'manager' && filteredLeads.length > 0 && (
              <button
                onClick={handleClearAll}
                disabled={clearAllMutation.isPending}
                style={{
                  background: '#FEE2E2',
                  color: '#B91C1C',
                  border: '1px solid #FCA5A5',
                  padding: '4px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: clearAllMutation.isPending ? 'wait' : 'pointer',
                }}
              >
                {clearAllMutation.isPending ? 'Clearing...' : 'Clear All'}
              </button>
            )}
          </div>
        </div>
        
        <input
          type="text"
          placeholder="Search leads (name, niche, company)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: '10px 16px',
            border: '1px solid #D8E1D7',
            borderRadius: 8,
            fontSize: 14,
            width: 300,
          }}
        />
      </div>

      {todayMeetings.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ color: '#DC2626', fontSize: 20, marginBottom: 16, fontFamily: 'Space Grotesk, sans-serif' }}>
            🚨 Call Today! (Meeting Scheduled)
          </h2>
          <div style={{ display: 'grid', gap: 16 }}>
            {todayMeetings.map(lead => renderLead(lead, true))}
          </div>
        </div>
      )}

      {/* Stage Tabs */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, borderBottom: '1px solid #E5E7EB', paddingBottom: 8 }}>
        <button 
          onClick={() => { setActiveTab('new_lead'); setSearchParams({ page: '1' }); }}
          style={{ 
            background: 'none', border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer',
            color: activeTab === 'new_lead' ? '#0F766E' : '#6B7280',
            borderBottom: activeTab === 'new_lead' ? '2px solid #0F766E' : 'none',
            paddingBottom: 8
          }}
        >
          New Leads ({otherLeads.filter(l => !l.stage || l.stage === 'new_lead').length})
        </button>
        <button 
          onClick={() => { setActiveTab('in_progress'); setSearchParams({ page: '1' }); }}
          style={{ 
            background: 'none', border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer',
            color: activeTab === 'in_progress' ? '#0F766E' : '#6B7280',
            borderBottom: activeTab === 'in_progress' ? '2px solid #0F766E' : 'none',
            paddingBottom: 8
          }}
        >
          In-Progress ({otherLeads.filter(l => l.stage === 'in_progress' || l.stage === 'email_sent' || l.stage === 'replied').length})
        </button>
        <button 
          onClick={() => { setActiveTab('converted_lost'); setSearchParams({ page: '1' }); }}
          style={{ 
            background: 'none', border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer',
            color: activeTab === 'converted_lost' ? '#0F766E' : '#6B7280',
            borderBottom: activeTab === 'converted_lost' ? '2px solid #0F766E' : 'none',
            paddingBottom: 8
          }}
        >
          Converted / Lost ({otherLeads.filter(l => l.stage === 'converted_lost').length})
        </button>
      </div>

      {/* Leads Grid */}
      <div style={{ display: 'grid', gap: 16 }}>
        {paginatedLeads.map(lead => renderLead(lead, false))}

        {tabLeads.length === 0 && (
          <div style={{ padding: 60, textAlign: 'center', color: '#7B8794', background: '#fff', borderRadius: 12, border: '1px solid #D8E1D7' }}>
            No leads in this stage.
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderTop: '1px solid #E5E7EB', background: '#F9FAFB', borderRadius: 12, marginTop: 16 }}>
          <span style={{ fontSize: 14, color: '#4B5563', fontWeight: 500 }}>
            Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, tabLeads.length)} of {tabLeads.length} leads
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button 
              onClick={() => goToPage(currentPage - 1)} 
              disabled={currentPage === 1}
              style={{ padding: '8px 16px', background: currentPage === 1 ? '#F3F4F6' : '#fff', color: currentPage === 1 ? '#9CA3AF' : '#374151', border: '1px solid #D1D5DB', borderRadius: 6, fontWeight: 600, cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
            >
              Previous
            </button>
            <span style={{ padding: '8px 16px', background: '#F3F4F6', color: '#374151', border: '1px solid #E5E7EB', borderRadius: 6, fontWeight: 700 }}>
              Page {currentPage} of {totalPages}
            </span>
            <button 
              onClick={() => goToPage(currentPage + 1)} 
              disabled={currentPage === totalPages}
              style={{ padding: '8px 16px', background: currentPage === totalPages ? '#F3F4F6' : '#fff', color: currentPage === totalPages ? '#9CA3AF' : '#374151', border: '1px solid #D1D5DB', borderRadius: 6, fontWeight: 600, cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {activeCall && activeCall.phone_number && (
        <DialerPopup
          phone={activeCall.phone_number}
          contactId={activeCall.id}
          contactName={activeCall.name}
          contactCompany={activeCall.company || undefined}
          onClose={() => {
            setActiveCall(null);
            queryClient.invalidateQueries({ queryKey: ['contacts'] });
          }}
          onEnded={({ connected, seconds }) => {
            console.log(`Call to ${activeCall.name} ended. Connected: ${connected}, Duration: ${seconds}s`);
          }}
        />
      )}

      {activeEmailLead && activeEmailLead.email && (
        <EmailPopup
          contactId={activeEmailLead.id}
          contactName={activeEmailLead.name}
          contactEmail={activeEmailLead.email}
          onClose={() => setActiveEmailLead(null)}
        />
      )}

      {/* Note Editing Modal */}
      {editingNoteLead && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100,
          backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400,
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, color: '#111827', fontWeight: 700 }}>
              Notes for {editingNoteLead.name}
            </h3>
            <textarea
              value={editingNoteText}
              onChange={(e) => setEditingNoteText(e.target.value)}
              placeholder="Enter note details..."
              style={{
                width: '100%', padding: '12px', border: '1px solid #E5E7EB', borderRadius: 8, minHeight: 100,
                fontSize: 14, fontFamily: 'inherit', resize: 'vertical', marginBottom: 16, boxSizing: 'border-box'
              }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEditingNoteLead(null)}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff',
                  color: '#4B5563', fontWeight: 600, cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => updateNoteMutation.mutate({ id: editingNoteLead.id, notes: editingNoteText || null })}
                disabled={updateNoteMutation.isPending}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0F766E',
                  color: '#fff', fontWeight: 600, cursor: updateNoteMutation.isPending ? 'wait' : 'pointer'
                }}
              >
                {updateNoteMutation.isPending ? 'Saving...' : 'Save Note'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
