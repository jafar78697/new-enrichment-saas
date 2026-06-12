import React, { useState } from 'react';
import { Play, Video, Share2, Plus, Settings } from 'lucide-react';

export default function ReelGeneration() {
  const [activeTab, setActiveTab] = useState<'studio' | 'scenes' | 'crm'>('studio');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const [platforms, setPlatforms] = useState({
    youtube: true,
    instagram: false,
    facebook: false,
    linkedin: false
  });

  const handleGenerate = () => {
    if (!prompt) return;
    setIsGenerating(true);
    setTimeout(() => setIsGenerating(false), 3000);
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
            {/* Left Panel: Prompt */}
            <div className="w-1/2 p-8 overflow-y-auto bg-white border-r border-gray-200 flex flex-col">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900">Script & Prompt Engine</h2>
                <p className="text-sm text-gray-500 mt-1">Write your scene description. Veo 3 will generate a 9:16 vertical video.</p>
              </div>
              <textarea 
                className="flex-1 w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-base resize-none shadow-sm"
                placeholder="E.g., A 30-second cinematic tour of a modern villa in Dubai with upbeat background music..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
              <button 
                className="mt-6 w-full bg-indigo-600 text-white font-semibold py-4 px-4 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg"
                onClick={handleGenerate}
                disabled={isGenerating || !prompt}
              >
                {isGenerating ? (
                  <span className="flex items-center gap-2"><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Rendering with Vertex AI...</span>
                ) : (
                  <span className="flex items-center gap-2"><Video className="w-5 h-5" /> Generate 9:16 Reel</span>
                )}
              </button>
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
                {Object.entries(platforms).map(([platform, active]) => (
                  <label key={platform} className={`flex items-center justify-between p-4 border rounded-xl cursor-pointer transition-colors ${active ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <div className="flex items-center gap-3">
                      <input 
                        type="checkbox" 
                        className="w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                        checked={active}
                        onChange={() => setPlatforms({...platforms, [platform]: !active})}
                      />
                      <span className="capitalize font-medium text-gray-900">{platform}</span>
                    </div>
                    {active && <span className="text-xs font-semibold text-indigo-600 bg-indigo-100 px-2 py-1 rounded-full">Connected</span>}
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
