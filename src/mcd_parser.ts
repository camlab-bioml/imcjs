import type { Acquisition, Panorama, Slide } from "./data.js";
import { DOMParser } from "@xmldom/xmldom";
import type { Document as XDocument, Element as XElement } from "@xmldom/xmldom";

export class MCDParserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MCDParserError";
  }
}

/**
 * Parses IMC .mcd file metadata from the embedded XML schema.
 * Mirrors readimc.MCDParser behavior, but uses a relational reconstruction
 * model (NOT XML hierarchy).
 *
 * The MCD schema XML is FLAT — Slide, Panorama, Acquisition, AcquisitionChannel,
 * AcquisitionROI, and ROIPoint are all direct children of <MCDSchema>, linked by
 * ID reference fields (SlideID, AcquisitionID, PanoramaID, etc.).
 *
 * Acquisition → Panorama linkage goes through AcquisitionROI:
 *   Acquisition.AcquisitionROIID → AcquisitionROI.ID → AcquisitionROI.PanoramaID → Panorama.ID
 */
export class MCDParser {
  readonly schemaXml: string;
  private readonly _doc: XDocument;

  constructor(schemaXml: string) {
    this.schemaXml = schemaXml;
    this._doc = new DOMParser().parseFromString(schemaXml, "text/xml");
  }

  get metadata(): string {
    return this.schemaXml;
  }

  get schemaXmlXmlns(): string | null {
    return this._doc.documentElement?.getAttribute("xmlns") ?? null;
  }

  get metadataXmlns(): string | null {
    return this.schemaXmlXmlns;
  }
  
  /** Returns all direct children of the document root with the given tag name. */
  private rootChildren(tag: string): XElement[] {
    const root = this._doc.documentElement;
    if (!root) return [];
    const ns = this.schemaXmlXmlns ?? null;

    let all: XElement[] = ns
      ? (Array.from(root.getElementsByTagNameNS(ns, tag)) as XElement[])
      : [];
    if (all.length === 0) {
      all = Array.from(root.getElementsByTagName(tag)) as XElement[];
    }
    // Only direct children of root, not grandchildren
    return all.filter((el) => el.parentNode === root);
  }

  /** Collects direct child element text content into a Record. */
  private meta(el: XElement): Record<string, string> {
    const out: Record<string, string> = {};
    for (let i = 0; i < el.childNodes.length; i++) {
      const child = el.childNodes[i] as XElement;
      if (child.nodeType !== 1) continue; // ELEMENT_NODE
      const name = child.localName ?? (child as unknown as { tagName: string }).tagName;
      if (name) out[name] = child.textContent?.trim() ?? "";
    }
    return out;
  }

  private toInt(v: string | null | undefined): number | null {
    if (!v) return null;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
  }

  private toFloat(v: string | null | undefined): number | null {
    if (!v) return null;
    const n = parseFloat(v);
    return Number.isNaN(n) ? null : n;
  }


  parseSlides(): Slide[] {
    const slideEls   = this.rootChildren("Slide");
    const panoEls    = this.rootChildren("Panorama");
    const acqEls     = this.rootChildren("Acquisition");
    const channelEls = this.rootChildren("AcquisitionChannel");
    const roiEls     = this.rootChildren("AcquisitionROI");
    const roiPtEls   = this.rootChildren("ROIPoint");

    // This is the bridge between Acquisition and Panorama.

    const panoIdByRoiId = new Map<number, number>();
    for (const el of roiEls) {
      const m = this.meta(el);
      const roiId  = this.toInt(m["ID"]);
      const panoId = this.toInt(m["PanoramaID"]);
      if (roiId !== null && panoId !== null) {
        panoIdByRoiId.set(roiId, panoId);
      }
    }

    // roiId → sorted [x, y] corners ──────────────────────────

    interface RoiPt { order: number; x: number; y: number }
    const ptsByRoiId = new Map<number, RoiPt[]>();
    for (const el of roiPtEls) {
      const m = this.meta(el);
      const roiId = this.toInt(m["AcquisitionROIID"]);
      if (roiId === null) continue;
      const x = this.toFloat(m["SlideXPosUm"]);
      const y = this.toFloat(m["SlideYPosUm"]);
      if (x === null || y === null) continue;
      const order = this.toInt(m["OrderNumber"]) ?? 0;
      if (!ptsByRoiId.has(roiId)) ptsByRoiId.set(roiId, []);
      ptsByRoiId.get(roiId)!.push({ order, x, y });
    }

    // acqId → sorted channel entries ──────────────────────────

    interface ChEntry { order: number; metal: string; mass: number; label: string }
    const channelsByAcqId = new Map<number, ChEntry[]>();

    // X/Y/Z are coordinate columns in the data stream, not signal channels
    const COORD_NAMES = new Set(["X", "Y", "Z"]);

    for (const el of channelEls) {
      const m = this.meta(el);
      const acqId = this.toInt(m["AcquisitionID"]);
      if (acqId === null) continue;

      const rawName = m["ChannelName"] ?? "";
      // Skip coordinate pseudo-channels
      if (COORD_NAMES.has(rawName)) continue;

      // ChannelName formats: "Ir(191)", "ArAr(80)", "Xe(126)", "Gd(158)"
      const match = rawName.match(/^([A-Za-z]+)\(?(\d+)\)?/);
      const metal = match ? match[1] : rawName;
      const mass  = match ? parseInt(match[2], 10) : 0;
      const label = m["ChannelLabel"] ?? rawName;
      const order = this.toInt(m["OrderNumber"] ?? m["ChannelNumber"]) ?? 0;

      if (!channelsByAcqId.has(acqId)) channelsByAcqId.set(acqId, []);
      channelsByAcqId.get(acqId)!.push({ order, metal, mass, label });
    }

    // Sort each acquisition's channels by OrderNumber
    for (const chs of channelsByAcqId.values()) {
      chs.sort((a, b) => a.order - b.order);
    }

    // slides

    const slidesById = new Map<number, Slide>();

    for (const el of slideEls) {
      const m  = this.meta(el);
      const id = this.toInt(m["ID"]) ?? 0;

      const slide: Slide = {
        id,
        description: m["Description"] ?? null,
        widthUm:     this.toFloat(m["WidthUm"]),
        heightUm:    this.toFloat(m["HeightUm"]),
        panoramas:   [],
        acquisitions: [],
        metadata:    m,
        _imageStartOffset: this.toInt(m["ImageStartOffset"]),
        _imageEndOffset:   this.toInt(m["ImageEndOffset"]),
      };

      slidesById.set(id, slide);
    }

    // acquisitions

    const acqById    = new Map<number, Acquisition>();
    // panoId → acquisitions that belong to that panorama
    const acqsByPanoId = new Map<number, Acquisition[]>();

    for (const el of acqEls) {
      const m = this.meta(el);
      const id = this.toInt(m["ID"]) ?? 0;

      // Resolve panorama via AcquisitionROI bridge
      const roiId  = this.toInt(m["AcquisitionROIID"]);
      const panoId = roiId !== null ? (panoIdByRoiId.get(roiId) ?? null) : null;

      // ROI corner points from ROIPoints table
      const rawPts = roiId !== null ? (ptsByRoiId.get(roiId) ?? []) : [];
      rawPts.sort((a, b) => a.order - b.order);
      const roiCoordsUm: Acquisition["roiCoordsUm"] =
        rawPts.length >= 4
          ? [
              [rawPts[0].x, rawPts[0].y],
              [rawPts[1].x, rawPts[1].y],
              [rawPts[2].x, rawPts[2].y],
              [rawPts[3].x, rawPts[3].y],
            ] as unknown as Acquisition["roiCoordsUm"]
          : null;

      // Bounding box from ROIStart/End fields on the Acquisition element itself
      const sx = this.toFloat(m["ROIStartXPosUm"]);
      const sy = this.toFloat(m["ROIStartYPosUm"]);
      const ex = this.toFloat(m["ROIEndXPosUm"]);
      const ey = this.toFloat(m["ROIEndYPosUm"]);
      const roiPointsUm: Acquisition["roiPointsUm"] =
        sx !== null && sy !== null && ex !== null && ey !== null
          ? [[sx, sy], [ex, sy], [ex, ey], [sx, ey]] as unknown as Acquisition["roiPointsUm"]
          : null;

      const chs = channelsByAcqId.get(id) ?? [];
      const maxX = this.toInt(m["MaxX"]);
      const maxY = this.toInt(m["MaxY"]);
      const pxX  = this.toFloat(m["AblationDistanceBetweenShotsX"]);
      const pxY  = this.toFloat(m["AblationDistanceBetweenShotsY"]);

      const acq: Acquisition = {
        id,
        slide:   null as unknown as Slide,
        panorama: null,

        description:  m["Description"] ?? null,
        widthPx:      maxX,
        heightPx:     maxY,
        pixelSizeXUm: pxX,
        pixelSizeYUm: pxY,
        widthUm:      maxX !== null && pxX !== null ? maxX * pxX : null,
        heightUm:     maxY !== null && pxY !== null ? maxY * pxY : null,

        roiPointsUm,
        roiCoordsUm,

        numChannels:   chs.length,
        channelMetals: chs.map((c) => c.metal),
        channelMasses: chs.map((c) => c.mass),
        channelLabels: chs.map((c) => c.label),
        channelNames:  chs.map((c) => `${c.metal}${c.mass}`),

        metadata: m,

        _dataStartOffset: this.toInt(m["DataStartOffset"]) ?? 0,
        _dataEndOffset:   this.toInt(m["DataEndOffset"])   ?? 0,

        _beforeAblationImageStartOffset: this.toInt(m["BeforeAblationImageStartOffset"]),
        _beforeAblationImageEndOffset:   this.toInt(m["BeforeAblationImageEndOffset"]),
        _afterAblationImageStartOffset:  this.toInt(m["AfterAblationImageStartOffset"]),
        _afterAblationImageEndOffset:    this.toInt(m["AfterAblationImageEndOffset"]),
      };

      acqById.set(id, acq);

      if (panoId !== null) {
        if (!acqsByPanoId.has(panoId)) acqsByPanoId.set(panoId, []);
        acqsByPanoId.get(panoId)!.push(acq);
      }
    }

    // panoramas
    
    const panoramasById = new Map<number, Panorama>();

    for (const el of panoEls) {
      const m       = this.meta(el);
      const id      = this.toInt(m["ID"]) ?? 0;
      const slideId = this.toInt(m["SlideID"]);
      
      // Skip "Default" virtual panoramas (no real image data)
      //if ((m["Type"] ?? "").toLowerCase() === "default") continue;

      const ptKeys: [string, string][] = [
        ["SlideX1PosUm", "SlideY1PosUm"],
        ["SlideX2PosUm", "SlideY2PosUm"],
        ["SlideX3PosUm", "SlideY3PosUm"],
        ["SlideX4PosUm", "SlideY4PosUm"],
      ];
      const pts = ptKeys.map(([xk, yk]) => {
        const x = this.toFloat(m[xk]);
        const y = this.toFloat(m[yk]);
        return x !== null && y !== null ? [x, y] : null;
      });
      const pointsUm = pts.every((p) => p !== null)
        ? (pts as unknown as Panorama["pointsUm"])
        : null;

      const panoAcqs = acqsByPanoId.get(id) ?? [];

      const pano: Panorama = {
        id,
        slide:       null as unknown as Slide,
        description: m["Description"] ?? null,
        widthUm:     this.toFloat(m["Width"] ?? m["WidthUm"]),
        heightUm:    this.toFloat(m["Height"] ?? m["HeightUm"]),
        pointsUm,
        acquisitions: panoAcqs,
        metadata:    m,
        _imageStartOffset: this.toInt(m["ImageStartOffset"]),
        _imageEndOffset:   this.toInt(m["ImageEndOffset"]),
      };

      // link panorama → acquisitions
      for (const acq of panoAcqs) {
        (acq as { panorama: Panorama }).panorama = pano;
      }

      panoramasById.set(id, pano);

      // link slides and panorama
      const slide = slideId !== null ? slidesById.get(slideId) : null;
      if (slide) {
        (pano as { slide: Slide }).slide = slide;
        (slide.panoramas as Panorama[]).push(pano);

        // Add this panorama's acquisitions to the slide
        for (const acq of panoAcqs) {
          (acq as { slide: Slide }).slide = slide;
          (slide.acquisitions as Acquisition[]).push(acq);
        }
      }
    }

    return Array.from(slidesById.values());
  }
}