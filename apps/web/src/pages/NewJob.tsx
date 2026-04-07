import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { jobsApi } from '../services/api';

const MODES = [
  { id: 'fast_http', label: 'Fast HTTP', desc: 'Best for static websites and low-cost bulk runs.', cost: '~0 credits' },
  { id: 'smart_hybrid', label: 'Smart Hybrid', desc: 'Recommended. Starts with HTTP and upgrades only when needed.', cost: '~few credits', recommended: true },
  { id: 'premium_js', label: 'Premium JS', desc: 'Use browser rendering for JavaScript-heavy sites.', cost: '~1 credit/domain' },
];

export default function NewJobPage() {
  const [inputMethod, setInputMethod] = useState<'paste' | 'csv'>('paste');
  const [domainsText, setDomainsText] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [mode, setMode] = useState('smart_hybrid');
  const [dedupe, setDedupe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const parsedDomains = domainsText.split('\n').map(d => d.trim()).filter(Boolean);
  const uniqueCount = dedupe ? new Set(parsedDomains.map(d => d.replace(/^https?:\/\/(www\.)?/, '').split('/')[0])).size : parsedDomains.length;

  const handleSubmit = async () => {
    setLoading(true); setError('');
    try {
      let res;
      if (inputMethod === 'csv' && csvFile) {
        res = await jobsApi.uploadCsv(csvFile, mode);
      } else {
        res = await jobsApi.create({ domains: parsedDomains, mode, options: { dedupe } });
      }
      navigate(`/jobs/${res.data.job_id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create job');
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="font-heading text-2xl font-bold text-text-primary">New Enrichment Job</h1>

      {/* Input Method */}
      <div className="bg-surface border border-border-soft rounded-xl p-5">
        <p className="text-sm font-medium text-text-primary mb-3">Input Method</p>
        <div className="flex gap-2">
          {(['paste', 'csv'] as const).map(m => (
            <button key={m} onClick={() => setInputMethod(m)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${inputMethod === m ? 'bg-brand-primary text-white border-brand-primary' : 'bg-surface text-text-secondary border-border-soft hover:border-brand-primary'}`}>
              {m === 'paste' ? 'Paste Links' : 'Upload CSV'}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {inputMethod === 'paste' ? (
            <>
              <textarea value={domainsText} onChange={e => setDomainsText(e.target.value)} rows={6}
                placeholder="example.com&#10;company.io&#10;startup.co"
                className="w-full border border-border-soft rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand-primary resize-none" />
              {parsedDomains.length > 0 && (
                <p className="text-xs text-text-muted mt-1">
                  {parsedDomains.length} domains detected • {parsedDomains.length - uniqueCount} duplicates removed
                </p>
              )}
            </>
          ) : (
            <div className="border-2 border-dashed border-border-soft rounded-lg p-8 text-center">
              <input type="file" accept=".csv" onChange={e => setCsvFile(e.target.files?.[0] || null)} className="hidden" id="csv-upload" />
              <label htmlFor="csv-upload" className="cursor-pointer">
                <p className="text-text-secondary text-sm">Drop CSV here or <span className="text-brand-primary">browse</span></p>
                {csvFile && <p className="text-xs text-text-muted mt-1">{csvFile.name}</p>}
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Mode Selection */}
      <div className="bg-surface border border-border-soft rounded-xl p-5">
        <p className="text-sm font-medium text-text-primary mb-3">Enrichment Mode</p>
        <div className="grid grid-cols-3 gap-3">
          {MODES.map(m => (
            <button key={m.id} onClick={() => setMode(m.id)}
              className={`p-4 rounded-xl border text-left transition-colors ${mode === m.id ? 'border-brand-primary bg-subtle' : 'border-border-soft hover:border-brand-primary'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-text-primary">{m.label}</span>
                {m.recommended && <span className="text-xs bg-brand-primary text-white px-1.5 py-0.5 rounded">Recommended</span>}
              </div>
              <p className="text-xs text-text-secondary">{m.desc}</p>
              <p className="text-xs text-text-muted mt-2 font-mono">{m.cost}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Options */}
      <div className="bg-surface border border-border-soft rounded-xl p-5">
        <p className="text-sm font-medium text-text-primary mb-3">Options</p>
        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
          <input type="checkbox" checked={dedupe} onChange={e => setDedupe(e.target.checked)} className="rounded" />
          Deduplicate domains
        </label>
      </div>

      {/* Estimate */}
      <div className="bg-subtle rounded-xl p-4 text-sm text-text-secondary">
        <span className="font-medium text-text-primary">Estimated:</span>{' '}
        {mode === 'premium_js' ? `~${uniqueCount} browser credits` : '~0 browser credits'} + {uniqueCount} HTTP rows
      </div>

      {error && <div className="bg-red-50 border border-danger text-danger text-sm rounded-lg p-3">{error}</div>}

      <button onClick={handleSubmit} disabled={loading || (inputMethod === 'paste' && !parsedDomains.length) || (inputMethod === 'csv' && !csvFile)}
        className="w-full bg-brand-primary hover:bg-brand-hover text-white font-medium py-3 rounded-xl text-sm transition-colors disabled:opacity-50">
        {loading ? 'Starting...' : 'Start Enrichment →'}
      </button>
    </div>
  );
}
