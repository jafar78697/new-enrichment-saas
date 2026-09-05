import test from 'node:test';
import assert from 'node:assert/strict';
import { mulawToLinear16 } from '../src/voice-agent/utils/mulaw.js';

test('G.711 silence, sign and peak vectors decode to signed PCM16', () => {
  const bytes = Buffer.from([0xff, 0x7f, 0xfe, 0x7e, 0x80, 0x00]);
  const result = mulawToLinear16(bytes.toString('base64'));
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => result.readInt16LE(i * 2)), [0, 0, 8, -8, 32124, -32124]);
});

test('silent telephone frames remain silent without DC offset', () => {
  const result = mulawToLinear16(Buffer.alloc(160, 0xff).toString('base64'));
  assert.equal(result.length, 320);
  assert.ok(result.every(byte => byte === 0));
});
