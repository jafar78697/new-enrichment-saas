
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background text-text p-8">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-primary hover:text-primary/80 mb-8">
          <ArrowLeft size={16} /> Back to Home
        </Link>
        <h1 className="text-3xl font-bold text-slate-900 mb-6">Privacy Policy</h1>
        <div className="space-y-4 text-textMuted leading-relaxed">
          <p>Last updated: September 2026</p>
          <p>Jento Calling values your privacy. This policy explains how we collect, use, and share information when you use our services.</p>
          
          <h2 className="text-xl font-semibold text-slate-900 mt-8 mb-4">1. Information We Collect</h2>
          <p>We collect information you provide directly to us when registering, making payments, and communicating with our support. We also collect usage data, call logs, and metadata as part of the calling service.</p>
          
          <h2 className="text-xl font-semibold text-slate-900 mt-8 mb-4">2. How We Use Information</h2>
          <p>Your information is used to provide, maintain, and improve our services, process transactions, and communicate with you about your account.</p>
          
          <h2 className="text-xl font-semibold text-slate-900 mt-8 mb-4">3. Data Security</h2>
          <p>We implement reasonable security measures to protect your personal information from unauthorized access, alteration, or destruction.</p>
          
          <h2 className="text-xl font-semibold text-slate-900 mt-8 mb-4">4. Contact Us</h2>
          <p>For privacy-related inquiries, contact us at support@voicecalling.space.</p>
        </div>
      </div>
    </div>
  );
}
