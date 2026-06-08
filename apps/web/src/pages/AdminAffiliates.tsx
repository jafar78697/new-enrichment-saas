import { useEffect, useState } from 'react';
import { affiliateApi } from '../services/affiliateApi';
import { toast } from 'sonner';

type Tab = 'affiliates' | 'applications' | 'commissions' | 'payouts' | 'settings' | 'flagged';

export default function AdminAffiliates() {
  const [tab, setTab] = useState<Tab>('affiliates');
  const [affiliates, setAffiliates] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [flagged, setFlagged] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [aff, apps, comm, pay, flag, sett] = await Promise.all([
        affiliateApi.adminListAffiliates({ search }),
        affiliateApi.adminListApplications({ status: 'pending' }),
        affiliateApi.adminListCommissions({ status: 'pending' }),
        affiliateApi.adminListPayouts({ status: 'pending_payout' }),
        affiliateApi.adminGetFlagged(),
        affiliateApi.adminGetSettings(),
      ]);
      setAffiliates(aff.data.affiliates || []);
      setApplications(apps.data.applications || []);
      setCommissions(comm.data.commissions || []);
      setPayouts(pay.data.payouts || []);
      setFlagged(flag.data.flagged || []);
      setSettings(sett.data || {});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [search]);

  const reviewApplication = async (id: string, action: 'approve' | 'reject', rejection_reason?: string) => {
    await affiliateApi.adminReviewApplication(id, { action, rejection_reason });
    load();
  };

  const updateCommission = async (id: string, action: 'approve' | 'reverse') => {
    await affiliateApi.adminUpdateCommission(id, { action });
    load();
  };

  const updatePayout = async (id: string, action: 'approve' | 'reject' | 'mark_paid') => {
    await affiliateApi.adminUpdatePayout(id, { action });
    load();
  };

  const saveSettings = async () => {
    await affiliateApi.adminUpdateSettings(settings);
    toast.success('Settings saved');
  };

  const exportCsv = async () => {
    const res = await affiliateApi.adminExportCsv();
    const url = URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a'); a.href = url; a.download = 'affiliates.csv'; a.click();
  };

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'affiliates', label: 'Affiliates' },
    { key: 'applications', label: 'Applications', badge: applications.length },
    { key: 'commissions', label: 'Commissions', badge: commissions.length },
    { key: 'payouts', label: 'Payouts', badge: payouts.length },
    { key: 'flagged', label: 'Flagged', badge: flagged.length },
    { key: 'settings', label: 'Settings' },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Affiliate Management</h1>
        <button onClick={exportCsv} className="text-sm border px-3 py-1.5 rounded-lg hover:bg-gray-50">Export CSV</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
            {t.badge ? <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5">{t.badge}</span> : null}
          </button>
        ))}
      </div>

      {loading && <p className="text-gray-400 text-sm">Loading...</p>}

      {/* Affiliates tab */}
      {tab === 'affiliates' && (
        <div className="space-y-3">
          <input type="text" placeholder="Search by name or email..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm w-72" />
          <table className="w-full text-sm bg-white border rounded-xl overflow-hidden">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>{['Name', 'Email', 'Code', 'Rate', 'Clicks', 'Conv.', 'Earnings', 'Status', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 font-medium">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {affiliates.map(a => (
                <tr key={a.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3">{a.name}</td>
                  <td className="px-4 py-3 text-gray-500">{a.email}</td>
                  <td className="px-4 py-3"><code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{a.promo_code}</code></td>
                  <td className="px-4 py-3">{a.commission_rate}%</td>
                  <td className="px-4 py-3">{a.total_clicks}</td>
                  <td className="px-4 py-3">{a.total_conversions}</td>
                  <td className="px-4 py-3">${parseFloat(a.total_earnings || 0).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${a.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{a.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <select defaultValue="" onChange={e => { if (e.target.value) affiliateApi.adminUpdateAffiliate(a.id, { status: e.target.value }).then(load); }}
                      className="text-xs border rounded px-1 py-0.5">
                      <option value="" disabled>Change status</option>
                      <option value="active">Active</option>
                      <option value="paused">Pause</option>
                      <option value="terminated">Terminate</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Applications tab */}
      {tab === 'applications' && (
        <table className="w-full text-sm bg-white border rounded-xl overflow-hidden">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>{['Name', 'Email', 'Social', 'Audience', 'Date', 'Actions'].map(h => (
              <th key={h} className="px-4 py-3 font-medium">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {applications.map(a => (
              <tr key={a.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3">{a.name}</td>
                <td className="px-4 py-3 text-gray-500">{a.email}</td>
                <td className="px-4 py-3 text-gray-500">{a.social_handles || '—'}</td>
                <td className="px-4 py-3">{a.audience_size || '—'}</td>
                <td className="px-4 py-3">{new Date(a.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 flex gap-2">
                  <button onClick={() => reviewApplication(a.id, 'approve')}
                    className="bg-green-600 text-white text-xs px-2 py-1 rounded hover:bg-green-700">Approve</button>
                  <button onClick={() => { const r = prompt('Rejection reason (optional):') || ''; reviewApplication(a.id, 'reject', r); }}
                    className="bg-red-500 text-white text-xs px-2 py-1 rounded hover:bg-red-600">Reject</button>
                </td>
              </tr>
            ))}
            {applications.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No pending applications</td></tr>}
          </tbody>
        </table>
      )}

      {/* Commissions tab */}
      {tab === 'commissions' && (
        <table className="w-full text-sm bg-white border rounded-xl overflow-hidden">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>{['Affiliate', 'Amount', 'Status', 'Date', 'Actions'].map(h => (
              <th key={h} className="px-4 py-3 font-medium">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {commissions.map(c => (
              <tr key={c.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3">{c.affiliate_name}</td>
                <td className="px-4 py-3">${parseFloat(c.amount).toFixed(2)}</td>
                <td className="px-4 py-3"><span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full text-xs">{c.status}</span></td>
                <td className="px-4 py-3">{new Date(c.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 flex gap-2">
                  <button onClick={() => updateCommission(c.id, 'approve')} className="bg-blue-600 text-white text-xs px-2 py-1 rounded">Approve</button>
                  <button onClick={() => updateCommission(c.id, 'reverse')} className="bg-gray-400 text-white text-xs px-2 py-1 rounded">Reverse</button>
                </td>
              </tr>
            ))}
            {commissions.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No pending commissions</td></tr>}
          </tbody>
        </table>
      )}

      {/* Payouts tab */}
      {tab === 'payouts' && (
        <table className="w-full text-sm bg-white border rounded-xl overflow-hidden">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>{['Affiliate', 'Amount', 'Method', 'Status', 'Date', 'Actions'].map(h => (
              <th key={h} className="px-4 py-3 font-medium">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {payouts.map(p => (
              <tr key={p.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3">{p.affiliate_name}</td>
                <td className="px-4 py-3">${parseFloat(p.amount).toFixed(2)}</td>
                <td className="px-4 py-3 capitalize">{p.payout_method}</td>
                <td className="px-4 py-3"><span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full text-xs">{p.status}</span></td>
                <td className="px-4 py-3">{new Date(p.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 flex gap-2">
                  <button onClick={() => updatePayout(p.id, 'approve')} className="bg-blue-600 text-white text-xs px-2 py-1 rounded">Approve</button>
                  <button onClick={() => updatePayout(p.id, 'mark_paid')} className="bg-green-600 text-white text-xs px-2 py-1 rounded">Mark Paid</button>
                  <button onClick={() => { const r = prompt('Rejection reason:') || ''; affiliateApi.adminUpdatePayout(p.id, { action: 'reject', rejection_reason: r }).then(load); }}
                    className="bg-red-500 text-white text-xs px-2 py-1 rounded">Reject</button>
                </td>
              </tr>
            ))}
            {payouts.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No pending payouts</td></tr>}
          </tbody>
        </table>
      )}

      {/* Flagged tab */}
      {tab === 'flagged' && (
        <div className="bg-white border rounded-xl p-5">
          <h2 className="font-semibold mb-3">Flagged Activity</h2>
          {flagged.length === 0 ? <p className="text-sm text-gray-400">No flagged activity.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500 border-b">
                <th className="pb-2">Type</th><th className="pb-2">Affiliate</th><th className="pb-2">IP</th><th className="pb-2">User Agent</th><th className="pb-2">Date</th>
              </tr></thead>
              <tbody>
                {flagged.map(f => (
                  <tr key={f.id} className="border-b last:border-0">
                    <td className="py-2 capitalize">{f.type}</td>
                    <td className="py-2">{f.affiliate_name}</td>
                    <td className="py-2 font-mono text-xs">{f.anonymized_ip}</td>
                    <td className="py-2 text-xs text-gray-500 truncate max-w-xs">{f.user_agent}</td>
                    <td className="py-2">{new Date(f.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Settings tab */}
      {tab === 'settings' && (
        <div className="bg-white border rounded-xl p-6 max-w-md space-y-4">
          <h2 className="font-semibold">Program Settings</h2>
          {[
            { key: 'default_commission_rate', label: 'Default Commission Rate (%)', type: 'number' },
            { key: 'attribution_window_days', label: 'Attribution Window (days)', type: 'number' },
            { key: 'min_payout_threshold', label: 'Minimum Payout Threshold ($)', type: 'number' },
            { key: 'hold_period_days', label: 'Hold Period (days)', type: 'number' },
          ].map(({ key, label, type }) => (
            <div key={key}>
              <label className="block text-sm font-medium mb-1">{label}</label>
              <input type={type} value={settings[key] ?? ''} onChange={e => setSettings((s: any) => ({ ...s, [key]: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          ))}
          <button onClick={saveSettings} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">Save Settings</button>
        </div>
      )}
    </div>
  );
}
