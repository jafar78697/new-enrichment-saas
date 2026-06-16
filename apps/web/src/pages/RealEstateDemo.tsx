import React, { useState } from 'react';
import { Building, Users, Activity, CheckCircle, Clock } from 'lucide-react';

export default function RealEstateDemo() {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    propertyType: 'Villa',
    budget: '$500k - $1M',
    timeframe: 'Immediately'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [leads, setLeads] = useState<any[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
      const response = await fetch(`${apiUrl}/real-estate/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const result = await response.json();
      if (result.success) {
        setLeads([result.data.savedLead, ...leads]);
        alert('Lead captured and assigned to ' + (result.data.assignedAgent?.name || 'Agent'));
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting to backend');
    }
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans">
      {/* Sidebar Dashboard Mock */}
      <aside className="w-64 bg-[#0B132B] text-white flex flex-col">
        <div className="p-6 border-b border-gray-800">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Building className="text-blue-400" /> RES AI
          </h1>
          <p className="text-xs text-gray-400 mt-1">Real Estate System</p>
        </div>
        <nav className="p-4 space-y-2 flex-1">
          <a href="#" className="flex items-center gap-3 bg-blue-900/50 text-blue-400 px-4 py-3 rounded-lg font-medium">
            <Activity size={18} /> Dashboard
          </a>
          <a href="#" className="flex items-center gap-3 text-gray-400 hover:bg-gray-800 hover:text-white px-4 py-3 rounded-lg font-medium transition">
            <Users size={18} /> Leads
          </a>
          <a href="#" className="flex items-center gap-3 text-gray-400 hover:bg-gray-800 hover:text-white px-4 py-3 rounded-lg font-medium transition">
            <Clock size={18} /> Tasks
          </a>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-8 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800">Live Demo Environment</h2>
        </header>

        <div className="flex-1 p-8 overflow-y-auto flex gap-8">
          {/* Left: Lead Capture Form (Simulating Facebook Ad) */}
          <div className="w-1/3 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-4 border-b pb-2 flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              Simulate Incoming Lead
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input 
                  type="text" required
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                  value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input 
                  type="tel" required
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                  value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input 
                  type="email" required
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                  value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Property Type</label>
                  <select 
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    value={formData.propertyType} onChange={e => setFormData({...formData, propertyType: e.target.value})}
                  >
                    <option>Villa</option>
                    <option>Apartment</option>
                    <option>Commercial</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Budget</label>
                  <select 
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    value={formData.budget} onChange={e => setFormData({...formData, budget: e.target.value})}
                  >
                    <option>$100k - $300k</option>
                    <option>$300k - $500k</option>
                    <option>$500k - $1M</option>
                  </select>
                </div>
              </div>
              <button 
                type="submit" disabled={isSubmitting}
                className="w-full mt-4 bg-blue-600 text-white font-medium py-3 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                {isSubmitting ? 'Processing AI...' : 'Submit Lead (Trigger Automation)'}
              </button>
            </form>
          </div>

          {/* Right: CRM View */}
          <div className="flex-1 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center justify-between">
              Recent Leads in Pipeline
              <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full">
                {leads.length} New
              </span>
            </h3>

            {leads.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
                <Users size={48} className="mb-4 opacity-50" />
                <p>Waiting for incoming leads from Facebook Ads...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {leads.map((lead, idx) => (
                  <div key={idx} className="p-4 border border-gray-200 rounded-lg flex items-center justify-between hover:shadow-md transition bg-gray-50">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">
                        {lead.company_name?.charAt(0) || 'L'}
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900">{lead.company_name}</h4>
                        <p className="text-sm text-gray-500">{lead.primary_phone} • {lead.primary_email}</p>
                        <p className="text-xs text-blue-600 mt-1 font-medium">Looking for {lead.re_property_type} ({lead.re_budget})</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="flex items-center gap-1 text-xs font-bold text-green-700 bg-green-100 px-2 py-1 rounded">
                        <CheckCircle size={12} /> Auto-Emailed
                      </span>
                      <span className="flex items-center gap-1 text-xs font-bold text-purple-700 bg-purple-100 px-2 py-1 rounded">
                        <Activity size={12} /> Bridging Call Initiated
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
