/**
 * Imaging mass cytometry (IMC) metadata types.
 */

/** Shared IMC acquisition channel interface */
export interface AcquisitionBase {
  numChannels: number;
  /** Symbols of metal isotopes (e.g. ["Ag", "Ir"]) */
  channelMetals: string[];
  /** Atomic masses of metal isotopes (e.g. [107, 191]) */
  channelMasses: number[];
  /** Channel labels (user-provided) */
  channelLabels: string[];
  /** Unique channel names in the format `${metal}${mass}` (e.g. ["Ag107", "Ir191"]) */
  channelNames: string[];
}

/** IMC acquisition metadata */
export interface Acquisition extends AcquisitionBase {
  /** Parent slide */
  slide: Slide;
  /** Associated panorama (if any) */
  panorama: Panorama | null;
  /** Acquisition ID */
  id: number;
  /** User-provided acquisition description */
  description: string | null;
  /** Acquisition width in pixels */
  widthPx: number | null;
  /** Acquisition height in pixels */
  heightPx: number | null;
  /** Width of a single pixel in micrometers */
  pixelSizeXUm: number | null;
  /** Height of a single pixel in micrometers */
  pixelSizeYUm: number | null;
  /** Acquisition width in micrometers */
  widthUm: number | null;
  /** Acquisition height in micrometers */
  heightUm: number | null;
  /**
   * User-provided ROI points in micrometers.
   * Order: [topLeft, topRight, bottomRight, bottomLeft]
   */
  roiPointsUm: [
    [number, number],
    [number, number],
    [number, number],
    [number, number],
  ] | null;
  /**
   * ROI stage coordinates in micrometers.
   * Order: [topLeft, topRight, bottomRight, bottomLeft]
   */
  roiCoordsUm: [
    [number, number],
    [number, number],
    [number, number],
    [number, number],
  ] | null;
  /** Full acquisition metadata from XML */
  metadata: Readonly<Record<string, string>>;
  // Internal fields used by MCDFile for reading
  _dataStartOffset: number;
  _dataEndOffset: number;
  _beforeAblationImageStartOffset: number | null;
  _beforeAblationImageEndOffset: number | null;
  _afterAblationImageStartOffset: number | null;
  _afterAblationImageEndOffset: number | null;
}

/** Panorama metadata */
export interface Panorama {
  /** Parent slide */
  slide: Slide;
  /** Panorama ID */
  id: number;
  /** User-provided panorama description */
  description: string | null;
  /** Panorama width in micrometers */
  widthUm: number | null;
  /** Panorama height in micrometers */
  heightUm: number | null;
  /**
   * User-provided ROI points in micrometers.
   * Order: [topLeft, topRight, bottomRight, bottomLeft]
   */
  pointsUm: [
    [number, number],
    [number, number],
    [number, number],
    [number, number],
  ] | null;
  /** List of acquisitions associated with this panorama */
  acquisitions: Acquisition[];
  /** Full panorama metadata from XML */
  metadata: Readonly<Record<string, string>>;
  // Internal
  _imageStartOffset: number | null;
  _imageEndOffset: number | null;
}

/** Slide metadata */
export interface Slide {
  /** Slide ID */
  id: number;
  /** User-provided slide description */
  description: string | null;
  /** Slide width in micrometers */
  widthUm: number | null;
  /** Slide height in micrometers */
  heightUm: number | null;
  /** List of panoramas with image data associated with this slide */
  panoramas: Panorama[];
  /** List of acquisitions associated with this slide */
  acquisitions: Acquisition[];
  /** Full slide metadata from XML */
  metadata: Readonly<Record<string, string>>;
  // Internal
  _imageStartOffset: number | null;
  _imageEndOffset: number | null;
}

/** Basic structure for array-like data */
export interface NDArray {
  
  /** Array-type data */
  data: Float32Array;
  
  /** Array of data shape, in the form (c, h, w) or (c, y, x) */
  shape: number[];
}

/**
 * Minimal random-access byte source. Implemented separately for browser
 * (File/Blob) and Node.js (file handle) so MCDFile never has to hold the
 * whole file in memory.
 */
export interface ByteSource {
  readonly size: number;
  /** Read bytes [start, end) and return them as a Uint8Array. */
  read(start: number, end: number): Promise<Uint8Array>;
  close?(): Promise<void>;
}
