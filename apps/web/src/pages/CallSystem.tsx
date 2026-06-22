import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import callsApi, { Contact } from '../services/callsApi';
import { getCallUser } from '../services/employeesApi';
import DialerPopup from '../components/DialerPopup';
import { useSearchParams } from 'react-router-dom';

export default function CallSystem() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = 50;

  const [search, setSearch] = useState('');
  const [activeCall, setActiveCall] = useState<Contact | null>(null);
  const [editingNoteLead, setEditingNoteLead] = useState<Contact | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const queryClient = useQueryClient();

  const updateNoteMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes: string | null }) => callsApi.updateContact(id, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setEditingNoteLead(null);
    }
  });

  const updateStageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: number; stage?: string }) => callsApi.updateContact(id, { stage }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contacts'] })
  });

  const handleOpenNoteModal = (lead: Contact) => {
    setEditingNoteLead(lead);
    setEditingNoteText(lead.notes || '');
  };

  const { data, isLoading } = useQuery({
    queryKey: ['contacts'],
    queryFn: callsApi.listContacts
  });

  // Filter ONLY leads that are in cold_calling stage and assigned to this employee
  const callUser = getCallUser();
  const callLeads = data?.contacts.filter(lead => {
    const isStage = lead.omnichannel_stage === 'cold_calling' || lead.stage === 'cold_calling';
    const isAssignedToMe = !callUser || callUser.role === 'manager' || lead.assigned_agent_id === callUser.id;
    return isStage && isAssignedToMe;
  }) || [];

  const filteredLeads = callLeads.filter(lead => 
    lead.name.toLowerCase().includes(search.toLowerCase()) ||
    (lead.niche_name && lead.niche_name.toLowerCase().includes(search.toLowerCase())) ||
    (lead.company && lead.company.toLowerCase().includes(search.toLowerCase()))
  );

  const totalPages = Math.ceil(filteredLeads.length / pageSize);
  const paginatedLeads = filteredLeads.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setSearchParams({ page: page.toString() });
    }
  };

  const renderLead = (lead: Contact) => {
    return (
      <div key={lead.id} style={{
        background: '#fff',
        border: '1px solid #D8E1D7',
        borderRadius: 12,
        padding: '16px 24px',
        boxShadow: '0 2px 4px -1px rgba(0, 0, 0, 0.05)',
        transition: 'transform 0.2s',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1.5fr) auto auto auto', gap: 32, alignItems: 'center' }}>
          
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
                 >
                   <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: 12, height: 12 }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                   Add Note
                 </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 15, color: '#14202B', fontWeight: 700, letterSpacing: 0.5 }}>
                {lead.phone_number || 'No phone'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={lead.stage || 'cold_calling'}
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
              <option value="cold_calling">To Call</option>
              <option value="in_progress">In Progress</option>
              <option value="converted_lost">Converted / Lost</option>
            </select>
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
            >
              <svg fill="currentColor" viewBox="0 0 20 20" style={{ width: 14, height: 14 }}>
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
              </svg>
              {lead.phone_number ? 'Call Now' : 'No Phone'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#7B8794' }}>Loading call queue...</div>;
  }

  return (
    <div style={{ maxWidth: 1400 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 28, fontWeight: 700, color: '#14202B', margin: '0 0 8px' }}>
            📞 Call Center
          </h1>
          <p style={{ color: '#52606D', fontSize: 15, margin: 0 }}>
            {filteredLeads.length} leads waiting to be called
          </p>
        </div>
        
        <input
          type="text"
          placeholder="Search call queue..."
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

      <div style={{ display: 'grid', gap: 16 }}>
        {paginatedLeads.map(lead => renderLead(lead))}

        {filteredLeads.length === 0 && (
          <div style={{ padding: 60, textAlign: 'center', color: '#7B8794', background: '#fff', borderRadius: 12, border: '1px solid #D8E1D7' }}>
            No leads currently in the call queue.
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderTop: '1px solid #E5E7EB', background: '#F9FAFB', borderRadius: 12, marginTop: 16 }}>
          <span style={{ fontSize: 14, color: '#4B5563', fontWeight: 500 }}>
            Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, filteredLeads.length)} of {filteredLeads.length} leads
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
