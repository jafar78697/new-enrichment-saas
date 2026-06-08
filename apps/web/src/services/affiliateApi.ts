import api from './api';

const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));
const MOCK = import.meta.env.VITE_MOCK !== 'false';

const MOCK_AFFILIATE = {
  id: 'aff-001', name: 'John Creator', email: 'john@example.com',
  promo_code: 'JOHN20', referral_link: 'https://app.enrichment-saas.com?ref=JOHN20',
  commission_rate: 20, status: 'active',
  total_clicks: 342, total_conversions: 18,
  pending_balance: 124.50, approved_balance: 280.00,
};

const MOCK_CONVERSIONS = [
  { id: 'c1', created_at: new Date(Date.now() - 86400000).toISOString(), plan_type: 'growth', sale_amount: 49, commission_amount: 9.80, commission_status: 'approved' },
  { id: 'c2', created_at: new Date(Date.now() - 172800000).toISOString(), plan_type: 'pro', sale_amount: 99, commission_amount: 19.80, commission_status: 'pending' },
];

const MOCK_AFFILIATES = [
  { id: 'aff-001', name: 'John Creator', email: 'john@example.com', promo_code: 'JOHN20', status: 'active', commission_rate: 20, total_clicks: 342, total_conversions: 18, total_earnings: 404.50, pending_payout: 124.50 },
  { id: 'aff-002', name: 'Sarah Influencer', email: 'sarah@example.com', promo_code: 'SARAH15', status: 'active', commission_rate: 15, total_clicks: 210, total_conversions: 9, total_earnings: 198.00, pending_payout: 0 },
];

const MOCK_APPLICATIONS = [
  { id: 'app-001', name: 'Mike Blogger', email: 'mike@blog.com', social_handles: '@mikeblog', audience_size: '50k', status: 'pending', created_at: new Date().toISOString() },
];

export const affiliateApi = {
  // Public
  apply: (data: any) => MOCK ? delay().then(() => ({ data: { id: 'app-new', status: 'pending' } })) : api.post('/affiliates/apply', data),
  trackClick: (promo_code: string, user_agent?: string, referring_url?: string) =>
    api.post('/track/click', { promo_code, user_agent, referring_url }),

  // Affiliate self-service
  getMe: async () => {
    if (MOCK) { await delay(); return { data: MOCK_AFFILIATE }; }
    return api.get('/affiliates/me');
  },
  getStats: async () => {
    if (MOCK) { await delay(); return { data: { total_clicks: 342, total_conversions: 18, pending_balance: 124.50, approved_balance: 280.00, total_paid: 500.00 } }; }
    return api.get('/affiliates/me/stats');
  },
  getConversions: async (params?: any) => {
    if (MOCK) { await delay(); return { data: { conversions: MOCK_CONVERSIONS, total: 2, page: 1, limit: 20 } }; }
    return api.get('/affiliates/me/conversions', { params });
  },
  requestPayout: async (data: any) => {
    if (MOCK) { await delay(); return { data: { id: 'pay-new', amount: 280.00, status: 'pending_payout' } }; }
    return api.post('/affiliates/me/payout-request', data);
  },
  getPayouts: async () => {
    if (MOCK) { await delay(); return { data: { payouts: [] } }; }
    return api.get('/affiliates/me/payouts');
  },

  // Admin
  adminListAffiliates: async (params?: any) => {
    if (MOCK) { await delay(); return { data: { affiliates: MOCK_AFFILIATES, total: 2, page: 1, limit: 20 } }; }
    return api.get('/affiliates', { params });
  },
  adminUpdateAffiliate: (id: string, data: any) => api.patch(`/affiliates/${id}`, data),
  adminListApplications: async (params?: any) => {
    if (MOCK) { await delay(); return { data: { applications: MOCK_APPLICATIONS, total: 1, page: 1, limit: 20 } }; }
    return api.get('/admin/affiliates/applications', { params });
  },
  adminReviewApplication: (id: string, data: any) => api.patch(`/admin/affiliates/applications/${id}`, data),
  adminListCommissions: async (params?: any) => {
    if (MOCK) { await delay(); return { data: { commissions: [] } }; }
    return api.get('/admin/affiliates/commissions', { params });
  },
  adminUpdateCommission: (id: string, data: any) => api.patch(`/admin/affiliates/commissions/${id}`, data),
  adminListPayouts: async (params?: any) => {
    if (MOCK) { await delay(); return { data: { payouts: [] } }; }
    return api.get('/admin/affiliates/payouts', { params });
  },
  adminUpdatePayout: (id: string, data: any) => api.patch(`/admin/affiliates/payouts/${id}`, data),
  adminGetSettings: async () => {
    if (MOCK) { await delay(); return { data: { default_commission_rate: 20, attribution_window_days: 30, min_payout_threshold: 50, hold_period_days: 30 } }; }
    return api.get('/admin/affiliates/settings');
  },
  adminUpdateSettings: (data: any) => api.patch('/admin/affiliates/settings', data),
  adminGetFlagged: async () => {
    if (MOCK) { await delay(); return { data: { flagged: [] } }; }
    return api.get('/admin/affiliates/flagged');
  },
  adminExportCsv: () => api.get('/admin/affiliates/export', { responseType: 'blob' }),
};
