
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function Terms() {
  return (
    <div className="min-h-screen bg-background text-text p-8">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-primary hover:text-primary/80 mb-8">
          <ArrowLeft size={16} /> Back to Home
        </Link>
        <h1 className="text-3xl font-bold text-slate-900 mb-6">Terms of Service</h1>
        <div className="space-y-4 text-textMuted leading-relaxed">
          <p>Last updated: September 2026</p>
          <h2 className="text-xl font-semibold text-slate-900 mt-8 mb-4">1. Acceptance of Terms</h2>
          <p>By accessing and using Jento Calling ("Service", "we", "us", or "our"), you agree to be bound by these Terms of Service. If you disagree with any part of the terms, you may not access the Service.</p>
          
          <h2 className="text-xl font-semibold text-slate-900 mt-8 mb-4">2. Description of Service</h2>
          <p>Jento Calling provides a voice calling platform, auto-dialer, and lead enrichment tools for outbound sales teams. We reserve the right to modify or discontinue, temporarily or permanently, the Service with or without notice.</p>
          
          <h2 className="text-xl font-semibold text-slate-900 mt-8 mb-4">3. User Conduct</h2>
          <p>You agree to use our services in compliance with all applicable local, state, national, and international laws, rules, and regulations, including telemarketing laws such as the TCPA (Telephone Consumer Protection Act).</p>
          
          <h2 className="text-xl font-semibold text-slate-900 mt-8 mb-4">4. Subscriptions and Billing</h2>
          <p>You will be billed in advance on a recurring basis. There will be no refunds or credits for partial months of service, upgrade/downgrade refunds, or refunds for months unused.</p>

          <h2 className="text-xl font-semibold text-slate-900 mt-8 mb-4">5. Contact</h2>
          <p>If you have any questions about these Terms, please contact us at support@voicecalling.space.</p>
        </div>
      </div>
    </div>
  );
}
