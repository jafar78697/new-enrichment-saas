import React, { useState, useEffect } from 'react';
import { Image as ImageIcon, MessageSquare, Share2 } from 'lucide-react';
import { aiMediaApi, socialApi } from '../services/api';
import { toast } from 'sonner';

export default function SocialPosts() {
  const [activeTab, setActiveTab] = useState<'create' | 'library'>('create');
  const [prompt, setPrompt] = useState('');
  const [type, setType] = useState<'text' | 'image'>('image');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedMedia, setGeneratedMedia] = useState<{text?: string, imageUrl?: string} | null>(null);
  
  const [mediaAssets, setMediaAssets] = useState<any[]>([]);
  
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await aiMediaApi.getMediaAssets();
      setMediaAssets(res.data.assets || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim()) return;
    
    setIsGenerating(true);
    setGeneratedMedia(null);
    try {
      if (type === 'text') {
        const res = await aiMediaApi.generateText(prompt, 'linkedin');
        setGeneratedMedia({ text: res.data.text });
      } else {
        const res = await aiMediaApi.generateImage(prompt);
        setGeneratedMedia({ imageUrl: res.data.imageUrl });
      }
      toast.success('Generated successfully!');
      fetchData();
    } catch (err) {
      toast.error('Failed to generate');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white">
      <div className="p-6 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-indigo-600" />
            Social Media Studio
          </h1>
          <p className="mt-1 text-sm text-gray-500">Generate engaging text posts and images for LinkedIn, Facebook, and Instagram.</p>
        </div>
        
        <div className="flex bg-gray-100 p-1 rounded-lg">
          <button onClick={() => setActiveTab('create')} className={`px-4 py-2 text-sm font-medium rounded-md flex items-center gap-2 ${activeTab === 'create' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600'}`}>Create</button>
          <button onClick={() => setActiveTab('library')} className={`px-4 py-2 text-sm font-medium rounded-md flex items-center gap-2 ${activeTab === 'library' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600'}`}>Library</button>
        </div>
      </div>

      <div className="p-8 flex-1 overflow-auto bg-gray-50">
        {activeTab === 'create' && (
          <div className="max-w-4xl mx-auto flex gap-8">
            <div className="flex-1 bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold mb-4">What do you want to create?</h2>
              
              <div className="flex gap-4 mb-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="type" checked={type === 'text'} onChange={() => setType('text')} /> Text Post
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="type" checked={type === 'image'} onChange={() => setType('image')} /> Image
                </label>
              </div>

              <textarea 
                className="w-full h-40 p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 resize-none mb-4"
                placeholder={type === 'text' ? "E.g., Write a LinkedIn post about the benefits of AI in real estate..." : "E.g., A cinematic shot of a luxury modern office space..."}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
              />
              
              <button 
                className="w-full py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50"
                onClick={handleGenerate}
                disabled={isGenerating || !prompt}
              >
                {isGenerating ? 'Generating...' : 'Generate with AI'}
              </button>
            </div>

            <div className="flex-1 bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col items-center justify-center min-h-[400px]">
              {isGenerating ? (
                <div className="animate-pulse flex flex-col items-center">
                  <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                  <p className="text-gray-500">AI is working its magic...</p>
                </div>
              ) : generatedMedia ? (
                <div className="w-full text-left">
                  {generatedMedia.imageUrl ? (
                    <img src={generatedMedia.imageUrl} alt="Generated" className="rounded-xl w-full object-cover" />
                  ) : (
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 whitespace-pre-wrap">{generatedMedia.text}</div>
                  )}
                </div>
              ) : (
                <div className="text-gray-400 flex flex-col items-center">
                  <ImageIcon className="w-12 h-12 mb-2 opacity-50" />
                  <p>Preview will appear here</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'library' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {mediaAssets.filter(a => a.media_type === 'image' || a.media_type === 'text').map((asset, i) => (
              <div key={asset.id} className="group relative rounded-xl border border-gray-200 overflow-hidden bg-white hover:shadow-md">
                <div className="aspect-square bg-gray-100 flex items-center justify-center p-4">
                  {asset.media_type === 'image' ? (
                    <img src={asset.media_url} className="w-full h-full object-cover rounded" alt="Asset" />
                  ) : (
                    <p className="text-xs text-gray-600 line-clamp-6">{asset.description || asset.prompt}</p>
                  )}
                </div>
                <div className="p-4">
                  <p className="text-sm font-medium truncate">{asset.media_type === 'image' ? 'Image' : 'Text Post'}</p>
                  <p className="text-xs text-gray-500 mt-1">{new Date(asset.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
            {mediaAssets.filter(a => a.media_type === 'image' || a.media_type === 'text').length === 0 && (
              <p className="text-gray-500 col-span-full">No assets generated yet.</p>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
