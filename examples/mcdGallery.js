// read an acquisition from MCD, scale the channels, and output as a static HTML gallery

import { MCDFile } from "imcjs";
import fs from "node:fs";
import { createCanvas } from "canvas";
import { fileURLToPath } from 'url';
import path from "path";
import { open } from 'fs/promises';

const percentile = (arr, value) => {
  const currentIndex = 0;
  const totalCount = arr.reduce((count, currentValue) => {
    if (currentValue < value && value > 0) {
      return count + 1;
    } else if (currentValue === value) {
      return count;
    }
    return count + 0;
  }, currentIndex);
  return (totalCount * 100) / arr.length;
};

function uint8ToDataURL(uint8, width, height) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const imageData = ctx.createImageData(width, height);
  imageData.data.set(uint8);

  ctx.putImageData(imageData, 0, 0);

  return canvas.toDataURL();
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
const handle = await open(fileLocation, 'r');
const { size } = await handle.stat();
const buf = Buffer.allocUnsafe(size);
await handle.read(buf, 0, size, 0);
await handle.close();

const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const mcd = MCDFile.fromArrayBuffer(arrayBuffer);
const acq = mcd.readAcquisition(mcd.slides[0].acquisitions[0]);
const labels = mcd.slides[0].acquisitions[0].channelLabels

const tileArray = [];

for (const channel of labels) {
    const indexChannel = mcd.slides[0].acquisitions[0].channelLabels.indexOf(channel);
    let chanArray = acq.data.slice((indexChannel * acq.shape[2] * acq.shape[1]), ((indexChannel + 1) * acq.shape[2] * acq.shape[1]));

    const scaledChannel = new Uint8Array(chanArray.length);
    let scalingFactor = percentile(chanArray, 99);
    
    for (let i = 0; i < chanArray.length; i++) {
    const x = chanArray[i] / scalingFactor;
    scaledChannel[i] = Math.round((x >= 1 ? 1 : x) * 255);
    };

     tileArray.push({
        data: recolourUint8ToRGB(scaledChannel, acq.shape[2], acq.shape[1], 0, 255, 255),
        label: channel, width: acq.shape[2], height: acq.shape[1]});
    
}

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
