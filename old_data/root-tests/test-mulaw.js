const MULAW_TABLE = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  const mulaw = ~i & 0xFF;
  const sign = (mulaw & 0x80) ? 1 : -1;
  const exponent = (mulaw >> 4) & 0x07;
  const mantissa = mulaw & 0x0F;
  MULAW_TABLE[i] = sign * ((mantissa << 3) + 0x84) << exponent;
}

function decodeMulaw(mulawBuffer) {
  const float32Array = new Float32Array(mulawBuffer.length);
  for (let i = 0; i < mulawBuffer.length; i++) {
    const sample = MULAW_TABLE[mulawBuffer[i]];
    float32Array[i] = sample / 32768.0;
  }
  return float32Array;
}

const pcm = new Float32Array(10);
for(let i=0; i<10; i++) pcm[i] = Math.sin(i * 0.1);

function encodeMulaw(float32Array) {
  const mulawArray = new Uint8Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    let sample = float32Array[i];
    if (sample > 1.0) sample = 1.0;
    if (sample < -1.0) sample = -1.0;
    let pcm = Math.round(sample * 32767);
    let sign = (pcm < 0) ? 0x80 : 0;
    if (pcm < 0) pcm = -pcm;
    pcm += 132;
    if (pcm > 32767) pcm = 32767;
    let exponent = 7;
    for (let expMask = 0x4000; (pcm & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {}
    let mantissa = (pcm >> (exponent === 0 ? 1 : exponent + 3)) & 0x0F;
    let mulaw = ~(sign | (exponent << 4) | mantissa) & 0xFF;
    mulawArray[i] = mulaw;
  }
  return mulawArray;
}

const encoded = encodeMulaw(pcm);
const decoded = decodeMulaw(encoded);
console.log("Original: ", pcm);
console.log("Decoded:  ", decoded);
