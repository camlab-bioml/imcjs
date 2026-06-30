import type { Acquisition, Panorama, Slide, NDArray, ByteSource } from "./data";
import { MCDParser, MCDParserError } from "./mcd_parser";
export { MCDParserError };


/** Browser/Blob-backed source. Reads are lazy `Blob.slice()` calls — nothing
 * is loaded until `read()` is actually called. */
class BlobByteSource implements ByteSource {
  readonly size: number;
  constructor(private readonly blob: Blob) {
    this.size = blob.size;
  }
  async read(start: number, end: number): Promise<Uint8Array> {
    const buf = await this.blob.slice(start, end).arrayBuffer();
    return new Uint8Array(buf);
  }
}

/** Node.js file-handle-backed source. Reads pull only the requested byte
 * range off disk. */
class NodeFileByteSource implements ByteSource {
  readonly size: number;
  private constructor(private readonly fd: any, size: number) {
    this.size = size;
  }
  static async open(path: string): Promise<NodeFileByteSource> {
    const fs = await import("fs/promises");
    const fd = await fs.open(path, "r");
    const stat = await fd.stat();
    return new NodeFileByteSource(fd, stat.size);
  }
  async read(start: number, end: number): Promise<Uint8Array> {
    const length = end - start;
    const buf = Buffer.alloc(length);
    await this.fd.read(buf, 0, length, start);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  async close(): Promise<void> {
    await this.fd.close();
  }
}

/** Tail window used to locate the schema XML, doubled if not found. */
const TAIL_CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB
/** Cap on bytes read per chunk when streaming acquisition pixel data. */
const ROW_CHUNK_BYTES = 16 * 1024 * 1024; // 16 MB

export class MCDFile {
  private readonly _source: ByteSource;
  private _schemaXml: string | null = null;
  private _schemaXmlPromise: Promise<string> | null = null;
  private _slides: Slide[] | null = null;
  private _slidesPromise: Promise<Slide[]> | null = null;

  private constructor(source: ByteSource) {
    this._source = source;
  }

  /** Open an MCD file from a browser File/Blob. No data is read yet. */
  static fromFile(file: File | Blob): MCDFile {
    return new MCDFile(new BlobByteSource(file));
  }

  /** Open an MCD file from a path on disk (Node.js only). */
  static async fromPath(path: string): Promise<MCDFile> {
    return new MCDFile(await NodeFileByteSource.open(path));
  }

  /** Open from a custom ByteSource (e.g. a network-backed range-reader). */
  static fromByteSource(source: ByteSource): MCDFile {
    return new MCDFile(source);
  }
  
  /** Release any underlying file handle (Node.js). Safe no-op for Blob sources. */
  async close(): Promise<void> {
    await this._source.close?.();
  }

  get sizeBytes(): number {
    return this._source.size;
  }

  /**
   * Full metadata in proprietary XML format, UTF-16-LE encoded near the end
   * of the file. Only the trailing window containing the XML is ever read,
   * regardless of total file size.
   */
  async getSchemaXml(): Promise<string> {
    if (this._schemaXml !== null) return this._schemaXml;
    if (!this._schemaXmlPromise) {
      this._schemaXmlPromise = this._extractSchemaXml();
    }
    this._schemaXml = await this._schemaXmlPromise;
    return this._schemaXml;
  }

  /** Alias for getSchemaXml (legacy compat). */
  async getMetadata(): Promise<string> {
    return this.getSchemaXml();
  }

  /** Slides contained in this MCD file. Parses schemaXml on first access. */
  async getSlides(): Promise<readonly Slide[]> {
    if (this._slides !== null) return this._slides;
    if (!this._slidesPromise) {
      this._slidesPromise = (async () => {
        const xml = await this.getSchemaXml();
        return new MCDParser(xml).parseSlides();
      })();
    }
    this._slides = await this._slidesPromise;
    return this._slides;
  }

  /** All acquisitions across all slides, keyed by acquisition ID. */
  async getAcquisitions(): Promise<readonly Acquisition[]> {
    const slides = await this.getSlides();
    return slides.flatMap((s) => s.acquisitions);
  }

  /** All acquisition description strings across all slides. */
  async getAcquisitionNames(): Promise<readonly (string | null)[]> {
    const slides = await this.getSlides();
    return slides.flatMap((s) => s.acquisitions.map((a) => a.description));
  }

  /** All acquisition IDs (position integers). */
  async getAcquisitionIDs(): Promise<readonly number[]> {
    const slides = await this.getSlides();
    return slides.flatMap((s) => s.acquisitions.map((a) => a.id));
  }

  /**
   * Reads an IMC acquisition as a Float32Array laid out [c, y, x].
   * Pixel data is streamed in row batches (bounded by ROW_CHUNK_BYTES)
   * rather than loaded in one shot, so this scales to acquisitions whose
   * raw byte range would itself exceed available memory.
   *
   * @param acquisition - The acquisition to read.
   * @param options.channels - Optional subset of 0-based channel indices to return.
   * @param options.region   - Optional [xMin, yMin, xMax, yMax] crop region in pixels.
   * @param options.onProgress - Optional callback fired after each row batch.
   */
  async readAcquisition(
    acquisition: Acquisition,
    options?: {
      // IMP: output channel order matches options.channels order
      channels?: number[];
      region?: readonly [number, number, number, number];
      onProgress?: (rowsRead: number, totalRows: number) => void;
    },
  ): Promise<NDArray> {
    const start = acquisition._dataStartOffset;
    const end = acquisition._dataEndOffset;

    if (start === 0 && end === 0) {
      throw new MCDParserError(`Acquisition ${acquisition.id} has no data offsets.`);
    }

    const signalC = acquisition.numChannels;
    const h = acquisition.heightPx ?? 0;
    const w = acquisition.widthPx ?? 0;

    if (signalC === 0 || h === 0 || w === 0) {
      throw new MCDParserError(
        `Acquisition ${acquisition.id} has invalid dimensions: ${signalC}c × ${h}h × ${w}w`,
      );
    }

    // Derive stride from the byte range size — no need to read anything yet.
    const totalFloats = (end - start) / 4;
    const pixelCount = h * w;
    const stride = Math.round(totalFloats / pixelCount);
    const coordCols = stride - signalC; // typically 3 (X, Y, Z)
    const firstSigCol = Math.max(coordCols, 0);

    const channels = options?.channels ?? Array.from({ length: signalC }, (_, i) => i);
    const [xMin, yMin, xMax, yMax] = options?.region ?? [0, 0, w, h];
    const outW = xMax - xMin;
    const outH = yMax - yMin;
    const outC = channels.length;
    const out = new Float32Array(outC * outH * outW);

    const bytesPerRow = w * stride * 4;
    const rowsPerChunk = Math.max(1, Math.floor(ROW_CHUNK_BYTES / bytesPerRow));

    for (let yChunkStart = yMin; yChunkStart < yMax; yChunkStart += rowsPerChunk) {
      const yChunkEnd = Math.min(yChunkStart + rowsPerChunk, yMax);
      const chunkByteStart = start + yChunkStart * bytesPerRow;
      const chunkByteEnd = start + yChunkEnd * bytesPerRow;

      const raw = await this._readFloat32Range(chunkByteStart, chunkByteEnd);

      for (let y = yChunkStart; y < yChunkEnd; y++) {
        const rowFloatOffset = (y - yChunkStart) * w * stride;
        for (let ci = 0; ci < outC; ci++) {
          const colInStride = firstSigCol + channels[ci];
          for (let x = xMin; x < xMax; x++) {
            const srcIdx = rowFloatOffset + x * stride + colInStride;
            const dstIdx = ci * outH * outW + (y - yMin) * outW + (x - xMin);
            out[dstIdx] = srcIdx < raw.length ? raw[srcIdx] : 0;
          }
        }
      }

      options?.onProgress?.(yChunkEnd - yMin, outH);
    }

    return { data: out, shape: [outC, outH, outW] };
  }

  /** Shape of an acquisition as [numChannels, height, width]. No I/O. */
  acquisitionShape(acquisition: Acquisition): [number, number, number] {
    return [acquisition.numChannels, acquisition.heightPx ?? 0, acquisition.widthPx ?? 0];
  }

  /** Reads a slide image as raw bytes (e.g. JPEG/PNG), or null if unavailable. */
  async readSlideRaw(slide: Slide): Promise<Uint8Array | null> {
    const start = slide._imageStartOffset == null ? slide._imageStartOffset : slide._imageStartOffset + 161;
    const end = slide._imageEndOffset == null ? slide._imageEndOffset : slide._imageEndOffset - 1;
    return this._readImageBlob(start, end);
  }

  /** Reads a slide image and returns an ImageBitmap (browser) or Uint8Array (Node). */
  async readSlide(slide: Slide): Promise<ImageBitmap | Uint8Array | null> {
    const raw = await this.readSlideRaw(slide);
    if (!raw) return null;
    if (typeof createImageBitmap !== "undefined") {
      return createImageBitmap(new Blob([Uint8Array.from(raw)]));
    }
    return raw;
  }

  /** Reads a panorama image as raw bytes, or null if unavailable. */
  async readPanoramaRaw(panorama: Panorama): Promise<Uint8Array | null> {
    const start = panorama._imageStartOffset == null ? panorama._imageStartOffset : panorama._imageStartOffset + 161;
    const end = panorama._imageEndOffset == null ? panorama._imageEndOffset : panorama._imageEndOffset - 1;
    return this._readImageBlob(start, end);
  }

  /** Reads a panorama image and returns an ImageBitmap (browser) or Uint8Array (Node). */
  async readPanorama(panorama: Panorama): Promise<ImageBitmap | Uint8Array | null> {
    const raw = await this.readPanoramaRaw(panorama);
    if (!raw) return null;
    if (typeof createImageBitmap !== "undefined") {
      return createImageBitmap(new Blob([Uint8Array.from(raw)]));
    }
    return raw;
  }

  /** Reads the before-ablation image for an acquisition as raw bytes. */
  async readBeforeAblationImageRaw(acquisition: Acquisition): Promise<Uint8Array | null> {
    const start =
      acquisition._beforeAblationImageStartOffset == null
        ? acquisition._beforeAblationImageStartOffset
        : acquisition._beforeAblationImageStartOffset + 161;
    const end =
      acquisition._beforeAblationImageEndOffset == null
        ? acquisition._beforeAblationImageEndOffset
        : acquisition._beforeAblationImageEndOffset - 1;
    return this._readImageBlob(start, end);
  }

  /** Reads the before-ablation image and returns an ImageBitmap or Uint8Array. */
  async readBeforeAblationImage(acquisition: Acquisition): Promise<ImageBitmap | Uint8Array | null> {
    const raw = await this.readBeforeAblationImageRaw(acquisition);
    if (!raw) return null;
    if (typeof createImageBitmap !== "undefined") {
      return createImageBitmap(new Blob([Uint8Array.from(raw)]));
    }
    return raw;
  }

  /** Reads the after-ablation image for an acquisition as raw bytes. */
  async readAfterAblationImageRaw(acquisition: Acquisition): Promise<Uint8Array | null> {
    const start =
      acquisition._afterAblationImageStartOffset == null
        ? acquisition._afterAblationImageStartOffset
        : acquisition._afterAblationImageStartOffset + 161;
    const end =
      acquisition._afterAblationImageEndOffset == null
        ? acquisition._afterAblationImageEndOffset
        : acquisition._afterAblationImageEndOffset - 1;
    return this._readImageBlob(start, end);
  }

  /** Reads the after-ablation image and returns an ImageBitmap or Uint8Array. */
  async readAfterAblationImage(acquisition: Acquisition): Promise<ImageBitmap | Uint8Array | null> {
    const raw = await this.readAfterAblationImageRaw(acquisition);
    if (!raw) return null;
    if (typeof createImageBitmap !== "undefined") {
      return createImageBitmap(new Blob([Uint8Array.from(raw)]));
    }
    return raw;
  }

  /**
   * Locates and extracts the schema XML embedded at the end of the file.
   * Starts with an 8MB tail window and doubles it backward only if the
   * start tag isn't found in the current window — so for a typical MCD
   * file (XML much smaller than the file itself) this reads a few MB
   * total, never the whole file.
   */
  private async _extractSchemaXml(): Promise<string> {
    const fileSize = this._source.size;
    const START_TAGS = ["<MCDSchema", "<mcdSchema", "<McdSchema"];
    const END_TAG = "</MCDSchema>";
    const endTagBytes = this._strToUtf16LE(END_TAG);

    let chunkSize = Math.min(TAIL_CHUNK_SIZE, fileSize);

    while (true) {
      const windowStart = Math.max(0, fileSize - chunkSize);
      const bytes = await this._source.read(windowStart, fileSize);

      const endPosInWindow = this._findLastSequence(bytes, endTagBytes, bytes.length);

      if (endPosInWindow !== -1) {
        let startPosInWindow = -1;
        for (const tag of START_TAGS) {
          const tagBytes = this._strToUtf16LE(tag);
          const pos = this._findLastSequence(bytes, tagBytes, endPosInWindow);
          if (pos !== -1) {
            startPosInWindow = pos;
            break;
          }
        }

        if (startPosInWindow !== -1) {
          const xmlEnd = endPosInWindow + endTagBytes.length;
          const decoder = new TextDecoder("utf-16le");
          return decoder.decode(bytes.subarray(startPosInWindow, xmlEnd));
        }

        if (windowStart === 0) {
          throw new MCDParserError("Could not locate MCD schema XML start tag in file. File may be corrupt.");
        }
        // End tag found but start tag is further back — grow the window and retry.
      } else if (windowStart === 0) {
        throw new MCDParserError("Could not locate MCD schema XML end tag in file. File may be corrupt.");
      }

      chunkSize = Math.min(chunkSize * 2, fileSize);
    }
  }

  /** Encodes an ASCII string as UTF-16-LE bytes. */
  private _strToUtf16LE(str: string): Uint8Array {
    const bytes = new Uint8Array(str.length * 2);
    for (let i = 0; i < str.length; i++) {
      bytes[i * 2] = str.charCodeAt(i) & 0xff;
      bytes[i * 2 + 1] = 0;
    }
    return bytes;
  }

  /** Finds the last occurrence of `needle` within haystack[0, searchUpTo). */
  private _findLastSequence(haystack: Uint8Array, needle: Uint8Array, searchUpTo: number): number {
    const limit = Math.min(searchUpTo, haystack.length - needle.length);
    outer: for (let i = limit; i >= 0; i--) {
      for (let j = 0; j < needle.length; j++) {
        if (haystack[i + j] !== needle[j]) continue outer;
      }
      return i;
    }
    return -1;
  }

  /** Reads bytes [start, end) from the source as an aligned Float32Array. */
  private async _readFloat32Range(start: number, end: number): Promise<Float32Array> {
    if (start < 0 || end > this._source.size || start >= end) {
      throw new MCDParserError(`Invalid data range [${start}, ${end}) for source of size ${this._source.size}`);
    }
    const bytes = await this._source.read(start, end);
    // .slice() copies into a fresh, 0-offset ArrayBuffer, guaranteeing
    // 4-byte alignment regardless of how the source returned the bytes.
    const copy = bytes.slice();
    return new Float32Array(copy.buffer, 0, Math.floor(copy.byteLength / 4));
  }

  /** Reads bytes [start, end) as a Uint8Array. Returns null for missing/zero offsets. */
  private async _readImageBlob(start: number | null, end: number | null): Promise<Uint8Array | null> {
    if (start === null || end === null) return null;
    if (start === 0 && end === 0) return null;
    if (start < 0 || end > this._source.size || start >= end) return null;
    return this._source.read(start, end);
  }
}