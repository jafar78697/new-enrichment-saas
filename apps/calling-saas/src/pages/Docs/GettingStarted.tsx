
export default function GettingStarted() {
  return (
    <div className="prose prose-invert prose-indigo max-w-none">
      <h1 className="text-4xl font-extrabold tracking-tight text-white mb-4">Getting Started</h1>
      <p className="text-xl text-textMuted mb-10 leading-relaxed">
        Follow these steps to set up your Jento Calling workspace, assign phone numbers, and make your very first outbound sales call.
      </p>

      <div className="space-y-12">
        <section>
          <h2 className="text-2xl font-bold text-white mb-4">1. Create Your Account</h2>
          <p className="text-textMuted mb-4">
            Sign up for a new account at <a href="/signup" className="text-primary hover:underline">voicecalling.space/signup</a>. 
            Once you log in, you will be directed to the main Dashboard where you can view your call limits and wallet balance.
          </p>
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 text-sm text-primary">
            <strong>Note:</strong> By default, new accounts are in "Demo Mode", which grants you 3 free outbound calls to test the platform.
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">2. Assign a Phone Number</h2>
          <p className="text-textMuted mb-4">
            Before making a call, you need a dedicated USA/Canada phone number.
          </p>
          <ol className="list-decimal pl-5 space-y-2 text-textMuted">
            <li>Navigate to the <strong>Phone Numbers</strong> page using the left sidebar.</li>
            <li>Click on <strong>Buy New Number</strong>.</li>
            <li>Search for an Area Code (e.g., <code className="bg-surface/50 px-1 py-0.5 rounded">312</code> for Chicago).</li>
            <li>Select a number from the list and confirm the purchase.</li>
            <li>Once purchased, you can assign this number to any of your team members.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">3. Build Your Lead List</h2>
          <p className="text-textMuted mb-4">
            You can manually add leads or use our integrated Google Maps Lead Enrichment tool.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-textMuted">
            <li>Go to <strong>Lead Enrichment</strong>.</li>
            <li>Type a query, such as <em>"Roofing contractors in Dallas, TX"</em>.</li>
            <li>The system will scrape Google Maps and enrich the leads with phone numbers.</li>
            <li>Click <strong>Add to Lead List</strong> to push them into your CRM.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">4. Make Your First Call</h2>
          <p className="text-textMuted mb-4">
            With a phone number and leads ready, it's time to start dialing.
          </p>
          <ol className="list-decimal pl-5 space-y-2 text-textMuted">
            <li>Navigate to the <strong>Lead List</strong> page.</li>
            <li>Click the green <strong>Call</strong> button next to any prospect.</li>
            <li>Allow microphone permissions when prompted by your browser.</li>
            <li>The Dialer popup will appear, and you will hear the phone ringing. 
                You can view the live transcript of your conversation directly inside the popup!</li>
          </ol>
        </section>
      </div>
    </div>
  );
}
