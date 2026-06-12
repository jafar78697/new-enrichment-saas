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

        <Link to="/outreach/reels" className="group block bg-white rounded-xl shadow-sm hover:shadow-md border border-gray-200 transition-all p-6">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-purple-50 text-purple-600 rounded-lg group-hover:bg-purple-600 group-hover:text-white transition-colors">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Reel Generation & CRM</h2>
              <p className="text-gray-500 text-sm mt-1">AI Video Studio, Scenes Library, and Cross-Platform Publishing CRM.</p>
            </div>
          </div>
        </Link>

      </div>
    </div>
  );
}
