import { describe, it, expect } from "vitest";
import path from "path";
import fs from "node:fs";
import { readFile } from 'fs/promises';

import { TXTFile } from "../src/txt";
import { MCDParserError } from "../src/mcd_parser";

describe("TXT parser", () => {
   const filepath = path.join(
          __dirname,
          "fixtures",
          "test.txt"
        );
    const filepath2 = path.join(
          __dirname,
          "fixtures",
          "single_row.txt"
        );
  
  it("Parses a TXT file", async () => {
        
    const buffer = fs.readFileSync(filepath);

    const file = new File([buffer], "test.txt", {
    type: "text/plain"});     

    const txtRead = await TXTFile.fromFile(file);
    expect(txtRead.numChannels).toBe(12);
    expect(txtRead.channelMetals.length).toStrictEqual(txtRead.channelMasses.length);
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

  it("Parses a TXT file as string", async () => {
  const text = await readFile(filepath, 'utf8');
  const txtRead = TXTFile.fromText(text);
  expect(txtRead.numChannels).toBe(12);
    expect(txtRead.channelMetals.length).toStrictEqual(txtRead.channelMasses.length);
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

  it("Parses a flattened TXT file", async () => {
    
  const buffer = fs.readFileSync(filepath2);

  const file = new File([buffer], "single_row.txt", {type: "text/plain"}); 
  
  const txtRead = await TXTFile.fromFile(file);
  
  expect(txtRead.numChannels).toBe(12);
  expect(txtRead.channelMetals.length).toStrictEqual(txtRead.channelMasses.length);
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
  expect(height).toBe(1);
  });

  it("Handles malformed TXT files", async () => {
      const filepath = path.join(
        __dirname,
        "fixtures",
        "malformed.txt"
      );
      
      const buffer = fs.readFileSync(filepath);
      const file = new File([buffer], "malformed.txt", {type: "text/plain"}); 
      
      const txt = await TXTFile.fromFile(file);
          
      expect(() => txt.readAcquisition()).toThrow(MCDParserError);
      expect(() => txt.readAcquisition({strict: false})).not.toThrow(MCDParserError);
    });

});

