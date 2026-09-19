
export default function Overview() {
  return (
    <div className="prose prose-invert prose-indigo max-w-none">
      <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 mb-4">Jento Calling Overview</h1>
      <p className="text-xl text-textMuted mb-10 leading-relaxed">
        Jento Calling is a modern outbound sales and cold calling platform built exclusively for teams targeting USA and Canada. 
        It integrates advanced lead enrichment via Google Maps with a powerful, low-latency browser dialer.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        <div className="bg-surface/40 border border-border/50 rounded-xl p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-2">Automated Dialer</h3>
          <p className="text-textMuted text-sm">
            Make calls directly from your browser without installing softphones. It uses WebRTC to connect you instantly with your prospects.
          </p>
        </div>
        <div className="bg-surface/40 border border-border/50 rounded-xl p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-2">Live Transcription</h3>
          <p className="text-textMuted text-sm">
            Every call is transcribed in real-time. Our advanced Speech-to-Text engine separates what you say from what the client says, creating a beautiful chat-like UI.
          </p>
        </div>
        <div className="bg-surface/40 border border-border/50 rounded-xl p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-2">Lead Enrichment</h3>
          <p className="text-textMuted text-sm">
            Search for local businesses via Google Maps directly from the dashboard. One click adds them to your CRM and finds their contact details.
          </p>
        </div>
        <div className="bg-surface/40 border border-border/50 rounded-xl p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-2">Team Management</h3>
          <p className="text-textMuted text-sm">
            Managers can monitor agents, view daily outbound metrics, assign specific phone numbers, and listen to recordings of previous calls.
          </p>
        </div>
      </div>

      <h2 className="text-2xl font-bold text-slate-900 mb-4 mt-8">Why Jento Calling?</h2>
      <p className="text-textMuted leading-8 mb-6">
        Most CRM platforms treat calling as an afterthought. Jento Calling puts the phone at the center of your workflow. 
        Whether you are a solo consultant booking appointments, or a manager overseeing a 10-person outbound sales floor, 
        our platform is designed to minimize clicks and maximize talk time.
      </p>

      <ul className="space-y-3 text-textMuted">
        <li className="flex gap-2">
          <strong className="text-primary">Instant Setup:</strong> 
          No complicated SIP trunk configurations. Just buy a number and start dialing.
        </li>
        <li className="flex gap-2">
          <strong className="text-primary">Built-in Compliance:</strong> 
          All phone numbers are verified and compliant with USA telecom standards.
        </li>
        <li className="flex gap-2">
          <strong className="text-primary">AI-Ready:</strong> 
          The infrastructure is built to support AI voice agents out-of-the-box when you are ready to scale beyond human callers.
        </li>
      </ul>
    </div>
  );
}
