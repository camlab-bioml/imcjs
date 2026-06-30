// read an acquisition from MCD, scale the channels, and output as a static HTML gallery

import { MCDFile } from "imcjs";
import fs from "node:fs";
import { createCanvas } from "canvas";
import { fileURLToPath } from 'url';
import path from "path";

function uint8ToDataURL(uint8, width, height, thumbWidth = 500, thumbHeight = null) {
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

function recolourUint8ToRGB(data, width, height, r, g, b, opts = {}) {
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

const fileLocation = path.join(path.dirname(path.dirname((fileURLToPath(import.meta.url)))), "/test/fixtures/test.mcd");

// node can parse a simple filepath string
const mcd = await MCDFile.fromPath(fileLocation);
const slides = await mcd.getSlides();
const acq = await mcd.readAcquisition(slides[0].acquisitions[0]);
const labels = slides[0].acquisitions[0].channelLabels

const tileArray = [];

for (const channel of labels) {

    const indexChannel = slides[0].acquisitions[0].channelLabels.indexOf(channel);
    let chanArray = acq.data.slice((indexChannel * acq.shape[2] * acq.shape[1]), ((indexChannel + 1) * acq.shape[2] * acq.shape[1]));
    
    // set how intense signal should look relative to this value; 1 is fully saturated signal;
    let scalingFactor = 10;
    const invScale = 255 / scalingFactor;
    const scaledChannel = new Uint8Array(chanArray.length);

  for (let i = 0; i < chanArray.length; i++) {
    const v = chanArray[i] * invScale;
    scaledChannel[i] = v >= 255 ? 255 : v + 0.5;
  }
  
  tileArray.push({
    data: recolourUint8ToRGB(scaledChannel, acq.shape[2], acq.shape[1], 0, 255, 255),
    label: channel, width: acq.shape[2], height: acq.shape[1]});
    
}

await mcd.close();

const galleryTiles = tileArray.map(t => ({
    src: uint8ToDataURL(t.data, t.width, t.height), label: t.label}));

const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />

<style>
body {
  font-family: Arial, sans-serif;
  margin: 20px;}

.gallery {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;}

.tile {
  border: 1px solid #ddd;
  border-radius: 6px;
  overflow: hidden;
  background: #fff;}

.tile img {
  width: 100%;
  display: block;}

.label {
  padding: 6px 8px;
  font-size: 13px;
  background: #f4f4f4;
  border-top: 1px solid #ddd;}

</style>
</head>
<body>

<div class="gallery">
${galleryTiles.map(t => `
  <div class="tile">
    <img src="${t.src}" />
    <div class="label">${t.label}</div>
  </div>
`).join("")}
</div>

</body>
</html>`;

fs.writeFileSync(path.join(path.dirname((fileURLToPath(import.meta.url))), "gallery.html"), html, "utf-8");
