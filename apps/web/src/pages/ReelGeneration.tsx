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
    <div className="max-w-7xl mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Reel Generation & CRM</h1>
        <p className="mt-2 text-gray-600">Generate videos with AI and publish them across YouTube, Instagram, Facebook, and LinkedIn.</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-8">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('studio')}
            className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === 'studio' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Video className="w-4 h-4" />
            AI Studio (Edit)
          </button>
          <button
            onClick={() => setActiveTab('scenes')}
            className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === 'scenes' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Play className="w-4 h-4" />
            Scenes & Videos
          </button>
          <button
            onClick={() => setActiveTab('crm')}
            className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === 'crm' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Share2 className="w-4 h-4" />
            Publish (CRM)
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 min-h-[600px]">
        {activeTab === 'studio' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="flex flex-col space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Video Prompt</h2>
                <p className="text-sm text-gray-500 mt-1">Describe what Veo 3 should generate.</p>
              </div>
              <textarea 
                className="w-full h-64 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="E.g., A 30-second cinematic tour of a modern villa in Dubai with upbeat background music..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
              <button 
                className="w-full bg-indigo-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                onClick={handleGenerate}
                disabled={isGenerating || !prompt}
              >
                {isGenerating ? 'Rendering with Vertex AI...' : 'Generate Reel'}
              </button>
            </div>
            <div className="bg-gray-50 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300 p-8">
              {isGenerating ? (
                <div className="text-center animate-pulse">
                  <Video className="w-12 h-12 text-indigo-400 mx-auto mb-4" />
                  <p className="text-indigo-600 font-medium">Generating preview...</p>
                </div>
              ) : (
                <div className="text-center">
                  <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Play className="w-8 h-8 text-gray-400 ml-1" />
                  </div>
                  <p className="text-gray-500">Your generated video will appear here.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'scenes' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Video Library</h2>
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div className="space-y-6">
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
