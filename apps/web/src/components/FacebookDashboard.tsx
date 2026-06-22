import React, { useState, useCallback } from 'react';
import {
  Users, MessageCircle, Send, Flame, Clock, Search, ThumbsUp,
  PlusCircle, CheckCircle2, Trash2, X, Play, Pause, Zap, Target,
  ChevronRight, AlertCircle, ArrowRight
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';

const API_BASE = import.meta.env.VITE_API_URL || '';

function useMetaApi(platform: 'facebook' | 'instagram' = 'facebook') {
  const { token } = useAuth();

  const authFetch = useCallback(async (path: string, options?: RequestInit) => {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options?.headers || {}),
      },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }, [token]);

  return { authFetch };
}

// ──────────────────────────────────────────────
// DAILY TARGETS WIDGET
// ──────────────────────────────────────────────
const DAILY_TARGETS = {
  like: { label: 'Likes & Comments', target: 100, color: 'blue', hint: 'Engage on A/B list influencer posts & groups.' },
  friend_req: { label: 'Friend Requests & DMs', target: 15, color: 'purple', hint: 'Target C-list profiles. Always comment first.' },
  group_join: { label: 'Group Joins/Posts', target: 13, color: 'pink', hint: 'Join or post in highly engaged FB groups.' },
  post: { label: 'Weekly Content Post', target: 2, color: 'orange', hint: 'Schedule 2 high-value posts per profile weekly.' },
};

const colorMap: Record<string, { bg: string; text: string; bar: string; light: string; border: string }> = {
  blue:   { bg: 'bg-blue-100',   text: 'text-blue-600',   bar: 'bg-blue-600',   light: 'bg-white to-blue-50',   border: 'border-blue-100' },
  purple: { bg: 'bg-purple-100', text: 'text-purple-600', bar: 'bg-purple-600', light: 'bg-white to-purple-50', border: 'border-purple-100' },
  pink:   { bg: 'bg-pink-100',   text: 'text-pink-600',   bar: 'bg-pink-600',   light: 'bg-white to-pink-50',   border: 'border-pink-100' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-600', bar: 'bg-orange-600', light: 'bg-white to-orange-50', border: 'border-orange-100' },
};

const iconMap: Record<string, React.ReactNode> = {
  like:       <ThumbsUp className="w-6 h-6" />,
  friend_req: <Users className="w-6 h-6" />,
  group_join: <Search className="w-6 h-6" />,
  post:       <Flame className="w-6 h-6" />,
};

// ──────────────────────────────────────────────
// ADD PROFILE MODAL
// ──────────────────────────────────────────────
function AddProfileModal({ platform, onClose, onAdd }: { platform: string; onClose: () => void; onAdd: (name: string, username: string) => void }) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center animate-fade-in">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-xl font-bold text-gray-900 mb-2">
          Connect New {platform === 'instagram' ? 'Instagram' : 'Facebook'} Profile
        </h3>
        <p className="text-gray-500 text-sm mb-5">
          Add a profile to start tracking daily actions and managing your pipeline.
        </p>

        <div className="space-y-3 mb-5">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Profile Name (internal label)</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={platform === 'instagram' ? 'e.g., IG Main Account' : 'e.g., Profile 1 (Main)'}
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              {platform === 'instagram' ? 'Instagram Username' : 'Facebook Profile Username / URL'}
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder={platform === 'instagram' ? '@yourusername' : 'facebook.com/yourprofile'}
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-100 text-blue-800 rounded-lg p-3 text-xs mb-5">
          <strong>How it works:</strong> Once added, use the Jento Chrome Extension to automate actions on this profile. The extension reports back here in real-time.
        </div>

        <button
          onClick={() => { if (name) { onAdd(name, username); onClose(); } }}
          disabled={!name}
          className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          Add Profile
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// ADD LEAD TO PIPELINE MODAL
// ──────────────────────────────────────────────
function AddLeadModal({ profileId, platform, onClose, onAdd }: {
  profileId: number; platform: string; onClose: () => void;
  onAdd: (name: string, group: string, avatarUrl: string) => void;
}) {
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center animate-fade-in">
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold text-gray-900 mb-4">Add Lead to Pipeline</h3>
        <div className="space-y-3 mb-4">
          <input
            type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="Full Name"
            className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <input
            type="text" value={group} onChange={e => setGroup(e.target.value)}
            placeholder={platform === 'instagram' ? 'Source (e.g., @realestateig)' : 'Source Group/Page'}
            className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <button
          onClick={() => { if (name) { onAdd(name, group, `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`); onClose(); } }}
          disabled={!name}
          className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          Add to Pipeline
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// MAIN COMPONENT
// ──────────────────────────────────────────────
export default function FacebookDashboard({ platform = 'facebook' }: { platform?: 'facebook' | 'instagram' }) {
  const queryClient = useQueryClient();
  const { authFetch } = useMetaApi(platform);
  const [activeTab, setActiveTab] = useState<'pipeline' | 'campaigns' | 'queue'>('pipeline');
  const [activeProfileId, setActiveProfileId] = useState<number | null>(null);
  const [showAddProfileModal, setShowAddProfileModal] = useState(false);
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [newCamp, setNewCamp] = useState({ name: '', message_template: '', daily_limit: 10 });
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  };

  const isFacebook = platform === 'facebook';
  const themeColor = isFacebook ? '#1877F2' : '#E1306C';
  const themeGradient = isFacebook
    ? 'from-[#1877F2] to-[#4267B2]'
    : 'from-[#833AB4] via-[#E1306C] to-[#F56040]';

  // ── DATA QUERIES ──

  const { data: profilesData, isLoading: profilesLoading } = useQuery({
    queryKey: ['meta-profiles', platform],
    queryFn: () => authFetch(`/v1/outreach/meta/profiles?platform=${platform}`),
    staleTime: 30000,
  });

  const profiles: any[] = profilesData?.profiles || [];

  // Set first profile as active when loaded
  React.useEffect(() => {
    if (profiles.length > 0 && !activeProfileId) {
      setActiveProfileId(profiles[0].id);
    }
  }, [profiles, activeProfileId]);

  const { data: statsData } = useQuery({
    queryKey: ['meta-daily-stats', platform, activeProfileId],
    queryFn: () => authFetch(`/v1/outreach/meta/daily-stats?platform=${platform}${activeProfileId ? `&profile_id=${activeProfileId}` : ''}`),
    enabled: !!activeProfileId,
    refetchInterval: 60000,
  });

  const { data: pipelineData, isLoading: pipelineLoading } = useQuery({
    queryKey: ['meta-pipeline', platform, activeProfileId],
    queryFn: () => authFetch(`/v1/outreach/meta/pipeline?platform=${platform}${activeProfileId ? `&profile_id=${activeProfileId}` : ''}`),
    enabled: activeTab === 'pipeline',
    staleTime: 10000,
  });

  const { data: campaignsData, isLoading: campaignsLoading } = useQuery({
    queryKey: ['meta-campaigns', platform],
    queryFn: () => authFetch(`/v1/outreach/meta/campaigns?platform=${platform}`),
    enabled: activeTab === 'campaigns',
    staleTime: 30000,
  });

  const { data: queueData, isLoading: queueLoading } = useQuery({
    queryKey: ['meta-queue', platform, activeProfileId],
    queryFn: () => authFetch(`/v1/outreach/meta/queue${activeProfileId ? `?profile_id=${activeProfileId}` : ''}`),
    enabled: activeTab === 'queue',
    refetchInterval: 15000,
  });

  // ── MUTATIONS ──

  const addProfileMutation = useMutation({
    mutationFn: ({ name, username }: { name: string; username: string }) =>
      authFetch('/v1/outreach/meta/profiles', {
        method: 'POST',
        body: JSON.stringify({ name, username, platform }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['meta-profiles', platform] });
      setActiveProfileId(data.profile.id);
      showToast('success', 'Profile added successfully!');
    },
    onError: () => showToast('error', 'Failed to add profile'),
  });

  const deleteProfileMutation = useMutation({
    mutationFn: (id: number) =>
      authFetch(`/v1/outreach/meta/profiles/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meta-profiles', platform] });
      setActiveProfileId(null);
      showToast('success', 'Profile removed');
    },
  });

  const logActionMutation = useMutation({
    mutationFn: ({ action_type }: { action_type: string }) =>
      authFetch('/v1/outreach/meta/actions/log', {
        method: 'POST',
        body: JSON.stringify({ profile_id: activeProfileId, action_type, count: 1 }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meta-daily-stats', platform, activeProfileId] });
    },
  });

  const addLeadMutation = useMutation({
    mutationFn: ({ name, source_group, avatar_url }: { name: string; source_group: string; avatar_url: string }) =>
      authFetch('/v1/outreach/meta/pipeline', {
        method: 'POST',
        body: JSON.stringify({ name, source_group, avatar_url, platform, profile_id: activeProfileId, stage: 'find_mine' }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meta-pipeline', platform, activeProfileId] });
      showToast('success', 'Lead added to pipeline!');
    },
  });

  const moveStageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: number; stage: string }) =>
      authFetch(`/v1/outreach/meta/pipeline/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ stage }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meta-pipeline', platform, activeProfileId] });
    },
  });

  const removeLeadMutation = useMutation({
    mutationFn: (id: number) =>
      authFetch(`/v1/outreach/meta/pipeline/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meta-pipeline', platform, activeProfileId] });
    },
  });

  const createCampaignMutation = useMutation({
    mutationFn: (data: typeof newCamp) =>
      authFetch('/v1/outreach/meta/campaigns', {
        method: 'POST',
        body: JSON.stringify({ ...data, platform, profile_id: activeProfileId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meta-campaigns', platform] });
      setNewCamp({ name: '', message_template: '', daily_limit: 10 });
      setShowCampaignForm(false);
      showToast('success', 'Campaign created!');
    },
    onError: () => showToast('error', 'Failed to create campaign'),
  });

  const toggleCampaignMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      authFetch(`/v1/outreach/meta/campaigns/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meta-campaigns', platform] }),
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: (id: number) =>
      authFetch(`/v1/outreach/meta/campaigns/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meta-campaigns', platform] });
      showToast('success', 'Campaign deleted');
    },
  });

  const addToQueueMutation = useMutation({
    mutationFn: ({ pipeline_id, task_type, target_url, message_body }: any) =>
      authFetch('/v1/outreach/meta/queue', {
        method: 'POST',
        body: JSON.stringify({ profile_id: activeProfileId, pipeline_id, task_type, target_url, message_body }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meta-queue', platform, activeProfileId] });
      showToast('success', 'Task added to queue!');
    },
  });

  // ── HELPERS ──
  const stats = statsData || {};
  const pipeline = pipelineData?.pipeline || { find_mine: [], engaged: [], hot_dm: [], active_conv: [] };
  const campaigns: any[] = campaignsData?.campaigns || [];
  const tasks: any[] = queueData?.tasks || [];
  const activeProfile = profiles.find(p => p.id === activeProfileId);

  const handleLikeComment = (lead: any) => {
    logActionMutation.mutate({ action_type: 'like' });
    moveStageMutation.mutate({ id: lead.id, stage: 'engaged' });
    showToast('success', `Logged: Like/Comment on ${lead.name}`);
  };

  const handleFriendRequest = (lead: any) => {
    logActionMutation.mutate({ action_type: 'friend_req' });
    moveStageMutation.mutate({ id: lead.id, stage: 'engaged' });
    addToQueueMutation.mutate({ pipeline_id: lead.id, task_type: 'send_friend_req', target_url: lead.profile_url });
    showToast('success', `Queued: Friend Request to ${lead.name}`);
  };

  const handleSendDM = (lead: any) => {
    logActionMutation.mutate({ action_type: 'dm' });
    moveStageMutation.mutate({ id: lead.id, stage: 'active_conv' });
    addToQueueMutation.mutate({ pipeline_id: lead.id, task_type: 'send_dm', target_url: lead.profile_url });
    showToast('success', `Queued: DM to ${lead.name}`);
  };

  const handleReply = (lead: any) => {
    logActionMutation.mutate({ action_type: 'dm' });
    showToast('success', `Opening conversation with ${lead.name}...`);
  };

  // ── RENDER ──
  return (
    <div className="animate-fade-in space-y-8">

      {/* TOAST */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[100] px-5 py-3 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-2 animate-fade-in
          ${toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.text}
        </div>
      )}

      {/* HEADER & TABS */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 pb-4">
        <div>
          <h2 className={`text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r ${themeGradient}`}>
            {isFacebook ? 'Facebook' : 'Instagram'} Outreach Engine
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Manage {isFacebook ? 'Facebook' : 'Instagram'} organic growth across multiple profiles.
          </p>
        </div>

        <div className="flex bg-gray-100 p-1 rounded-xl shadow-inner">
          {(['pipeline', 'campaigns', 'queue'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 text-sm font-semibold rounded-lg transition-all duration-300 capitalize
                ${activeTab === tab ? 'bg-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
              style={activeTab === tab ? { color: themeColor } : {}}
            >
              {tab === 'queue' ? 'Task Queue' : tab === 'campaigns' ? 'Auto Campaigns' : 'Daily Pipeline'}
            </button>
          ))}
        </div>
      </div>

      {/* ── PIPELINE TAB ── */}
      {activeTab === 'pipeline' && (
        <>
          {/* PROFILE SELECTOR */}
          <div className="flex items-center gap-3 overflow-x-auto pb-2">
            <span className="text-sm font-bold text-gray-700 whitespace-nowrap">Active Profile:</span>
            {profilesLoading ? (
              <div className="w-32 h-8 bg-gray-200 rounded-full animate-pulse" />
            ) : (
              profiles.map(profile => (
                <div key={profile.id} className="flex items-center gap-1">
                  <button
                    onClick={() => setActiveProfileId(profile.id)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap border ${
                      activeProfileId === profile.id
                        ? 'text-white border-transparent shadow-md'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                    style={activeProfileId === profile.id ? { backgroundColor: themeColor } : {}}
                  >
                    {profile.name}
                  </button>
                  {activeProfileId === profile.id && (
                    <button
                      onClick={() => deleteProfileMutation.mutate(profile.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
            <button
              onClick={() => setShowAddProfileModal(true)}
              className="px-3 py-1.5 rounded-full text-sm font-medium text-gray-500 bg-gray-100 border border-gray-200 border-dashed hover:bg-gray-200 flex items-center transition-colors whitespace-nowrap"
            >
              <PlusCircle className="w-4 h-4 mr-1" /> Add Profile
            </button>
          </div>

          {/* NO PROFILE WARNING */}
          {!activeProfileId && !profilesLoading && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
              <AlertCircle className="w-10 h-10 text-amber-400 mx-auto mb-2" />
              <p className="font-semibold text-amber-800">No profile selected</p>
              <p className="text-sm text-amber-600 mt-1">Add a {isFacebook ? 'Facebook' : 'Instagram'} profile to start tracking your pipeline.</p>
              <button
                onClick={() => setShowAddProfileModal(true)}
                className="mt-4 px-5 py-2 rounded-lg text-white text-sm font-semibold"
                style={{ backgroundColor: themeColor }}
              >
                Add Your First Profile
              </button>
            </div>
          )}

          {/* DAILY TARGETS */}
          {activeProfileId && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {Object.entries(DAILY_TARGETS).map(([key, cfg]) => {
                const c = colorMap[cfg.color];
                const done = stats[key === 'like' ? 'likes_comments' : key === 'friend_req' ? 'friend_requests' : key === 'group_join' ? 'group_joins' : 'posts'] || 0;
                const pct = Math.min(100, (done / cfg.target) * 100);
                return (
                  <div key={key} className={`bg-gradient-to-br from-white ${c.light} p-6 rounded-2xl shadow-sm border ${c.border} relative overflow-hidden group`}>
                    <div className={`absolute top-0 right-0 w-24 h-24 rounded-bl-full opacity-20 group-hover:scale-110 transition-transform duration-500 ${c.bg}`} />
                    <div className="flex items-center justify-between mb-4 relative z-10">
                      <div className={`p-3 ${c.bg} ${c.text} rounded-xl`}>{iconMap[key]}</div>
                      <span className="text-2xl font-bold text-gray-800">
                        {done}<span className="text-gray-400 text-lg">/{cfg.target}</span>
                      </span>
                    </div>
                    <h3 className="font-bold text-gray-900">{cfg.label}</h3>
                    <p className="text-xs text-gray-500 mt-1 mb-3">{cfg.hint}</p>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className={`${c.bar} h-2 rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* KANBAN PIPELINE */}
          {activeProfileId && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900 flex items-center">
                  <span className="flex items-center justify-center w-8 h-8 rounded-lg mr-3" style={{ backgroundColor: `${themeColor}20`, color: themeColor }}>
                    <Zap className="w-4 h-4" />
                  </span>
                  Pipeline — {activeProfile?.name || ''}
                </h3>
                <button
                  onClick={() => setShowAddLeadModal(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold"
                  style={{ backgroundColor: themeColor }}
                >
                  <PlusCircle className="w-4 h-4" /> Add Lead
                </button>
              </div>

              {pipelineLoading ? (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                  {[1,2,3,4].map(i => <div key={i} className="h-48 bg-gray-100 rounded-2xl animate-pulse" />)}
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

                  {/* STAGE 1 — Find & Mine */}
                  <div className="bg-gray-50/50 rounded-2xl border border-gray-200 p-4 flex flex-col min-h-[450px]">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="font-bold text-gray-800 flex items-center text-sm">
                        <Search className="w-4 h-4 mr-1.5 text-blue-500" /> Find & Mine
                      </h4>
                      <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">{pipeline.find_mine.length}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                      {pipeline.find_mine.length === 0 && (
                        <div className="text-center py-8 text-gray-400 text-sm">
                          <Target className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          Add leads to start
                        </div>
                      )}
                      {pipeline.find_mine.map((lead: any) => (
                        <div key={lead.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-200 transition-all group">
                          <div className="flex items-center gap-3 mb-3">
                            <img src={lead.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(lead.name)}&background=random`}
                              alt={lead.name} className="w-10 h-10 rounded-full object-cover" />
                            <div className="flex-1 min-w-0">
                              <h5 className="font-bold text-sm text-gray-900 truncate">{lead.name}</h5>
                              <p className="text-xs text-gray-500 truncate">{lead.source_group}</p>
                            </div>
                            <button onClick={() => removeLeadMutation.mutate(lead.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => handleLikeComment(lead)}
                              className="py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-colors"
                            >
                              Like/Comment
                            </button>
                            <button
                              onClick={() => handleFriendRequest(lead)}
                              className="py-1.5 bg-blue-50 border border-blue-100 rounded-lg text-xs font-bold text-blue-600 hover:bg-blue-100 transition-colors"
                            >
                              {isFacebook ? 'Add Friend' : 'Follow'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* STAGE 2 — Engaged / Pending */}
                  <div className="bg-gray-50/50 rounded-2xl border border-gray-200 p-4 flex flex-col min-h-[450px]">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="font-bold text-gray-800 flex items-center text-sm">
                        <Clock className="w-4 h-4 mr-1.5 text-gray-500" /> Engaged / Pending
                      </h4>
                      <span className="bg-gray-200 text-gray-700 text-xs font-bold px-2 py-0.5 rounded-full">{pipeline.engaged.length}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                      {pipeline.engaged.length === 0 && (
                        <div className="text-center py-8 text-gray-400 text-sm">
                          <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          Waiting for responses
                        </div>
                      )}
                      {pipeline.engaged.map((lead: any) => (
                        <div key={lead.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all group">
                          <div className="flex items-center gap-3 mb-3">
                            <img src={lead.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(lead.name)}&background=random`}
                              alt={lead.name} className="w-10 h-10 rounded-full object-cover opacity-80" />
                            <div className="flex-1 min-w-0">
                              <h5 className="font-bold text-sm text-gray-700 truncate">{lead.name}</h5>
                              <p className="text-xs text-gray-400 truncate">{lead.source_group}</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded flex items-center gap-1">
                              <Clock className="w-3 h-3" /> Pending
                            </span>
                            <button
                              onClick={() => moveStageMutation.mutate({ id: lead.id, stage: 'hot_dm' })}
                              className="text-xs font-semibold text-pink-600 hover:text-pink-700 flex items-center gap-0.5"
                            >
                              Hot DM <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* STAGE 3 — Hot for DM */}
                  <div className="bg-pink-50/40 rounded-2xl border border-pink-100 p-4 flex flex-col min-h-[450px]">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="font-bold text-gray-800 flex items-center text-sm">
                        <Flame className="w-4 h-4 mr-1.5 text-pink-500" /> Hot for DM
                      </h4>
                      <span className="bg-pink-100 text-pink-700 text-xs font-bold px-2 py-0.5 rounded-full">{pipeline.hot_dm.length}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                      {pipeline.hot_dm.length === 0 && (
                        <div className="text-center py-8 text-gray-400 text-sm">
                          <Flame className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          Move leads here when ready
                        </div>
                      )}
                      {pipeline.hot_dm.map((lead: any) => (
                        <div key={lead.id} className="bg-white p-4 rounded-xl shadow-sm border border-pink-200 hover:shadow-md hover:border-pink-300 transition-all relative overflow-hidden group">
                          <div className="absolute top-0 left-0 w-1 h-full bg-pink-400" />
                          <div className="flex items-center gap-3 mb-3">
                            <img src={lead.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(lead.name)}&background=random`}
                              alt={lead.name} className="w-10 h-10 rounded-full object-cover" />
                            <div>
                              <h5 className="font-bold text-sm text-gray-900">{lead.name}</h5>
                              <p className="text-xs text-gray-500">{lead.source_group}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleSendDM(lead)}
                            className="w-full py-2 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-lg text-xs font-bold hover:shadow-lg transition-all flex items-center justify-center gap-1 shadow-pink-500/20 shadow-md"
                          >
                            <Send className="w-3 h-3" /> Send 1st Message
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* STAGE 4 — Active Conversations */}
                  <div className="rounded-2xl border p-4 flex flex-col min-h-[450px]"
                    style={{ backgroundColor: `${themeColor}08`, borderColor: `${themeColor}30` }}>
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="font-bold text-gray-800 flex items-center text-sm">
                        <MessageCircle className="w-4 h-4 mr-1.5" style={{ color: themeColor }} /> Active Conv.
                      </h4>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${themeColor}20`, color: themeColor }}>
                        {pipeline.active_conv.length}
                      </span>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                      {pipeline.active_conv.length === 0 && (
                        <div className="text-center py-8 text-gray-400 text-sm">
                          <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          No active conversations
                        </div>
                      )}
                      {pipeline.active_conv.map((lead: any) => (
                        <div key={lead.id} className="bg-white p-4 rounded-xl shadow-sm border hover:shadow-md transition-all"
                          style={{ borderColor: `${themeColor}30` }}>
                          <div className="flex items-center gap-3 mb-2">
                            <img src={lead.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(lead.name)}&background=random`}
                              alt={lead.name} className="w-10 h-10 rounded-full object-cover" />
                            <h5 className="font-bold text-sm text-gray-900">{lead.name}</h5>
                          </div>
                          {lead.last_message && (
                            <div className="bg-gray-50 p-2 rounded-lg text-xs text-gray-600 mb-3 italic border border-gray-100 line-clamp-2">
                              "{lead.last_message}"
                            </div>
                          )}
                          <button
                            onClick={() => handleReply(lead)}
                            className="w-full py-2 text-white rounded-lg text-xs font-bold hover:opacity-90 transition-colors flex items-center justify-center gap-1"
                            style={{ backgroundColor: themeColor }}
                          >
                            Reply in {isFacebook ? 'Messenger' : 'Instagram DMs'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── CAMPAIGNS TAB ── */}
      {activeTab === 'campaigns' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Auto Campaigns</h3>
              <p className="text-sm text-gray-500 mt-1">
                Configure automated {isFacebook ? 'Facebook' : 'Instagram'} outreach campaigns.
              </p>
            </div>
            {!showCampaignForm && (
              <button
                onClick={() => setShowCampaignForm(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold"
                style={{ backgroundColor: themeColor }}
              >
                <PlusCircle className="w-4 h-4" /> New Campaign
              </button>
            )}
          </div>

          {/* Warning */}
          <div className="flex items-start gap-3 bg-amber-50 text-amber-800 p-4 rounded-xl border border-amber-200 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p><strong>Note:</strong> Meta imposes strict 24-hour limits on automated actions. We recommend manual prospecting via the Pipeline tab for higher conversions.</p>
          </div>

          {/* Create Form */}
          {showCampaignForm && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <h4 className="font-bold text-gray-900 mb-4">Create New Campaign</h4>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Campaign Name</label>
                  <input
                    type="text" value={newCamp.name}
                    onChange={e => setNewCamp(p => ({ ...p, name: e.target.value }))}
                    placeholder={`e.g., ${isFacebook ? 'Real Estate Group Outreach' : 'IG DM Campaign #1'}`}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 outline-none"
                    style={{ '--tw-ring-color': themeColor } as any}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Message Template</label>
                  <textarea
                    value={newCamp.message_template}
                    onChange={e => setNewCamp(p => ({ ...p, message_template: e.target.value }))}
                    placeholder="Hi [Name], I noticed you're interested in [Topic]..."
                    rows={4}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 outline-none resize-none"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Daily Action Limit</label>
                  <input
                    type="number" value={newCamp.daily_limit} min={1} max={50}
                    onChange={e => setNewCamp(p => ({ ...p, daily_limit: Number(e.target.value) }))}
                    className="w-32 p-2.5 border border-gray-300 rounded-lg focus:ring-2 outline-none"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => createCampaignMutation.mutate(newCamp)}
                    disabled={!newCamp.name || !newCamp.message_template || createCampaignMutation.isPending}
                    className="px-6 py-2.5 rounded-xl text-white font-semibold disabled:opacity-50"
                    style={{ backgroundColor: themeColor }}
                  >
                    {createCampaignMutation.isPending ? 'Creating...' : 'Create Campaign'}
                  </button>
                  <button
                    onClick={() => setShowCampaignForm(false)}
                    className="px-6 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Campaign List */}
          {campaignsLoading ? (
            <div className="space-y-4">
              {[1,2].map(i => <div key={i} className="h-28 bg-gray-100 rounded-2xl animate-pulse" />)}
            </div>
          ) : campaigns.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center">
              <Flame className="w-16 h-16 text-gray-200 mx-auto mb-4" />
              <h4 className="text-lg font-bold text-gray-900 mb-2">No campaigns yet</h4>
              <p className="text-gray-500 max-w-sm mx-auto">Create your first automated campaign to start outreach at scale.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {campaigns.map((camp: any) => (
                <div key={camp.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex justify-between items-start">
                  <div className="flex-1 mr-4">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-bold text-gray-900">{camp.name}</h4>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        camp.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {camp.status?.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 line-clamp-2 mb-2 italic">"{camp.message_template}"</p>
                    <div className="flex gap-4 text-xs text-gray-500">
                      <span>Daily limit: <strong>{camp.daily_limit}</strong></span>
                      <span>Sent: <strong>{camp.sent_count || 0}</strong></span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => toggleCampaignMutation.mutate({ id: camp.id, status: camp.status === 'active' ? 'paused' : 'active' })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 hover:bg-gray-50 transition-colors"
                    >
                      {camp.status === 'active' ? <><Pause className="w-3 h-3" /> Pause</> : <><Play className="w-3 h-3" /> Activate</>}
                    </button>
                    <button
                      onClick={() => deleteCampaignMutation.mutate(camp.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TASK QUEUE TAB ── */}
      {activeTab === 'queue' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Extension Task Queue</h3>
              <p className="text-sm text-gray-500 mt-1">
                Background tasks queued for the Jento Chrome Extension. Auto-refreshes every 15s.
              </p>
            </div>
            <span className="text-xs font-medium px-3 py-1 rounded-full" style={{ backgroundColor: `${themeColor}15`, color: themeColor }}>
              {tasks.length} task{tasks.length !== 1 ? 's' : ''}
            </span>
          </div>

          {queueLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          ) : tasks.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center">
              <Clock className="w-16 h-16 text-gray-200 mx-auto mb-4" />
              <h4 className="font-bold text-gray-900 mb-2">Queue is empty</h4>
              <p className="text-gray-500 max-w-sm mx-auto">
                Tasks are added automatically when you perform actions in the pipeline. The Chrome Extension processes them in the background.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Task</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Lead</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Profile</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tasks.map((task: any) => (
                    <tr key={task.id} className="hover:bg-gray-50">
                      <td className="px-5 py-4">
                        <span className="font-medium text-gray-900 capitalize">{task.task_type?.replace(/_/g, ' ')}</span>
                      </td>
                      <td className="px-5 py-4 text-gray-600">{task.pipeline_lead_name || '—'}</td>
                      <td className="px-5 py-4 text-gray-600">{task.profile_name || '—'}</td>
                      <td className="px-5 py-4">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          task.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                          task.status === 'done' ? 'bg-green-100 text-green-700' :
                          task.status === 'failed' ? 'bg-red-100 text-red-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {task.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-400 text-xs">
                        {new Date(task.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODALS */}
      {showAddProfileModal && (
        <AddProfileModal
          platform={platform}
          onClose={() => setShowAddProfileModal(false)}
          onAdd={(name, username) => addProfileMutation.mutate({ name, username })}
        />
      )}
      {showAddLeadModal && activeProfileId && (
        <AddLeadModal
          profileId={activeProfileId}
          platform={platform}
          onClose={() => setShowAddLeadModal(false)}
          onAdd={(name, group, avatar) => addLeadMutation.mutate({ name, source_group: group, avatar_url: avatar })}
        />
      )}
    </div>
  );
}
