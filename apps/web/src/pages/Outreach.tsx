import React from 'react';
import { Link } from 'react-router-dom';
import { Mail, MessageCircle } from 'lucide-react';

export default function OutreachHub() {
  return (
    <div className="space-y-6 max-w-6xl mx-auto py-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Outreach Hub</h1>
        <p className="mt-2 text-gray-600">Select a platform to manage your automated campaigns and outreach.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        
        <Link to="/outreach/email" className="group block bg-white rounded-xl shadow-sm hover:shadow-md border border-gray-200 transition-all p-6">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <Mail className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Email Outreach</h2>
              <p className="text-gray-500 text-sm mt-1">Manage email campaigns, connected SMTP senders, and follow-ups.</p>
            </div>
          </div>
        </Link>

        <Link to="/outreach/facebook" className="group block bg-white rounded-xl shadow-sm hover:shadow-md border border-gray-200 transition-all p-6">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <MessageCircle className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Facebook / IG</h2>
              <p className="text-gray-500 text-sm mt-1">Automate Facebook DMs and manage Messenger lead interactions.</p>
            </div>
          </div>
        </Link>

        <Link to="/outreach/linkedin" className="group block bg-white rounded-xl shadow-sm hover:shadow-md border border-gray-200 transition-all p-6">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-blue-50 text-blue-700 rounded-lg group-hover:bg-blue-700 group-hover:text-white transition-colors">
              <MessageCircle className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">LinkedIn Auto-Pilot</h2>
              <p className="text-gray-500 text-sm mt-1">Send connection requests and messages on autopilot using the extension.</p>
            </div>
          </div>
        </Link>

        <Link to="/outreach/reddit" className="group block bg-white rounded-xl shadow-sm hover:shadow-md border border-gray-200 transition-all p-6">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-orange-50 text-orange-600 rounded-lg group-hover:bg-orange-600 group-hover:text-white transition-colors">
              <MessageCircle className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Reddit Outreach</h2>
              <p className="text-gray-500 text-sm mt-1">Scrape subreddits and send automated DMs to Reddit users.</p>
            </div>
          </div>
        </Link>


      </div>

      {/* YouTube Connection Section */}
      <div className="mt-12 pt-8 border-t border-gray-200">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Connected Platforms</h2>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">YouTube Automation</h3>
              <p className="text-gray-500 text-sm mt-1">Connect your YouTube channels to automatically publish AI-generated Reels and Shorts.</p>
            </div>
          </div>
          <button 
            onClick={() => {
              const clientId = '1071909841111-sfa36eroerh8ggr58cu6v7upcvop380g.apps.googleusercontent.com';
              const redirectUri = `${window.location.origin}/auth/youtube/callback`;
              const scope = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly';
              const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;
              window.location.href = url;
            }}
            className="px-6 py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors shadow-sm"
          >
            Connect YouTube Channel
          </button>
        </div>
      </div>
    </div>
  );
}
