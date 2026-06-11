import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { Mail, MessageCircle, Settings, CheckCircle, Eye, Reply, Send } from 'lucide-react';
import callsApi, { Contact } from '../services/callsApi';

export default function EmailOutreach() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('email');
  const [activeEmailTab, setActiveEmailTab] = useState<'campaigns' | 'accounts' | 'manual' | 'replies' | 'followups'>('campaigns');
  const [activeSocialSubTab, setActiveSocialSubTab] = useState<'campaigns' | 'leads' | 'queue'>('campaigns');
  const [emailSubTab, setEmailSubTab] = useState<'pending' | 'sent' | 'replied'>('pending');
  const [newCampName, setNewCampName] = useState('');
  const [newCampTemplate, setNewCampTemplate] = useState('I noticed your real estate listings and wanted to reach out regarding a potential collaboration. Would you have time for a quick chat next week?');
  const [newCampDailyLimit, setNewCampDailyLimit] = useState<number>(50);
  const [newCampSendTime, setNewCampSendTime] = useState<string>('09:00');
  const [newCampStartDate, setNewCampStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [newCampEndDate, setNewCampEndDate] = useState<string>('');
  const [baseTemplate, setBaseTemplate] = useState('I noticed your real estate listings and wanted to reach out regarding a potential collaboration. Would you have time for a quick chat next week?');
  const [accounts, setAccounts] = useState<any[]>([]);
  const { token } = useAuth();
  const [statusMsg, setStatusMsg] = useState<{type: 'success'|'error', text: string} | null>(null);

  const { data: contactsData, isLoading: contactsLoading } = useQuery({
    queryKey: ['contacts'],
    queryFn: callsApi.listContacts
  });

  const { data: linkedinTasksData, isLoading: linkedinTasksLoading, refetch: refetchLinkedinTasks } = useQuery({
    queryKey: ['linkedinTasks'],
    queryFn: () => callsApi.getLinkedinTasks(),
    enabled: activeTab === 'linkedin',
  });

  const queueLinkedinMutation = useMutation({
    mutationFn: ({ id, task_type }: { id: number; task_type: 'scrape_profile' | 'send_connection' | 'send_message' }) =>
      callsApi.queueLinkedinTask(id, task_type),
    onSuccess: () => {
      refetchLinkedinTasks();
      setStatusMsg({ type: 'success', text: 'LinkedIn task queued successfully!' });
      setTimeout(() => setStatusMsg(null), 3000);
    },
    onError: (err: any) => {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to queue LinkedIn task.' });
      setTimeout(() => setStatusMsg(null), 5000);
    }
  });

  const { data: redditTasksData, isLoading: redditTasksLoading, refetch: refetchRedditTasks } = useQuery({
    queryKey: ['redditTasks'],
    queryFn: () => callsApi.getRedditTasks(),
    enabled: activeTab === 'reddit',
  });

  const queueRedditMutation = useMutation({
    mutationFn: ({ id, task_type }: { id: number; task_type: 'scrape_profile' | 'send_message' }) =>
      callsApi.queueRedditTask(id, task_type),
    onSuccess: () => {
      refetchRedditTasks();
      setStatusMsg({ type: 'success', text: 'Reddit task queued successfully!' });
      setTimeout(() => setStatusMsg(null), 3000);
    },
    onError: (err: any) => {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to queue Reddit task.' });
      setTimeout(() => setStatusMsg(null), 5000);
    }
  });

  const outreachMutation = useMutation({
    mutationFn: ({ id, template }: { id: number, template: string }) => callsApi.startOutreach(id, template),
    onSuccess: (data) => {
      setStatusMsg({ type: data.success ? 'success' : 'error', text: data.message });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setTimeout(() => setStatusMsg(null), 5000);
    },
    onError: () => {
      setStatusMsg({ type: 'error', text: 'Failed to trigger outreach.' });
      setTimeout(() => setStatusMsg(null), 5000);
    }
  });

  const { data: campaignsData, isLoading: campaignsLoading } = useQuery({
    queryKey: ['campaigns', 'email'],
    queryFn: () => callsApi.getCampaigns('email'),
  });

  const { data: linkedinCampaignsData, isLoading: linkedinCampaignsLoading } = useQuery({
    queryKey: ['campaigns', 'linkedin'],
    queryFn: () => callsApi.getCampaigns('linkedin'),
    enabled: activeTab === 'linkedin',
  });

  const createCampaignMutation = useMutation({
    mutationFn: async (data: { name: string, base_template: string, daily_limit: number, send_time: string, start_date: string, end_date?: string, channel?: string }) => {
      const payload = { ...data, channel: data.channel || 'email' };
      const res = await callsApi.createCampaign(payload as any);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    }
  });

  const updateCampaignMutation = useMutation({
    mutationFn: ({ id, status }: { id: number, status: 'active' | 'paused' }) => callsApi.updateCampaignStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    }
  });

  const assignCampaignMutation = useMutation({
    mutationFn: ({ id, contact_ids }: { id: number, contact_ids: number[] }) => callsApi.assignToCampaign(id, contact_ids),
    onSuccess: (data) => {
      setStatusMsg({ type: 'success', text: `Assigned ${data.count} leads to campaign.` });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    }
  });

  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['emailAccounts'],
    queryFn: () => callsApi.getEmailAccounts(),
  });

  const createAccountMutation = useMutation({
    mutationFn: (data: { email: string; app_password: string }) => callsApi.createEmailAccount(data),
    onSuccess: () => {
      setStatusMsg({ type: 'success', text: 'Email account connected successfully!' });
      queryClient.invalidateQueries({ queryKey: ['emailAccounts'] });
    },
    onError: (err: any) => {
      setStatusMsg({ type: 'error', text: err.response?.data?.error || 'Failed to connect account.' });
    }
  });

  const [newAccEmail, setNewAccEmail] = useState('');
  const [newAccPass, setNewAccPass] = useState('');

  const [selectedLeads, setSelectedLeads] = useState<Set<number>>(new Set());

  const handleSelectLead = (id: number) => {
    const next = new Set(selectedLeads);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedLeads(next);
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const metaStatus = params.get('meta');
    if (metaStatus === 'success') {
      setStatusMsg({ type: 'success', text: 'Successfully connected Meta account!' });
      setActiveTab('facebook');
    } else if (metaStatus === 'error') {
      setStatusMsg({ type: 'error', text: 'Failed to connect Meta account. Please try again.' });
      setActiveTab('facebook');
    }
    
    if (metaStatus) {
      navigate(location.pathname, { replace: true });
    }
  }, [location, navigate]);

  useEffect(() => {
    if (activeTab === 'settings') {
      fetchAccounts();
    }
  }, [activeTab]);

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/v1/outreach/accounts', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.accounts) setAccounts(data.accounts);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 relative">
      {statusMsg && (
        <div className={`p-4 rounded-lg border ${statusMsg.type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-700' : 'bg-red-500/10 border-red-500/30 text-red-700'} mb-6`}>
          {statusMsg.text}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 ">Outreach Automation</h1>
      </div>

      {/* Main Tabs */}
        <Link to="/outreach" className="text-indigo-600 font-medium mb-4 inline-block hover:underline">← Back to Hub</Link>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'email' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Email Sub-Tabs */}
            <div className="bg-gray-50/80 border-b border-gray-200 px-6 py-4 flex gap-4">
              <button 
                onClick={() => setActiveEmailTab('campaigns')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeEmailTab === 'campaigns' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-200/50'}`}
              >
                Auto Campaigns
              </button>
              <button 
                onClick={() => setActiveEmailTab('accounts')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeEmailTab === 'accounts' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-200/50'}`}
              >
                Connected Senders
              </button>
              <button 
                onClick={() => setActiveEmailTab('replies')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeEmailTab === 'replies' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-200/50'}`}
              >
                Replies & Tracking
              </button>
              <button 
                onClick={() => setActiveEmailTab('followups')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeEmailTab === 'followups' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-200/50'}`}
              >
                Follow-ups
              </button>
              <button 
                onClick={() => setActiveEmailTab('manual')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeEmailTab === 'manual' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-200/50'}`}
              >
                Manual Sandbox
              </button>
            </div>

            {/* Email Sub-Tab Content */}
            <div className="p-6">
              {activeEmailTab === 'manual' && (
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Manual Sandbox Outreach</h2>
                  <p className="text-gray-500 mb-6">
                    Manually review leads and click to send emails individually. Does not use auto-rotation.
                  </p>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                <p className="text-sm font-medium text-blue-600 mb-1">Emails Sent Today</p>
                <p className="text-2xl font-bold text-blue-900">
                  {contactsData?.contacts?.filter((lead: Contact) => lead.stage === 'email_sent').length || 0}
                </p>
              </div>
              <div className="bg-purple-50 border border-purple-100 rounded-lg p-4">
                <p className="text-sm font-medium text-purple-600 mb-1">Total Opened</p>
                <p className="text-2xl font-bold text-purple-900">
                  {contactsData?.contacts?.filter((lead: Contact) => (lead.email_opened || 0) > 0).length || 0}
                </p>
              </div>
              <div className="bg-green-50 border border-green-100 rounded-lg p-4">
                <p className="text-sm font-medium text-green-600 mb-1">Total Replied</p>
                <p className="text-2xl font-bold text-green-900">
                  {contactsData?.contacts?.filter((lead: Contact) => (lead.emails_received || 0) > 0).length || 0}
                </p>
              </div>
            </div>

            <div className="flex justify-between items-center mb-6">
              <div className="flex gap-2">
                <button onClick={() => setEmailSubTab('pending')} className={`px-4 py-2 rounded-lg text-sm font-medium ${emailSubTab === 'pending' ? 'bg-gray-900 text-white' : 'bg-gray-100'}`}>Pending</button>
                <button onClick={() => setEmailSubTab('sent')} className={`px-4 py-2 rounded-lg text-sm font-medium ${emailSubTab === 'sent' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>Sent</button>
                <button onClick={() => setEmailSubTab('replied')} className={`px-4 py-2 rounded-lg text-sm font-medium ${emailSubTab === 'replied' ? 'bg-green-600 text-white' : 'bg-gray-100'}`}>Replied</button>
              </div>

              {emailSubTab === 'pending' && selectedLeads.size > 0 && campaignsData?.campaigns && (
                <div className="flex gap-2 items-center">
                  <select 
                    className="border border-gray-300 rounded-lg p-2 text-sm"
                    onChange={(e) => {
                      if (e.target.value) {
                        assignCampaignMutation.mutate({ id: parseInt(e.target.value), contact_ids: Array.from(selectedLeads) });
                        setSelectedLeads(new Set());
                      }
                    }}
                    value=""
                  >
                    <option value="" disabled>Assign {selectedLeads.size} leads to Campaign...</option>
                    {campaignsData.campaigns.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            
            <div className="mb-8">
              <h3 className="text-md font-semibold text-gray-800 mb-2">Base Template</h3>
              <textarea value={baseTemplate} onChange={(e) => setBaseTemplate(e.target.value)} className="w-full h-24 p-3 border border-gray-300 rounded-lg" />
            </div>
            
            {contactsLoading ? <div className="text-center py-10">Loading...</div> : (
              <div className="space-y-4">
                {contactsData?.contacts?.filter((lead: Contact) => {
                  if (emailSubTab === 'pending') return !lead.stage || lead.stage === 'new_lead';
                  if (emailSubTab === 'sent') return lead.stage === 'email_sent';
                  return (lead.emails_received || 0) > 0;
                }).map((lead: Contact) => (
                  <div key={lead.id} className="p-4 border rounded-lg bg-white flex justify-between items-center">
                    <div className="flex items-center gap-4">
                      {emailSubTab === 'pending' && <input type="checkbox" checked={selectedLeads.has(lead.id)} onChange={() => handleSelectLead(lead.id)} />}
                      <div>
                        <div className="font-bold">{lead.name}</div>
                        <div className="text-sm text-gray-500">{lead.email}</div>
                      </div>
                    </div>
                    {lead.campaign_id && emailSubTab === 'pending' && <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded">Scheduled in Auto-Campaign</span>}
                    <button
                      onClick={() => outreachMutation.mutate({ id: lead.id, template: baseTemplate })}
                      disabled={outreachMutation.isPending || lead.stage === 'email_sent'}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold flex items-center gap-2"
                    >
                      <Send className="w-4 h-4" />
                      {lead.stage === 'email_sent' ? 'Sent' : 'Send Email'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
              )}

              {activeEmailTab === 'campaigns' && (
                <div>
                  <h2 className="text-xl font-bold text-gray-800 mb-6">Automated Campaigns</h2>
                  
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-8">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Create New Campaign</h3>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name</label>
                          <input 
                            type="text" 
                            value={newCampName}
                            onChange={e => setNewCampName(e.target.value)}
                            placeholder="e.g., Real Estate Cold Outreach" 
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Daily Send Limit (Leads/Day)</label>
                          <input 
                            type="number" 
                            value={newCampDailyLimit}
                            onChange={e => setNewCampDailyLimit(Number(e.target.value))}
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Time to Send (Daily)</label>
                          <input 
                            type="time" 
                            value={newCampSendTime}
                            onChange={e => setNewCampSendTime(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                          <input 
                            type="date" 
                            value={newCampStartDate}
                            onChange={e => setNewCampStartDate(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">End Date (Optional)</label>
                          <input 
                            type="date" 
                            value={newCampEndDate}
                            onChange={e => setNewCampEndDate(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Base AI Prompt / Template</label>
                        <textarea 
                          value={newCampTemplate}
                          onChange={e => setNewCampTemplate(e.target.value)}
                          placeholder="AI Base Template (e.g., Hi [Name], I noticed your real estate firm...)" 
                          className="w-full h-24 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" 
                        />
                      </div>
                      
                      <button 
                        onClick={() => {
                          createCampaignMutation.mutate({ 
                            name: newCampName, 
                            base_template: newCampTemplate,
                            daily_limit: newCampDailyLimit,
                            send_time: newCampSendTime,
                            start_date: newCampStartDate,
                            end_date: newCampEndDate || undefined
                          });
                          setNewCampName('');
                          setNewCampTemplate('');
                        }}
                        disabled={!newCampName || !newCampTemplate || createCampaignMutation.isPending}
                        className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
                      >
                        Create Automated Campaign
                      </button>
                    </div>
                  </div>

                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Active Campaigns</h3>
                  {campaignsLoading ? <p>Loading...</p> : (
                    <div className="space-y-4">
                      {campaignsData?.campaigns?.length === 0 && <p className="text-gray-500">No campaigns found.</p>}
                      {campaignsData?.campaigns?.map(camp => (
                        <div key={camp.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex justify-between items-start">
                          <div className="flex-1 mr-6">
                            <h4 className="text-lg font-bold text-gray-900">{camp.name}</h4>
                            <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${camp.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                {camp.status.toUpperCase()}
                              </span>
                              <span>Daily Limit: <strong className="text-gray-900">{camp.daily_limit || 50}</strong></span>
                              <span>Time: <strong className="text-gray-900">{camp.send_time || '09:00'}</strong></span>
                              <span>Start: <strong className="text-gray-900">{camp.start_date ? new Date(camp.start_date).toLocaleDateString() : 'N/A'}</strong></span>
                            </div>
                            <p className="text-sm text-gray-500 mt-3 line-clamp-2 bg-gray-50 p-2 rounded border border-gray-100">
                              {camp.base_template}
                            </p>
                            <div className="flex items-center gap-4 mt-3 text-sm text-gray-600">
                              <span>Total Leads: <strong className="text-gray-900">{camp.leads_count || 0}</strong></span>
                              <span>Sent: <strong className="text-gray-900">{camp.sent_count || 0}</strong></span>
                            </div>
                          </div>
                          <div>
                            <button
                              onClick={() => updateCampaignMutation.mutate({ id: camp.id, status: camp.status === 'active' ? 'paused' : 'active' })}
                              className={`px-4 py-2 text-sm font-medium rounded-lg border ${camp.status === 'active' ? 'border-gray-300 text-gray-700 hover:bg-gray-50' : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'}`}
                            >
                              {camp.status === 'active' ? 'Pause' : 'Activate'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeEmailTab === 'accounts' && (
                <div>
                  <h2 className="text-xl font-bold text-gray-800 mb-6">Connected Email Senders</h2>
                  
                  <div className="bg-gray-50/50 rounded-xl shadow-sm border border-gray-100 p-6 mb-8">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Connect New Gmail Smtp</h3>
                    <p className="text-sm text-gray-500 mb-4">Use a Google App Password (16-digits), not your regular password.</p>
                    <div className="grid md:grid-cols-2 gap-4 items-start">
                      <input 
                        type="email" 
                        value={newAccEmail}
                        onChange={e => setNewAccEmail(e.target.value)}
                        placeholder="name@gmail.com" 
                        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                      <input 
                        type="password" 
                        value={newAccPass}
                        onChange={e => setNewAccPass(e.target.value)}
                        placeholder="16-digit App Password" 
                        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                      <button 
                        onClick={() => {
                          createAccountMutation.mutate({ email: newAccEmail, app_password: newAccPass });
                          setNewAccPass('');
                        }}
                        disabled={!newAccEmail || !newAccPass || createAccountMutation.isPending}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {createAccountMutation.isPending ? 'Verifying...' : 'Connect Account'}
                      </button>
                    </div>
                  </div>

                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Active Senders Pool</h3>
                  {accountsLoading ? <p>Loading...</p> : (
                    <div className="grid md:grid-cols-2 gap-4">
                      {accountsData?.accounts?.length === 0 && <p className="text-gray-500">No accounts connected.</p>}
                      {accountsData?.accounts?.map(acc => (
                        <div key={acc.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col justify-between">
                          <div className="flex justify-between items-start mb-4">
                            <h4 className="text-md font-bold text-gray-900 break-all">{acc.email}</h4>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider ${acc.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {acc.status}
                            </span>
                          </div>
                          
                          <div className="space-y-3">
                            <div>
                              <div className="flex justify-between text-xs text-gray-500 mb-1">
                                <span>Sent Today</span>
                                <span>{acc.sent_today} / {acc.daily_limit}</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-1.5">
                                <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${Math.min(100, (acc.sent_today / acc.daily_limit) * 100)}%` }}></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeEmailTab === 'replies' && (
                <div>
                  <h2 className="text-xl font-bold text-gray-800 mb-6">Replies & Inbox</h2>
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
                    <Mail className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Inbox is Empty</h3>
                    <p className="text-gray-500 max-w-md mx-auto">
                      All replies to your automated campaigns will appear here. The system actively monitors your connected sending accounts for incoming responses.
                    </p>
                  </div>
                </div>
              )}

              {activeEmailTab === 'followups' && (
                <div>
                  <h2 className="text-xl font-bold text-gray-800 mb-6">Automated Follow-ups</h2>
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
                    <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Follow-ups</h3>
                    <p className="text-gray-500 max-w-md mx-auto">
                      Configure follow-up sequences for leads who don't reply to the initial campaign email. Set delay intervals and AI-generated bump templates.
                    </p>
                    <button className="mt-6 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors">
                      Create Follow-up Sequence
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'facebook' && (
          <div className="bg-white  rounded-xl p-6 shadow-sm border border-gray-200 ">
            <h2 className="text-lg font-semibold text-gray-900  mb-4">Facebook & Instagram Automation</h2>
            <p className="text-gray-500  mb-6">
              Connect your Facebook/Instagram account to receive replies directly in the Unified Inbox. 
              The initial cold message will be sent automatically via our <strong>Jento Social Automator Chrome Extension</strong>.
            </p>
            
            <div className="bg-blue-50  border border-blue-200  rounded-lg p-5 mb-6">
              <h3 className="text-md font-medium text-blue-900  mb-3">Step 1: Install Chrome Extension</h3>
              <p className="text-sm text-blue-800  mb-4">
                The Chrome extension is required to bypass Meta's 24-hour API limit by sending the initial message on your behalf.
              </p>
              <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm">
                Download Jento Social Automator
              </button>
            </div>

            <div className="bg-gray-50  border border-gray-200  rounded-lg p-5">
              <h3 className="text-md font-medium text-gray-900  mb-3">Step 2: Connect Meta Account</h3>
              <p className="text-sm text-gray-600  mb-4">
                Connect your Facebook and Instagram account to automatically sync your messages and replies directly to Jento.
              </p>
              <button 
                onClick={() => {
                  window.location.href = `${import.meta.env.VITE_API_URL}/api/meta/auth?token=${token}`;
                }}
                className="px-4 py-2 bg-[#1877F2] hover:bg-[#166FE5] text-white rounded-lg font-medium transition-colors text-sm flex items-center"
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                Connect Facebook / Instagram
              </button>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="bg-white  rounded-xl p-6 shadow-sm border border-gray-200 ">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 ">Sending Accounts</h2>
                <p className="text-gray-500  text-sm">
                  These accounts are kept hidden from the main view. They work in the background to send emails.
                </p>
              </div>
              <div className="bg-green-100 text-green-800 text-sm font-medium px-3 py-1 rounded-full  ">
                {accounts.length} Active Accounts
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 ">
                <thead>
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sent Today</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 ">
                  {accounts.map((acc, i) => (
                    <tr key={i}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 ">{acc.email}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800  ">
                          Active
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {acc.sent_today} / {acc.daily_limit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'linkedin' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Social Sub-Tabs */}
            <div className="bg-gray-50/80 border-b border-gray-200 px-6 py-4 flex gap-4">
              <button 
                onClick={() => setActiveSocialSubTab('campaigns')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeSocialSubTab === 'campaigns' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-200/50'}`}
              >
                Auto Campaigns
              </button>
              <button 
                onClick={() => setActiveSocialSubTab('leads')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeSocialSubTab === 'leads' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-200/50'}`}
              >
                Eligible LinkedIn Leads
              </button>
              <button 
                onClick={() => {
                  setActiveSocialSubTab('queue');
                  refetchLinkedinTasks();
                }}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeSocialSubTab === 'queue' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-200/50'}`}
              >
                LinkedIn Task Queue
              </button>
            </div>

            <div className="p-6">
              {activeSocialSubTab === 'campaigns' && (
                <div>
                  <h2 className="text-xl font-bold text-gray-800 mb-6">Automated LinkedIn Campaigns</h2>
                  
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-8">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Create New Campaign</h3>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name</label>
                          <input 
                            type="text" 
                            value={newCampName}
                            onChange={e => setNewCampName(e.target.value)}
                            placeholder="e.g., LinkedIn Mass Connect" 
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Daily Send Limit (Connections/Day)</label>
                          <input 
                            type="number" 
                            value={newCampDailyLimit}
                            onChange={e => setNewCampDailyLimit(Number(e.target.value))}
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                          <input 
                            type="date" 
                            value={newCampStartDate}
                            onChange={e => setNewCampStartDate(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Connection Request Note Template</label>
                        <textarea 
                          value={newCampTemplate}
                          onChange={e => setNewCampTemplate(e.target.value)}
                          placeholder="Template (e.g., Hi [Name], I noticed your profile...)" 
                          className="w-full h-24 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" 
                        />
                      </div>
                      
                      <button 
                        onClick={() => {
                          createCampaignMutation.mutate({ 
                            name: newCampName, 
                            base_template: newCampTemplate,
                            daily_limit: newCampDailyLimit,
                            send_time: '09:00',
                            start_date: newCampStartDate,
                            channel: 'linkedin'
                          });
                          setNewCampName('');
                          setNewCampTemplate('');
                        }}
                        disabled={!newCampName || !newCampTemplate || createCampaignMutation.isPending}
                        className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
                      >
                        Create LinkedIn Campaign
                      </button>
                    </div>
                  </div>

                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Active Campaigns</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {linkedinCampaignsLoading ? (
                      <div className="col-span-full text-center py-10">Loading campaigns...</div>
                    ) : linkedinCampaignsData?.campaigns?.length === 0 ? (
                      <div className="col-span-full text-center py-10 text-gray-500">No active LinkedIn campaigns. Create one above!</div>
                    ) : (
                      linkedinCampaignsData?.campaigns?.map(camp => (
                        <div key={camp.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col justify-between">
                          <div>
                            <div className="flex justify-between items-start mb-2">
                              <h4 className="font-bold text-gray-800 text-lg truncate pr-2" title={camp.name}>{camp.name}</h4>
                              <span className={`text-xs px-2 py-1 rounded font-medium ${camp.status === 'active' ? 'bg-green-100 text-green-700' : camp.status === 'paused' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'}`}>
                                {camp.status.toUpperCase()}
                              </span>
                            </div>
                            <p className="text-sm text-gray-500 mb-4 line-clamp-2">{camp.base_template}</p>
                            
                            <div className="space-y-2 mb-4">
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Daily Limit:</span>
                                <span className="font-medium">{camp.daily_limit} reqs/day</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Total Leads:</span>
                                <span className="font-medium">{camp.total_leads || 0}</span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex justify-end gap-2 border-t pt-4">
                            <button
                              onClick={() => updateCampaignMutation.mutate({ id: camp.id, status: camp.status === 'active' ? 'paused' : 'active' })}
                              className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                            >
                              {camp.status === 'active' ? 'Pause' : 'Activate'}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}


              {activeSocialSubTab === 'leads' && (
                <div>
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h2 className="text-xl font-bold text-gray-800 font-display">LinkedIn Outreach</h2>
                      <p className="text-gray-500 text-sm mt-1">
                        Select leads to queue automation tasks. These are processed by the Chrome extension.
                      </p>
                    </div>
                    {selectedLeads.size > 0 && (
                      <div className="flex gap-2 items-center bg-indigo-50 px-4 py-2 rounded-lg border border-indigo-100 animate-fade-in">
                        <span className="text-sm font-medium text-indigo-700">{selectedLeads.size} selected</span>
                        <button
                          onClick={async () => {
                            for (const id of selectedLeads) {
                              await queueLinkedinMutation.mutateAsync({ id, task_type: 'scrape_profile' });
                            }
                            setSelectedLeads(new Set());
                          }}
                          className="px-3 py-1 bg-indigo-600 text-white text-xs font-semibold rounded hover:bg-indigo-700 transition-colors"
                        >
                          Queue Scrape
                        </button>
                        <button
                          onClick={async () => {
                            for (const id of selectedLeads) {
                              await queueLinkedinMutation.mutateAsync({ id, task_type: 'send_connection' });
                            }
                            setSelectedLeads(new Set());
                          }}
                          className="px-3 py-1 bg-indigo-600 text-white text-xs font-semibold rounded hover:bg-indigo-700 transition-colors"
                        >
                          Queue Connect
                        </button>
                        <button
                          onClick={async () => {
                            for (const id of selectedLeads) {
                              await queueLinkedinMutation.mutateAsync({ id, task_type: 'send_message' });
                            }
                            setSelectedLeads(new Set());
                          }}
                          className="px-3 py-1 bg-indigo-600 text-white text-xs font-semibold rounded hover:bg-indigo-700 transition-colors"
                        >
                          Queue Message
                        </button>
                        {linkedinCampaignsData?.campaigns?.length > 0 && (
                          <select 
                            className="text-sm border border-indigo-200 rounded px-2 py-1 bg-white outline-none ml-2"
                            onChange={(e) => {
                              if (e.target.value) {
                                assignCampaignMutation.mutate({ id: Number(e.target.value), contact_ids: Array.from(selectedLeads) });
                                setSelectedLeads(new Set());
                              }
                            }}
                            value=""
                          >
                            <option value="" disabled>Assign {selectedLeads.size} leads to Campaign...</option>
                            {linkedinCampaignsData.campaigns.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </div>

                  {contactsLoading ? (
                    <div className="text-center py-10">Loading contacts...</div>
                  ) : (
                    <div className="overflow-x-auto border border-gray-200 rounded-lg">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                              <input 
                                type="checkbox" 
                                onChange={(e) => {
                                  const eligible = contactsData?.contacts?.filter(c => c.linkedin) || [];
                                  if (e.target.checked) {
                                    setSelectedLeads(new Set(eligible.map(c => c.id)));
                                  } else {
                                    setSelectedLeads(new Set());
                                  }
                                }}
                                checked={contactsData?.contacts?.filter(c => c.linkedin).length > 0 && selectedLeads.size === contactsData?.contacts?.filter(c => c.linkedin).length}
                              />
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">LinkedIn Profile</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                          {(contactsData?.contacts?.filter(c => c.linkedin) || []).map(contact => (
                            <tr key={contact.id} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <input 
                                  type="checkbox" 
                                  checked={selectedLeads.has(contact.id)} 
                                  onChange={() => handleSelectLead(contact.id)} 
                                />
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{contact.name}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{contact.company || '—'}</td>
                              <td className="px-6 py-4 text-sm">
                                <a href={contact.linkedin!} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline break-all">
                                  {contact.linkedin}
                                </a>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm flex gap-2">
                                <button
                                  onClick={() => queueLinkedinMutation.mutate({ id: contact.id, task_type: 'scrape_profile' })}
                                  className="px-2.5 py-1 text-xs border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                                >
                                  Scrape
                                </button>
                                <button
                                  onClick={() => queueLinkedinMutation.mutate({ id: contact.id, task_type: 'send_connection' })}
                                  className="px-2.5 py-1 text-xs border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                                >
                                  Connect
                                </button>
                                <button
                                  onClick={() => queueLinkedinMutation.mutate({ id: contact.id, task_type: 'send_message' })}
                                  className="px-2.5 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium"
                                >
                                  Message
                                </button>
                              </td>
                            </tr>
                          ))}
                          {contactsData?.contacts?.filter(c => c.linkedin).length === 0 && (
                            <tr>
                              <td colSpan={5} className="text-center py-10 text-gray-500 text-sm">
                                No leads with a LinkedIn URL found in the database.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {activeSocialSubTab === 'queue' && (
                <div>
                  <h2 className="text-xl font-bold text-gray-800 mb-6 font-display">LinkedIn Task Queue</h2>
                  {linkedinTasksLoading ? (
                    <div className="text-center py-10">Loading tasks...</div>
                  ) : (
                    <div className="overflow-x-auto border border-gray-200 rounded-lg">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lead Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Task Type</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created At</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                          {(linkedinTasksData?.tasks || []).map(task => (
                            <tr key={task.id} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">#{task.id}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{task.name}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm uppercase text-gray-600 font-medium">{task.task_type.replace('_', ' ')}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                                  task.status === 'completed' ? 'bg-green-100 text-green-800' :
                                  task.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                  task.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {task.status}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(task.created_at).toLocaleString()}</td>
                            </tr>
                          ))}
                          {(linkedinTasksData?.tasks || []).length === 0 && (
                            <tr>
                              <td colSpan={5} className="text-center py-10 text-gray-500 text-sm">
                                No tasks in the queue yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'reddit' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Social Sub-Tabs */}
            <div className="bg-gray-50/80 border-b border-gray-200 px-6 py-4 flex gap-4">
              <button 
                onClick={() => setActiveSocialSubTab('leads')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeSocialSubTab === 'leads' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-200/50'}`}
              >
                Eligible Reddit Leads
              </button>
              <button 
                onClick={() => {
                  setActiveSocialSubTab('queue');
                  refetchRedditTasks();
                }}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeSocialSubTab === 'queue' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-200/50'}`}
              >
                Reddit Task Queue
              </button>
            </div>

            <div className="p-6">
              {activeSocialSubTab === 'leads' && (
                <div>
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h2 className="text-xl font-bold text-gray-800 font-display">Reddit Outreach</h2>
                      <p className="text-gray-500 text-sm mt-1">
                        Select leads to queue automation DMs or profile scraping.
                      </p>
                    </div>
                    {selectedLeads.size > 0 && (
                      <div className="flex gap-2 items-center bg-indigo-50 px-4 py-2 rounded-lg border border-indigo-100 animate-fade-in">
                        <span className="text-sm font-medium text-indigo-700">{selectedLeads.size} selected</span>
                        <button
                          onClick={async () => {
                            for (const id of selectedLeads) {
                              await queueRedditMutation.mutateAsync({ id, task_type: 'scrape_profile' });
                            }
                            setSelectedLeads(new Set());
                          }}
                          className="px-3 py-1 bg-indigo-600 text-white text-xs font-semibold rounded hover:bg-indigo-700 transition-colors"
                        >
                          Queue Scrape
                        </button>
                        <button
                          onClick={async () => {
                            for (const id of selectedLeads) {
                              await queueRedditMutation.mutateAsync({ id, task_type: 'send_message' });
                            }
                            setSelectedLeads(new Set());
                          }}
                          className="px-3 py-1 bg-indigo-600 text-white text-xs font-semibold rounded hover:bg-indigo-700 transition-colors"
                        >
                          Queue Message
                        </button>
                      </div>
                    )}
                  </div>

                  {contactsLoading ? (
                    <div className="text-center py-10">Loading contacts...</div>
                  ) : (
                    <div className="overflow-x-auto border border-gray-200 rounded-lg">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                              <input 
                                type="checkbox" 
                                onChange={(e) => {
                                  const eligible = contactsData?.contacts?.filter(c => c.reddit_url) || [];
                                  if (e.target.checked) {
                                    setSelectedLeads(new Set(eligible.map(c => c.id)));
                                  } else {
                                    setSelectedLeads(new Set());
                                  }
                                }}
                                checked={contactsData?.contacts?.filter(c => c.reddit_url).length > 0 && selectedLeads.size === contactsData?.contacts?.filter(c => c.reddit_url).length}
                              />
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reddit URL</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                          {(contactsData?.contacts?.filter(c => c.reddit_url) || []).map(contact => (
                            <tr key={contact.id} className="hover:bg-gray-55/50 transition-colors">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <input 
                                  type="checkbox" 
                                  checked={selectedLeads.has(contact.id)} 
                                  onChange={() => handleSelectLead(contact.id)} 
                                />
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{contact.name}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{contact.company || '—'}</td>
                              <td className="px-6 py-4 text-sm">
                                <a href={contact.reddit_url!} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline break-all">
                                  {contact.reddit_url}
                                </a>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm flex gap-2">
                                <button
                                  onClick={() => queueRedditMutation.mutate({ id: contact.id, task_type: 'scrape_profile' })}
                                  className="px-2.5 py-1 text-xs border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                                >
                                  Scrape
                                </button>
                                <button
                                  onClick={() => queueRedditMutation.mutate({ id: contact.id, task_type: 'send_message' })}
                                  className="px-2.5 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium"
                                >
                                  Message
                                </button>
                              </td>
                            </tr>
                          ))}
                          {contactsData?.contacts?.filter(c => c.reddit_url).length === 0 && (
                            <tr>
                              <td colSpan={5} className="text-center py-10 text-gray-500 text-sm">
                                No leads with a Reddit URL found in the database.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {activeSocialSubTab === 'queue' && (
                <div>
                  <h2 className="text-xl font-bold text-gray-800 mb-6 font-display">Reddit Task Queue</h2>
                  {redditTasksLoading ? (
                    <div className="text-center py-10">Loading tasks...</div>
                  ) : (
                    <div className="overflow-x-auto border border-gray-200 rounded-lg">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lead Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Task Type</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created At</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                          {(redditTasksData?.tasks || []).map(task => (
                            <tr key={task.id} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">#{task.id}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{task.name}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm uppercase text-gray-600 font-medium">{task.task_type.replace('_', ' ')}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                                  task.status === 'completed' ? 'bg-green-100 text-green-800' :
                                  task.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                  task.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {task.status}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(task.created_at).toLocaleString()}</td>
                            </tr>
                          ))}
                          {(redditTasksData?.tasks || []).length === 0 && (
                            <tr>
                              <td colSpan={5} className="text-center py-10 text-gray-500 text-sm">
                                No tasks in the queue yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
