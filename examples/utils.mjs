
import { createCanvas } from "canvas";

export function uint8ToDataURL(uint8, width, height, thumbWidth = 500, thumbHeight = null) {
  if (!thumbWidth && !thumbHeight) {
    throw new Error("Provide either thumbWidth or thumbHeight");
  }
  
  let outW, outH;

  if (thumbWidth) {
    outW = thumbWidth;
    outH = Math.round((height / width) * thumbWidth);
  } else {
    outH = thumbHeight;
    outW = Math.round((width / height) * thumbHeight);
  }

  const srcCanvas = createCanvas(width, height);
  const srcCtx = srcCanvas.getContext("2d");

  const imageData = srcCtx.createImageData(width, height);
  imageData.data.set(uint8);
  srcCtx.putImageData(imageData, 0, 0);

  const dstCanvas = createCanvas(outW, outH);
  const dstCtx = dstCanvas.getContext("2d");

  dstCtx.imageSmoothingEnabled = true;
  dstCtx.imageSmoothingQuality = "high";

  dstCtx.drawImage(srcCanvas, 0, 0, width, height, 0, 0, outW, outH);

  return dstCanvas.toDataURL();
}

export function recolourUint8ToRGB(data, width, height, r, g, b, opts = {}) {
  const { gamma = 1, minVal, maxVal } = opts;
  const pixels = width * height;

  let lo = minVal ?? Infinity, hi = maxVal ?? -Infinity;
  if (minVal === undefined || maxVal === undefined) {
    for (let i = 0; i < pixels; i++) {
      if (data[i] < lo) lo = data[i];
      if (data[i] > hi) hi = data[i];
    }
  }

  const range = hi - lo || 1;
  const output = new Uint8ClampedArray(pixels * 4);

  for (let i = 0; i < pixels; i++) {
    const t = (data[i] - lo) / range;
    const intensity = gamma === 1 ? t : Math.pow(t, gamma);
    const j = i * 4;
    output[j]     = Math.round(r * intensity);
    output[j + 1] = Math.round(g * intensity);
    output[j + 2] = Math.round(b * intensity);
    output[j + 3] = 255;
  }

  return output;
}