import axios from 'axios';

const api = axios.create({ baseURL: '/v1' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('enr_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('enr_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Mock mode — active when VITE_MOCK=true (no backend needed)
const MOCK = import.meta.env.VITE_MOCK === 'true';
const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

const MOCK_TOKEN = 'mock-jwt-dev';
const MOCK_JOBS = [
  { id: 'a1b2c3d4-0001', mode: 'smart_hybrid', status: 'completed', total_items: 50, completed_items: 47, failed_items: 3, http_completed: 42, browser_completed: 5, source_type: 'api', created_at: new Date(Date.now() - 3600000).toISOString() },
  { id: 'a1b2c3d4-0002', mode: 'fast_http', status: 'running', total_items: 200, completed_items: 89, failed_items: 2, http_completed: 89, browser_completed: 0, source_type: 'csv', created_at: new Date(Date.now() - 7200000).toISOString() },
  { id: 'a1b2c3d4-0003', mode: 'premium_js', status: 'queued', total_items: 25, completed_items: 0, failed_items: 0, http_completed: 0, browser_completed: 0, source_type: 'api', created_at: new Date(Date.now() - 300000).toISOString() },
];
const MOCK_RESULTS = [
  { id: 'r1', domain: 'example.com', primary_email: 'info@example.com', primary_phone: '+1-555-0100', linkedin_url: 'https://linkedin.com/company/example', confidence_level: 'high_confidence', enrichment_lane: 'http', company_name: 'Example Corp', industry_guess: 'SaaS', one_line_pitch: 'Leading software solutions provider', ecommerce_signal: false, saas_signal: true, cms_guess: 'wordpress' },
  { id: 'r2', domain: 'acme.io', primary_email: 'hello@acme.io', primary_phone: null, linkedin_url: null, confidence_level: 'medium_confidence', enrichment_lane: 'browser', company_name: 'Acme Inc', industry_guess: 'Ecommerce', one_line_pitch: 'Premium products for everyone', ecommerce_signal: true, saas_signal: false, cms_guess: 'shopify' },
  { id: 'r3', domain: 'startup.co', primary_email: null, primary_phone: '+44-20-7946-0958', linkedin_url: 'https://linkedin.com/company/startup', confidence_level: 'low_confidence', enrichment_lane: 'http', company_name: 'Startup Co', industry_guess: 'Tech', one_line_pitch: null, ecommerce_signal: false, saas_signal: false, cms_guess: null },
];

export const authApi = {
  login: async (email: string, password: string) => {
    if (MOCK) { await delay(); return { data: { token: MOCK_TOKEN, user: { id: '1', email, role: 'owner', plan: 'growth' } } }; }
    return api.post('/auth/login', { email, password });
  },
  signup: async (data: any) => {
    if (MOCK) { await delay(); return { data: { token: MOCK_TOKEN, user: { id: '1', email: data.email, role: 'owner' } } }; }
    return api.post('/auth/signup', data);
  },
};

export const jobsApi = {
  create: async (data: any) => {
    if (MOCK) { await delay(); return { data: { job_id: 'new-' + Date.now(), total_items: data.domains?.length || 0, status: 'queued' } }; }
    return api.post('/jobs/enrich', data);
  },
  uploadCsv: async (file: File, mode: string) => {
    if (MOCK) { await delay(); return { data: { job_id: 'csv-' + Date.now(), total_items: 50, status: 'queued' } }; }
    const fd = new FormData(); fd.append('file', file); fd.append('mode', mode);
    return api.post('/jobs/enrich-csv', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  list: async (params?: any) => {
    if (MOCK) { await delay(); return { data: { jobs: MOCK_JOBS, total: MOCK_JOBS.length, page: 1, limit: 20 } }; }
    return api.get('/jobs', { params });
  },
  get: async (id: string) => {
    if (MOCK) { await delay(); return { data: MOCK_JOBS.find(j => j.id === id) || MOCK_JOBS[0] }; }
    return api.get(`/jobs/${id}`);
  },
  getResults: async (id: string, params?: any) => {
    if (MOCK) { await delay(); return { data: { results: MOCK_RESULTS, total: MOCK_RESULTS.length, page: 1, limit: 50 } }; }
    return api.get(`/jobs/${id}/results`, { params });
  },
  cancel: async (id: string) => {
    if (MOCK) { await delay(); return { data: { success: true } }; }
    return api.post(`/jobs/${id}/cancel`);
  },
  retryFailed: async (id: string) => {
    if (MOCK) { await delay(); return { data: { retried: 3 } }; }
    return api.post(`/jobs/${id}/retry-failed`);
  },
  export: async (id: string, format: string) => {
    if (MOCK) { await delay(); return { data: { export_id: 'exp-' + Date.now(), status: 'pending' } }; }
    return api.post(`/jobs/${id}/export`, { format });
  },
};

export const billingApi = {
  getUsage: async () => {
    if (MOCK) { await delay(); return { data: { http_enrichments_used: 4231, http_limit: 25000, browser_credits_used: 87, browser_credits_remaining: 413 } }; }
    return api.get('/billing/usage');
  },
  getPlan: async () => {
    if (MOCK) { await delay(); return { data: { plan: 'growth', ls_subscription_id: null } }; }
    return api.get('/billing/plan');
  },
  checkout: (data: any) => api.post('/billing/checkout', data),
  portal: () => api.post('/billing/portal'),
};

export const apiKeysApi = {
  list: async () => {
    if (MOCK) { await delay(); return { data: { keys: [{ id: 'k1', name: 'Production', key_prefix: 'enr_sk_abc', last_used_at: new Date().toISOString(), created_at: new Date().toISOString() }] } }; }
    return api.get('/api-keys');
  },
  create: async (name: string) => {
    if (MOCK) { await delay(); return { data: { id: 'k-new', name, key: 'enr_sk_' + Math.random().toString(36).slice(2, 18), prefix: 'enr_sk_abc' } }; }
    return api.post('/api-keys', { name });
  },
  revoke: async (id: string) => {
    if (MOCK) { await delay(); return { data: {} }; }
    return api.delete(`/api-keys/${id}`);
  },
};

export const webhooksApi = {
  list: async () => {
    if (MOCK) { await delay(); return { data: { webhooks: [] } }; }
    return api.get('/webhooks');
  },
  create: (data: any) => api.post('/webhooks', data),
  delete: (id: string) => api.delete(`/webhooks/${id}`),
};

export default api;
