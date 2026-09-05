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
