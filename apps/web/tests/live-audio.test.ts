import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveAudioPlayer } from '../src/utils/live-audio.ts';

function setup() {
  const sources: any[] = [];
  const context = {
    currentTime: 10,
    destination: {},
    createBuffer: (_channels: number, length: number, rate: number) => {
      const samples = new Float32Array(length);
      return { duration: length / rate, getChannelData: () => samples };
    },
    createBufferSource: () => {
      const source = { buffer: null, startAt: 0, stopped: false, onended: null, connect() {}, disconnect() {}, start(at: number) { this.startAt = at; }, stop() { this.stopped = true; } };
      sources.push(source);
      return source;
    },
  };
  return { player: new LiveAudioPlayer(context as unknown as AudioContext), context, sources };
}

test('simultaneous prospect and AI streams do not accumulate each others duration', () => {
  const { player, sources } = setup();
  const second = Buffer.alloc(16000).toString('base64');
  for (let i = 0; i < 30; i++) {
    player.play(second, 'prospect');
    player.play(second, 'ai');
  }
  assert.equal(sources[58].startAt, 39);
  assert.equal(sources[59].startAt, 39);
});

test('barge-in stops only AI sources and resets the next AI turn', () => {
  const { player, context, sources } = setup();
  const second = Buffer.alloc(16000).toString('base64');
  player.play(second, 'ai');
  player.play(second, 'ai');
  player.play(second, 'prospect');
  player.clear('ai');
  assert.deepEqual(sources.map(source => source.stopped), [true, true, false]);
  context.currentTime = 10.5;
  player.play(second, 'ai');
  assert.equal(sources[3].startAt, 10.5);
  player.clear();
  assert.ok(sources.every(source => source.stopped));
});

test('PCM16 samples are decoded once with correct polarity', () => {
  const { player, sources } = setup();
  const data = Buffer.alloc(6);
  data.writeInt16LE(-32768, 0); data.writeInt16LE(0, 2); data.writeInt16LE(16384, 4);
  player.play(data.toString('base64'), 'prospect');
  assert.deepEqual([...sources[0].buffer.getChannelData(0)], [-1, 0, 0.5]);
  player.play('AA==', 'ai');
  assert.equal(sources.length, 1);
});
