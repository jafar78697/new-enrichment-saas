import React, { useState, useEffect } from 'react';
import { getCallUser, employeesApi } from '../services/employeesApi';

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
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');
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
    if (!keyword || !location) return;

    setIsScraping(true);
    try {
      const response = await employeesApi.scrapeGoogleMaps({ keyword, location });
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
      alert('Failed to scrape from Google Maps. Ensure your API key is configured on the backend.');
    } finally {
      setIsScraping(false);
    }
  };

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 28, fontWeight: 700, color: '#14202B', margin: '0 0 8px' }}>
          Google Maps Scraper
        </h1>
        <p style={{ color: '#52606D', fontSize: 15, margin: 0 }}>
          Scrape and enrich local business leads from Google Maps
        </p>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, marginBottom: 32 }}>
        <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 13, color: '#7B8794', marginBottom: 8 }}>Today's Leads</div>
          <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 36, fontWeight: 700, color: '#14202B' }}>
            {stats.totalLeads}
          </div>
        </div>
        
        <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 13, color: '#7B8794', marginBottom: 8 }}>Today's Calls</div>
          <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 36, fontWeight: 700, color: '#6D28D9' }}>
            {stats.totalCalls}
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 13, color: '#7B8794', marginBottom: 8 }}>Meetings Booked</div>
          <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 36, fontWeight: 700, color: '#F59E0B' }}>
            {stats.totalMeetings}
          </div>
        </div>
        
        <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 13, color: '#7B8794', marginBottom: 8 }}>Enriched Leads</div>
          <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 36, fontWeight: 700, color: '#10B981' }}>
            {stats.enriched}
          </div>
        </div>
        
        <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 13, color: '#7B8794', marginBottom: 8 }}>Remaining to Enrich</div>
          <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 36, fontWeight: 700, color: '#0F766E' }}>
            {stats.remaining}
          </div>
        </div>
      </div>

      {/* Admin Scraper */}
      {isAdmin && (
        <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 12, padding: 24, marginBottom: 32 }}>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 18, fontWeight: 700, color: '#14202B', margin: '0 0 8px' }}>
            Admin Scraper Control
          </h2>
          <p style={{ color: '#52606D', fontSize: 14, margin: '0 0 20px' }}>
            Use Google Maps API to find new local businesses by keyword and location.
          </p>
          
          <form onSubmit={handleScrape} style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 200px' }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#52606D', marginBottom: 6 }}>Keyword</label>
              <input
                type="text"
                required
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="e.g. Plumbers, Marketing"
                style={{ width: '100%', padding: '10px 14px', border: '1px solid #D8E1D7', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }}
              />
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#52606D', marginBottom: 6 }}>Location</label>
              <input
                type="text"
                required
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. New York, London"
                style={{ width: '100%', padding: '10px 14px', border: '1px solid #D8E1D7', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }}
              />
            </div>
            <div>
              <button
                type="submit"
                disabled={isScraping}
                style={{ 
                  background: isScraping ? '#9CA3AF' : '#0F766E', 
                  color: '#fff', 
                  padding: '10px 24px', 
                  borderRadius: 8, 
                  border: 'none', 
                  fontWeight: 600, 
                  cursor: isScraping ? 'not-allowed' : 'pointer',
                  height: 42
                }}
              >
                {isScraping ? 'Scraping...' : '▶ Start Scraping'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Scraped Leads Table */}
      <div style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 12, padding: 24 }}>
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
              <tr style={{ borderBottom: '2px solid #D8E1D7' }}>
                <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#7B8794', textTransform: 'uppercase' }}>Business Info</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#7B8794', textTransform: 'uppercase' }}>Contact Info</th>
                <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#7B8794', textTransform: 'uppercase' }}>Rating</th>
                <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#7B8794', textTransform: 'uppercase' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '40px 24px', textAlign: 'center', color: '#7B8794' }}>
                    No leads scraped yet. Use the admin panel to start.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead.id} style={{ borderBottom: '1px solid #E5E7EB' }}>
                    <td style={{ padding: '16px' }}>
                      <div style={{ fontWeight: 600, color: '#14202B' }}>{lead.name}</div>
                      <div style={{ fontSize: 12, color: '#7B8794', marginTop: 4 }}>📍 {lead.address}</div>
                    </td>
                    <td style={{ padding: '16px' }}>
                      {lead.phone && (
                        <div style={{ fontSize: 13, color: '#52606D', marginBottom: 4 }}>📞 {lead.phone}</div>
                      )}
                      {lead.website && (
                        <div style={{ fontSize: 13 }}>
                          🌐 <a href={lead.website} target="_blank" rel="noopener noreferrer" style={{ color: '#0F766E', textDecoration: 'none' }}>Website</a>
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'center', padding: '16px', fontFamily: 'Space Grotesk, sans-serif', fontSize: 16, fontWeight: 700, color: '#F59E0B' }}>
                      {lead.rating} <span style={{ fontSize: 12, color: '#7B8794', fontWeight: 500 }}>({lead.reviews})</span>
                    </td>
                    <td style={{ textAlign: 'center', padding: '16px' }}>
                      {lead.status === 'scraped' ? (
                        <span style={{ background: '#F3F4F6', color: '#4B5563', padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                          Pending
                        </span>
                      ) : (
                        <span style={{ background: '#D1FAE5', color: '#065F46', padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                          ✓ Enriched
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
