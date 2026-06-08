import { useState } from 'react';
import { affiliateApi } from '../services/affiliateApi';

export default function AffiliateApply() {
  const [form, setForm] = useState({
    name: '', email: '', social_handles: '', audience_size: '', terms_accepted: false,
  });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.terms_accepted) { setError('You must accept the terms to apply.'); return; }
    setLoading(true); setError('');
    try {
      await affiliateApi.apply({ ...form, terms_version: '1.0' });
      setSubmitted(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Submission failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-xl p-8 max-w-md text-center shadow">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold mb-2">Application Submitted!</h2>
          <p className="text-gray-600">We'll review your application and get back to you via email within 2-3 business days.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
      <div className="bg-white rounded-xl shadow p-8 w-full max-w-lg">
        <h1 className="text-2xl font-bold mb-2">Join Our Affiliate Program</h1>
        <p className="text-gray-500 text-sm mb-6">Earn up to 20% commission on every referral. Fill out the form below to apply.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Full Name *</label>
            <input required type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Your name" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email Address *</label>
            <input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="you@example.com" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Social Media Handles</label>
            <input type="text" value={form.social_handles} onChange={e => setForm(f => ({ ...f, social_handles: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="@yourhandle, YouTube channel, etc." />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Audience Size</label>
            <select value={form.audience_size} onChange={e => setForm(f => ({ ...f, audience_size: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Select range</option>
              <option value="under_1k">Under 1,000</option>
              <option value="1k_10k">1,000 – 10,000</option>
              <option value="10k_50k">10,000 – 50,000</option>
              <option value="50k_plus">50,000+</option>
            </select>
          </div>
          <div className="flex items-start gap-2">
            <input type="checkbox" id="terms" checked={form.terms_accepted}
              onChange={e => setForm(f => ({ ...f, terms_accepted: e.target.checked }))}
              className="mt-1" />
            <label htmlFor="terms" className="text-sm text-gray-600">
              I agree to the <a href="/affiliate-terms" className="text-indigo-600 underline" target="_blank">Affiliate Program Terms</a> (v1.0)
            </label>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">
            {loading ? 'Submitting...' : 'Submit Application'}
          </button>
        </form>
      </div>
    </div>
  );
}
