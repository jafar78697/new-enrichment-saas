import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import callsApi from '../services/callsApi';
import { getCallUser } from '../services/employeesApi';
import { scraperApi, jobsApi } from '../services/api';
import { nichesApi, type Niche } from '../services/nichesApi';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';

interface ScrapedLead {
  id: string;
  name: string;
  phone: string;
  website: string;
  rating: number;
  reviews: number;
  address: string;
  status: 'scraped' | 'enriching' | 'enriched' | 'failed';
}

type GroupedLeads = Record<string, ScrapedLead[]>;

export default function GoogleMapScraper() {
  const [searchParams, setSearchParams] = useSearchParams();
  const pageSize = 20;
  
  const currentPage = parseInt(searchParams.get('page') || '1', 10);

  const goToPage = (page: number) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('page', page.toString());
    setSearchParams(newParams);
  };

  const [isAdmin, setIsAdmin] = useState(false);
  const [bulkKeywords, setBulkKeywords] = useState('');
  const [location, setLocation] = useState('');
  
  // Niche selection logic
  const [selectedNiche, setSelectedNiche] = useState('');
  const [newNicheName, setNewNicheName] = useState('');
  const [niches, setNiches] = useState<Niche[]>([]);
  
  const [isScraping, setIsScraping] = useState(false);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  
  const { data, isLoading } = useQuery({
    queryKey: ['contacts'],
    queryFn: callsApi.listContacts,
    refetchInterval: (query) => {
      const currentLeads = query.state.data?.contacts || [];
      const hasPending = currentLeads.some((l: any) => !l.score || l.score <= 0);
      return hasPending ? 3000 : false;
    }
  });

  const leads = data?.contacts || [];
  
  // Categorize leads
  const pendingLeads = leads.filter(l => l.website && (!l.score || l.score <= 0) && l.stage !== 'needs_browser');
  const browserLeads = leads.filter(l => l.stage === 'needs_browser');
  const enrichedLeads = leads.filter(l => l.score && l.score > 0 && l.stage !== 'needs_browser');
  
  const [mainTab, setMainTab] = useState<'scraper' | 'http' | 'pending' | 'browser'>('scraper');

  interface ScrapeJob {
    keyword: string;
    location: string;
    status: 'pending' | 'scraping' | 'completed' | 'failed';
    leadsFound: number;
    startedAt: string;
    completedAt?: string;
  }
  const [scrapeJobs, setScrapeJobs] = useState<ScrapeJob[]>([]);

  useEffect(() => {
    // All users can access scraper and niches
    setIsAdmin(true);
    nichesApi.list().then(res => {
      if (res.niches) setNiches(res.niches);
    }).catch(err => console.error("Failed to fetch niches", err));
  }, []);

  const handleScrape = async (e: React.FormEvent) => {
    e.preventDefault();
    const keywords = bulkKeywords.split('\n').map(k => k.trim()).filter(k => k);
    if (keywords.length === 0) return;

    // Determine the final niche name to send to backend
    let finalNicheName = '';
    if (selectedNiche === 'new') {
      finalNicheName = newNicheName.trim();
      if (finalNicheName) {
        try {
          await nichesApi.create({ name: finalNicheName });
        } catch (err: any) {
          console.log("Niche creation skipped (might already exist):", err);
        }
      }
    } else {
      finalNicheName = selectedNiche;
    }

    const newJobs: ScrapeJob[] = keywords.map(kw => ({
      keyword: kw,
      location,
      status: 'pending',
      leadsFound: 0,
      startedAt: new Date().toISOString()
    }));
    setScrapeJobs(prev => [...newJobs, ...prev]);

    setIsScraping(true);
    let allScrapedDomains: string[] = [];
    try {
      for (const keyword of keywords) {
        setScrapeJobs(prev => prev.map(job => 
          job.keyword === keyword && job.status === 'pending' 
            ? { ...job, status: 'scraping' } 
            : job
        ));

        toast(`Scraping: ${keyword}... (Fetching all available pages)`);
        const response = await scraperApi.scrapeGoogleMaps({ 
          keywords: [keyword], 
          location, 
          // limit is intentionally removed from payload to scrape maximum possible
          niche_name: finalNicheName !== '' ? finalNicheName : undefined
        });
        
        if (response.success && response.leads) {
          const websites = response.leads.map((l: any) => l.website).filter(Boolean);
          allScrapedDomains.push(...websites);
          
          setScrapeJobs(prev => prev.map(job => 
            job.keyword === keyword && job.status === 'scraping'
              ? { ...job, status: 'completed', leadsFound: response.leads.length, completedAt: new Date().toISOString() } 
              : job
          ));
        } else {
          setScrapeJobs(prev => prev.map(job => 
            job.keyword === keyword && job.status === 'scraping'
              ? { ...job, status: 'failed', completedAt: new Date().toISOString() } 
              : job
          ));
        }
      }
      toast.success('All keywords processed successfully! Scraped maximum available leads.');

      // AUTO-TRIGGER ENRICHMENT
      if (allScrapedDomains.length > 0) {
        toast('Starting auto-enrichment...');
        try {
          await jobsApi.create({ domains: allScrapedDomains, mode: 'smart_hybrid' });
          toast.success(`Enrichment started for ${allScrapedDomains.length} websites!`);
        } catch (e: any) {
          toast.error('Error starting auto-enrichment: ' + (e.response?.data?.message || e.message));
        }
      }

      // REFRESH NICHES LIST IN CASE A NEW ONE WAS CREATED
      nichesApi.list().then(res => {
        if (res.niches) setNiches(res.niches);
        // Clear the new niche text input
        if (selectedNiche === 'new') {
          setSelectedNiche(finalNicheName);
          setNewNicheName('');
        }
      }).catch(err => console.error("Failed to fetch niches", err));

    } catch (error) {
      console.error('Failed to scrape:', error);
      toast.error('Failed to scrape from Google Maps. Ensure your API key is configured on the backend.');
    } finally {
      setIsScraping(false);
    }
  };

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Header & Stats Container */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 24, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 24, fontWeight: 700, color: '#14202B', margin: '0 0 4px' }}>
            Google Maps Scraper <span style={{ color: '#0F766E', fontSize: 14, verticalAlign: 'middle', background: '#EEF2EA', padding: '2px 8px', borderRadius: 12, marginLeft: 8 }}>Premium</span>
          </h1>
          <p style={{ color: '#52606D', fontSize: 14, margin: 0 }}>
            Scrape and enrich local business leads from Google Maps in bulk.
          </p>
        </div>

        {/* Smaller Stats Cards */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 8, padding: '12px 16px', boxShadow: '0 2px 4px -1px rgba(0, 0, 0, 0.05)', minWidth: 140 }}>
            <div style={{ fontSize: 12, color: '#7B8794', marginBottom: 4 }}>Total Scraped</div>
            <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 22, fontWeight: 700, color: '#14202B' }}>
              {leads.length}
            </div>
          </div>
          
          <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 8, padding: '12px 16px', boxShadow: '0 2px 4px -1px rgba(0, 0, 0, 0.05)', minWidth: 140 }}>
            <div style={{ fontSize: 12, color: '#7B8794', marginBottom: 4 }}>Enriched Leads</div>
            <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 22, fontWeight: 700, color: '#10B981' }}>
              {enrichedLeads.length}
            </div>
          </div>
          
          <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 8, padding: '12px 16px', boxShadow: '0 2px 4px -1px rgba(0, 0, 0, 0.05)', minWidth: 140 }}>
            <div style={{ fontSize: 12, color: '#7B8794', marginBottom: 4 }}>Pending Enrich</div>
            <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 22, fontWeight: 700, color: '#0F766E' }}>
              {pendingLeads.length + browserLeads.length}
            </div>
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 24, borderBottom: '1px solid #E5E7EB', paddingBottom: 0 }}>
        {[
          { id: 'scraper', label: 'Google Maps Scraping' },
          { id: 'http', label: `HTTP Enriched (${enrichedLeads.length})` },
          { id: 'pending', label: `Pending HTTP (${pendingLeads.length})` },
          { id: 'browser', label: `Browser Queue (${browserLeads.length})` }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => { setMainTab(tab.id as any); setSearchParams({ page: '1' }); }}
            style={{
              background: 'transparent', border: 'none', padding: '12px 0', fontSize: 15, fontWeight: 600, cursor: 'pointer',
              color: mainTab === tab.id ? '#0F766E' : '#6B7280',
              borderBottom: mainTab === tab.id ? '3px solid #0F766E' : '3px solid transparent',
              marginBottom: -1
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Google Maps Scraping Tab Content */}
      {mainTab === 'scraper' && (
        <>
          {/* Admin Scraper Form */}
          {isAdmin && (
            <div style={{ 
              background: 'linear-gradient(145deg, #ffffff, #f9fafb)', 
              border: '1px solid #e5e7eb', 
              borderRadius: 16, 
              padding: 32, 
              marginBottom: 32,
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 0 20px rgba(16, 185, 129, 0.05)'
            }}>
              <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>
                Bulk Scraper Engine
              </h2>
              <p style={{ color: '#4B5563', fontSize: 14, margin: '0 0 24px' }}>
                Extract hundreds of leads and push them directly to a Niche. Returns maximum results possible per keyword.
              </p>
              
              <form onSubmit={handleScrape} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 300px' }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                      Bulk Keywords <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(One per line)</span>
                    </label>
                    <textarea
                      required
                      value={bulkKeywords}
                      onChange={(e) => setBulkKeywords(e.target.value)}
                      placeholder="Beauty Salons in UK&#10;Plumbers in London"
                      rows={6}
                      style={{ 
                        width: '100%', 
                        padding: '12px 16px', 
                        border: '1px solid #D1D5DB', 
                        borderRadius: 8, 
                        fontSize: 14, 
                        fontFamily: 'inherit',
                        resize: 'vertical',
                        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)'
                      }}
                    />
                  </div>

                  <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                        Location Filter <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(Optional - Applies to all keywords)</span>
                      </label>
                      <input
                        type="text"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="e.g. New York, London"
                        style={{ width: '100%', padding: '10px 14px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }}
                      />
                    </div>
                    
                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Save to Niche</label>
                      <select 
                        value={selectedNiche} 
                        onChange={(e) => setSelectedNiche(e.target.value)}
                        style={{ width: '100%', padding: '10px 14px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', backgroundColor: '#fff', marginBottom: selectedNiche === 'new' ? 12 : 0 }}
                      >
                        <option value="">-- Do not save to niche --</option>
                        {niches.map(niche => (
                          <option key={niche.id} value={niche.name}>{niche.name}</option>
                        ))}
                        <option value="new">+ Create New Niche</option>
                      </select>

                      {selectedNiche === 'new' && (
                        <input
                          type="text"
                          autoFocus
                          required
                          value={newNicheName}
                          onChange={(e) => setNewNicheName(e.target.value)}
                          placeholder="Enter new niche name..."
                          style={{ width: '100%', padding: '10px 14px', border: '1px solid #10B981', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', boxShadow: '0 0 0 2px rgba(16, 185, 129, 0.2)' }}
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="submit"
                    disabled={isScraping}
                    style={{ 
                      background: isScraping ? '#9CA3AF' : '#10B981', 
                      color: '#fff', 
                      padding: '12px 32px', 
                      borderRadius: 8, 
                      border: 'none', 
                      fontWeight: 600, 
                      fontSize: 15,
                      cursor: isScraping ? 'not-allowed' : 'pointer',
                      boxShadow: isScraping ? 'none' : '0 4px 14px rgba(16, 185, 129, 0.4)',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}
                  >
                    {isScraping ? (
                      <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }}>
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Scraping in background...
                      </>
                    ) : 'Start Bulk Scraping'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Keywords / Jobs Tracker Table */}
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E5E7EB', background: '#F8FAFC' }}>
                  <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>Keyword</th>
                  <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>Leads Found</th>
                  <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>Started At</th>
                </tr>
              </thead>
              <tbody>
                {scrapeJobs.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>No keywords scraped yet. Add bulk keywords above to begin.</td></tr>
                ) : (
                  scrapeJobs.map((job, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #F3F4F6' }}>
                      <td style={{ padding: '16px 20px', fontWeight: 600, color: '#111827' }}>
                        {job.keyword} {job.location && <span style={{color: '#9CA3AF', fontWeight: 'normal', fontSize: 12}}>(in {job.location})</span>}
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        {job.status === 'scraping' && <span style={{ color: '#F59E0B', fontWeight: 600, background: '#FEF3C7', padding: '4px 8px', borderRadius: 12, fontSize: 12 }}>Scraping...</span>}
                        {job.status === 'pending' && <span style={{ color: '#6B7280', fontWeight: 600, background: '#F3F4F6', padding: '4px 8px', borderRadius: 12, fontSize: 12 }}>Pending</span>}
                        {job.status === 'completed' && <span style={{ color: '#059669', fontWeight: 600, background: '#D1FAE5', padding: '4px 8px', borderRadius: 12, fontSize: 12 }}>Completed</span>}
                        {job.status === 'failed' && <span style={{ color: '#DC2626', fontWeight: 600, background: '#FEE2E2', padding: '4px 8px', borderRadius: 12, fontSize: 12 }}>Failed</span>}
                      </td>
                      <td style={{ padding: '16px 20px', fontWeight: 600, color: job.leadsFound > 0 ? '#059669' : '#6B7280' }}>
                        {job.leadsFound > 0 ? `+${job.leadsFound}` : '-'}
                      </td>
                      <td style={{ padding: '16px 20px', color: '#6B7280', fontSize: 13 }}>
                        {new Date(job.startedAt).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Enrichment Trackers */}
      {(mainTab === 'http' || mainTab === 'pending' || mainTab === 'browser') && (
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#7B8794' }}>Loading leads...</div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #E5E7EB', background: '#F8FAFC' }}>
                      <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>Lead Name</th>
                      <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>Website</th>
                      <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const displayLeads = mainTab === 'http' ? enrichedLeads : mainTab === 'pending' ? pendingLeads : mainTab === 'browser' ? browserLeads : [];
                      const totalPages = Math.ceil(displayLeads.length / pageSize);
                      const paginatedLeads = displayLeads.slice((currentPage - 1) * pageSize, currentPage * pageSize);

                      if (displayLeads.length === 0) {
                        return (
                          <tr>
                            <td colSpan={3} style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>No leads found in this section.</td>
                          </tr>
                        );
                      }

                      return paginatedLeads.map((lead: any) => (
                        <tr key={lead.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                          <td style={{ padding: '16px 20px', fontWeight: 600, color: '#111827' }}>
                            {lead.name}
                          </td>
                          <td style={{ padding: '16px 20px' }}>
                            <a href={lead.website} target="_blank" rel="noopener noreferrer" style={{ color: '#0F766E', textDecoration: 'none' }}>
                              {lead.website}
                            </a>
                          </td>
                          <td style={{ padding: '16px 20px' }}>
                            {mainTab === 'http' ? (
                              <span style={{ background: '#D1FAE5', color: '#065F46', padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, border: '1px solid #A7F3D0' }}>
                                Ready for Outreach
                              </span>
                            ) : (
                              lead.stage === 'needs_browser' ? (
                                <span style={{ background: '#EEF2FF', color: '#4338CA', padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, border: '1px solid #C7D2FE' }}>
                                  Headless Browser Escalated
                                </span>
                              ) : (
                                <span style={{ background: '#FEF3C7', color: '#92400E', padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                                  Pending HTTP
                                </span>
                              )
                            )}
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {(() => {
                const displayLeads = mainTab === 'http' ? enrichedLeads : mainTab === 'pending' ? pendingLeads : mainTab === 'browser' ? browserLeads : [];
                const totalPages = Math.ceil(displayLeads.length / pageSize);
                if (totalPages <= 1) return null;

                return (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderTop: '1px solid #E5E7EB', background: '#F9FAFB' }}>
                    <span style={{ fontSize: 14, color: '#4B5563', fontWeight: 500 }}>
                      Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, displayLeads.length)} of {displayLeads.length} leads
                    </span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button 
                        onClick={() => goToPage(currentPage - 1)} 
                        disabled={currentPage === 1}
                        style={{ padding: '6px 12px', background: currentPage === 1 ? '#F3F4F6' : '#fff', color: currentPage === 1 ? '#9CA3AF' : '#374151', border: '1px solid #D1D5DB', borderRadius: 6, fontWeight: 600, cursor: currentPage === 1 ? 'not-allowed' : 'pointer', fontSize: 13 }}
                      >
                        Previous
                      </button>
                      <span style={{ padding: '6px 12px', background: '#F3F4F6', color: '#374151', border: '1px solid #E5E7EB', borderRadius: 6, fontWeight: 700, fontSize: 13 }}>
                        Page {currentPage} of {totalPages}
                      </span>
                      <button 
                        onClick={() => goToPage(currentPage + 1)} 
                        disabled={currentPage === totalPages}
                        style={{ padding: '6px 12px', background: currentPage === totalPages ? '#F3F4F6' : '#fff', color: currentPage === totalPages ? '#9CA3AF' : '#374151', border: '1px solid #D1D5DB', borderRadius: 6, fontWeight: 600, cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', fontSize: 13 }}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}
