import React, { useState, useEffect } from 'react';
import { MonitorPlay, Plus } from 'lucide-react';
import { socialApi } from '../services/api';
import { toast } from 'sonner';

export default function YouTubeDashboard() {
  const [youtubeAccounts, setYoutubeAccounts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [channelToDelete, setChannelToDelete] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const socialRes = await socialApi.getAccounts();
      setYoutubeAccounts(socialRes.data.youtube || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnectYouTube = async (channelId: string) => {
    try {
      await socialApi.disconnectYouTube(channelId);
      toast.success('Channel disconnected');
      setChannelToDelete(null);
      fetchData(); // refresh
    } catch (err) {
      toast.error('Failed to disconnect channel.');
      setChannelToDelete(null);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-gray-50">
      <div className="p-6 border-b border-gray-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MonitorPlay className="w-6 h-6 text-red-600" />
            YouTube Studio
          </h1>
          <p className="mt-1 text-sm text-gray-500">Manage your connected YouTube channels and view statistics.</p>
        </div>
        <button 
          onClick={() => {
            const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '405166611993-tg63d9mh5kdbbjufi8bdnpv3f0hh9a8d.apps.googleusercontent.com';
            const redirectUri = window.location.origin + '/auth/youtube/callback';
            const scope = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly';
            const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;
            window.location.href = authUrl;
          }}
          className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 flex items-center gap-2 shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Connect New Channel
        </button>
      </div>

      <div className="p-8 flex-1 overflow-auto relative">
        {channelToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <h3 className="text-xl font-bold text-gray-900 mb-2">Disconnect Channel</h3>
              <p className="text-gray-500 mb-6 text-sm">Are you sure you want to disconnect this YouTube channel? You will no longer be able to auto-publish Reels to it.</p>
              <div className="flex justify-end gap-3">
                <button 
                  onClick={() => setChannelToDelete(null)}
                  className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleDisconnectYouTube(channelToDelete)}
                  className="px-4 py-2 bg-red-600 text-white font-medium hover:bg-red-700 rounded-lg transition-colors shadow-sm"
                >
                  Disconnect
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="max-w-6xl mx-auto">
          {isLoading ? (
            <div className="flex justify-center p-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
            </div>
          ) : youtubeAccounts.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 flex flex-col items-center justify-center text-center">
              <MonitorPlay className="w-16 h-16 text-gray-300 mb-4" />
              <h2 className="text-xl font-bold text-gray-900 mb-2">No Channels Connected</h2>
              <p className="text-gray-500 max-w-md">Connect your YouTube channel to start publishing AI generated reels directly to YouTube Shorts.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {youtubeAccounts.map((yt) => (
                <div key={yt.channel_id} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {yt.channel_logo ? (
                      <img src={yt.channel_logo} alt={yt.channel_title} className="w-16 h-16 rounded-full object-cover border-2 border-gray-100 shadow-sm" />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center border-2 border-red-100 shadow-sm">
                        <span className="text-xl text-red-600 font-bold">{yt.channel_title?.charAt(0) || 'Y'}</span>
                      </div>
                    )}
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        {yt.channel_title || 'Unknown Channel'}
                        <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-semibold border border-green-200">Connected</span>
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">ID: {yt.channel_id}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-8 px-6 border-l border-gray-100">
                    <div className="text-center">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Subscribers</p>
                      <p className="text-xl font-bold text-gray-900">{parseInt(yt.subscriber_count || 0).toLocaleString()}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Total Views</p>
                      <p className="text-xl font-bold text-gray-900">{parseInt(yt.total_views || 0).toLocaleString()}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Videos</p>
                      <p className="text-xl font-bold text-gray-900">{parseInt(yt.total_videos || 0).toLocaleString()}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setChannelToDelete(yt.channel_id)}
                    className="ml-6 text-red-500 hover:text-red-700 text-sm font-semibold border border-red-200 hover:bg-red-50 px-4 py-2 rounded-lg transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
