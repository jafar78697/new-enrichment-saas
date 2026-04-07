import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { jobsApi } from '../services/api';

const CONFIDENCE_COLORS: Record<string, string> = {
  high_confidence: 'text-success',
  medium_confidence: 'text-signal',
  low_confidence: 'text-text-muted',
};

export default function ResultsExplorerPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [filters, setFilters] = useState({ has_email: false, has_phone: false, has_linkedin: false, confidence: '', lane: '' });
  const [selected, setSelected] = useState<any>(null);

  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
  const { data, isLoading } = useQuery({
    queryKey: ['results', jobId, params],
    queryFn: () => jobsApi.getResults(jobId!, params).then(r => r.data),
  });

  const copyEmails = () => {
    const emails = data?.results?.map((r: any) => r.primary_email).filter(Boolean).join('\n');
    navigator.clipboard.writeText(emails || '');
  };

  return (
    <div className="flex gap-4 h-full">
      {/* Filter Rail */}
      <aside className="w-48 bg-surface border border-border-soft rounded-xl p-4 space-y-3 h-fit">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Filters</p>
        {[
          { key: 'has_email', label: 'Has Email' },
          { key: 'has_phone', label: 'Has Phone' },
          { key: 'has_linkedin', label: 'Has LinkedIn' },
        ].map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
            <input type="checkbox" checked={(filters as any)[key]} onChange={e => setFilters({ ...filters, [key]: e.target.checked })} className="rounded" />
            {label}
          </label>
        ))}
        <div>
          <p className="text-xs text-text-muted mb-1">Confidence</p>
          <select value={filters.confidence} onChange={e => setFilters({ ...filters, confidence: e.target.value })}
            className="w-full text-xs border border-border-soft rounded px-2 py-1">
            <option value="">All</option>
            <option value="high">High only</option>
          </select>
        </div>
        <div>
          <p className="text-xs text-text-muted mb-1">Lane</p>
          <select value={filters.lane} onChange={e => setFilters({ ...filters, lane: e.target.value })}
            className="w-full text-xs border border-border-soft rounded px-2 py-1">
            <option value="">All</option>
            <option value="browser">Browser only</option>
          </select>
        </div>
      </aside>

      {/* Main Table */}
      <div className="flex-1 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-text-secondary">{data?.total ?? 0} results</p>
          <div className="flex gap-2">
            <button onClick={copyEmails} className="px-3 py-1.5 text-xs border border-border-soft rounded-lg text-text-secondary hover:border-brand-primary">Copy All Emails</button>
          </div>
        </div>

        <div className="bg-surface border border-border-soft rounded-xl overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-text-muted text-sm">Loading results...</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-subtle border-b border-border-soft">
                <tr>
                  {['Domain', 'Email', 'Phone', 'LinkedIn', 'Confidence', 'Lane'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-text-secondary">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {data?.results?.map((r: any) => (
                  <tr key={r.id} className="hover:bg-subtle cursor-pointer" onClick={() => setSelected(r)}>
                    <td className="px-3 py-2 font-mono text-xs text-text-primary">{r.domain}</td>
                    <td className="px-3 py-2 text-xs text-text-secondary">{r.primary_email || '—'}</td>
                    <td className="px-3 py-2 text-xs text-text-secondary">{r.primary_phone || '—'}</td>
                    <td className="px-3 py-2 text-xs">{r.linkedin_url ? <a href={r.linkedin_url} target="_blank" rel="noreferrer" className="text-brand-primary hover:underline">Link</a> : '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className={CONFIDENCE_COLORS[r.confidence_level] || 'text-text-muted'}>
                        {r.confidence_level?.replace('_confidence', '') || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-text-muted capitalize">{r.enrichment_lane || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detail Drawer */}
      {selected && (
        <aside className="w-72 bg-surface border border-border-soft rounded-xl p-4 space-y-4 h-fit">
          <div className="flex items-center justify-between">
            <p className="font-heading font-semibold text-text-primary text-sm">{selected.domain}</p>
            <button onClick={() => setSelected(null)} className="text-text-muted hover:text-text-primary">✕</button>
          </div>
          <div className="space-y-2 text-xs">
            <p className="font-medium text-text-secondary">Contact</p>
            <p>Email: <span className="text-text-primary">{selected.primary_email || '—'}</span></p>
            <p>Phone: <span className="text-text-primary">{selected.primary_phone || '—'}</span></p>
            <p className="font-medium text-text-secondary mt-3">Company</p>
            <p>Name: <span className="text-text-primary">{selected.company_name || '—'}</span></p>
            <p>Industry: <span className="text-text-primary">{selected.industry_guess || '—'}</span></p>
            <p>Pitch: <span className="text-text-primary">{selected.one_line_pitch || '—'}</span></p>
            <p className="font-medium text-text-secondary mt-3">Signals</p>
            <p>CMS: <span className="text-text-primary">{selected.cms_guess || '—'}</span></p>
            <p>Ecommerce: <span className="text-text-primary">{selected.ecommerce_signal ? 'Yes' : 'No'}</span></p>
            <p>SaaS: <span className="text-text-primary">{selected.saas_signal ? 'Yes' : 'No'}</span></p>
          </div>
        </aside>
      )}
    </div>
  );
}
