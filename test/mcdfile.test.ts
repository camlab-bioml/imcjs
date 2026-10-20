import { describe, it, expect } from "vitest";
import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";
import http from "http";

import { MCDFile, MCDParserError, NodeFileByteSource } from "../src/mcd_file";
import { MCDParser } from "../src/mcd_parser";
import { URLByteSource } from "../src/source";

function decodePng(buffer: Uint8Array) {
  return PNG.sync.read(Buffer.from(buffer));
};

function serveRangeFile(path: string, allow_ranges: boolean = true,
  use_content_range: boolean = true) {

  const server = http.createServer((req, res) => {
    const stat = fs.statSync(path);
    const size = stat.size;

    const range = req.headers.range;

    if (!range) {
      res.writeHead(200, {
        "Content-Length": size,
      });

      fs.createReadStream(path).pipe(res);
      return;
    }

    const match = range.match(/bytes=(\d+)-(\d*)/);

    if (!match) {
      res.writeHead(416);
      return;
    }

    const start = Number(match[1]);
    const end = match[2]
      ? Number(match[2])
      : size - 1;

    if (allow_ranges) {
      let contentRange = use_content_range ? `bytes ${start}-${end}/${size}` : "";
      res.writeHead(206, {
      "Content-Range": contentRange,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
    });
    }

    fs.createReadStream(path, {
      start,
      end,
    }).pipe(res);
  });

  return new Promise<string>((resolve) => {
    server.listen(0, () => {
      const address = server.address() as any;
      resolve(`http://localhost:${address.port}/file.mcd`);
    });
  });
};

describe("MCD parser", async () => {
   const filepath = path.join(
      __dirname,
      "fixtures",
      "test.mcd"
    );
  

  it("Parses an MCD file from file", async() => {
    
    const buffer = fs.readFileSync(filepath);
    const file = new File([buffer], "test.mcd", {type: "text/plain"}); 
    const mcd = await MCDFile.fromFile(file);
    const slides = await mcd.getSlides()
    expect(slides.length).toBe(1);

    expect(mcd.sizeBytes > 10000000).toBe(true);
    const schema = await mcd.getSchemaXml();
    const metadata = await mcd.getMetadata();
    expect(schema).toStrictEqual(metadata);

    expect(schema).toContain("SAT_Test_chr10-h54h54-Gd158_2_18.mcd");
    expect(new MCDParser(schema).metadata).toStrictEqual(schema);
    expect(schema).toContain(new MCDParser(schema).metadataXmlns);
    expect(new MCDParser(schema).parseSlides().length).toBe(1);

    const acqs = await mcd.getAcquisitions();
    expect(acqs[0].id).toBe(18);
    const acqIds = await mcd.getAcquisitionIDs()
    expect(acqIds).toStrictEqual([18]);
    expect(acqIds[0]).toBe(18);
    const acqNames = await mcd.getAcquisitionNames();
    expect(acqNames.length).toBe(1);
    expect(slides[0].acquisitions[0].channelNames.length).toStrictEqual(
    slides[0].acquisitions[0].channelLabels.length);
    const acq = await mcd.readAcquisition(slides[0].acquisitions[0]);
    const [numChannels, height, width] = acq.shape;
    expect(acq.data.length).toBe(height * width * numChannels);
    expect(mcd.acquisitionShape(slides[0].acquisitions[0])).toStrictEqual([numChannels, height, width]);

    // check row major order, assert that the first column of the second row is after the width index
    expect(acq.data[width]).toBe(1022);
    // check first column, second row, third channel
    expect(acq.data[(2 * width * height) + width]).toBe(11.5);
    
    // slice the acquisition, with indices in a non sequential order
    const acqSlide = await mcd.readAcquisition(slides[0].acquisitions[0],
      {channels: [2, 4, 0]}
    );

    
    
    expect(acqSlide.shape).toStrictEqual([3, 500, 500]);

    // expect the first acquisition in the slice to be the third in the full
    expect(acqSlide.data[0]).toBe(acq.data[2*(500 * 500)]);
    expect(acqSlide.data[500 * 500]).toBe(acq.data[4*(500 * 500)]);
    // assert that the third position acquisition in the slice is the first one in full
    expect(acqSlide.data[2*(500 * 500)]).toBe(acq.data[0]);


    // slice the acquisition, additionally with a sub-region of all channels
    const acqSlideROI = await mcd.readAcquisition(slides[0].acquisitions[0],
      {channels: [0, 2, 4, 6], region: [1, 0, 100, 100]}
    );

    expect(acqSlideROI.shape).toStrictEqual([4, 100, 99]);
    // expect the first element to match the original second because of a one-index slice
    expect(acqSlideROI.data[0]).toBe(acq.data[1]);

    const slideRead = await mcd.readSlide(slides[0])
    expect(slideRead instanceof Uint8Array).toBe(true);

    await mcd.close();

  });

  it("Parses an MCD file from node path", async() => {
    
    const mcd = await MCDFile.fromPath(filepath);

    const slides = await mcd.getSlides()
    expect(slides.length).toBe(1);
    const schema = await mcd.getSchemaXml();
    expect(schema).toContain("SAT_Test_chr10-h54h54-Gd158_2_18.mcd");
    expect(new MCDParser(schema).metadata).toStrictEqual(schema);
    expect(schema).toContain(new MCDParser(schema).metadataXmlns);
    expect(new MCDParser(schema).parseSlides().length).toBe(1);

    const acqIds = await mcd.getAcquisitionIDs()
    expect(acqIds).toStrictEqual([18]);
    expect(acqIds[0]).toBe(18);
    const acqNames = await mcd.getAcquisitionNames();
    expect(acqNames.length).toBe(1);
    expect(slides[0].acquisitions[0].channelNames.length).toStrictEqual(
    slides[0].acquisitions[0].channelLabels.length);
    const acq = await mcd.readAcquisition(slides[0].acquisitions[0]);
    const [numChannels, height, width] = acq.shape;
    expect(acq.data.length).toBe(height * width * numChannels);
    expect(mcd.acquisitionShape(slides[0].acquisitions[0])).toStrictEqual([numChannels, height, width]);

    // check row major order, assert that the first column of the second row is after the width index
    expect(acq.data[width]).toBe(1022);
    // check first column, second row, third channel
    expect(acq.data[(2 * width * height) + width]).toBe(11.5);
    
    // slice the acquisition, with indices in a non sequential order
    const acqSlide = await mcd.readAcquisition(slides[0].acquisitions[0],
      {channels: [2, 4, 0]}
    );

    
    
    expect(acqSlide.shape).toStrictEqual([3, 500, 500]);

    // expect the first acquisition in the slice to be the third in the full
    expect(acqSlide.data[0]).toBe(acq.data[2*(500 * 500)]);
    expect(acqSlide.data[500 * 500]).toBe(acq.data[4*(500 * 500)]);
    // assert that the third position acquisition in the slice is the first one in full
    expect(acqSlide.data[2*(500 * 500)]).toBe(acq.data[0]);


    // slice the acquisition, additionally with a sub-region of all channels
    const acqSlideROI = await mcd.readAcquisition(slides[0].acquisitions[0],
      {channels: [0, 2, 4, 6], region: [1, 0, 100, 100]}
    );

    expect(acqSlideROI.shape).toStrictEqual([4, 100, 99]);
    // expect the first element to match the original second because of a one-index slice
    expect(acqSlideROI.data[0]).toBe(acq.data[1]);

    const slideRead = await mcd.readSlide(slides[0])
    expect(slideRead instanceof Uint8Array).toBe(true);

    await mcd.close();

  });
  
  it("Parse MCD from byte source", async () => {

    const byteSource = await NodeFileByteSource.open(filepath);
    const mcd = await MCDFile.fromByteSource(byteSource);
    const slides = await mcd.getSlides()
    expect(slides.length).toBe(1);
    const schema = await mcd.getSchemaXml();
    expect(schema).toContain("SAT_Test_chr10-h54h54-Gd158_2_18.mcd");
    await mcd.close();
  });

  it("Parse MCD from URL HTTP source", async () => {

    const url = await serveRangeFile(filepath);

    const mcd = await MCDFile.fromURL(url);
    const slides = await mcd.getSlides()
    expect(slides.length).toBe(1);
    const schema = await mcd.getSchemaXml();
    expect(schema).toContain("SAT_Test_chr10-h54h54-Gd158_2_18.mcd");
    await mcd.close();
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

    const acqIDsKnown = new Set([1, 2, 3, 4, 5, 6]);
    const acqIDs = await mcd.getAcquisitionIDs();
    const acqNames = await mcd.getAcquisitionNames();

    expect(acqIDs.length === acqIDsKnown.size && [...acqIDs].every(x => 
      acqIDsKnown.has(x))).toBe(true);

    // Check that the 4th acquisition has the same position in the IDs as the names
    expect(acqIDs.indexOf(4)).toBe(acqNames.indexOf('Glycerol'))
    
    expect(acqNames.includes('EtOH')).toBe(true);
    expect(acqNames.includes('ROI1')).toBe(false);

    expect(acqNames.length).toBe(6);

    const slides = await mcd.getSlides();
    for (const acq of slides[0].acquisitions) {
      const acqRead = await mcd.readAcquisition(acq);
      const [numChannels, height, width] = acqRead.shape;
      expect(acqRead.data.length).toBe(height * width * numChannels);
      expect(numChannels).toBe(11);
    }
    
    expect(await mcd.readBeforeAblationImage(slides[0].acquisitions[0])).toBeNull();
    expect(await mcd.readAfterAblationImage(slides[0].acquisitions[0])).toBeNull();

    await mcd.close();

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
    
    const slides = await mcd.getSlides();
    const slideRead = await mcd.readSlide(slides[0]);
    expect(slideRead instanceof Uint8Array).toBe(true);
    
    if (slideRead instanceof Uint8Array) {
      const png = decodePng(slideRead!);
      expect(png.height).toBe(669);
      expect(png.width).toBe(2002);
    };

    const pano = await mcd.readPanorama(slides[0].panoramas[0])
    expect(pano instanceof Uint8Array).toBe(true);
    
    if (pano instanceof Uint8Array) {
      const png = decodePng(pano!);
      expect(png.height).toBe(874);
      expect(png.width).toBe(2608);
    };

    const acq = await mcd.readAcquisition(slides[0].acquisitions[0]);
    const [numChannels, height, width] = acq.shape;
  
    const beforeAblation = await mcd.readBeforeAblationImage(slides[0].acquisitions[0]);
    expect(beforeAblation).not.toBeNull();
    if (beforeAblation instanceof Uint8Array) {
      const png = decodePng(beforeAblation!);
      expect(png.width).toBe(width);
      expect(png.height).toBe(height);
    };

    const afterAblation = await mcd.readAfterAblationImage(slides[0].acquisitions[0]);
    expect(afterAblation).not.toBeNull();
    if (afterAblation instanceof Uint8Array) {
      const png = decodePng(afterAblation!);
      expect(png.width).toBe(width);
      expect(png.height).toBe(height);
    };

    await mcd.close();

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
    
    await expect(mcd.getSchemaXml()).rejects.toThrow(MCDParserError);
    await expect(mcd.getSlides()).rejects.toThrow(MCDParserError);
    await mcd.close();

    });

    it("MCDParser can handle empty schema", async () => {
    
    const emptySchema = new MCDParser("<tag></tag>");
    expect(emptySchema.metadataXmlns).toBeNull();
    expect(emptySchema.parseSlides().length).toBe(0);
    });

  it("Error on MCD parsing from URL without ranges permitted", async () => {

    const url = await serveRangeFile(filepath, false);
    await expect(URLByteSource.open(url)).rejects.toThrow(Error);
  });

  it("Error on MCD parsing from URL without content range", async () => {

    const url = await serveRangeFile(filepath, true, false);
    await expect(URLByteSource.open(url)).rejects.toThrow(Error);
  });
    
});