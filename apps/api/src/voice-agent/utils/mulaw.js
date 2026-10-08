export function mulawToLinear16(base64Payload) {
  const input = Buffer.from(base64Payload, 'base64');
  const output = Buffer.alloc(input.length * 2);
  for (let i = 0; i < input.length; i += 1) {
    const value = ~input[i] & 0xff;
    const magnitude = (((value & 0x0f) << 3) + 0x84) << ((value >> 4) & 7);
    const sample = value & 0x80 ? 0x84 - magnitude : magnitude - 0x84;
    output.writeInt16LE(sample, i * 2);
  }
  return output;
}


function decodeMulawByte(byte) {
  const value = ~byte & 0xff;
  const magnitude = (((value & 0x0f) << 3) + 0x84) << ((value >> 4) & 7);
  return value & 0x80 ? 0x84 - magnitude : magnitude - 0x84;
}

function encodeMulawSample(sample) {
  const BIAS = 0x84;
  const CLIP = 32635;
  let pcm = Math.max(-CLIP, Math.min(CLIP, Math.round(sample)));
  const sign = pcm < 0 ? 0x80 : 0;
  if (pcm < 0) pcm = -pcm;
  pcm += BIAS;
  let exponent = 7;
  for (let mask = 0x4000; exponent > 0 && !(pcm & mask); exponent -= 1, mask >>= 1) {}
  const mantissa = (pcm >> (exponent + 3)) & 0x0f;
  return (~(sign | (exponent << 4) | mantissa)) & 0xff;
}

/** Apply conservative gain while preserving raw 8 kHz PCMU telephony audio. */
export function applyMulawGain(audio, gain = 1) {
  const input = Buffer.isBuffer(audio) ? audio : Buffer.from(audio);
  const normalizedGain = Number.isFinite(Number(gain))
    ? Math.max(0.5, Math.min(2, Number(gain)))
    : 1;
  if (Math.abs(normalizedGain - 1) < 0.001) return input;

  const output = Buffer.allocUnsafe(input.length);
  for (let i = 0; i < input.length; i += 1) {
    let sample = decodeMulawByte(input[i]) * normalizedGain;
    // A smooth knee keeps boosted peaks within G.711's decoded range rather
    // than hard-clipping them. Frame duration and sample rate stay identical.
    const magnitude = Math.abs(sample);
    const knee = 28000;
    const headroom = 32124 - knee;
    if (magnitude > knee) {
      sample = Math.sign(sample) * (knee + headroom * Math.tanh((magnitude - knee) / headroom));
    }
    output[i] = encodeMulawSample(sample);
  }
  return output;
}
