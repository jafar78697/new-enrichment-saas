import React from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { getCallUser } from '../services/employeesApi';

export default function OutreachHub() {
  const callUser = getCallUser();
  const isManager = !callUser || callUser.role === 'manager';
  const assigned = callUser?.assigned_modules || [];

  const canAccess = (moduleKey: string) => {
    return isManager || assigned.includes(moduleKey);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto py-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Outreach Hub</h1>
        <p className="mt-2 text-gray-600">Select a platform to manage your automated campaigns and outreach.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        
        {/* Email Outreach */}
        {canAccess('email') && (
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
        )}

        {canAccess('facebook') && (
          <Link to="/outreach/facebook" className="group block bg-white rounded-xl shadow-sm hover:shadow-md border border-gray-200 transition-all p-6">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-gradient-to-br from-blue-50 to-pink-50 text-blue-600 rounded-lg group-hover:from-blue-600 group-hover:to-pink-500 group-hover:text-white transition-all">
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Facebook / Instagram</h2>
                <p className="text-gray-500 text-sm mt-1">Automate FB & IG DMs, manage pipeline, run campaigns across multiple profiles.</p>
              </div>
            </div>
          </Link>
        )}

        {canAccess('linkedin') && (
          <Link to="/outreach/linkedin" className="group block bg-white rounded-xl shadow-sm hover:shadow-md border border-gray-200 transition-all p-6">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-blue-50 text-blue-700 rounded-lg group-hover:bg-blue-700 group-hover:text-white transition-colors">
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">LinkedIn Auto-Pilot</h2>
                <p className="text-gray-500 text-sm mt-1">Send connection requests and messages on autopilot using the extension.</p>
              </div>
            </div>
          </Link>
        )}

        {canAccess('reddit') && (
          <Link to="/outreach/reddit" className="group block bg-white rounded-xl shadow-sm hover:shadow-md border border-gray-200 transition-all p-6">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-orange-50 text-orange-600 rounded-lg group-hover:bg-orange-600 group-hover:text-white transition-colors">
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Reddit Outreach</h2>
                <p className="text-gray-500 text-sm mt-1">Scrape subreddits and send automated DMs to Reddit users.</p>
              </div>
            </div>
          </Link>
        )}

        {canAccess('youtube') && (
          <Link to="/outreach/youtube-studio" className="group block bg-white rounded-xl shadow-sm hover:shadow-md border border-gray-200 transition-all p-6">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-red-50 text-red-600 rounded-lg group-hover:bg-red-600 group-hover:text-white transition-colors">
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.42a2.78 2.78 0 0 0-1.94 2C1 8.17 1 12 1 12s0 3.83.46 5.58a2.78 2.78 0 0 0 1.94 2C5.12 20 12 20 12 20s6.88 0 8.6-.42a2.78 2.78 0 0 0 1.94-2C23 15.83 23 12 23 12s0-3.83-.46-5.58z"></path><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="white"></polygon></svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">YouTube Automation</h2>
                <p className="text-gray-500 text-sm mt-1">Manage your connected YouTube channels and view statistics.</p>
              </div>
            </div>
          </Link>
        )}

      </div>
    </div>
  );
}
