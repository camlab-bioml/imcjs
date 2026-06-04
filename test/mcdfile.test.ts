import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { MCDFile } from "../src/mcd_file";

describe("MCD parser", () => {
   const filepath = path.join(
      __dirname,
      "fixtures",
      "test.mcd"
    );
  it("Parses an MCD file from array buffer", async() => {
    
    const buffer = fs.readFileSync(filepath);

    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );
    
    const mcd = MCDFile.fromArrayBuffer(arrayBuffer);
    expect(mcd.schemaXml).toContain("SAT_Test_chr10-h54h54-Gd158_2_18.mcd");
    expect(mcd.acquisitionNames.length).toBe(1);
    expect(mcd.slides[0].acquisitions[0].channelNames.length).toStrictEqual(
    mcd.slides[0].acquisitions[0].channelLabels.length);
    const acq = mcd.readAcquisition(mcd.slides[0].acquisitions[0]);
    const [numChannels, height, width] = acq.shape;
    expect(acq.data.length).toBe(height * width * numChannels);
    expect(mcd.acquisitionShape(mcd.slides[0].acquisitions[0])).toStrictEqual([numChannels, height, width]);
    

    const slideRead = await mcd.readSlide(mcd.slides[0])
    expect(slideRead instanceof Uint8Array).toBe(true);

  });

  it("Parses an MCD direcly from file", async() => {

    const buffer = fs.readFileSync(filepath);
    const file = new File([buffer], "test.mcd", {type: "text/plain"}); 
    const mcd = await MCDFile.fromFile(file);
    expect(mcd.schemaXml).toContain("SAT_Test_chr10-h54h54-Gd158_2_18.mcd");
    expect(mcd.acquisitionNames.length).toBe(1);
    expect(mcd.slides[0].acquisitions[0].channelNames.length).toStrictEqual(
    mcd.slides[0].acquisitions[0].channelLabels.length);
    const acq = mcd.readAcquisition(mcd.slides[0].acquisitions[0]);
    const [numChannels, height, width] = acq.shape;
    expect(acq.data.length).toBe(height * width * numChannels);
    expect(mcd.acquisitionShape(mcd.slides[0].acquisitions[0])).toStrictEqual([numChannels, height, width]);
    

    const slideRead = await mcd.readSlide(mcd.slides[0])
    expect(slideRead instanceof Uint8Array).toBe(true);

  });

  it("Parse multi-ROI file", async () => {
    const filepath = path.join(
      __dirname,
      "fixtures",
      "query.mcd"
    );
    
    const buffer = fs.readFileSync(filepath);
    const file = new File([buffer], "query.mcd", {type: "text/plain"}); 
    
    const mcd = await MCDFile.fromFile(file);
    expect(mcd.metadata).toStrictEqual(mcd.schemaXml);
    
    expect(mcd.acquisitionNames.length).toBe(6);
    const acq = mcd.readAcquisition(mcd.slides[0].acquisitions[2]);
    const [numChannels, height, width] = acq.shape;
    expect(acq.data.length).toBe(height * width * numChannels);
    expect(numChannels).toBe(11);

    const pano = await mcd.readPanorama(mcd.slides[0].panoramas[0])
    expect(pano instanceof Uint8Array).toBe(true);

  });

});