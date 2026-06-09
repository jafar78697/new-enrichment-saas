import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Building, Users, Map, CheckSquare, Phone, Mail } from 'lucide-react';

export default function RealEstateLanding() {
  const { token } = useAuth();

  return (
    <div className="min-h-screen bg-white text-gray-900 font-serif">
      
      {/* Classic Navigation */}
      <nav className="w-full border-b border-gray-300 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 h-24 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-4">
            <div className="w-12 h-12 border-2 border-blue-900 flex items-center justify-center text-blue-900 font-bold text-2xl bg-white">
              R
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-normal text-blue-900 uppercase">Real Estate Systems</h1>
              <p className="text-xs text-gray-600 tracking-widest uppercase">Est. 2026</p>
            </div>
          </Link>
          
          <div className="hidden md:flex items-center gap-8 text-base font-normal text-gray-800">
            <a href="#features" className="hover:text-blue-900 hover:underline">Features</a>
            <a href="#management" className="hover:text-blue-900 hover:underline">Management</a>
            <a href="#agents" className="hover:text-blue-900 hover:underline">Agents</a>
          </div>

          <div className="flex items-center gap-4">
            <Link to="/login" className="text-base text-gray-800 hover:underline">
              Client Portal
            </Link>
            <a href="#demo" className="px-6 py-3 border-2 border-blue-900 text-blue-900 font-bold text-base hover:bg-blue-900 hover:text-white transition-colors">
              Request a Consultation
            </a>
          </div>
        </div>
      </nav>

      {/* Traditional Hero Section (Full Screen) */}
      <section className="relative min-h-[85vh] flex items-center justify-center border-b border-gray-300">
        {/* Background Image & Classic Overlay */}
        <div className="absolute inset-0 z-0">
          <img 
            src="/luxury-property.png" 
            alt="Traditional Real Estate Property" 
            className="w-full h-full object-cover"
          />
          {/* Simple dark overlay to ensure text is readable */}
          <div className="absolute inset-0 bg-black/60" />
        </div>

        <div className="relative z-10 text-center max-w-4xl mx-auto px-4">
          <h2 className="text-5xl lg:text-6xl font-bold text-white mb-8 leading-tight">
            A Reliable Management System for Real Estate Professionals.
          </h2>
          <p className="text-2xl text-gray-200 mb-12 leading-relaxed max-w-3xl mx-auto">
            Equip your agency with a solid foundation. Our system provides founders with complete oversight and gives agents the tools they need to manage listings, track buyers, and close deals efficiently.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-6">
            <a href="#demo" className="px-10 py-4 bg-blue-900 text-white font-bold text-lg hover:bg-blue-800 transition-colors shadow-lg">
              Book a Demo
            </a>
            <a href="#features" className="px-10 py-4 bg-transparent text-white font-bold text-lg border-2 border-white hover:bg-white hover:text-gray-900 transition-colors">
              Read More
            </a>
          </div>
        </div>
      </section>

      {/* Main Features Grid */}
      <section id="features" className="py-20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h3 className="text-3xl font-bold text-gray-900 mb-4 border-b-2 border-blue-900 inline-block pb-2">Core Capabilities</h3>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto mt-4">
              A straightforward approach to managing your entire real estate operation without the confusion of overly complex software.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Building,
                title: 'Property Listings Management',
                description: 'Organize all your properties in one place. Keep track of active, pending, and sold listings with simple data entry.'
              },
              {
                icon: Users,
                title: 'Client Database',
                description: 'Maintain detailed records of buyers and sellers. Never lose a contact number or email address again.'
              },
              {
                icon: CheckSquare,
                title: 'Agent Tasks & Follow-ups',
                description: 'Assign tasks to your agents and ensure every lead receives a prompt phone call or email.'
              }
            ].map((feature, i) => (
              <div key={i} className="border border-gray-300 p-8 bg-gray-50 hover:bg-gray-100">
                <feature.icon className="w-10 h-10 text-blue-900 mb-6" />
                <h4 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h4>
                <p className="text-gray-600 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Founder vs Agent Section */}
      <section className="bg-blue-900 text-white py-20 border-y border-gray-400">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-16">
            
            <div id="management">
              <h3 className="text-3xl font-bold mb-6">For the Founders</h3>
              <ul className="space-y-6">
                <li className="flex items-start gap-4">
                  <div className="mt-1 bg-white text-blue-900 p-1"><Map className="w-5 h-5" /></div>
                  <div>
                    <h5 className="text-xl font-bold mb-2">Complete Agency Overview</h5>
                    <p className="text-blue-100">Review the performance of your entire agency from a single desk. Monitor which agents are closing deals and which properties are stagnating.</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="mt-1 bg-white text-blue-900 p-1"><CheckSquare className="w-5 h-5" /></div>
                  <div>
                    <h5 className="text-xl font-bold mb-2">Clear Reporting</h5>
                    <p className="text-blue-100">Generate simple, easy-to-read reports at the end of every week or month. No confusing graphs, just solid numbers.</p>
                  </div>
                </li>
              </ul>
            </div>

            <div id="agents">
              <h3 className="text-3xl font-bold mb-6">For the Agents</h3>
              <ul className="space-y-6">
                <li className="flex items-start gap-4">
                  <div className="mt-1 bg-white text-blue-900 p-1"><Phone className="w-5 h-5" /></div>
                  <div>
                    <h5 className="text-xl font-bold mb-2">Organized Outreach</h5>
                    <p className="text-blue-100">Agents are provided with a clear list of people to call each morning. The system ensures no potential buyer is forgotten.</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="mt-1 bg-white text-blue-900 p-1"><Mail className="w-5 h-5" /></div>
                  <div>
                    <h5 className="text-xl font-bold mb-2">Standardized Communication</h5>
                    <p className="text-blue-100">Send pre-written, professional emails to clients regarding viewings, offers, and contracts with just a few clicks.</p>
                  </div>
                </li>
              </ul>
            </div>

          </div>
        </div>
      </section>

      {/* Classic CTA Section */}
      <section id="demo" className="py-24 bg-gray-100 text-center border-b border-gray-300">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">
            Ready to organize your Real Estate Agency?
          </h2>
          <p className="text-xl text-gray-700 mb-10">
            Contact us today to schedule a formal demonstration of the system. We will walk you through exactly how it can improve your daily operations.
          </p>
          <a href="mailto:contact@realestatesystems.com" className="inline-block px-10 py-5 bg-blue-900 text-white font-bold text-xl hover:bg-blue-800 shadow-md">
            Schedule a Consultation
          </a>
        </div>
      </section>

      {/* Simple Footer */}
      <footer className="bg-white py-10 text-center border-t border-gray-300">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between">
          <p className="text-gray-600 font-bold">Real Estate Systems</p>
          <p className="text-gray-500 text-sm mt-4 md:mt-0">© 2026 All Rights Reserved.</p>
          <div className="mt-4 md:mt-0 space-x-6 text-sm text-gray-500">
            <Link to="/privacy" className="hover:text-gray-900 hover:underline">Privacy Policy</Link>
            <a href="#" className="hover:text-gray-900 hover:underline">Terms of Service</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
