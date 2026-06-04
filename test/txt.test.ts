import { describe, it, expect } from "vitest";
import path from "path";
import fs from "node:fs";

import { TXTFile } from "../src/txt";

describe("TXT parser", () => {
  it("parses a real TXT file", async () => {
    const filepath = path.join(
          __dirname,
          "fixtures",
          "test.txt"
        );
        
    const buffer = fs.readFileSync(filepath);

    const file = new File([buffer], "test.txt", {
    type: "text/plain"});     

    const txtRead = await TXTFile.fromFile(file);
    expect(txtRead.numChannels).toBe(12);
    expect(txtRead.channelLabels).toStrictEqual([
  '80ArAr(ArAr80)',
  '126Xe(Xe126)',
  '131Xe(Xe131)',
  '134Xe(Xe134)',
  '158Gd_h5050_Chr2SAT(Gd158)',
  '162Dy_h5454_Chr10SAT(Dy162)',
  '166Er_h3838_Chr1SAT(Er166)',
  '167Er_h3838_Chr1SAT(Er167)',
  '191Ir_DNA1(Ir191)',
  '193Ir_DNA2(Ir193)',
  '206Pb(Pb206)',
  '208Pb(Pb208)'])
  expect(txtRead.channelNames).toStrictEqual(txtRead.channelLabels);
  const acq = txtRead.readAcquisition();
  const [numChannels, height, width] = acq.shape;
  expect(acq.data.length).toBe(height * width * numChannels);
  expect(numChannels).toBe(12);
  });
});

