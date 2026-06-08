import type { Acquisition, Panorama, Slide, NDArray } from "./data";
import { MCDParser, MCDParserError } from "./mcd_parser";

export { MCDParserError };

/**
 * A class for reading IMC .mcd files in the browser (or any environment with
 * ArrayBuffer / File / Blob support).
 * 
 * Usage:
 * ```ts
 * const file = await MCDFile.fromFile(fileInput.files[0]);
 * console.log(file.slides[0].acquisitions[0].channelNames);
 * const imgData = file.readAcquisition(file.slides[0].acquisitions[0]);
 * // imgData: Float32Array, shape [channels, height, width] (c, y, x)
 * ```
 */
export class MCDFile {
  private readonly _buffer: ArrayBuffer;
  private _schemaXml: string | null = null;
  private _slides: Slide[] | null = null;

  private constructor(buffer: ArrayBuffer) {
    this._buffer = buffer;
  }


  /** Parse an MCD file from a browser File object. */
  static async fromFile(file: File): Promise<MCDFile> {
    const buffer = await file.arrayBuffer();
    return new MCDFile(buffer);
  }

  /** Parse an MCD file from an ArrayBuffer (e.g. from fetch or FileReader). */
  static fromArrayBuffer(buffer: ArrayBuffer): MCDFile {
    return new MCDFile(buffer);
  }


  /**
   * Full metadata in proprietary XML format.
   * The XML is stored as UTF-16-LE at the end of the MCD file.
   */
  get schemaXml(): string {
    if (this._schemaXml === null) {
      this._schemaXml = this._extractSchemaXml();
    }
    return this._schemaXml;
  }

  /** Alias for schemaXml (legacy compat). */
  get metadata(): string {
    return this.schemaXml;
  }

  /** Slides contained in this MCD file. */
  get slides(): readonly Slide[] {
    if (this._slides === null) {
      const parser = new MCDParser(this.schemaXml);
      this._slides = parser.parseSlides();
    }
    return this._slides;
  }

  parseSlides() {
    if (this._slides === null) {
      const parser = new MCDParser(this.schemaXml);
      this._slides = parser.parseSlides();
    }
  
  }

  /**
   * All acquisitions across all slides, keyed by acquisition ID.
   * Convenience accessor — equivalent to iterating slides[].acquisitions[].
   */
  get acquisitions(): readonly Acquisition[] {
    return this.slides.flatMap((s) => s.acquisitions);
  }

  /**
   * All acquisition description strings across all slides.
   * Returns null if schema XML has not been parsed yet (call .slides first).
   */
  get acquisitionNames(): readonly (string | null)[]{
    if (this._slides === null) {
      this.parseSlides()
    };
    if (this._slides === null) return [];
    return this.slides.flatMap((s) => s.acquisitions.map((a) => a.description));
  }

  /**
   * All acquisition IDs (position integers)
   * Returns null if schema XML has not been parsed yet (call .slides first).
   */
  get acquisitionIDs(): readonly (number)[]{
    if (this._slides === null) {
      this.parseSlides()
    };
    if (this._slides === null) return [];
    return this.slides.flatMap((s) => s.acquisitions.map((a) => a.id));
  }


  /**
   * Reads an IMC acquisition as a Float32Array laid out [c, y, x].
   * The shape is [numChannels, height, width].
   *
   * @param acquisition - The acquisition to read.
   * @param options.channels - Optional subset of 0-based channel indices to return.
   * @param options.region   - Optional [xMin, yMin, xMax, yMax] crop region in pixels.
   */
  readAcquisition(
    acquisition: Acquisition,
    options?: {
      // IMP: the output array will store the channel arrys in the order in which they are passed to options.channels
      channels?: number[];
      region?: readonly [number, number, number, number];
    },
  ): NDArray {
    const start = acquisition._dataStartOffset;
    const end   = acquisition._dataEndOffset;

    if (start === 0 && end === 0) {
      throw new MCDParserError(
        `Acquisition ${acquisition.id} has no data offsets.`,
      );
    }
    
    const raw = this._readBlobAsFloat32(start, end);

    // numChannels here is signal channels only (X/Y/Z excluded by the parser).
    // However the binary data stream INCLUDES X, Y, Z columns at positions 0-2.
    // We must account for all columns in the stride, then skip the coord columns.
    const signalC = acquisition.numChannels;
    const h = acquisition.heightPx ?? 0;
    const w = acquisition.widthPx ?? 0;

    if (signalC === 0 || h === 0 || w === 0) {
      throw new MCDParserError(
        `Acquisition ${acquisition.id} has invalid dimensions: ${signalC}c × ${h}h × ${w}w`,
      );
    }

    // The binary stride = total columns stored per pixel (X + Y + Z + signal channels).
    // We derive this from the byte range: totalCols = raw.length / (h * w).
    const totalSamples = raw.length;
    const pixelCount   = h * w;
    const stride       = Math.round(totalSamples / pixelCount);

    // The first `coordCols` columns are X, Y, Z (coordinates) — skip them.
    const coordCols  = stride - signalC;        // typically 3
    const firstSigCol = Math.max(coordCols, 0); // index of first signal column in the stride

    const channels = options?.channels ?? Array.from({ length: signalC }, (_, i) => i);
    const [xMin, yMin, xMax, yMax] = options?.region ?? [0, 0, w, h];
    const outW = xMax - xMin;
    const outH = yMax - yMin;
    const outC = channels.length;
    const out  = new Float32Array(outC * outH * outW);

    for (let ci = 0; ci < outC; ci++) {
      // Map user-facing channel index to column index in the raw stream
      const colInStride = firstSigCol + channels[ci];
      for (let y = yMin; y < yMax; y++) {
        for (let x = xMin; x < xMax; x++) {
          const srcIdx = (y * w + x) * stride + colInStride;
          const dstIdx = ci * outH * outW + (y - yMin) * outW + (x - xMin);
          out[dstIdx] = srcIdx < raw.length ? raw[srcIdx] : 0;
        }
      }
    }

    return {data: out, shape: [outC, outH, outW]}
  }

  /**
   * Returns the shape of an acquisition as [numChannels, height, width]
   * without reading any pixel data.
   */
  acquisitionShape(acquisition: Acquisition): [number, number, number] {
    return [acquisition.numChannels, acquisition.heightPx ?? 0, acquisition.widthPx ?? 0];
  }
  
  /**
   * Reads a slide image as raw bytes (Uint8Array).
   * The bytes represent the encoded image (e.g. JPEG/PNG) as stored in the file.
   * Returns null if no image is available.
   */
  readSlideRaw(slide: Slide): Uint8Array | null {
    return this._readImageBlob(slide._imageStartOffset, slide._imageEndOffset);
  }

  /**
   * Reads a slide image and returns an ImageBitmap (browser) or raw Uint8Array (Node.js).
   * Returns null if no image is available.
   */
  async readSlide(slide: Slide): Promise<ImageBitmap | Uint8Array | null> {
    const raw = this.readSlideRaw(slide);
    if (!raw) return null;
    if (typeof createImageBitmap !== "undefined") {
      return createImageBitmap(new Blob([Uint8Array.from(raw)]));
    }
    // TODO: should add the shape of the array here for reconstruction?
    return raw;
  }

  /**
   * Reads a panorama image as raw bytes.
   * Returns null if no image is available.
   */
  readPanoramaRaw(panorama: Panorama): Uint8Array | null {
    return this._readImageBlob(panorama._imageStartOffset, panorama._imageEndOffset);
  }

  /**
   * Reads a panorama image and returns an ImageBitmap (browser) or raw Uint8Array (Node.js).
   * Returns null if no image is available.
   */
  async readPanorama(panorama: Panorama): Promise<ImageBitmap | Uint8Array | null> {
    const raw = this.readPanoramaRaw(panorama);
    if (!raw) return null;
    if (typeof createImageBitmap !== "undefined") {
      return createImageBitmap(new Blob([Uint8Array.from(raw)]));
    }
    return raw;
  }

  /**
   * Reads the before-ablation image for an acquisition as raw bytes.
   * Returns null if not available.
   */
  readBeforeAblationImageRaw(acquisition: Acquisition): Uint8Array | null {
    return this._readImageBlob(
      acquisition._beforeAblationImageStartOffset,
      acquisition._beforeAblationImageEndOffset,
    );
  }

  /**
   * Reads the before-ablation image and returns an ImageBitmap or Uint8Array.
   * Returns null if not available.
   */
  async readBeforeAblationImage(acquisition: Acquisition): Promise<ImageBitmap | Uint8Array | null> {
    const raw = this.readBeforeAblationImageRaw(acquisition);
    if (!raw) return null;
    if (typeof createImageBitmap !== "undefined") {
      return createImageBitmap(new Blob([Uint8Array.from(raw)]));
    }
    return raw;
  }

  /**
   * Reads the after-ablation image for an acquisition as raw bytes.
   * Returns null if not available.
   */
  readAfterAblationImageRaw(acquisition: Acquisition): Uint8Array | null {
    return this._readImageBlob(
      acquisition._afterAblationImageStartOffset,
      acquisition._afterAblationImageEndOffset,
    );
  }

  /**
   * Reads the after-ablation image and returns an ImageBitmap or Uint8Array.
   * Returns null if not available.
   */
  async readAfterAblationImage(acquisition: Acquisition): Promise<ImageBitmap | Uint8Array | null> {
    const raw = this.readAfterAblationImageRaw(acquisition);
    if (!raw) return null;
    if (typeof createImageBitmap !== "undefined") {
      return createImageBitmap(new Blob([Uint8Array.from(raw)]));
    }
    return raw;
  }


  /**
   * Locates and extracts the XML schema embedded at the end of the MCD file.
   *
   * The XML is encoded as UTF-16-LE and delimited by:
   *   <MCDSchema ...> ... </MCDSchema>
   * It may be preceded by null bytes used as padding.
   */
  private _extractSchemaXml(): string {
    const byteLen = this._buffer.byteLength;

    const START_TAGS = ["<MCDSchema", "<mcdSchema", "<McdSchema"];
    const END_TAG    = "</MCDSchema>";

    const endTagBytes = this._strToUtf16LE(END_TAG);
    const endPos      = this._findLastSequence(endTagBytes, byteLen);

    if (endPos === -1) {
      throw new MCDParserError(
        "Could not locate MCD schema XML end tag in file. File may be corrupt.",
      );
    }
    const xmlEndByte = endPos + endTagBytes.byteLength;

    let xmlStartByte = -1;
    for (const startTag of START_TAGS) {
      const startTagBytes = this._strToUtf16LE(startTag);
      const pos = this._findLastSequence(startTagBytes, endPos);
      if (pos !== -1) {
        xmlStartByte = pos;
        break;
      }
    }

    if (xmlStartByte === -1) {
      throw new MCDParserError(
        "Could not locate MCD schema XML start tag in file. File may be corrupt.",
      );
    }

    const xmlBytes = new Uint8Array(this._buffer, xmlStartByte, xmlEndByte - xmlStartByte);
    const decoder  = new TextDecoder("utf-16le");
    return decoder.decode(xmlBytes);
  }

  /** Encodes an ASCII string as UTF-16-LE bytes. */
  private _strToUtf16LE(str: string): Uint8Array {
    const bytes = new Uint8Array(str.length * 2);
    for (let i = 0; i < str.length; i++) {
      bytes[i * 2]     = str.charCodeAt(i) & 0xff;
      bytes[i * 2 + 1] = 0;
    }
    return bytes;
  }

  /**
   * Searches for the last occurrence of `needle` within the first `searchUpTo`
   * bytes of the buffer. Returns the byte offset of the match start, or -1.
   */
  private _findLastSequence(needle: Uint8Array, searchUpTo: number): number {
    const haystack = new Uint8Array(this._buffer);
    const limit    = Math.min(searchUpTo, haystack.length - needle.length);
    outer: for (let i = limit; i >= 0; i--) {
      for (let j = 0; j < needle.length; j++) {
        if (haystack[i + j] !== needle[j]) continue outer;
      }
      return i;
    }
    return -1;
  }

  /** Reads bytes [start, end) as a Float32Array (copies to ensure 4-byte alignment). */
  private _readBlobAsFloat32(start: number, end: number): Float32Array {
    if (start < 0 || end > this._buffer.byteLength || start >= end) {
      throw new MCDParserError(
        `Invalid data range [${start}, ${end}) for buffer of size ${this._buffer.byteLength}`,
      );
    }
    const aligned = this._buffer.slice(start, end);
    return new Float32Array(aligned, 0, Math.floor((end - start) / 4));
  }
  
  /** Reads bytes [start, end) as a Uint8Array view. Returns null for missing/zero offsets. */
  private _readImageBlob(
    start: number | null,
    end: number | null,
  ): Uint8Array | null {
    if (start === null || end === null) return null;
    if (start === 0 && end === 0) return null;
    if (start < 0 || end > this._buffer.byteLength || start >= end) return null;
    return new Uint8Array(this._buffer, start, end - start);
  }
}