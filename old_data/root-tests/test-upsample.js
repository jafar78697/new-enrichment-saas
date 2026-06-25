const float32Data = new Float32Array(10);
for(let i=0;i<10;i++) float32Data[i] = i; // 0, 1, 2, 3...

const inputRate = 8000;
const outputRate = 48000;
const ratio = outputRate / inputRate;
const newLength = Math.round(float32Data.length * ratio);
const upsampledData = new Float32Array(newLength);
for (let i = 0; i < newLength; i++) {
  const srcIndex = i / ratio;
  const index1 = Math.floor(srcIndex);
  const index2 = Math.min(index1 + 1, float32Data.length - 1);
  const fraction = srcIndex - index1;
  upsampledData[i] = float32Data[index1] * (1 - fraction) + float32Data[index2] * fraction;
}
console.log(upsampledData.slice(0, 20));
