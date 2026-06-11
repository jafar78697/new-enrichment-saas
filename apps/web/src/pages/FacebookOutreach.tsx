import React from 'react';
import { Link } from 'react-router-dom';
import FacebookDashboard from '../components/FacebookDashboard';

export default function FacebookOutreach() {
  return (
    <div className="space-y-6">
      <Link to="/outreach" className="text-indigo-600 font-medium hover:underline inline-block">← Back to Outreach Hub</Link>
      
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Facebook / IG Auto-Pilot</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 overflow-hidden">
        <FacebookDashboard />
      </div>
    </div>
  );
}
