import React from 'react';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-white p-8 rounded-xl shadow-sm border border-gray-200">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Privacy Policy</h1>
        
        <div className="space-y-6 text-gray-600">
          <p>Last updated: June 4, 2026</p>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Introduction</h2>
            <p>Welcome to Jento AI. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website or use our application.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Information We Collect</h2>
            <p>We may collect information about you in a variety of ways. The information we may collect via the Application includes:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>Personal Data:</strong> Name, email address, and demographic information.</li>
              <li><strong>Derivative Data:</strong> Information our servers automatically collect when you access the Application.</li>
              <li><strong>Facebook Permissions:</strong> When you connect your Facebook account, we request access to your pages and messaging to sync leads and messages into our Unified Inbox.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Use of Your Information</h2>
            <p>Having accurate information about you permits us to provide you with a smooth, efficient, and customized experience. Specifically, we may use information collected about you via the Application to:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Create and manage your account.</li>
              <li>Deliver targeted advertising, coupons, newsletters, and other information regarding promotions.</li>
              <li>Sync and manage your outreach campaigns across email and social media (including Facebook and Instagram).</li>
              <li>Respond to product and customer service requests.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Disclosure of Your Information</h2>
            <p>We may share information we have collected about you in certain situations. Your information may be disclosed as follows:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>By Law or to Protect Rights</li>
              <li>Third-Party Service Providers</li>
              <li>Marketing Communications</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Data Deletion Instructions</h2>
            <p>According to Facebook Platform rules, we have to provide User Data Deletion Callback URL or Data Deletion Instructions URL. If you want to delete your activities for the Jento AI App, you can request data deletion by contacting our support team at hello@jentoai.pro.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Contact Us</h2>
            <p>If you have questions or comments about this Privacy Policy, please contact us at:</p>
            <p className="mt-2 font-medium">Jento AI Team<br />hello@jentoai.pro</p>
          </section>
        </div>
      </div>
    </div>
  );
}
