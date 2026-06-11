import React, { useState } from 'react';
import { Users, MessageCircle, Send, Flame, Clock, Search, ExternalLink, ThumbsUp, PlusCircle, CheckCircle2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import callsApi from '../services/callsApi';

export default function FacebookDashboard() {
  const [activeTab, setActiveTab] = useState<'pipeline' | 'campaigns' | 'queue'>('pipeline');
  const [activeProfile, setActiveProfile] = useState<string>('Profile 1 (Main)');
  const [showAddProfileModal, setShowAddProfileModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', 'social'],
    queryFn: () => callsApi.listContacts()
  });

  const realSocialLeads = data?.contacts?.filter(c => c.omnichannel_stage === 'social') || [];

  // Dummy profile names for the selector
  const profiles = [
    'Profile 1 (Main)', 'Profile 2 (USA)', 'Profile 3 (Sales)', 
    'Profile 4 (Outreach)', 'Profile 5 (Network)'
  ];

  // Placeholder data + Real DB Leads mixed for the pipeline
  const leads = {
    findAndMine: [
      ...realSocialLeads.map(l => ({
        id: l.id,
        name: l.name,
        group: l.company || l.niche_name || 'Passed from Email/Calls',
        engagement: 'New',
        image: `https://ui-avatars.com/api/?name=${encodeURIComponent(l.name)}&background=random`
      })),
      { id: 10001, name: 'Jason Miller', group: 'SaaS Founders', engagement: 'High', image: 'https://i.pravatar.cc/150?img=12' },
      { id: 10002, name: 'Amanda Clarke', group: 'B2B Lead Gen', engagement: 'Medium', image: 'https://i.pravatar.cc/150?img=16' },
      { id: 10003, name: 'Chris Wong', group: 'Agency Scaling', engagement: 'High', image: 'https://i.pravatar.cc/150?img=11' }
    ],
    engagedPending: [
      { id: 10004, name: 'Sarah Connor', status: 'Commented on Post', timeAgo: '2 hrs ago', image: 'https://i.pravatar.cc/150?img=5' },
      { id: 10005, name: 'Daniel Craig', status: 'Request Sent', timeAgo: '1 day ago', image: 'https://i.pravatar.cc/150?img=8' }
    ],
    hotForDm: [
      { id: 10006, name: 'Emily Rose', acceptedAt: '5 hours ago', source: 'Group Comment', image: 'https://i.pravatar.cc/150?img=9' },
      { id: 10007, name: 'Mark Tyson', acceptedAt: '6 hours ago', source: 'Influencer Post', image: 'https://i.pravatar.cc/150?img=15' }
    ],
    activeConversations: [
      { id: 10008, name: 'Natalie Portman', lastMessage: 'Sure, I would love to learn more.', unread: true, image: 'https://i.pravatar.cc/150?img=20' },
      { id: 10009, name: 'Bruce Wayne', lastMessage: 'What is the pricing model?', unread: false, image: 'https://i.pravatar.cc/150?img=33' }
    ]
  };

  return (
    <div className="animate-fade-in space-y-8">
      {/* HEADER & TABS */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#1877F2] to-[#E1306C]">
            Meta Outreach Engine
          </h2>
          <p className="text-gray-500 text-sm mt-1">Manage Facebook & Instagram organic growth across multiple profiles.</p>
        </div>
        
        <div className="flex bg-gray-100 p-1 rounded-xl shadow-inner">
          <button 
            onClick={() => setActiveTab('pipeline')}
            className={`px-5 py-2 text-sm font-semibold rounded-lg transition-all duration-300 ${activeTab === 'pipeline' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
          >
            Daily Pipeline
          </button>
          <button 
            onClick={() => setActiveTab('campaigns')}
            className={`px-5 py-2 text-sm font-semibold rounded-lg transition-all duration-300 ${activeTab === 'campaigns' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
          >
            Auto Campaigns
          </button>
          <button 
            onClick={() => setActiveTab('queue')}
            className={`px-5 py-2 text-sm font-semibold rounded-lg transition-all duration-300 ${activeTab === 'queue' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
          >
            Task Queue
          </button>
        </div>
      </div>

      {activeTab === 'pipeline' && (
        <>
          {/* MULTI-PROFILE SELECTOR */}
          <div className="flex items-center gap-3 overflow-x-auto pb-2 custom-scrollbar">
            <span className="text-sm font-bold text-gray-700 whitespace-nowrap">Active Identity:</span>
            {profiles.map(profile => (
              <button
                key={profile}
                onClick={() => setActiveProfile(profile)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap border ${
                  activeProfile === profile 
                    ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20' 
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {profile}
              </button>
            ))}
            <button 
              onClick={() => setShowAddProfileModal(true)}
              className="px-3 py-1.5 rounded-full text-sm font-medium text-gray-500 bg-gray-100 border border-gray-200 border-dashed hover:bg-gray-200 flex items-center transition-colors">
              <PlusCircle className="w-4 h-4 mr-1" /> Add Profile
            </button>
          </div>

          {/* ADD PROFILE MODAL */}
          {showAddProfileModal && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center animate-fade-in">
              <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
                <button 
                  onClick={() => setShowAddProfileModal(false)}
                  className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Connect New Meta Profile</h3>
                <p className="text-gray-600 text-sm mb-6">
                  Jento AI uses your Chrome Extension to securely link and manage multiple Meta profiles without getting banned.
                </p>
                <div className="space-y-4 mb-8">
                  <div className="flex gap-3 text-sm text-gray-700">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">1</span>
                    <p>Open a <b>new Chrome Profile</b> (Click your face icon top right in Chrome &gt; Add).</p>
                  </div>
                  <div className="flex gap-3 text-sm text-gray-700">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">2</span>
                    <p>Log in to your secondary Facebook/Instagram account.</p>
                  </div>
                  <div className="flex gap-3 text-sm text-gray-700">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">3</span>
                    <p>Install and open the <b>Jento AI Chrome Extension</b> in that new profile, and click <b>Connect Profile</b>.</p>
                  </div>
                </div>
                <div className="bg-blue-50 text-blue-800 p-3 rounded-lg text-xs font-medium text-center border border-blue-100">
                  Once connected via the extension, the profile will automatically appear in this dashboard!
                </div>
                <button 
                  onClick={() => setShowAddProfileModal(false)}
                  className="w-full mt-6 py-2.5 bg-gray-900 text-white rounded-xl font-semibold hover:bg-gray-800 transition-colors"
                >
                  Got it
                </button>
              </div>
            </div>
          )}

          {/* DAILY TARGETS WIDGET */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-gradient-to-br from-white to-blue-50 p-6 rounded-2xl shadow-sm border border-blue-100 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-200 rounded-bl-full opacity-20 group-hover:scale-110 transition-transform duration-500"></div>
              <div className="flex items-center justify-between mb-4 relative z-10">
                <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
                  <ThumbsUp className="w-6 h-6" />
                </div>
                <span className="text-2xl font-bold text-gray-800">45<span className="text-gray-400 text-lg">/100</span></span>
              </div>
              <h3 className="font-bold text-gray-900">Likes & Comments</h3>
              <p className="text-xs text-gray-500 mt-1 mb-3">Engage on A/B list influencer posts & groups.</p>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full transition-all duration-1000" style={{ width: '45%' }}></div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-white to-purple-50 p-6 rounded-2xl shadow-sm border border-purple-100 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-purple-200 rounded-bl-full opacity-20 group-hover:scale-110 transition-transform duration-500"></div>
              <div className="flex items-center justify-between mb-4 relative z-10">
                <div className="p-3 bg-purple-100 text-purple-600 rounded-xl">
                  <Users className="w-6 h-6" />
                </div>
                <span className="text-2xl font-bold text-gray-800">12<span className="text-gray-400 text-lg">/15</span></span>
              </div>
              <h3 className="font-bold text-gray-900">Friend Requests & DMs</h3>
              <p className="text-xs text-gray-500 mt-1 mb-3">Target C-list profiles. Always comment first.</p>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-purple-600 h-2 rounded-full transition-all duration-1000" style={{ width: '80%' }}></div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-white to-pink-50 p-6 rounded-2xl shadow-sm border border-pink-100 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-pink-200 rounded-bl-full opacity-20 group-hover:scale-110 transition-transform duration-500"></div>
              <div className="flex items-center justify-between mb-4 relative z-10">
                <div className="p-3 bg-pink-100 text-pink-600 rounded-xl">
                  <Search className="w-6 h-6" />
                </div>
                <span className="text-2xl font-bold text-gray-800">4<span className="text-gray-400 text-lg">/13</span></span>
              </div>
              <h3 className="font-bold text-gray-900">Group Joins/Posts</h3>
              <p className="text-xs text-gray-500 mt-1 mb-3">Join or post in highly engaged FB groups.</p>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-pink-600 h-2 rounded-full transition-all duration-1000" style={{ width: '30%' }}></div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-white to-orange-50 p-6 rounded-2xl shadow-sm border border-orange-100 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-orange-200 rounded-bl-full opacity-20 group-hover:scale-110 transition-transform duration-500"></div>
              <div className="flex items-center justify-between mb-4 relative z-10">
                <div className="p-3 bg-orange-100 text-orange-600 rounded-xl">
                  <Flame className="w-6 h-6" />
                </div>
                <span className="text-2xl font-bold text-gray-800">0<span className="text-gray-400 text-lg">/2</span></span>
              </div>
              <h3 className="font-bold text-gray-900">Weekly Content Post</h3>
              <p className="text-xs text-gray-500 mt-1 mb-3">Schedule 2 high-value posts per profile weekly.</p>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-orange-600 h-2 rounded-full transition-all duration-1000" style={{ width: '0%' }}></div>
              </div>
            </div>
          </div>

          {/* KANBAN BOARD / PIPELINE */}
          <div className="mt-10">
            <h3 className="text-xl font-bold text-gray-900 flex items-center mb-6">
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100 text-blue-600 mr-3">
                <Search className="w-4 h-4" />
              </span>
              Pipeline for {activeProfile}
            </h3>
            
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              
              {/* STAGE 1 */}
              <div className="bg-gray-50/50 rounded-2xl border border-gray-200 p-4 flex flex-col h-[500px]">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-bold text-gray-800 flex items-center text-sm">
                    <Search className="w-4 h-4 mr-1.5 text-blue-500" /> Find & Mine
                  </h4>
                  <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">{leads.findAndMine.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1">
                  {leads.findAndMine.map(lead => (
                    <div key={lead.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-200 transition-all group">
                      <div className="flex items-center gap-3 mb-3">
                        <img src={lead.image} alt={lead.name} className="w-10 h-10 rounded-full bg-gray-100 object-cover" />
                        <div>
                          <h5 className="font-bold text-sm text-gray-900">{lead.name}</h5>
                          <p className="text-xs text-gray-500 truncate">{lead.group}</p>
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-xs text-gray-500 mb-3">
                        <span className="bg-gray-100 px-2 py-1 rounded text-gray-600 font-medium">Eng: {lead.engagement}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button className="py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-colors">
                          Like/Comment
                        </button>
                        <button className="py-1.5 bg-blue-50 border border-blue-100 rounded-lg text-xs font-bold text-blue-600 hover:bg-blue-100 transition-colors">
                          Add Friend
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* STAGE 2 */}
              <div className="bg-gray-50/50 rounded-2xl border border-gray-200 p-4 flex flex-col h-[500px]">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-bold text-gray-800 flex items-center text-sm">
                    <Clock className="w-4 h-4 mr-1.5 text-gray-500" /> Engaged / Pending
                  </h4>
                  <span className="bg-gray-200 text-gray-700 text-xs font-bold px-2 py-0.5 rounded-full">{leads.engagedPending.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1">
                  {leads.engagedPending.map(lead => (
                    <div key={lead.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all">
                      <div className="flex items-center gap-3 mb-3">
                        <img src={lead.image} alt={lead.name} className="w-10 h-10 rounded-full bg-gray-100 object-cover opacity-80" />
                        <div>
                          <h5 className="font-bold text-sm text-gray-700">{lead.name}</h5>
                          <p className="text-xs text-gray-400 truncate">{lead.status}</p>
                        </div>
                      </div>
                      <div className="flex items-center text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded w-fit">
                        <Clock className="w-3 h-3 mr-1" /> {lead.timeAgo}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* STAGE 3 */}
              <div className="bg-pink-50/40 rounded-2xl border border-pink-100 p-4 flex flex-col h-[500px]">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-bold text-gray-800 flex items-center text-sm">
                    <Flame className="w-4 h-4 mr-1.5 text-pink-500" /> Hot for DM
                  </h4>
                  <span className="bg-pink-100 text-pink-700 text-xs font-bold px-2 py-0.5 rounded-full">{leads.hotForDm.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1">
                  {leads.hotForDm.map(lead => (
                    <div key={lead.id} className="bg-white p-4 rounded-xl shadow-sm border border-pink-200 hover:shadow-md hover:border-pink-300 transition-all relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-pink-400"></div>
                      <div className="flex items-center gap-3 mb-3">
                        <img src={lead.image} alt={lead.name} className="w-10 h-10 rounded-full bg-gray-100 object-cover" />
                        <div>
                          <h5 className="font-bold text-sm text-gray-900">{lead.name}</h5>
                          <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">{lead.source}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs text-green-600 font-medium bg-green-50 px-2 py-1 rounded inline-block w-full text-center mb-1">
                          Accepted {lead.acceptedAt}
                        </p>
                        <button className="w-full py-2 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-lg text-xs font-bold hover:shadow-lg transition-all flex items-center justify-center shadow-pink-500/20 shadow-md">
                          <Send className="w-3 h-3 mr-1" /> Send 1st Message
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* STAGE 4 */}
              <div className="bg-[#1877F2]/5 rounded-2xl border border-[#1877F2]/20 p-4 flex flex-col h-[500px]">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-bold text-gray-800 flex items-center text-sm">
                    <MessageCircle className="w-4 h-4 mr-1.5 text-[#1877F2]" /> Active Conv.
                  </h4>
                  <span className="bg-[#1877F2]/10 text-[#1877F2] text-xs font-bold px-2 py-0.5 rounded-full">{leads.activeConversations.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1">
                  {leads.activeConversations.map(lead => (
                    <div key={lead.id} className="bg-white p-4 rounded-xl shadow-sm border border-[#1877F2]/20 hover:shadow-md transition-all relative">
                      {lead.unread && <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 border-2 border-white rounded-full"></span>}
                      <div className="flex items-center gap-3 mb-2">
                        <img src={lead.image} alt={lead.name} className="w-10 h-10 rounded-full bg-gray-100 object-cover" />
                        <div>
                          <h5 className="font-bold text-sm text-gray-900">{lead.name}</h5>
                        </div>
                      </div>
                      <div className="bg-gray-50 p-2 rounded-lg text-xs text-gray-600 mb-3 italic border border-gray-100">
                        "{lead.lastMessage}"
                      </div>
                      <button className="w-full py-2 bg-[#1877F2] text-white rounded-lg text-xs font-bold hover:bg-[#166FE5] transition-colors flex items-center justify-center shadow-sm">
                        Reply in Messenger
                      </button>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </>
      )}

      {activeTab === 'campaigns' && (
        <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm text-center">
          <Flame className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">Automated Meta Campaigns</h3>
          <p className="text-gray-500 max-w-lg mx-auto mb-6">
            Configure fully automated campaigns to send requests, view profiles, and send follow-ups while you sleep.
            This section connects with your background Chrome Extension.
          </p>
          
          <div className="flex items-center justify-center gap-4 bg-yellow-50 text-yellow-800 p-4 rounded-xl border border-yellow-200 max-w-2xl mx-auto mb-6">
             <div className="font-medium text-sm">
               ⚠️ Note: Meta imposes strict 24-hour limits on automated actions. We strongly recommend manual prospecting using the Pipeline for higher conversions.
             </div>
          </div>

          <button className="px-6 py-2.5 bg-[#1877F2] text-white font-semibold rounded-xl hover:bg-[#166FE5] hover:shadow-lg transition-all">
            Create New Campaign
          </button>
        </div>
      )}

      {activeTab === 'queue' && (
        <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm text-center">
          <Clock className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">Task Queue</h3>
          <p className="text-gray-500 max-w-lg mx-auto">
            View all background tasks queued up for your Meta extension.
          </p>
          <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-100 text-sm text-gray-400">
            No tasks currently in the queue for {activeProfile}.
          </div>
        </div>
      )}
    </div>
  );
}
