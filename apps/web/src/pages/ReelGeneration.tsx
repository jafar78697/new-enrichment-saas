import React, { useState } from 'react';
import { Play, Video, Share2, Plus, Settings } from 'lucide-react';

export default function ReelGeneration() {
  const [activeTab, setActiveTab] = useState<'studio' | 'scenes' | 'crm'>('studio');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'ai', content: 'Hello! I am your Veo 3 Reel Generation Assistant. Describe the video you want to create, and I will generate the script, voiceover, and visual scenes for you.' }
  ]);

  const [platforms, setPlatforms] = useState({
    youtube: true,
    instagram: false,
    facebook: false,
    linkedin: false
  });

  const handleConnectYouTube = () => {
    // Exact same client ID and scopes as the old youtube automaion project
    const clientId = '1071909841111-sfa36eroerh8ggr58cu6v7upcvop380g.apps.googleusercontent.com';
    const redirectUri = `${window.location.origin}/auth/youtube/callback`;
    const scope = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly';
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;
    
    // Redirect to Google Consent screen
    window.location.href = url;
  };

  const handleGenerate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim()) return;
    
    // Add user message
    const userMsg = prompt.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setPrompt('');
    setIsGenerating(true);

    // Simulate AI thinking and generating
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'ai', content: 'Got it! I am writing the script and generating the 9:16 vertical video using Vertex AI (Veo 3). This may take a few moments...' }]);
    }, 500);

    setTimeout(() => {
      setIsGenerating(false);
      setMessages(prev => [...prev, { role: 'ai', content: 'Your video is ready! You can preview it on the right. If you want to make any changes, just let me know.' }]);
    }, 4000);
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
            <Video className="w-4 h-4" /> Studio
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
              {[1, 2, 3].map(i => (
                <div key={i} className="group relative rounded-xl border border-gray-200 overflow-hidden bg-white hover:shadow-md transition-all">
                  <div className="aspect-[9/16] bg-gray-100 flex items-center justify-center relative">
                    <Play className="w-12 h-12 text-gray-300" />
                    <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">0:30</div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-medium text-gray-900 truncate">Generated Reel #{i}</h3>
                    <p className="text-sm text-gray-500 mt-1">Ready to publish</p>
                  </div>
                </div>
              ))}
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
                <select className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500">
                  <option>Generated Reel #1</option>
                  <option>Generated Reel #2</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Universal Title</label>
                <input type="text" className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500" placeholder="e.g. Luxury Villa Tour #realestate" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description / Caption</label>
                <textarea className="w-full h-32 border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500" placeholder="Write an engaging caption..." />
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Select Platforms</h3>
                <p className="text-sm text-gray-500 mt-1">Choose where to distribute this video.</p>
              </div>
              <div className="space-y-3">
                <div className={`flex items-center justify-between p-4 border rounded-xl transition-colors ${platforms.youtube ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <div className="flex items-center gap-3">
                    <input 
                      type="checkbox" 
                      className="w-5 h-5 text-red-600 rounded border-gray-300 focus:ring-red-500"
                      checked={platforms.youtube}
                      onChange={() => {
                        if (!platforms.youtube) {
                          handleConnectYouTube();
                        } else {
                          setPlatforms({...platforms, youtube: false});
                        }
                      }}
                    />
                    <span className="capitalize font-medium text-gray-900">YouTube</span>
                  </div>
                  {platforms.youtube ? (
                    <span className="text-xs font-semibold text-red-600 bg-red-100 px-2 py-1 rounded-full">Connected</span>
                  ) : (
                    <button 
                      onClick={handleConnectYouTube}
                      className="text-xs font-semibold text-white bg-red-600 px-3 py-1.5 rounded hover:bg-red-700 transition-colors"
                    >
                      Connect Account
                    </button>
                  )}
                </div>

                {['instagram', 'facebook', 'linkedin'].map((platform) => (
                  <label key={platform} className={`flex items-center justify-between p-4 border rounded-xl cursor-pointer transition-colors ${platforms[platform as keyof typeof platforms] ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <div className="flex items-center gap-3">
                      <input 
                        type="checkbox" 
                        className="w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                        checked={platforms[platform as keyof typeof platforms]}
                        onChange={() => setPlatforms({...platforms, [platform]: !platforms[platform as keyof typeof platforms]})}
                      />
                      <span className="capitalize font-medium text-gray-900">{platform}</span>
                    </div>
                    {platforms[platform as keyof typeof platforms] && <span className="text-xs font-semibold text-indigo-600 bg-indigo-100 px-2 py-1 rounded-full">Connected</span>}
                  </label>
                ))}
              </div>
              <button className="w-full py-4 bg-gray-900 text-white font-bold rounded-xl hover:bg-gray-800 transition-colors shadow-sm flex justify-center items-center gap-2">
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
