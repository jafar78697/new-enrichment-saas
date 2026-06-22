/**
 * Audio Converter Utility
 *
 * Converts between various audio formats used in the voice pipeline:
 * - PCM 16-bit (24kHz mono) from ElevenLabs
 * - Mulaw 8kHz (for Twilio Media Streams)
 * - LINEAR16 (8kHz) for Google STT
 */

/**
 * Mulaw encoding table (16-bit linear PCM → 8-bit mulaw).
 * Standard G.711 mu-law compression.
 */
const MULAW_ENCODE_TABLE = new Uint8Array(256);
const BIAS = 0x84;
const CLIP = 8159;

// Pre-compute mulaw encode table
for (let i = 0; i < 256; i++) {
  // Convert signed 16-bit to linear value
  let sample = (i - 128) * 64;
  let sign = 0;

  if (sample < 0) {
    sample = -sample;
    sign = 0x80;
  }

  if (sample > CLIP) sample = CLIP;

  sample += BIAS;
  const exponent = 7;
  let mantissa;

  // Find the segment (log compression)
  for (let exp = 0; exp < 7; exp++) {
    if (sample <= (0x7F << exp)) {
      mantissa = (sample >> exp) & 0x0F;
      sign |= (exp << 4) | mantissa;
      break;
    }
  }

  MULAW_ENCODE_TABLE[i] = ~sign & 0xFF; // Invert for transmission
}

/**
 * Convert 16-bit PCM buffer to base64-encoded mulaw.
 *
 * Input: PCM 16-bit signed, any sample rate
 * Output: Base64 string of 8kHz mulaw (resampled if needed)
 *
 * @param {Buffer} pcmBuffer - 16-bit PCM audio data
 * @param {number} [inputSampleRate=24000] - Input sample rate in Hz
 * @param {number} [outputSampleRate=8000] - Output sample rate in Hz
 * @returns {string} Base64-encoded mulaw audio
 */
export function pcmToMulaw(pcmBuffer, inputSampleRate = 24000, outputSampleRate = 8000) {
  if (!pcmBuffer || pcmBuffer.length === 0) {
    return '';
  }

  const sampleCount = Math.floor(pcmBuffer.length / 2);
  const ratio = inputSampleRate / outputSampleRate;

  // Calculate output buffer size
  const outputSampleCount = Math.floor(sampleCount / ratio);
  const mulawBuffer = Buffer.allocUnsafe(outputSampleCount);

  for (let i = 0; i < outputSampleCount; i++) {
    const srcIndex = Math.floor(i * ratio) * 2;
    if (srcIndex + 1 >= pcmBuffer.length) break;

    // Read 16-bit signed integer (little-endian)
    const sample = pcmBuffer.readInt16LE(srcIndex);

    // Convert to 8-bit ulaw using standard G.711 algorithm
    mulawBuffer[i] = linearToMulaw(sample);
  }

  return mulawBuffer.toString('base64');
}

/**
 * Convert a single 16-bit linear PCM sample to 8-bit mu-law.
 * Standard G.711 mu-law encoding.
 *
 * @param {number} sample - 16-bit signed linear PCM sample (-32768 to 32767)
 * @returns {number} 8-bit mu-law byte
 */
function linearToMulaw(sample) {
  const MAX = 0x1FFF; // 13-bit max
  const BIAS = 0x84;

  // Shift 16-bit to 14-bit (mu-law expects 14-bit linear PCM)
  sample = sample >> 2;

  let sign = 0;
  if (sample < 0) {
    sample = -sample;
    sign = 0x80;
  }

  // Clip to 13 bits
  if (sample > MAX) sample = MAX;

  // Add bias
  sample += BIAS;
  if (sample > 0x7FFF) sample = 0x7FFF;

  // Find leading 1 position (segment)
  let segment;
  for (segment = 7; segment >= 0; segment--) {
    if (sample >= (0x0100 << segment)) {
      break;
    }
  }

  // Quantize
  const mantissa = (sample >> (segment + 4)) & 0x0F;
  const mulawByte = ~(sign | (segment << 4) | mantissa) & 0xFF;

  return mulawByte;
}

/**
 * Convert 8kHz mulaw to 24kHz PCM 16-bit (for ElevenLabs or other services).
 *
 * @param {Buffer} mulawBuffer - 8kHz mulaw audio
 * @param {number} [outputSampleRate=24000] - Desired output sample rate
 * @returns {Buffer} PCM 16-bit audio
 */
export function mulawToPcm(mulawBuffer, outputSampleRate = 24000) {
  if (!mulawBuffer || mulawBuffer.length === 0) {
    return Buffer.alloc(0);
  }

  const inputSampleRate = 8000;
  const ratio = outputSampleRate / inputSampleRate;
  const outputSampleCount = Math.floor(mulawBuffer.length * ratio);
  const pcmBuffer = Buffer.allocUnsafe(outputSampleCount * 2);

  // Mulaw decode table (standard G.711)
  const MULAW_DECODE = new Int16Array(256);
  for (let i = 0; i < 256; i++) {
    const mulaw = ~i & 0xFF;
    const sign = (mulaw & 0x80) ? 1 : -1;
    const exponent = (mulaw >> 4) & 0x07;
    const mantissa = mulaw & 0x0F;
    const sample = sign * ((mantissa << 3) + 0x84) << exponent;
    MULAW_DECODE[i] = sample;
  }

  for (let i = 0; i < outputSampleCount; i++) {
    const srcIndex = Math.floor(i / ratio);
    if (srcIndex >= mulawBuffer.length) break;

    const sample = MULAW_DECODE[mulawBuffer[srcIndex]];
    pcmBuffer.writeInt16LE(sample, i * 2);
  }

  return pcmBuffer;
}

/**
 * Compute the RMS energy of an audio buffer (for silence detection).
 *
 * @param {Buffer} mulawBuffer - Mulaw audio buffer
 * @returns {number} RMS energy value
 */
export function computeAudioEnergy(mulawBuffer) {
  if (!mulawBuffer || mulawBuffer.length === 0) return 0;

  // Quick approximation: compute average absolute value of mulaw bytes
  let sum = 0;
  for (let i = 0; i < mulawBuffer.length; i++) {
    // Mulaw values near 0xFF are quiet, values near 0x00 are loud
    const value = ~mulawBuffer[i] & 0xFF;
    sum += Math.abs(value - 128);
  }

  return sum / mulawBuffer.length;
}

export default {
  pcmToMulaw,
  mulawToPcm,
  computeAudioEnergy,
};
