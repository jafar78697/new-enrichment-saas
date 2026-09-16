import React, { useMemo, useState } from 'react';
import { MapPin, Database, Play } from 'lucide-react';
import axios from 'axios';
import { useNotifications } from '../components/Notifications';

export default function Enrichment() {
  const { notify } = useNotifications();
  const [keywordInput, setKeywordInput] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  const keywords = useMemo(() => {
    const unique = new Map<string, string>();
    keywordInput.split(/[\n,]+/).forEach((value) => {
      const keyword = value.trim();
      if (keyword) unique.set(keyword.toLowerCase(), keyword);
    });
    return [...unique.values()];
  }, [keywordInput]);
  const batchTooLarge = keywords.length > 10;
  const estimatedCredits = keywords.length * 20;

  const handleScrape = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keywords.length || batchTooLarge) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Please log in before starting a Maps scrape.');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const res = await axios.post(`${API_URL}/v1/google-maps/scrape`, {
        keywords,
        location: location || 'United States'
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data && res.data.success) {
        setResults((current) => [{
          id: res.data.jobId,
          count: res.data.leadsCount,
          uniqueCount: res.data.uniqueLeadCount ?? res.data.leadsCount,
          newCount: res.data.newLeadCount ?? res.data.leadsCount,
          existingCount: res.data.existingLeadCount ?? 0,
          keywordCount: keywords.length,
          status: 'Completed'
        }, ...current]);
        const newCount = Number(res.data.newLeadCount ?? res.data.leadsCount);
        const existingCount = Number(res.data.existingLeadCount ?? 0);
        notify(
          `${res.data.leadsCount} Maps result${res.data.leadsCount === 1 ? '' : 's'} processed: ${newCount} new unique lead${newCount === 1 ? '' : 's'} added${existingCount ? `, ${existingCount} already in your Lead List` : ''}.`,
          'success',
        );
      }
    } catch (err: any) {
      console.error('Failed to trigger enrichment API:', err);
      notify(err?.response?.data?.error || 'Google Maps search could not be completed. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-in fade-in duration-500 max-w-5xl mx-auto">
      <header className="mb-10">
        <h1 className="text-3xl font-bold text-white mb-2">Lead Enrichment</h1>
        <p className="text-textMuted">Extract high-quality leads from Google Maps in real-time.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <form onSubmit={handleScrape} className="glass-card p-6 flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-2">
              <Database size={18} className="text-primary" /> New Scrape Task
            </h2>
            
            <div>
              <label className="block text-sm font-medium text-textMuted mb-1">Keywords</label>
              <textarea
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                placeholder={'Makeup salon\nWedding photographer\nRoofing company'}
                className="input-field min-h-32 resize-y leading-6"
                spellCheck={false}
                required
              />
              <p className={`mt-2 text-xs ${batchTooLarge ? 'text-rose-400' : 'text-textMuted'}`}>
                {batchTooLarge
                  ? 'Maximum 10 unique keywords per batch.'
                  : `${keywords.length} unique keyword${keywords.length === 1 ? '' : 's'} ready. One keyword per line or comma.`}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-textMuted mb-1">Location</label>
              <div className="relative">
                <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
                <input 
                  type="text" 
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Location" 
                  className="input-field pl-10"
                />
              </div>
            </div>

            <div>
              <p className="mt-2 text-xs text-textMuted">
                Up to {estimatedCredits} Maps credits reserved. Only saved leads consume credits.
              </p>
            </div>

            <button type="submit" disabled={loading || !keywords.length || batchTooLarge} className="btn-primary mt-4 flex items-center justify-center gap-2">
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <><Play size={16} /> {keywords.length ? `Run ${keywords.length} Keyword${keywords.length === 1 ? '' : 's'}` : 'Start Scraping'}</>
              )}
            </button>
          </form>
        </div>

        <div className="lg:col-span-2">
          <div className="glass-card p-6 h-full min-h-[400px]">
            <h2 className="text-lg font-semibold text-white mb-6">Recent Results</h2>
            
            {results.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-textMuted">
                <Database size={48} className="mb-4 opacity-20" />
                <p>No recent enrichment tasks.</p>
                <p className="text-sm">Start a scrape task to see results here.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {results.map((r, i) => (
                  <div key={i} className="bg-surface/50 border border-border rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <div className="text-primary font-mono text-sm mb-1">{r.id}</div>
                      <div className="text-white font-medium">{r.keywordCount || 1} keyword{r.keywordCount === 1 ? '' : 's'} - Extracted {r.count} results</div>
                      <div className="mt-1 text-sm text-textMuted">{r.newCount} new unique lead{r.newCount === 1 ? '' : 's'} added{r.existingCount ? `, ${r.existingCount} already saved` : ''}.</div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="bg-green-500/10 text-green-400 text-xs px-2 py-1 rounded-full border border-green-500/20">{r.status}</span>
                      <button className="text-sm text-primary hover:text-primary/80 font-medium">Download CSV</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
