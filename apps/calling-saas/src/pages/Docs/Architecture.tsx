
export default function Architecture() {
  return (
    <div className="prose prose-invert prose-indigo max-w-none">
      <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 mb-4">System Architecture</h1>
      <p className="text-xl text-textMuted mb-10 leading-relaxed">
        Jento Calling utilizes a modern VoIP WebRTC stack combined with specialized microservices for AI transcription and AI calling. 
        Here's how everything connects under the hood.
      </p>

      <div className="space-y-12">
        <section>
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Core Components</h2>
          <ul className="space-y-4 text-textMuted">
            <li>
              <strong className="text-slate-900">Frontend (React/Vite):</strong> Runs the Jento Calling dashboard. It connects to the backend API for data, and opens a direct WebRTC websocket to the Voice Provider for audio data.
            </li>
            <li>
              <strong className="text-slate-900">Backend (Node.js/Fastify):</strong> Handles authentication, routing, and database interactions. It exposes the REST endpoints that the frontend consumes.
            </li>
            <li>
              <strong className="text-slate-900">Voice Provider (WebRTC):</strong> Acts as the PBX and SIP trunk. When an agent clicks "Call", the provider bridges the WebRTC connection from the browser to the PSTN (Public Switched Telephone Network).
            </li>
            <li>
              <strong className="text-slate-900">Transcription Service (Google STT):</strong> A dedicated WebSocket server receives raw audio bytes from the browser during a call and pipes them into Google Cloud Speech-to-Text for real-time transcription.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-slate-900 mb-4">The Calling Flow</h2>
          <div className="bg-surface/30 p-6 rounded-xl border border-border/50 text-sm font-mono text-textMuted mb-6 overflow-x-auto">
            <pre>
{`[Browser]
   | (1) POST /v1/calls (JWT)
   v
[Backend API]
   | (2) Validates balance & creates token
   v
[WebRTC Gateway]
   | (3) WebRTC connection established
   v
[PSTN (Telecom)] -> [Prospect's Phone]`}
            </pre>
          </div>
          <p className="text-textMuted leading-7">
            When you initiate a call, the frontend requests a temporary token from the Backend API. This token allows the browser to securely connect to the Voice Provider using WebRTC. The provider then dials the destination number on the PSTN.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Live Transcription Details</h2>
          <p className="text-textMuted leading-7 mb-4">
            While the call is active, the frontend uses the Web Audio API to capture the audio stream of the remote caller. It sends this audio via Socket.io to the Backend's <code>/browser-transcription</code> namespace.
          </p>
          <p className="text-textMuted leading-7">
            Simultaneously, the browser uses the native Web Speech API to capture your (the agent's) microphone input locally. The UI then stitches both transcripts together into a seamless chat-bubble interface, separating "You" from the "Client".
          </p>
        </section>
      </div>
    </div>
  );
}
