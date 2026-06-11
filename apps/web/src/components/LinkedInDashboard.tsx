import React, { useState } from 'react';
import { Users, MessageCircle, Send, Flame, Clock, CheckCircle2, Search, Zap, ExternalLink } from 'lucide-react';

export default function LinkedInDashboard() {
  const [activeTab, setActiveTab] = useState<'pipeline' | 'campaigns' | 'queue'>('pipeline');

  // Placeholder data for the pipeline to demonstrate the UI
  const leads = {
    findAndMine: [
      { id: 1, name: 'Sarah Jenkins', title: 'CEO at TechFlow', followers: '4.2k', image: 'https://i.pravatar.cc/150?img=1' },
      { id: 2, name: 'Michael Chen', title: 'Founder @ ScaleUp', followers: '6.1k', image: 'https://i.pravatar.cc/150?img=11' },
      { id: 3, name: 'Emma Watson', title: 'Director of Sales', followers: '2.8k', image: 'https://i.pravatar.cc/150?img=5' }
    ],
    waitingAcceptance: [
      { id: 4, name: 'David Smith', title: 'VP Marketing, GrowthCo', timeSent: '2 hrs ago', image: 'https://i.pravatar.cc/150?img=8' },
      { id: 5, name: 'Jessica Alba', title: 'Head of Growth', timeSent: '1 day ago', image: 'https://i.pravatar.cc/150?img=9' }
    ],
    hotForOutreach: [
      { id: 6, name: 'John Doe', title: 'SaaS Founder', acceptedAt: '5 hours ago', image: 'https://i.pravatar.cc/150?img=15' },
      { id: 7, name: 'Alice Cooper', title: 'CEO at DataSync', acceptedAt: '6 hours ago', image: 'https://i.pravatar.cc/150?img=20' }
    ],
    activeConversations: [
      { id: 8, name: 'Robert Fox', title: 'CTO @ Nexa', lastMessage: 'That sounds interesting, can we...', unread: true, image: 'https://i.pravatar.cc/150?img=33' }
    ]
  };

  return (
    <div className="animate-fade-in space-y-8">
      {/* HEADER & TABS */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-indigo-600">
            LinkedIn Lead Gen Engine
          </h2>
          <p className="text-gray-500 text-sm mt-1">Execute the 80% Sales Rule framework. Hit your daily targets to scale inbound/outbound.</p>
        </div>
        
        <div className="flex bg-gray-100 p-1 rounded-xl shadow-inner">
          <button 
            onClick={() => setActiveTab('pipeline')}
            className={`px-5 py-2 text-sm font-semibold rounded-lg transition-all duration-300 ${activeTab === 'pipeline' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
          >
            Daily Pipeline
          </button>
          <button 
            onClick={() => setActiveTab('campaigns')}
            className={`px-5 py-2 text-sm font-semibold rounded-lg transition-all duration-300 ${activeTab === 'campaigns' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
          >
            Auto Campaigns
          </button>
          <button 
            onClick={() => setActiveTab('queue')}
            className={`px-5 py-2 text-sm font-semibold rounded-lg transition-all duration-300 ${activeTab === 'queue' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
          >
            Task Queue
          </button>
        </div>
      </div>

      {activeTab === 'pipeline' && (
        <>
          {/* DAILY TARGETS WIDGET */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-gradient-to-br from-white to-blue-50 p-6 rounded-2xl shadow-sm border border-blue-100 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-200 rounded-bl-full opacity-20 group-hover:scale-110 transition-transform duration-500"></div>
              <div className="flex items-center justify-between mb-4 relative z-10">
                <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
                  <Users className="w-6 h-6" />
                </div>
                <span className="text-2xl font-bold text-gray-800">12<span className="text-gray-400 text-lg">/20</span></span>
              </div>
              <h3 className="font-bold text-gray-900">Connection Requests</h3>
              <p className="text-xs text-gray-500 mt-1 mb-3">Send to C-List prospects under 7K followers.</p>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full transition-all duration-1000" style={{ width: '60%' }}></div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-white to-purple-50 p-6 rounded-2xl shadow-sm border border-purple-100 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-purple-200 rounded-bl-full opacity-20 group-hover:scale-110 transition-transform duration-500"></div>
              <div className="flex items-center justify-between mb-4 relative z-10">
                <div className="p-3 bg-purple-100 text-purple-600 rounded-xl">
                  <Flame className="w-6 h-6" />
                </div>
                <span className="text-2xl font-bold text-gray-800">4<span className="text-gray-400 text-lg">/10</span></span>
              </div>
              <h3 className="font-bold text-gray-900">Influencer Engagement</h3>
              <p className="text-xs text-gray-500 mt-1 mb-3">Meaningful comments on A/B list profiles.</p>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-purple-600 h-2 rounded-full transition-all duration-1000" style={{ width: '40%' }}></div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-white to-green-50 p-6 rounded-2xl shadow-sm border border-green-100 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-green-200 rounded-bl-full opacity-20 group-hover:scale-110 transition-transform duration-500"></div>
              <div className="flex items-center justify-between mb-4 relative z-10">
                <div className="p-3 bg-green-100 text-green-600 rounded-xl">
                  <Send className="w-6 h-6" />
                </div>
                <span className="text-2xl font-bold text-gray-800">8<span className="text-gray-400 text-lg">/15</span></span>
              </div>
              <h3 className="font-bold text-gray-900">First Messages Sent</h3>
              <p className="text-xs text-gray-500 mt-1 mb-3">Wait 5-6 hours after request acceptance.</p>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-green-600 h-2 rounded-full transition-all duration-1000" style={{ width: '53%' }}></div>
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
              <Zap className="w-5 h-5 text-yellow-500 mr-2" />
              Today's Action Pipeline
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
                          <p className="text-xs text-gray-500 truncate">{lead.title}</p>
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-xs text-gray-500 mb-3">
                        <span>{lead.followers} followers</span>
                      </div>
                      <button className="w-full py-2 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-colors flex items-center justify-center">
                        Send Request
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* STAGE 2 */}
              <div className="bg-gray-50/50 rounded-2xl border border-gray-200 p-4 flex flex-col h-[500px]">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-bold text-gray-800 flex items-center text-sm">
                    <Clock className="w-4 h-4 mr-1.5 text-gray-500" /> Pending Accpt.
                  </h4>
                  <span className="bg-gray-200 text-gray-700 text-xs font-bold px-2 py-0.5 rounded-full">{leads.waitingAcceptance.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1">
                  {leads.waitingAcceptance.map(lead => (
                    <div key={lead.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all">
                      <div className="flex items-center gap-3 mb-3">
                        <img src={lead.image} alt={lead.name} className="w-10 h-10 rounded-full bg-gray-100 object-cover opacity-70" />
                        <div>
                          <h5 className="font-bold text-sm text-gray-700">{lead.name}</h5>
                          <p className="text-xs text-gray-400 truncate">{lead.title}</p>
                        </div>
                      </div>
                      <div className="flex items-center text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded w-fit">
                        <Clock className="w-3 h-3 mr-1" /> Sent {lead.timeSent}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* STAGE 3 */}
              <div className="bg-orange-50/40 rounded-2xl border border-orange-100 p-4 flex flex-col h-[500px]">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-bold text-gray-800 flex items-center text-sm">
                    <Flame className="w-4 h-4 mr-1.5 text-orange-500" /> Hot for Outreach
                  </h4>
                  <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">{leads.hotForOutreach.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1">
                  {leads.hotForOutreach.map(lead => (
                    <div key={lead.id} className="bg-white p-4 rounded-xl shadow-sm border border-orange-200 hover:shadow-md hover:border-orange-300 transition-all relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-orange-400"></div>
                      <div className="flex items-center gap-3 mb-3">
                        <img src={lead.image} alt={lead.name} className="w-10 h-10 rounded-full bg-gray-100 object-cover" />
                        <div>
                          <h5 className="font-bold text-sm text-gray-900">{lead.name}</h5>
                          <p className="text-xs text-green-600 font-medium">Accepted {lead.acceptedAt}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <button className="w-full py-1.5 bg-gray-100 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-200 transition-colors flex items-center justify-center">
                          <ExternalLink className="w-3 h-3 mr-1" /> Like/Comment Profile
                        </button>
                        <button className="w-full py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg text-xs font-bold hover:shadow-lg transition-all flex items-center justify-center shadow-orange-500/20 shadow-md">
                          <Send className="w-3 h-3 mr-1" /> Send 1st Message
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* STAGE 4 */}
              <div className="bg-green-50/40 rounded-2xl border border-green-100 p-4 flex flex-col h-[500px]">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-bold text-gray-800 flex items-center text-sm">
                    <MessageCircle className="w-4 h-4 mr-1.5 text-green-500" /> Active Conv.
                  </h4>
                  <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">{leads.activeConversations.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1">
                  {leads.activeConversations.map(lead => (
                    <div key={lead.id} className="bg-white p-4 rounded-xl shadow-sm border border-green-200 hover:shadow-md transition-all relative">
                      {lead.unread && <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 border-2 border-white rounded-full"></span>}
                      <div className="flex items-center gap-3 mb-2">
                        <img src={lead.image} alt={lead.name} className="w-10 h-10 rounded-full bg-gray-100 object-cover" />
                        <div>
                          <h5 className="font-bold text-sm text-gray-900">{lead.name}</h5>
                          <p className="text-xs text-gray-500 truncate">{lead.title}</p>
                        </div>
                      </div>
                      <div className="bg-gray-50 p-2 rounded-lg text-xs text-gray-600 mb-3 italic">
                        "{lead.lastMessage}"
                      </div>
                      <button className="w-full py-2 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 transition-colors flex items-center justify-center">
                        Reply & Close
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
          <h3 className="text-xl font-bold text-gray-900 mb-2">Automated LinkedIn Campaigns</h3>
          <p className="text-gray-500 max-w-lg mx-auto">
            Configure fully automated campaigns to send requests, view profiles, and send follow-ups while you sleep.
            This section connects with your background Chrome Extension.
          </p>
          <button className="mt-6 px-6 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-500/20 transition-all">
            Create New Campaign
          </button>
        </div>
      )}

      {activeTab === 'queue' && (
        <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm text-center">
          <Clock className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">Task Queue</h3>
          <p className="text-gray-500 max-w-lg mx-auto">
            View all background tasks queued up for your LinkedIn extension.
          </p>
          <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-100 text-sm text-gray-400">
            No tasks currently in the queue.
          </div>
        </div>
      )}
    </div>
  );
}
