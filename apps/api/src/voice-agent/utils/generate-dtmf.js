const fs = require('fs');

const DTMF_FREQS = {
  '1': [697, 1209],
  '2': [697, 1336],
  '3': [697, 1477],
  '4': [770, 1209],
  '5': [770, 1336],
  '6': [770, 1477],
  '7': [852, 1209],
  '8': [852, 1336],
  '9': [852, 1477],
  '*': [941, 1209],
  '0': [941, 1336],
  '#': [941, 1477]
};

const SAMPLE_RATE = 8000;
const DURATION_MS = 300; // 300ms is standard
const SAMPLES = (SAMPLE_RATE * DURATION_MS) / 1000;

function encodeUlaw(sample) {
  const CLIP = 32635;
  const BIAS = 0x84;
  let sign = 0;
  
  if (sample < 0) {
    sample = -sample;
    sign = 0x80;
  }
  
  if (sample > CLIP) sample = CLIP;
  sample += BIAS;
  
  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {}
  
  let mantissa = (sample >> (exponent + 3)) & 0x0F;
  let ulawByte = ~(sign | (exponent << 4) | mantissa);
  
  return ulawByte & 0xFF;
}

const dtmfMap = {};

for (const [digit, [f1, f2]] of Object.entries(DTMF_FREQS)) {
  const buffer = Buffer.alloc(SAMPLES);
  for (let i = 0; i < SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    let sample = (Math.sin(2 * Math.PI * f1 * t) + Math.sin(2 * Math.PI * f2 * t)) * 0.5;
    let pcm = Math.round(sample * 32767);
    buffer[i] = encodeUlaw(pcm);
  }
  dtmfMap[digit] = buffer.toString('base64');
}

const content = `// Auto-generated DTMF base64 mulaw payloads (8000Hz, 300ms)
export const DTMF_TONES = ${JSON.stringify(dtmfMap, null, 2)};
`;

fs.writeFileSync('apps/api/src/voice-agent/utils/dtmf.js', content);
console.log('Successfully generated dtmf.js');
