import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import callsApi, { Contact } from '../services/callsApi';
import { jobsApi } from '../services/api';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';

export default function EnrichmentPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = 50;

  const queryClient = useQueryClient();
  const [isStartingEnrichment, setIsStartingEnrichment] = useState(() => {
    return sessionStorage.getItem('isEnriching') === 'true';
  });
  
  const { data, isLoading } = useQuery({
    queryKey: ['contacts'],
    queryFn: callsApi.listContacts,
    refetchInterval: (query) => {
      const leads = query.state.data?.contacts || [];
      const hasPending = leads.some((l: any) => !l.score || l.score <= 0);
      return hasPending ? 3000 : false;
    }
  });

  const clearAllMutation = useMutation({
    mutationFn: () => callsApi.clearAllContacts(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contacts'] })
  });

  const leads = data?.contacts || [];
  
  // Categorize leads
  const pendingLeads = leads.filter(l => l.website && (!l.score || l.score <= 0) && l.stage !== 'needs_browser');
  const browserLeads = leads.filter(l => l.stage === 'needs_browser');
  const enrichedLeads = leads.filter(l => l.score && l.score > 0 && l.stage !== 'needs_browser');

  // Clear enriching state if there are no pending leads left
  if (pendingLeads.length === 0 && isStartingEnrichment) {
    setIsStartingEnrichment(false);
    sessionStorage.removeItem('isEnriching');
  }
  
  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear ALL leads? This cannot be undone.')) {
      clearAllMutation.mutate();
    }
  };

  const handleStartEnrichment = async () => {
    const domains = pendingLeads.map(l => l.website!);
      
    if (domains.length === 0) {
      toast.error('No pending leads with websites found to enrich.');
      return;
    }

    setIsStartingEnrichment(true);
    sessionStorage.setItem('isEnriching', 'true');
    try {
      await jobsApi.create({ domains, mode: 'smart_hybrid' });
      toast.success(`Enrichment started for ${domains.length} websites! Progress will update automatically.`);
    } catch (err: any) {
      toast.error('Error starting enrichment: ' + (err.response?.data?.message || err.message));
      setIsStartingEnrichment(false);
      sessionStorage.removeItem('isEnriching');
    }
    // We intentionally don't set it to false in finally() so it stays spinning while the background worker processes the leads
  };

  const calculateProgress = () => {
    if (leads.length === 0) return 0;
    return Math.round((enrichedLeads.length / leads.length) * 100);
  };

  const [activeTab, setActiveTab] = useState<'queue' | 'enriched'>('queue');

  if (isLoading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#7B8794' }}>Loading scraped leads...</div>;
  }

  const displayLeads = activeTab === 'queue' ? [...browserLeads, ...pendingLeads] : enrichedLeads;
  const totalPages = Math.ceil(displayLeads.length / pageSize);
  const paginatedLeads = displayLeads.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setSearchParams({ page: page.toString() });
    }
  };

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 28, fontWeight: 700, color: '#14202B', margin: '0 0 8px' }}>
            Smart Enrichment
          </h1>
          <p style={{ color: '#52606D', fontSize: 15, margin: 0 }}>
            Automatically enrich your scraped leads with Deep Research
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: 12 }}>
          {leads.length > 0 && (
            <button
              onClick={handleClearAll}
              disabled={clearAllMutation.isPending}
              style={{
                background: '#FEE2E2',
                color: '#B91C1C',
                border: '1px solid #FCA5A5',
                padding: '12px 24px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: clearAllMutation.isPending ? 'wait' : 'pointer',
              }}
            >
              {clearAllMutation.isPending ? 'Clearing...' : 'Clear All Leads'}
            </button>
          )}
          {isStartingEnrichment && (
            <button
              onClick={() => {
                setIsStartingEnrichment(false);
                sessionStorage.removeItem('isEnriching');
              }}
              style={{
                background: '#F3F4F6', color: '#6B7280', border: '1px solid #D1D5DB',
                padding: '12px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer'
              }}
              title="Force stop the spinner if it's stuck"
            >
              Stop Spinner
            </button>
          )}
          <button
            onClick={handleStartEnrichment}
            disabled={pendingLeads.length === 0 || isStartingEnrichment}
            style={{
              background: pendingLeads.length > 0 ? 'linear-gradient(135deg, #0F766E 0%, #115E59 100%)' : '#D8E1D7',
              color: pendingLeads.length > 0 ? '#fff' : '#7B8794',
              border: 'none',
              padding: '12px 24px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 700,
              cursor: pendingLeads.length > 0 && !isStartingEnrichment ? 'pointer' : 'not-allowed',
              boxShadow: pendingLeads.length > 0 ? '0 4px 12px rgba(15, 118, 110, 0.3)' : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.2s'
            }}
          >
            {isStartingEnrichment ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }}>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Enriching...
              </span>
            ) : (
              <>Start Enrichment ({pendingLeads.length} Pending)</>
            )}
          </button>
        </div>
      </div>

      {/* Live Dashboard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#fff', padding: 24, borderRadius: 16, border: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase' }}>Total Scraped</span>
          <span style={{ fontSize: 32, fontWeight: 800, color: '#111827' }}>{leads.length}</span>
        </div>
        <div style={{ background: '#F0FDFA', padding: 24, borderRadius: 16, border: '1px solid #A7F3D0', display: 'flex', flexDirection: 'column', gap: 8, position: 'relative', overflow: 'hidden' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#047857', textTransform: 'uppercase' }}>Ready (Enriched)</span>
          <span style={{ fontSize: 32, fontWeight: 800, color: '#065F46', display: 'flex', alignItems: 'center', gap: 12 }}>
            {enrichedLeads.length}
            {enrichedLeads.length > 0 && <span style={{ fontSize: 14, background: '#D1FAE5', color: '#065F46', padding: '4px 8px', borderRadius: 12, fontWeight: 700 }}>Sent</span>}
          </span>
        </div>
        <div style={{ background: '#EEF2FF', padding: 24, borderRadius: 16, border: '1px solid #C7D2FE', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#4338CA', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
            Browser Queue
            {browserLeads.length > 0 && (
              <span style={{ display: 'inline-block', width: 8, height: 8, background: '#6366F1', borderRadius: '50%', animation: 'pulse 1.5s infinite' }} />
            )}
          </span>
          <span style={{ fontSize: 32, fontWeight: 800, color: '#312E81' }}>{browserLeads.length}</span>
        </div>
        <div style={{ background: '#FEF2F2', padding: 24, borderRadius: 16, border: '1px solid #FECACA', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#B91C1C', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
            Pending HTTP
            {pendingLeads.length > 0 && (
              <span style={{ display: 'inline-block', width: 8, height: 8, background: '#EF4444', borderRadius: '50%', animation: 'pulse 1.5s infinite' }} />
            )}
          </span>
          <span style={{ fontSize: 32, fontWeight: 800, color: '#991B1B' }}>{pendingLeads.length}</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, borderBottom: '1px solid #E5E7EB', paddingBottom: 8 }}>
        <button 
          onClick={() => { setActiveTab('queue'); setSearchParams({ page: '1' }); }}
          style={{
            background: 'transparent', border: 'none', padding: '8px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            color: activeTab === 'queue' ? '#0F766E' : '#6B7280',
            borderBottom: activeTab === 'queue' ? '2px solid #0F766E' : '2px solid transparent',
            marginBottom: -9
          }}
        >
          Enrichment Queue ({browserLeads.length + pendingLeads.length})
        </button>
        <button 
          onClick={() => { setActiveTab('enriched'); setSearchParams({ page: '1' }); }}
          style={{
            background: 'transparent', border: 'none', padding: '8px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            color: activeTab === 'enriched' ? '#0F766E' : '#6B7280',
            borderBottom: activeTab === 'enriched' ? '2px solid #0F766E' : '2px solid transparent',
            marginBottom: -9
          }}
        >
          Enriched Data ({enrichedLeads.length})
        </button>
      </div>

      {/* Leads Table */}
      <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F6F7F2', borderBottom: '2px solid #D8E1D7' }}>
              <th style={{ textAlign: 'left', padding: '16px', fontSize: 12, fontWeight: 700, color: '#7B8794', textTransform: 'uppercase' }}>Lead Name</th>
              <th style={{ textAlign: 'left', padding: '16px', fontSize: 12, fontWeight: 700, color: '#7B8794', textTransform: 'uppercase' }}>Website</th>
              {activeTab === 'queue' ? (
                <th style={{ textAlign: 'left', padding: '16px', fontSize: 12, fontWeight: 700, color: '#7B8794', textTransform: 'uppercase' }}>Status / Queue</th>
              ) : (
                <th style={{ textAlign: 'left', padding: '16px', fontSize: 12, fontWeight: 700, color: '#7B8794', textTransform: 'uppercase' }}>Enrichment Score</th>
              )}
            </tr>
          </thead>
          <tbody>
            {(pendingLeads.length === 0 && browserLeads.length === 0) && leads.length > 0 && (
              <tr>
                <td colSpan={3} style={{ padding: 40, textAlign: 'center', color: '#059669', fontWeight: 600 }}>
                  All scraped leads have been successfully enriched! Check the Leads section.
                </td>
              </tr>
            )}
            {pendingLeads.length === 0 && leads.length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: 40, textAlign: 'center', color: '#7B8794' }}>No leads found. Scrape some leads first!</td>
              </tr>
            )}
            {paginatedLeads.map(lead => (
              <tr key={lead.id} style={{ borderBottom: '1px solid #E5E7EB', background: lead.stage === 'needs_browser' ? '#F8FAFC' : '#fff' }}>
                <td style={{ padding: '16px', fontWeight: 600, color: lead.stage === 'needs_browser' ? '#1E293B' : '#14202B' }}>
                  {lead.name}
                </td>
                <td style={{ padding: '16px' }}>
                  <a href={lead.website} target="_blank" rel="noopener noreferrer" style={{ color: '#0F766E', textDecoration: 'none' }}>
                    {lead.website}
                  </a>
                </td>
                <td style={{ padding: '16px' }}>
                  {activeTab === 'queue' ? (
                    lead.stage === 'needs_browser' ? (
                      <span style={{
                        background: '#EEF2FF', color: '#4338CA', padding: '6px 12px',
                        borderRadius: 20, fontSize: 12, fontWeight: 700, display: 'inline-flex',
                        alignItems: 'center', gap: 6, border: '1px solid #C7D2FE'
                      }}>Headless Browser Escalated</span>
                    ) : (
                      <span style={{
                        background: '#FEF3C7', color: '#92400E', padding: '6px 12px',
                        borderRadius: 20, fontSize: 12, fontWeight: 700, display: 'inline-flex',
                        alignItems: 'center', gap: 6
                      }}>Pending HTTP</span>
                    )
                  ) : (
                    <span style={{
                      background: '#D1FAE5', color: '#065F46', padding: '6px 12px',
                      borderRadius: 20, fontSize: 12, fontWeight: 700, display: 'inline-flex',
                      alignItems: 'center', gap: 6, border: '1px solid #A7F3D0'
                    }}>Score: {lead.score} - Ready</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderTop: '1px solid #E5E7EB', background: '#F9FAFB' }}>
            <span style={{ fontSize: 14, color: '#4B5563', fontWeight: 500 }}>
              Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, displayLeads.length)} of {displayLeads.length} leads
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
      </div>

      <style>
        {`
          @keyframes shimmer {
            0% { transform: translateX(-100%) skewX(-20deg); }
            100% { transform: translateX(200%) skewX(-20deg); }
          }
        `}
      </style>
    </div>
  );
}
