import type { AcquisitionBase, NDArray } from "./data";
import { MCDParserError } from "./mcd_parser";


/**
 * A class for reading IMC .txt acquisition files.
 *
 * Usage:
 * ```ts
 * const f = await TXTFile.fromFile(fileInput.files[0]);
 * console.log(f.channelNames);
 * const img = f.readAcquisition(); // Float32Array, shape [c, y, x]
 * ```
 */
export class TXTFile implements AcquisitionBase {
  private readonly _text: string;
  private _headers: string[] | null = null;
  private _rows: Float32Array[] | null = null;

  private constructor(text: string) {
    this._text = text;
  }


  static async fromFile(file: File): Promise<TXTFile> {
    const text = await file.text();
    return new TXTFile(text);
  }

  static fromText(text: string): TXTFile {
    return new TXTFile(text);
  }
  

  get numChannels(): number {
    return this._getHeaders().filter((h) => !["Start_push", "End_push", "Pushes_duration", "X", "Y", "Z"].includes(h)).length;
  }

  /** Symbols of metal isotopes (e.g. ["Ag", "Ir"]) */
  get channelMetals(): string[] {
    return this.channelNames.map((n) => n.replace(/\d+$/, ""));
  }

  /** Atomic masses of metal isotopes (e.g. [107, 191]) */
  get channelMasses(): number[] {
    return this.channelNames.map((n) => {
      const m = n.match(/(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    });
  }

  /**
   * Channel labels — in TXT files the column header IS the label.
   * (Same as channelNames for TXT files as labels aren't separately stored.)
   */
  get channelLabels(): string[] {
    return this._channelHeaders();
  }

  /**
   * Unique channel names in the format `${metal}${mass}` (e.g. ["Ag107", "Ir191"]).
   * In TXT files these are derived directly from the column headers.
   */
  get channelNames(): string[] {
    return this._channelHeaders();
  }


  /**
   * Reads the acquisition as a Float32Array with layout [c, y, x].
   *
   * @param strict - If false, attempts recovery from corrupted/truncated data.
   */
  readAcquisition(options?: { strict?: boolean }): NDArray {
    const strict = options?.strict ?? true;
    const rows = this._getRows(strict);
    const channelHeaders = this._channelHeaders();
    const allHeaders = this._getHeaders();
    const channelIndices = channelHeaders.map((h) => allHeaders.indexOf(h));
    
    // Find X and Y column indices to determine image shape
    const xIdx = allHeaders.indexOf("X");
    const yIdx = allHeaders.indexOf("Y");

    if (xIdx === -1 || yIdx === -1) {
      // No X/Y columns — treat as flat scan (1 row of pixels)
      const c = channelHeaders.length;
      const n = rows.length;
      const out = new Float32Array(c * n);
      for (let r = 0; r < n; r++) {
        for (let ci = 0; ci < c; ci++) {
          out[ci * n + r] = rows[r][channelIndices[ci]] ?? 0;
        }
      }
      return {data: out, shape: [c, 1, n]}
    }
    
    // Determine image bounds
    let maxX = 0;
    let maxY = 0;
    for (const row of rows) {
      const x = Math.round(row[xIdx]);
      const y = Math.round(row[yIdx]);
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    const w = maxX + 1;
    const h = maxY + 1;
    const c = channelHeaders.length;
    
    const out = new Float32Array(c * h * w);

    for (const row of rows) {
      const x = Math.round(row[xIdx]);
      const y = Math.round(row[yIdx]);
      // TODO: can this condition ever be reached with now the max is computed above?
      // if (x < 0 || x >= w || y < 0 || y >= h) {
      //   if (strict) throw new MCDParserError(`Pixel out of bounds: (${x}, ${y})`);
      //   continue;
      // }
      for (let ci = 0; ci < c; ci++) {
        out[ci * h * w + y * w + x] = row[channelIndices[ci]] ?? 0;
      }
    }

    return {data: out, shape: [c, h, w]}
  }


  private static readonly SYSTEM_COLUMNS = new Set([
    "Start_push",
    "End_push",
    "Pushes_duration",
    "X",
    "Y",
    "Z",
  ]);

  private _channelHeaders(): string[] {
    return this._getHeaders().filter((h) => !TXTFile.SYSTEM_COLUMNS.has(h));
  }

  private _getHeaders(): string[] {
    if (this._headers !== null) return this._headers;
    const firstLine = this._text.split(/\r?\n/)[0] ?? "";
    this._headers = firstLine.split("\t");
    return this._headers;
  }

  private _getRows(strict = true): Float32Array[] {
    if (this._rows !== null) return this._rows;
    const lines = this._text.split(/\r?\n/);
    const headers = this._getHeaders();
    const rows: Float32Array[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const parts = line.split("\t");
      if (parts.length !== headers.length) {
        if (strict) {
          throw new MCDParserError(
            `Line ${i + 1}: expected ${headers.length} columns but got ${parts.length}`,
          );
        }
        // Try to recover by zero-padding
      }
      const row = new Float32Array(headers.length);
      for (let j = 0; j < headers.length; j++) {
        const v = parseFloat(parts[j] ?? "0");
        row[j] = isNaN(v) ? 0 : v;
      }
      rows.push(row);
    }

    this._rows = rows;
    return rows;
  }
}