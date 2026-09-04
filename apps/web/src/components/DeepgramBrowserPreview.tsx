import { useCallback, useEffect, useRef, useState } from 'react';
import { AgentMicrophone, AgentPlayer, AgentSession } from '@deepgram/agents';
import { Mic, MicOff, Square, Volume2 } from 'lucide-react';
import { deepgramAgentsApi, type DeepgramAgent } from '../services/deepgramAgentsApi';

type PreviewState = 'idle' | 'connecting' | 'ready' | 'speaking' | 'error' | 'ended';

function messageFor(error: unknown) {
  if (error instanceof Error) return error.message.replace(/^\{.*"error":"?/, '').replace(/"?\}$/, '');
  return 'Preview start nahi ho saka.';
}

export default function DeepgramBrowserPreview({ agent }: { agent: DeepgramAgent }) {
  const [state, setState] = useState<PreviewState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [muted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState<Array<{ role: string; content: string }>>([]);
  const sessionRef = useRef<AgentSession | null>(null);
  const microphoneRef = useRef<AgentMicrophone | null>(null);
  const playerRef = useRef<AgentPlayer | null>(null);
  const timerRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  const clearTimers = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    timerRef.current = null;
    intervalRef.current = null;
  };

  const stop = useCallback(async (reason: PreviewState = 'ended') => {
    clearTimers();
    microphoneRef.current?.stop();
    playerRef.current?.dispose();
    sessionRef.current?.disconnect();
    microphoneRef.current = null;
    playerRef.current = null;
    sessionRef.current = null;
    setMuted(false);
    setState(reason);
    await deepgramAgentsApi.stopPreview(agent.id).catch(() => undefined);
  }, [agent.id]);

  useEffect(() => () => { void stop('ended'); }, [stop]);

  const start = async () => {
    try {
      setError(null);
      setTranscript([]);
      setState('connecting');
      const initial = await deepgramAgentsApi.previewToken(agent.id);
      let firstToken = initial.token;
      const player = new AgentPlayer({ sampleRate: initial.config.audio.output.sampleRate });
      const session = new AgentSession({
        auth: {
          tokenFactory: async () => {
            if (firstToken) {
              const token = firstToken;
              firstToken = '';
              return token;
            }
            return (await deepgramAgentsApi.previewToken(agent.id)).token;
          },
        },
        agent: initial.config.agent as any,
        audio: initial.config.audio,
        url: initial.url,
        reconnect: { enabled: true, maxAttempts: 1, baseDelay: 800, maxDelay: 1500, jitter: false },
        tags: ['jento-browser-preview', agent.id],
      });
      const microphone = new AgentMicrophone((data) => session.sendAudio(data), {
        sampleRate: initial.config.audio.input.sampleRate,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });

      session.on('audio', (data) => player.queue(data));
      session.on('settings-applied', () => setState('ready'));
      session.on('agent-started-speaking', () => setState('speaking'));
      session.on('agent-audio-done', () => setState('ready'));
      session.on('user-started-speaking', () => {
        player.interrupt();
        setState('ready');
      });
      session.on('conversation-text', (event) => {
        setTranscript((items) => [...items, { role: event.role, content: event.content }].slice(-6));
      });
      session.on('error', (event: any) => {
        setError(String(event.description || event.message || 'Deepgram ne preview error return kiya.'));
        void stop('error');
      });
      session.on('sdk-error', (event) => {
        setError(event.message || 'Browser audio connection fail hui.');
        void stop('error');
      });
      session.on('disconnected', (reason) => {
        if (sessionRef.current === session) {
          microphone.stop();
          player.dispose();
          clearTimers();
          sessionRef.current = null;
          microphoneRef.current = null;
          playerRef.current = null;
          setState('ended');
          if (reason && reason !== 'user requested disconnect') setError(reason);
          void deepgramAgentsApi.stopPreview(agent.id);
        }
      });

      sessionRef.current = session;
      microphoneRef.current = microphone;
      playerRef.current = player;
      await session.connect();
      await microphone.start();

      const endsAt = Date.now() + initial.maxSeconds * 1000;
      setRemaining(initial.maxSeconds);
      intervalRef.current = window.setInterval(() => {
        setRemaining(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
      }, 1000);
      timerRef.current = window.setTimeout(() => {
        void stop('ended');
      }, initial.maxSeconds * 1000);
    } catch (startError) {
      setError(messageFor(startError));
      setState('error');
      await stop('error');
    }
  };

  const toggleMute = () => {
    if (!microphoneRef.current) return;
    if (muted) microphoneRef.current.unmute();
    else microphoneRef.current.mute();
    setMuted(!muted);
  };

  const running = ['connecting', 'ready', 'speaking'].includes(state);
  const stateLabel = state === 'speaking' ? 'Speaking' : state === 'ready' ? 'Ready' : state === 'connecting' ? 'Connecting' : state === 'error' ? 'Error' : state === 'ended' ? 'Ended' : 'Idle';

  return (
    <section className="border border-slate-200 bg-white rounded-lg p-5 min-h-[520px] flex flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Browser Preview</h2>
          <p className="mt-1 text-xs text-slate-500">{agent.name}</p>
        </div>
        <span className={`px-2 py-1 text-xs font-medium rounded ${state === 'error' ? 'bg-rose-100 text-rose-700' : running ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{stateLabel}</span>
      </div>

      <div className="flex-1 py-4 space-y-2 overflow-y-auto">
        {transcript.length === 0 ? (
          <div className="text-sm text-slate-400 pt-1">Conversation transcript yahan nazar ayega.</div>
        ) : transcript.map((item, index) => (
          <div key={`${item.role}-${index}`} className={`text-sm leading-6 ${/assistant|agent/i.test(item.role) ? 'text-sky-800' : 'text-slate-700'}`}>
            <span className="font-medium">{/assistant|agent/i.test(item.role) ? 'Agent' : 'You'}: </span>{item.content}
          </div>
        ))}
      </div>

      {error && <div className="mb-3 border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700 rounded">{error}</div>}
      {running && <div className="mb-3 text-xs text-slate-500">Time remaining: {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</div>}

      <div className="flex gap-2 pt-3 border-t border-slate-100">
        {!running ? (
          <button onClick={() => void start()} className="flex-1 inline-flex justify-center items-center gap-2 h-10 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
            <Mic size={16} /> Start preview
          </button>
        ) : (
          <>
            <button onClick={toggleMute} title={muted ? 'Unmute microphone' : 'Mute microphone'} className="h-10 w-10 inline-flex justify-center items-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50">
              {muted ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
            <button onClick={() => playerRef.current?.setVolume(playerRef.current.volume === 0 ? 1 : 0)} title="Toggle speaker volume" className="h-10 w-10 inline-flex justify-center items-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50">
              <Volume2 size={16} />
            </button>
            <button onClick={() => void stop('ended')} className="flex-1 inline-flex justify-center items-center gap-2 h-10 rounded-md bg-rose-600 text-white text-sm font-medium hover:bg-rose-700">
              <Square size={16} /> Stop preview
            </button>
          </>
        )}
      </div>
    </section>
  );
}
