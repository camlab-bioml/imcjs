import { describe, it, expect } from "vitest";
import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";

import { MCDFile, MCDParserError } from "../src/mcd_file";
import { MCDParser } from "../src/mcd_parser";

function decodePng(buffer: Uint8Array) {
  return PNG.sync.read(Buffer.from(buffer));
}

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
    expect(mcd.slides.length).toBe(1);
    expect(mcd.schemaXml).toContain("SAT_Test_chr10-h54h54-Gd158_2_18.mcd");
    expect(new MCDParser(mcd.schemaXml).metadata).toStrictEqual(mcd.schemaXml);
    expect(mcd.schemaXml).toContain(new MCDParser(mcd.schemaXml).metadataXmlns);
    expect(new MCDParser(mcd.schemaXml).parseSlides().length).toBe(1);

    expect(mcd.acquisitionIDs).toStrictEqual([18]);
    expect(mcd.acquisitions[0].id).toBe(18);
    expect(mcd.acquisitionNames.length).toBe(1);
    expect(mcd.slides[0].acquisitions[0].channelNames.length).toStrictEqual(
    mcd.slides[0].acquisitions[0].channelLabels.length);
    const acq = mcd.readAcquisition(mcd.slides[0].acquisitions[0]);
    const [numChannels, height, width] = acq.shape;
    expect(acq.data.length).toBe(height * width * numChannels);
    expect(mcd.acquisitionShape(mcd.slides[0].acquisitions[0])).toStrictEqual([numChannels, height, width]);

  });

  it("Parses an MCD directly from file", async() => {

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
    
    // check row major order, assert that the first column of the second row is after the width index
    expect(acq.data[width]).toBe(1022);
    // check first column, second row, third channel
    expect(acq.data[(2 * width * height) + width]).toBe(11.5);
    
    // slice the acquisition, with indices in a non sequential order
    const acqSlide = mcd.readAcquisition(mcd.slides[0].acquisitions[0],
      {channels: [2, 4, 0]}
    );
    
    expect(acqSlide.shape).toStrictEqual([3, 500, 500]);

    // expect the first acquisition in the slice to be the third in the full
    expect(acqSlide.data[0]).toBe(acq.data[2*(500 * 500)]);
    expect(acqSlide.data[500 * 500]).toBe(acq.data[4*(500 * 500)]);
    // assert that the third position acquisition in the slice is the first one in full
    expect(acqSlide.data[2*(500 * 500)]).toBe(acq.data[0]);


    // slice the acquisition, additionally with a sub-region of all channels
    const acqSlideROI = mcd.readAcquisition(mcd.slides[0].acquisitions[0],
      {channels: [0, 2, 4, 6], region: [1, 0, 100, 100]}
    );

    expect(acqSlideROI.shape).toStrictEqual([4, 100, 99]);
    // expect the first element to match the original second because of a one-index slice
    expect(acqSlideROI.data[0]).toBe(acq.data[1]);


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

    const acqIDsKnown = new Set([1, 2, 3, 4, 5, 6]);

    expect(mcd.acquisitionIDs.length === acqIDsKnown.size && [...mcd.acquisitionIDs].every(x => 
      acqIDsKnown.has(x))).toBe(true);

    // Check that the 4th acquisition has the same position in the IDs as the names
    expect(mcd.acquisitionIDs.indexOf(4)).toBe(mcd.acquisitionNames.indexOf('Glycerol'))
    
    expect(mcd.acquisitionNames.includes('EtOH')).toBe(true);
    expect(mcd.acquisitionNames.includes('ROI1')).toBe(false);

    expect(mcd.acquisitionNames.length).toBe(6);

    for (const acq of mcd.slides[0].acquisitions) {
      const acqRead = mcd.readAcquisition(acq);
      const [numChannels, height, width] = acqRead.shape;
      expect(acqRead.data.length).toBe(height * width * numChannels);
      expect(numChannels).toBe(11);
    }
    
    expect(await mcd.readBeforeAblationImage(mcd.slides[0].acquisitions[0])).toBeNull();
    expect(await mcd.readAfterAblationImage(mcd.slides[0].acquisitions[0])).toBeNull();

  });

  it("Read slide, panorama, and ablation images", async () => {
    const filepath = path.join(
      __dirname,
      "fixtures",
      "ffpe_w_ablation.mcd"
    );
    
    const buffer = fs.readFileSync(filepath);
    const file = new File([buffer], "ffpe_w_ablation.mcd", {type: "text/plain"}); 
    
    const mcd = await MCDFile.fromFile(file);

    const slideRead = await mcd.readSlide(mcd.slides[0])
    expect(slideRead instanceof Uint8Array).toBe(true);
    
    if (slideRead instanceof Uint8Array) {
      const png = decodePng(slideRead!);
      expect(png.height).toBe(669);
      expect(png.width).toBe(2002);
    };

    const pano = await mcd.readPanorama(mcd.slides[0].panoramas[0])
    expect(pano instanceof Uint8Array).toBe(true);
    
    if (pano instanceof Uint8Array) {
      const png = decodePng(pano!);
      expect(png.height).toBe(874);
      expect(png.width).toBe(2608);
    };

    const acq = mcd.readAcquisition(mcd.slides[0].acquisitions[0]);
    const [numChannels, height, width] = acq.shape;
  
    const beforeAblation = await mcd.readBeforeAblationImage(mcd.slides[0].acquisitions[0]);
    expect(beforeAblation).not.toBeNull();
    if (beforeAblation instanceof Uint8Array) {
      const png = decodePng(beforeAblation!);
      expect(png.width).toBe(width);
      expect(png.height).toBe(height);
    };

    const afterAblation = await mcd.readAfterAblationImage(mcd.slides[0].acquisitions[0]);
    expect(afterAblation).not.toBeNull();
    if (afterAblation instanceof Uint8Array) {
      const png = decodePng(afterAblation!);
      expect(png.width).toBe(width);
      expect(png.height).toBe(height);
    };


    });

  it("Throw errors on malformed MCD", async () => {
    const filepath = path.join(
      __dirname,
      "fixtures",
      "error.mcd"
    );
    
    const buffer = fs.readFileSync(filepath);
    const file = new File([buffer], "error.mcd", {type: "text/plain"}); 
    
    const mcd = await MCDFile.fromFile(file);
  
    expect(() => mcd.schemaXml).toThrow(MCDParserError);
    expect(() => mcd.readAcquisition(mcd.slides[0].acquisitions[0])).toThrow(MCDParserError);
    });

    it("MCDParser can handle empty schema", async () => {
    
    const emptySchema = new MCDParser("<tag></tag>");
    expect(emptySchema.metadataXmlns).toBeNull();
    expect(emptySchema.parseSlides().length).toBe(0);
    });
    
});