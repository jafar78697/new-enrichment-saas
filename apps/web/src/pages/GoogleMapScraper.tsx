import React, { useState, useEffect } from 'react';
import { getCallUser } from '../services/employeesApi';
import { scraperApi } from '../services/api';
import { nichesApi, type Niche } from '../services/nichesApi';
import { toast } from 'sonner';

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

export default function GoogleMapScraper() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [bulkKeywords, setBulkKeywords] = useState('');
  const [location, setLocation] = useState('');
  const [limit, setLimit] = useState(60);
  const [nicheName, setNicheName] = useState('');
  const [niches, setNiches] = useState<Niche[]>([]);
  const [isScraping, setIsScraping] = useState(false);
  const [leads, setLeads] = useState<ScrapedLead[]>([]);

  // Dashboard Stats
  const [stats, setStats] = useState({
    totalLeads: 0,
    totalCalls: 0,
    totalMeetings: 0,
    enriched: 0,
    remaining: 0,
  });

  useEffect(() => {
    // Check if user is manager/admin
    const user = getCallUser();
    if (user?.role === 'manager') {
      setIsAdmin(true);
      // Fetch Niches for Dropdown
      nichesApi.list().then(res => {
        if (res.niches) setNiches(res.niches);
      }).catch(err => console.error("Failed to fetch niches", err));
    }

    // Mock initial stats fetch
    setStats({
      totalLeads: 1240,
      totalCalls: 85,
      totalMeetings: 12,
      enriched: 950,
      remaining: 290,
    });
  }, []);

  const handleScrape = async (e: React.FormEvent) => {
    e.preventDefault();
    const keywords = bulkKeywords.split('\n').map(k => k.trim()).filter(k => k);
    if (keywords.length === 0) return;

    setIsScraping(true);
    try {
      const response = await scraperApi.scrapeGoogleMaps({ 
        keywords, 
        location, 
        limit,
        niche_name: nicheName.trim() !== '' ? nicheName.trim() : undefined
      });
      if (response.success && response.leads) {
        setLeads(response.leads);
        setStats(prev => ({ 
          ...prev, 
          totalLeads: prev.totalLeads + response.leads.length, 
          remaining: prev.remaining + response.leads.length 
        }));
      }
    } catch (error) {
      console.error('Failed to scrape:', error);
      toast.error('Failed to scrape from Google Maps. Ensure your API key is configured on the backend.');
    } finally {
      setIsScraping(false);
    }
  };

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 28, fontWeight: 700, color: '#14202B', margin: '0 0 8px' }}>
          Google Maps Scraper <span style={{ color: '#0F766E', textShadow: '0 0 10px rgba(15, 118, 110, 0.3)' }}>✨ Premium</span>
        </h1>
        <p style={{ color: '#52606D', fontSize: 15, margin: 0 }}>
          Scrape and enrich local business leads from Google Maps in bulk.
        </p>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, marginBottom: 32 }}>
        <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 12, padding: 24, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
          <div style={{ fontSize: 13, color: '#7B8794', marginBottom: 8 }}>Today's Leads</div>
          <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 36, fontWeight: 700, color: '#14202B' }}>
            {stats.totalLeads}
          </div>
        </div>
        
        <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 12, padding: 24, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
          <div style={{ fontSize: 13, color: '#7B8794', marginBottom: 8 }}>Today's Calls</div>
          <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 36, fontWeight: 700, color: '#6D28D9' }}>
            {stats.totalCalls}
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 12, padding: 24, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
          <div style={{ fontSize: 13, color: '#7B8794', marginBottom: 8 }}>Meetings Booked</div>
          <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 36, fontWeight: 700, color: '#F59E0B' }}>
            {stats.totalMeetings}
          </div>
        </div>
        
        <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 12, padding: 24, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
          <div style={{ fontSize: 13, color: '#7B8794', marginBottom: 8 }}>Enriched Leads</div>
          <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 36, fontWeight: 700, color: '#10B981' }}>
            {stats.enriched}
          </div>
        </div>
        
        <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 12, padding: 24, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
          <div style={{ fontSize: 13, color: '#7B8794', marginBottom: 8 }}>Remaining to Enrich</div>
          <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 36, fontWeight: 700, color: '#0F766E' }}>
            {stats.remaining}
          </div>
        </div>
      </div>

      {/* Admin Scraper - Glowing UI */}
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
            Extract hundreds of leads and push them directly to a Niche.
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
                  rows={4}
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
                    Location <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. New York, London"
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }}
                  />
                </div>
                
                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Type or Select Niche</label>
                    <input
                      list="nichesList"
                      value={nicheName}
                      onChange={(e) => setNicheName(e.target.value)}
                      placeholder="e.g. UK Salons"
                      style={{ width: '100%', padding: '10px 14px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', backgroundColor: '#fff' }}
                    />
                    <datalist id="nichesList">
                      {niches.map(niche => (
                        <option key={niche.id} value={niche.name} />
                      ))}
                    </datalist>
                  </div>
                  <div style={{ width: 100 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Leads/Kw</label>
                    <input
                      type="number"
                      min="1"
                      max="300"
                      required
                      value={limit}
                      onChange={(e) => setLimit(Number(e.target.value))}
                      style={{ width: '100%', padding: '10px 14px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }}
                    />
                  </div>
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
                  transform: isScraping ? 'none' : 'translateY(-1px)'
                }}
              >
                {isScraping ? 'Scraping Data...' : '▶ Start Bulk Scraping'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Scraped Leads Table */}
      <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 12, padding: 24, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 18, fontWeight: 700, color: '#14202B', margin: 0 }}>
            Recent Leads from Maps
          </h2>
          <button style={{ background: '#fff', border: '1px solid #D8E1D7', color: '#52606D', padding: '6px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            ↓ Export CSV
          </button>
        </div>
        
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E5E7EB' }}>
                <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase' }}>Business Info</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase' }}>Contact Info</th>
                <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase' }}>Rating</th>
                <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '40px 24px', textAlign: 'center', color: '#9CA3AF' }}>
                    No leads scraped yet. Use the admin panel to start.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '16px' }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{lead.name}</div>
                      <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>📍 {lead.address || 'Address hidden'}</div>
                    </td>
                    <td style={{ padding: '16px' }}>
                      {lead.phone ? (
                        <div style={{ fontSize: 13, color: '#4B5563', marginBottom: 4 }}>📞 {lead.phone}</div>
                      ) : (
                        <div style={{ fontSize: 12, color: '#EF4444', marginBottom: 4 }}>⚠️ No Phone</div>
                      )}
                      {lead.website && (
                        <div style={{ fontSize: 13 }}>
                          🌐 <a href={lead.website} target="_blank" rel="noopener noreferrer" style={{ color: '#0F766E', textDecoration: 'none' }}>Website</a>
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'center', padding: '16px', fontFamily: 'Space Grotesk, sans-serif', fontSize: 16, fontWeight: 700, color: '#F59E0B' }}>
                      {lead.rating} <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 500 }}>({lead.reviews})</span>
                    </td>
                    <td style={{ textAlign: 'center', padding: '16px' }}>
                      {lead.status === 'enriched' ? (
                        <span style={{ background: '#D1FAE5', color: '#065F46', padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, border: '1px solid #A7F3D0' }}>
                          ✓ Saved to Niche
                        </span>
                      ) : (
                        <span style={{ background: '#F3F4F6', color: '#4B5563', padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                          Pending
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
