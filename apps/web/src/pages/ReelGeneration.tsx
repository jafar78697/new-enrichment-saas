import React, { useState, useEffect } from 'react';
import { Play, Video, Share2, Plus, Settings } from 'lucide-react';
import { aiMediaApi, socialApi } from '../services/api';
import { toast } from 'sonner';

export default function ReelGeneration() {
  const [activeTab, setActiveTab] = useState<'studio' | 'scenes' | 'crm'>('studio');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [mediaAssets, setMediaAssets] = useState<any[]>([]);
  const [messages, setMessages] = useState([
    { role: 'ai', content: 'Hello! I am your Veo 3 Reel Generation Assistant. Describe the video you want to create, and I will generate the script, voiceover, and visual scenes for you.' }
  ]);

  const [platforms, setPlatforms] = useState({
    linkedin: false,
    instagram: false,
    facebook: false
  });

  const [connectedYouTubeAccounts, setConnectedYouTubeAccounts] = useState<any[]>([]);
  const [selectedYouTubeChannels, setSelectedYouTubeChannels] = useState<string[]>([]);
  const [channelToDelete, setChannelToDelete] = useState<string | null>(null);

  const [publishForm, setPublishForm] = useState({
    selectedAssetId: '',
    title: '',
    description: ''
  });

  // Fetch assets and connected accounts on load
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [assetsRes, accountsRes] = await Promise.all([
        aiMediaApi.getMediaAssets(),
        socialApi.getAccounts()
      ]);
      setMediaAssets(assetsRes.data.assets || []);
      
      const accs = accountsRes.data;
      setConnectedYouTubeAccounts(accs.youtube || []);
      // Auto-select all connected channels by default
      if (accs.youtube && accs.youtube.length > 0) {
        setSelectedYouTubeChannels(accs.youtube.map((c: any) => c.channel_id));
      }
      setPlatforms(prev => ({
        ...prev,
        linkedin: accs.linkedin?.length > 0,
      }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleConnectYouTube = () => {
    // Read from Vite environment variables, fallback to default if not set
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '1071909841111-sfa36eroerh8ggr58cu6v7upcvop380g.apps.googleusercontent.com';
    const redirectUri = `${window.location.origin}/auth/youtube/callback`;
    const scope = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly';
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;
  };

  const handleConnectLinkedIn = () => {
    const clientId = 'LINKEDIN_CLIENT_ID'; // Will need actual client id
    const redirectUri = `${window.location.origin}/auth/linkedin/callback`;
    const scope = 'w_member_social profile openid';
    window.location.href = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;
  };

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim()) return;
    
    const userMsg = prompt.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setPrompt('');
    setIsGenerating(true);
    
    setMessages(prev => [...prev, { role: 'ai', content: 'Got it! I am writing the script and generating the 9:16 vertical video using Vertex AI (Veo 3). This may take a few moments...' }]);

    try {
      const res = await aiMediaApi.generateVideo(userMsg);
      setIsGenerating(false);
      setGeneratedVideoUrl(res.data.videoUrl);
      setMessages(prev => [...prev, { role: 'ai', content: 'Your video is ready! You can preview it on the right.' }]);
      fetchData(); // Refresh assets
    } catch (err) {
      setIsGenerating(false);
      toast.error('Failed to generate video');
      setMessages(prev => [...prev, { role: 'ai', content: 'Sorry, I encountered an error while generating the video.' }]);
    }
  };

  const handlePublish = async () => {
    const selectedPlatforms = Object.entries(platforms).filter(([k, v]) => v).map(([k]) => k);
    if (!publishForm.selectedAssetId || selectedPlatforms.length === 0) {
      toast.error('Please select a video and at least one platform');
      return;
    }
    try {
      toast.info('Publishing to selected platforms...');
      
      const publishPlatforms = [...selectedPlatforms];
      if (selectedYouTubeChannels.length > 0) {
        publishPlatforms.push('youtube');
      }

      const res = await socialApi.publish({
        assetId: publishForm.selectedAssetId,
        platforms: publishPlatforms,
        youtubeChannelIds: selectedYouTubeChannels,
        title: publishForm.title,
        text: publishForm.description
      });
      toast.success('Publish request completed');
      console.log('Platform status:', res.data.platformStatus);
    } catch (err) {
      toast.error('Failed to publish');
    }
  };

  const handleDisconnectYouTube = async (channelId: string) => {
    try {
      await socialApi.disconnectYouTube(channelId);
      toast.success('Channel disconnected');
      setChannelToDelete(null);
      fetchData(); // refresh
    } catch (err) {
      toast.error('Failed to disconnect channel. The backend endpoint might not be fully implemented yet.');
      setChannelToDelete(null);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white relative">
      <div className="p-6 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Video className="w-6 h-6 text-indigo-600" />
            Reel Generation Studio
          </h1>
          <p className="mt-1 text-sm text-gray-500">Vertex AI powered vertical video creator for YouTube Shorts, IG Reels & LinkedIn.</p>
        </div>
        
        {/* Tabs inside Header */}
        <div className="flex bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('studio')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
              activeTab === 'studio' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Video className="w-4 h-4" /> Generate Reels
          </button>
          <button
            onClick={() => setActiveTab('scenes')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
              activeTab === 'scenes' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Play className="w-4 h-4" /> Library
          </button>
          <button
            onClick={() => setActiveTab('crm')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
              activeTab === 'crm' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Share2 className="w-4 h-4" /> Publish
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto bg-gray-50 relative">
        {activeTab === 'studio' && (
          <div className="absolute inset-0 flex">
            {/* Left Panel: LLM Chatbot Interface */}
            <div className="w-1/2 overflow-hidden bg-white border-r border-gray-200 flex flex-col">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                    AI Studio Assistant
                  </h2>
                  <p className="text-xs text-gray-500 mt-1">Powered by Gemini & Veo 3</p>
                </div>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'ai' && (
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                        <Video className="w-4 h-4 text-indigo-600" />
                      </div>
                    )}
                    <div className={`max-w-[80%] rounded-2xl p-4 text-sm ${
                      msg.role === 'user' 
                        ? 'bg-indigo-600 text-white rounded-br-none shadow-sm' 
                        : 'bg-gray-100 text-gray-800 rounded-bl-none'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {isGenerating && (
                  <div className="flex gap-4 justify-start">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                      <Video className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div className="max-w-[80%] rounded-2xl p-4 text-sm bg-gray-100 text-gray-800 rounded-bl-none flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                      Generating video...
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Input */}
              <div className="p-6 bg-white border-t border-gray-100">
                <form onSubmit={handleGenerate} className="relative flex items-center">
                  <textarea 
                    className="w-full pl-4 pr-14 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm resize-none shadow-sm h-[60px] flex items-center"
                    placeholder="Type your prompt here..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleGenerate();
                      }
                    }}
                  />
                  <button 
                    type="submit"
                    className="absolute right-2 w-10 h-10 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center shadow-md"
                    disabled={isGenerating || !prompt.trim()}
                  >
                    <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                  </button>
                </form>
                <p className="text-center text-xs text-gray-400 mt-3">Shift + Enter to add a new line. The AI will write the script and create the video.</p>
              </div>
            </div>

            {/* Right Panel: Preview (Mobile Device Frame) */}
            <div className="w-1/2 p-8 flex items-center justify-center bg-[#0B0F19]">
              <div className="relative w-[320px] h-[640px] bg-black rounded-[3rem] border-[8px] border-gray-800 shadow-2xl overflow-hidden flex flex-col">
                {/* Mobile Notch */}
                <div className="absolute top-0 inset-x-0 h-6 bg-gray-800 rounded-b-xl w-32 mx-auto z-10" />
                
                {isGenerating ? (
                  <div className="flex-1 flex flex-col items-center justify-center bg-gray-900">
                    <Video className="w-12 h-12 text-indigo-400 mx-auto mb-4 animate-pulse" />
                    <p className="text-indigo-400 font-medium text-sm animate-pulse">Rendering Veo 3 output...</p>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center bg-gray-900 text-gray-500 p-6 text-center">
                    <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4">
                      <Play className="w-8 h-8 ml-1 opacity-50" />
                    </div>
                    <p className="text-sm">Preview</p>
                    <p className="text-xs mt-2 opacity-60">Automatically resized to 16:9, 1:1, or 9:16 using FFmpeg before publishing.</p>
                    {generatedVideoUrl && (
                      <video src={generatedVideoUrl} controls className="mt-4 rounded-xl max-w-full" />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'scenes' && (
          <div className="p-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold text-gray-900">Video Library</h2>
              <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                <Settings className="w-4 h-4" /> Filter
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {mediaAssets.filter(a => a.media_type === 'video').map((asset, i) => (
                <div key={asset.id || i} className="group relative rounded-xl border border-gray-200 overflow-hidden bg-white hover:shadow-md transition-all">
                  <div className="aspect-[9/16] bg-gray-100 flex items-center justify-center relative">
                    {asset.media_url ? (
                      <video src={asset.media_url} className="w-full h-full object-cover opacity-80" />
                    ) : (
                      <Play className="w-12 h-12 text-gray-300" />
                    )}
                    <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">Ready</div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-medium text-gray-900 truncate">{asset.title || `Generated Reel #${i+1}`}</h3>
                    <p className="text-sm text-gray-500 mt-1">{asset.generation_status}</p>
                  </div>
                </div>
              ))}
              {mediaAssets.length === 0 && (
                <p className="text-gray-500 col-span-full">No videos generated yet.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'crm' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-12 p-8 max-w-7xl mx-auto">
            <div className="space-y-6 bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Publish Settings</h2>
                <p className="text-sm text-gray-500 mt-1">Configure metadata and platform distribution.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Video</label>
                <select 
                  className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 p-2 border"
                  value={publishForm.selectedAssetId}
                  onChange={e => setPublishForm({...publishForm, selectedAssetId: e.target.value})}
                >
                  <option value="">-- Select a Video --</option>
                  {mediaAssets.filter(a => a.media_type === 'video').map(asset => (
                    <option key={asset.id} value={asset.id}>{asset.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Universal Title</label>
                <input type="text" className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 p-2 border" placeholder="e.g. Luxury Villa Tour #realestate" 
                  value={publishForm.title} onChange={e => setPublishForm({...publishForm, title: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description / Caption</label>
                <textarea className="w-full h-32 border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 p-2 border" placeholder="Write an engaging caption..."
                  value={publishForm.description} onChange={e => setPublishForm({...publishForm, description: e.target.value})} />
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Select Platforms</h3>
                <p className="text-sm text-gray-500 mt-1">Choose where to distribute this video.</p>
              </div>
              <div className="space-y-3">
                {/* YouTube Accounts Section */}
                <div className="p-4 border rounded-xl border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-900 flex items-center gap-2">
                      <span className="text-red-600">YouTube</span> Channels
                    </h4>
                    <button 
                      onClick={handleConnectYouTube}
                      className="text-xs font-semibold text-white bg-red-600 px-3 py-1.5 rounded hover:bg-red-700 transition-colors"
                    >
                      + Add Account
                    </button>
                  </div>
                  
                  {connectedYouTubeAccounts.length === 0 ? (
                    <p className="text-sm text-gray-500">No YouTube accounts connected.</p>
                  ) : (
                    <div className="space-y-2 mt-2">
                      {connectedYouTubeAccounts.map((yt: any) => (
                        <label key={yt.channel_id} className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${selectedYouTubeChannels.includes(yt.channel_id) ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                          <div className="flex items-center gap-3">
                            <input 
                              type="checkbox" 
                              className="w-4 h-4 text-red-600 rounded border-gray-300 focus:ring-red-500"
                              checked={selectedYouTubeChannels.includes(yt.channel_id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedYouTubeChannels(prev => [...prev, yt.channel_id]);
                                } else {
                                  setSelectedYouTubeChannels(prev => prev.filter(id => id !== yt.channel_id));
                                }
                              }}
                            />
                            {yt.channel_logo ? (
                              <img src={yt.channel_logo} alt={yt.channel_title} className="w-6 h-6 rounded-full object-cover shadow-sm border border-gray-200" />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center shadow-sm border border-red-200">
                                <span className="text-xs text-red-600 font-bold">{yt.channel_title?.charAt(0) || 'Y'}</span>
                              </div>
                            )}
                            <span className="font-medium text-sm text-gray-900">{yt.channel_title || 'Unknown Channel'}</span>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-xs text-gray-500">{yt.channel_id}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {['linkedin', 'instagram', 'facebook'].map((platform) => (
                  <label key={platform} className={`flex items-center justify-between p-4 border rounded-xl cursor-pointer transition-colors ${platforms[platform as keyof typeof platforms] ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <div className="flex items-center gap-3">
                      <input 
                        type="checkbox" 
                        className="w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                        checked={platforms[platform as keyof typeof platforms]}
                        onChange={() => {
                          if (platform === 'linkedin' && !platforms.linkedin) {
                             handleConnectLinkedIn();
                          } else {
                             setPlatforms({...platforms, [platform]: !platforms[platform as keyof typeof platforms]});
                          }
                        }}
                      />
                      <span className="capitalize font-medium text-gray-900">{platform}</span>
                    </div>
                    {platforms[platform as keyof typeof platforms] ? 
                      <span className="text-xs font-semibold text-indigo-600 bg-indigo-100 px-2 py-1 rounded-full">Connected</span> 
                      : (platform === 'linkedin' ? <span className="text-xs text-gray-500">Click to connect</span> : null)
                    }
                  </label>
                ))}
              </div>
              <button 
                className="w-full py-4 bg-gray-900 text-white font-bold rounded-xl hover:bg-gray-800 transition-colors shadow-sm flex justify-center items-center gap-2"
                onClick={handlePublish}
              >
                <Share2 className="w-5 h-5" />
                Publish to Selected Platforms
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
