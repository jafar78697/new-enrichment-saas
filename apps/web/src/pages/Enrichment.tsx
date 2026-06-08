import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import callsApi, { Contact } from '../services/callsApi';
import { jobsApi } from '../services/api';
import { toast } from 'sonner';

export default function EnrichmentPage() {
  const queryClient = useQueryClient();
  const [isStartingEnrichment, setIsStartingEnrichment] = useState(false);
  
  const { data, isLoading } = useQuery({
    queryKey: ['contacts'],
    queryFn: callsApi.listContacts,
    refetchInterval: (query) => {
      // PERFORMANCE OPTIMIZATION:
      // Previously, this polled every 3 seconds unconditionally, which caused heavy server load and React re-renders.
      // Now, it only polls if there is actually a lead that needs enrichment.
      // This saves API bandwidth and CPU usage.
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
  const pendingLeads = leads.filter(l => !l.score || l.score <= 0);
  const enrichedLeads = leads.filter(l => l.score && l.score > 0);
  
  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear ALL leads? This cannot be undone.')) {
      clearAllMutation.mutate();
    }
  };

  const handleStartEnrichment = async () => {
    const domains = pendingLeads
      .filter(l => l.website)
      .map(l => l.website!);
      
    if (domains.length === 0) {
      toast.error('No pending leads with websites found to enrich.');
      return;
    }

    setIsStartingEnrichment(true);
    try {
      await jobsApi.create({ domains, mode: 'smart_hybrid' });
      toast.success(`Enrichment started for ${domains.length} websites! Progress will update automatically.`);
    } catch (err: any) {
      toast.error('Error starting enrichment: ' + (err.response?.data?.message || err.message));
    } finally {
      setIsStartingEnrichment(false);
    }
  };

  const calculateProgress = () => {
    if (leads.length === 0) return 0;
    return Math.round((enrichedLeads.length / leads.length) * 100);
  };

  if (isLoading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#7B8794' }}>Loading scraped leads...</div>;
  }

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 28, fontWeight: 700, color: '#14202B', margin: '0 0 8px' }}>
            ✨ Smart Enrichment
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
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Starting...
              </span>
            ) : (
              <>🚀 Enrich {pendingLeads.length} Pending Leads</>
            )}
          </button>
        </div>
      </div>

      {/* Live Dashboard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#fff', padding: 24, borderRadius: 16, border: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase' }}>Total Scraped</span>
          <span style={{ fontSize: 32, fontWeight: 800, color: '#111827' }}>{leads.length}</span>
        </div>
        <div style={{ background: '#F0FDFA', padding: 24, borderRadius: 16, border: '1px solid #A7F3D0', display: 'flex', flexDirection: 'column', gap: 8, position: 'relative', overflow: 'hidden' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#047857', textTransform: 'uppercase' }}>✅ Enriched & Sent to Leads</span>
          <span style={{ fontSize: 32, fontWeight: 800, color: '#065F46', display: 'flex', alignItems: 'center', gap: 12 }}>
            {enrichedLeads.length}
            {enrichedLeads.length > 0 && <span style={{ fontSize: 14, background: '#D1FAE5', color: '#065F46', padding: '4px 8px', borderRadius: 12, fontWeight: 700 }}>Ready</span>}
          </span>
        </div>
        <div style={{ background: '#FEF2F2', padding: 24, borderRadius: 16, border: '1px solid #FECACA', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#B91C1C', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
            ⏳ Pending Enrichment
            {pendingLeads.length > 0 && (
              <span style={{ display: 'inline-block', width: 8, height: 8, background: '#EF4444', borderRadius: '50%', animation: 'pulse 1.5s infinite' }} />
            )}
          </span>
          <span style={{ fontSize: 32, fontWeight: 800, color: '#991B1B' }}>{pendingLeads.length}</span>
        </div>
      </div>

      {/* Progress Bar & Animation */}
      {leads.length > 0 && (
        <div style={{ marginBottom: 32, background: '#fff', padding: 20, borderRadius: 12, border: '1px solid #E5E7EB' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 14, fontWeight: 600, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: '#4B5563' }}>Enrichment Progress</span>
              {pendingLeads.length > 0 && (
                <span style={{ 
                  fontSize: 12, 
                  padding: '4px 10px', 
                  background: '#FEF2F2', 
                  color: '#B91C1C', 
                  borderRadius: 12, 
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  animation: 'pulse 1.5s infinite' 
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444' }}></span>
                  {pendingLeads.length} Remaining
                </span>
              )}
              {enrichedLeads.length > 0 && (
                <span style={{ fontSize: 12, padding: '4px 10px', background: '#F0FDFA', color: '#047857', borderRadius: 12 }}>
                  ✅ {enrichedLeads.length} Completed
                </span>
              )}
            </div>
            <span style={{ color: '#0F766E', fontSize: 16, fontWeight: 800 }}>{calculateProgress()}%</span>
          </div>
          <div style={{ width: '100%', height: 12, background: '#F3F4F6', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
            <div style={{ 
              width: `${calculateProgress()}%`, 
              height: '100%', 
              background: 'linear-gradient(90deg, #14B8A6 0%, #0F766E 100%)', 
              transition: 'width 0.5s ease-in-out',
              position: 'relative'
            }}>
              {pendingLeads.length > 0 && calculateProgress() > 0 && (
                <div style={{ 
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, 
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                  animation: 'shimmer 1.5s infinite linear',
                  transform: 'skewX(-20deg)'
                }} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Leads Table */}
      <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F6F7F2', borderBottom: '2px solid #D8E1D7' }}>
              <th style={{ textAlign: 'left', padding: '16px', fontSize: 12, fontWeight: 700, color: '#7B8794', textTransform: 'uppercase' }}>Lead Name</th>
              <th style={{ textAlign: 'left', padding: '16px', fontSize: 12, fontWeight: 700, color: '#7B8794', textTransform: 'uppercase' }}>Website</th>
              <th style={{ textAlign: 'left', padding: '16px', fontSize: 12, fontWeight: 700, color: '#7B8794', textTransform: 'uppercase' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {/* 
              USER REQUIREMENT IMPLEMENTED: 
              Only show pending leads in this table.
              Leads that are enriched will disappear from here and show up in the main 'Leads' page.
            */}
            {pendingLeads.length === 0 && leads.length > 0 && (
              <tr>
                <td colSpan={3} style={{ padding: 40, textAlign: 'center', color: '#059669', fontWeight: 600 }}>
                  🎉 All scraped leads have been successfully enriched! Check the Leads section.
                </td>
              </tr>
            )}
            {pendingLeads.length === 0 && leads.length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: 40, textAlign: 'center', color: '#7B8794' }}>No leads found. Scrape some leads first!</td>
              </tr>
            )}
            {pendingLeads.map(lead => (
              <tr key={lead.id} style={{ borderBottom: '1px solid #E5E7EB', background: '#fff' }}>
                <td style={{ padding: '16px', fontWeight: 600, color: '#14202B' }}>
                  {lead.name}
                </td>
                <td style={{ padding: '16px' }}>
                  <a href={lead.website} target="_blank" rel="noopener noreferrer" style={{ color: '#0F766E', textDecoration: 'none' }}>
                    {lead.website}
                  </a>
                </td>
                <td style={{ padding: '16px' }}>
                  <span style={{
                    background: '#FEF3C7',
                    color: '#92400E',
                    padding: '6px 12px',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6
                  }}>
                    {/* 
                      PERFORMANCE OPTIMIZATION: 
                      Removed the <svg className="animate-spin ..."> here.
                      Having hundreds of spinning SVGs in a long table causes the browser's 
                      GPU/CPU to max out and the UI to lag terribly. 
                      A simple text indicator is much faster to render.
                    */}
                    ⏳ Pending Enrichment
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
