
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function RefundPolicy() {
  return (
    <div className="min-h-screen bg-background text-text p-8">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-primary hover:text-primary/80 mb-8">
          <ArrowLeft size={16} /> Back to Home
        </Link>
        <h1 className="text-3xl font-bold text-slate-900 mb-6">Refund Policy</h1>
        <div className="space-y-4 text-textMuted leading-relaxed">
          <p>Last updated: September 2026</p>
          
          <h2 className="text-xl font-semibold text-slate-900 mt-8 mb-4">1. General Policy</h2>
          <p>At Jento Calling, we strive to ensure our customers are satisfied with our voice calling platform. Due to the nature of telecommunications and infrastructure costs incurred upon usage, we have a strict refund policy.</p>
          
          <h2 className="text-xl font-semibold text-slate-900 mt-8 mb-4">2. Subscriptions</h2>
          <p>Subscription fees are billed in advance. You may cancel your subscription at any time, but we do not offer refunds or credits for partial months of service or for unused time.</p>
          
          <h2 className="text-xl font-semibold text-slate-900 mt-8 mb-4">3. Top-ups and Call Credits</h2>
          <p>Prepaid call credits, wallet top-ups, and usage charges are non-refundable once added to your account or consumed.</p>
          
          <h2 className="text-xl font-semibold text-slate-900 mt-8 mb-4">4. Exceptions</h2>
          <p>If you experience technical issues on our end that entirely prevent you from using the service, please contact support within 7 days of the billing cycle for a case-by-case review.</p>
          
          <h2 className="text-xl font-semibold text-slate-900 mt-8 mb-4">5. Contact</h2>
          <p>If you have any billing issues or refund requests, reach out to us at support@voicecalling.space.</p>
        </div>
      </div>
    </div>
  );
}
