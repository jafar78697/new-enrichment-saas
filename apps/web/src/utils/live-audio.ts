type Speaker = 'ai' | 'prospect';

// A browser only permits sound after a real user click. Keeping one unlocked
// AudioContext alive means the Listen Live popup can open later without losing
// the first seconds of an AI call.
let sharedAudioContext: AudioContext | null = null;

export function getLiveAudioContext() {
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    sharedAudioContext = new AudioContextClass({ sampleRate: 8000 }) as AudioContext;
  }
  return sharedAudioContext;
}

export async function unlockLiveAudio() {
  const context = getLiveAudioContext();
  if (context.state !== 'running') await context.resume();
  return context;
}

export class LiveAudioPlayer {
  private nextStart: Record<Speaker, number> = { ai: 0, prospect: 0 };
  private sources: Record<Speaker, Set<AudioBufferSourceNode>> = { ai: new Set(), prospect: new Set() };

  constructor(private readonly context: AudioContext) {}

  play(base64Pcm: string, speaker: Speaker) {
    const binary = atob(base64Pcm);
    if (!binary.length || binary.length % 2) return;
    const audio = this.context.createBuffer(1, binary.length / 2, 8000);
    const samples = audio.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) {
      const value = binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8);
      samples[i] = (value >= 0x8000 ? value - 0x10000 : value) / 32768;
    }
    const source = this.context.createBufferSource();
    source.buffer = audio;
    source.connect(this.context.destination);
    // Each speaker has a timeline so inbound silence cannot delay AI playback.
    const start = Math.max(this.context.currentTime, this.nextStart[speaker]);
    this.sources[speaker].add(source);
    source.onended = () => {
      this.sources[speaker].delete(source);
      source.disconnect();
    };
    source.start(start);
    this.nextStart[speaker] = start + audio.duration;
  }

  clear(speaker?: Speaker) {
    for (const track of speaker ? [speaker] : ['ai', 'prospect'] as Speaker[]) {
      for (const source of this.sources[track]) {
        source.onended = null;
        try { source.stop(); } catch { /* The source may already have ended. */ }
        source.disconnect();
      }
      this.sources[track].clear();
      this.nextStart[track] = 0;
    }
  }
}
