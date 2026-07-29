// read an acquisition from MCD, scale the channels, and output as a static HTML gallery

import { MCDFile } from "imcjs";
import fs from "node:fs";
import { fileURLToPath } from 'url';
import path from "path";
import { recolourUint8ToRGB, uint8ToDataURL } from "./utils.mjs";

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

fs.writeFileSync(path.join(path.dirname((fileURLToPath(import.meta.url))), "gallery_local.html"), html, "utf-8");
