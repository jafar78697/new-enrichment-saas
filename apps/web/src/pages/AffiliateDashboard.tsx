import { useEffect, useState } from 'react';
import { affiliateApi } from '../services/affiliateApi';

export default function AffiliateDashboard() {
  const [affiliate, setAffiliate] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [conversions, setConversions] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [payoutForm, setPayoutForm] = useState({ payout_method: 'paypal', payout_details: '' });
  const [payoutError, setPayoutError] = useState('');

  useEffect(() => {
    Promise.all([
      affiliateApi.getMe(),
      affiliateApi.getStats(),
      affiliateApi.getConversions(),
      affiliateApi.getPayouts(),
    ]).then(([me, st, conv, pay]) => {
      setAffiliate(me.data);
      setStats(st.data);
      setConversions(conv.data.conversions || []);
      setPayouts(pay.data.payouts || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePayoutRequest = async () => {
    setPayoutError('');
    try {
      await affiliateApi.requestPayout({
        payout_method: payoutForm.payout_method,
        payout_details: { account: payoutForm.payout_details },
      });
      setShowPayoutModal(false);
      window.location.reload();
    } catch (e: any) {
      setPayoutError(e.response?.data?.error || 'Failed to submit payout request');
    }
  };

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;

  if (!affiliate) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center">
        <h2 className="text-2xl font-bold mb-4">Join Our Affiliate Program</h2>
        <p className="text-gray-600 mb-6">Earn commissions by referring customers to our platform.</p>
        <a href="/affiliate/apply" className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700">Apply Now</a>
      </div>
    );
  }

  const isPaused = affiliate.status === 'paused' || affiliate.status === 'terminated';
  const conversionRate = stats?.total_clicks > 0
    ? ((stats.total_conversions / stats.total_clicks) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Affiliate Dashboard</h1>
        {isPaused && (
          <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-medium">
            Account {affiliate.status} — Payouts disabled
          </span>
        )}
      </div>

      {/* Promo code & link */}
      <div className="bg-white border rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-gray-700">Your Referral Details</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 w-28">Promo Code</span>
          <code className="bg-gray-100 px-3 py-1 rounded font-mono text-indigo-700 font-bold text-lg">{affiliate.promo_code}</code>
          <button onClick={() => copyToClipboard(affiliate.promo_code)} className="text-sm text-indigo-600 hover:underline">
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 w-28">Referral Link</span>
          <span className="text-sm text-gray-700 truncate max-w-xs">{affiliate.referral_link}</span>
          <button onClick={() => copyToClipboard(affiliate.referral_link)} className="text-sm text-indigo-600 hover:underline">Copy</button>
        </div>
        <p className="text-xs text-gray-400">Commission rate: {affiliate.commission_rate}% of net revenue</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: 'Total Clicks', value: stats?.total_clicks ?? 0 },
          { label: 'Conversions', value: stats?.total_conversions ?? 0 },
          { label: 'Conversion Rate', value: `${conversionRate}%` },
          { label: 'Pending Balance', value: `$${parseFloat(stats?.pending_balance ?? 0).toFixed(2)}` },
          { label: 'Approved Balance', value: `$${parseFloat(stats?.approved_balance ?? 0).toFixed(2)}` },
          { label: 'Total Paid', value: `$${parseFloat(stats?.total_paid ?? 0).toFixed(2)}` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white border rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className="text-2xl font-bold text-gray-800">{value}</p>
          </div>
        ))}
      </div>

      {/* Payout request */}
      <div className="bg-white border rounded-xl p-5 flex items-center justify-between">
        <div>
          <p className="font-semibold">Request Payout</p>
          <p className="text-sm text-gray-500">Approved balance: ${parseFloat(stats?.approved_balance ?? 0).toFixed(2)} (min $50)</p>
        </div>
        <button
          disabled={isPaused || parseFloat(stats?.approved_balance ?? 0) < 50}
          onClick={() => setShowPayoutModal(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Request Payout
        </button>
      </div>

      {/* Recent conversions */}
      <div className="bg-white border rounded-xl p-5">
        <h2 className="font-semibold mb-3">Recent Conversions</h2>
        {conversions.length === 0 ? (
          <p className="text-sm text-gray-400">No conversions yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500 border-b">
              <th className="pb-2">Date</th><th className="pb-2">Plan</th>
              <th className="pb-2">Sale</th><th className="pb-2">Commission</th><th className="pb-2">Status</th>
            </tr></thead>
            <tbody>
              {conversions.map(c => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-2">{new Date(c.created_at).toLocaleDateString()}</td>
                  <td className="py-2 capitalize">{c.plan_type}</td>
                  <td className="py-2">${c.sale_amount}</td>
                  <td className="py-2">${parseFloat(c.commission_amount).toFixed(2)}</td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      c.commission_status === 'paid' ? 'bg-green-100 text-green-700' :
                      c.commission_status === 'approved' ? 'bg-blue-100 text-blue-700' :
                      c.commission_status === 'reversed' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>{c.commission_status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Payout history */}
      {payouts.length > 0 && (
        <div className="bg-white border rounded-xl p-5">
          <h2 className="font-semibold mb-3">Payout History</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500 border-b">
              <th className="pb-2">Date</th><th className="pb-2">Amount</th><th className="pb-2">Method</th><th className="pb-2">Status</th>
            </tr></thead>
            <tbody>
              {payouts.map(p => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-2">{new Date(p.created_at).toLocaleDateString()}</td>
                  <td className="py-2">${parseFloat(p.amount).toFixed(2)}</td>
                  <td className="py-2 capitalize">{p.payout_method}</td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      p.status === 'paid' ? 'bg-green-100 text-green-700' :
                      p.status === 'rejected' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>{p.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Payout modal */}
      {showPayoutModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-bold">Request Payout</h3>
            <p className="text-sm text-gray-500">Amount: ${parseFloat(stats?.approved_balance ?? 0).toFixed(2)}</p>
            <div>
              <label className="block text-sm font-medium mb-1">Payout Method</label>
              <select value={payoutForm.payout_method} onChange={e => setPayoutForm(f => ({ ...f, payout_method: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="paypal">PayPal</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="wise">Wise</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Account Details</label>
              <input type="text" placeholder="e.g. your@paypal.com"
                value={payoutForm.payout_details}
                onChange={e => setPayoutForm(f => ({ ...f, payout_details: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            {payoutError && <p className="text-red-600 text-sm">{payoutError}</p>}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowPayoutModal(false)} className="px-4 py-2 text-sm border rounded-lg">Cancel</button>
              <button onClick={handlePayoutRequest} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
