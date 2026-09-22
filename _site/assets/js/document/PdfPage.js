import { PdfDictionary } from '../objects/PdfDictionary.js';
import { PdfArray } from '../objects/PdfArray.js';
import { PdfNumber } from '../objects/PdfNumber.js';
import { PdfResources } from './PdfResources.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Represents a single page (`/Type /Page`) in the PDF document.
 */
export class PdfPage {
  /** @type {PdfDictionary} */
  #dictionary;

  /** @type {number} */
  #pageIndex;

  /** @type {Object} */
  #document;

  /**
   * @param {PdfDictionary} dictionary
   * @param {number} pageIndex - 0-indexed page number
   * @param {Object} document - Parent PdfDocument
   */
  constructor(dictionary, pageIndex, document) {
    if (!(dictionary instanceof PdfDictionary)) {
      throw new PdfInvalidArgumentException('dictionary', dictionary, 'PdfDictionary');
    }
    if (typeof pageIndex !== 'number' || pageIndex < 0) {
      throw new PdfInvalidArgumentException('pageIndex', pageIndex, 'non-negative integer');
    }
    this.#dictionary = dictionary;
    this.#pageIndex = pageIndex;
    this.#document = document;
  }

  get dictionary() {
    return this.#dictionary;
  }

  get pageIndex() {
    return this.#pageIndex;
  }

  get document() {
    return this.#document;
  }

  /**
   * Helper to resolve indirect objects.
   * @private
   */
  #resolve(obj) {
    if (this.#document && typeof this.#document.resolve === 'function') {
      return this.#document.resolve(obj);
    }
    return obj;
  }

  /**
   * Returns /MediaBox `[x1, y1, x2, y2]` (inheriting from parent page tree nodes if needed).
   * Defaults to [0, 0, 612, 792] if absent.
   * 
   * @returns {Array<number>}
   */
  getMediaBox() {
    let current = this.#dictionary;
    while (current) {
      const box = this.#resolve(current.get('MediaBox'));
      if (box && box.isArray() && box.size() >= 4) {
        return [
          box.getNumber(0) || 0,
          box.getNumber(1) || 0,
          box.getNumber(2) || 0,
          box.getNumber(3) || 0
        ];
      }
      const parent = this.#resolve(current.get('Parent'));
      current = parent && parent.isDictionary() ? parent : null;
    }
    return [0, 0, 612, 792]; // Standard US Letter default
  }

  /**
   * Returns /CropBox `[x1, y1, x2, y2]` (defaults to MediaBox if not specified).
   * @returns {Array<number>}
   */
  getCropBox() {
    let current = this.#dictionary;
    while (current) {
      const box = this.#resolve(current.get('CropBox'));
      if (box && box.isArray() && box.size() >= 4) {
        return [
          box.getNumber(0) || 0,
          box.getNumber(1) || 0,
          box.getNumber(2) || 0,
          box.getNumber(3) || 0
        ];
      }
      const parent = this.#resolve(current.get('Parent'));
      current = parent && parent.isDictionary() ? parent : null;
    }
    return this.getMediaBox();
  }

  /**
   * Returns /Rotate angle in degrees (0, 90, 180, 270) (inherited from parent if needed).
   * @returns {number}
   */
  getRotation() {
    let current = this.#dictionary;
    while (current) {
      const rot = this.#resolve(current.get('Rotate'));
      if (rot && rot.isNumber()) {
        const deg = rot.intValue() % 360;
        return deg < 0 ? deg + 360 : deg;
      }
      const parent = this.#resolve(current.get('Parent'));
      current = parent && parent.isDictionary() ? parent : null;
    }
    return 0;
  }

  /**
   * Returns visual page dimensions `{ width, height }` taking CropBox/MediaBox and rotation into account.
   * @returns {{ width: number, height: number }}
   */
  getSize() {
    const box = this.getCropBox();
    const rawWidth = Math.abs(box[2] - box[0]);
    const rawHeight = Math.abs(box[3] - box[1]);
    const rotation = this.getRotation();

    if (rotation === 90 || rotation === 270) {
      return { width: rawHeight, height: rawWidth };
    }
    return { width: rawWidth, height: rawHeight };
  }

  /**
   * Returns page /Resources (inheriting from parent tree if needed).
   * @returns {PdfResources}
   */
  getResources() {
    let current = this.#dictionary;
    while (current) {
      const res = this.#resolve(current.get('Resources'));
      if (res && res.isDictionary()) {
        return new PdfResources(res, this.#document);
      }
      const parent = this.#resolve(current.get('Parent'));
      current = parent && parent.isDictionary() ? parent : null;
    }
    return new PdfResources(new PdfDictionary(), this.#document);
  }

  /**
   * Returns page content stream(s) as an array of PdfStream.
   * @returns {Array<PdfObject>}
   */
  getContents() {
    const contents = this.#resolve(this.#dictionary.get('Contents'));
    if (!contents) {
      return [];
    }
    if (contents.isArray()) {
      const streams = [];
      for (const item of contents) {
        const resolved = this.#resolve(item);
        if (resolved) {
          streams.push(resolved);
        }
      }
      return streams;
    }
    return [contents];
  }

  /**
   * Returns parent /Pages node.
   * @returns {PdfDictionary|null}
   */
  getParent() {
    const p = this.#resolve(this.#dictionary.get('Parent'));
    return p && p.isDictionary() ? p : null;
  }

  /**
   * Extracts clean plain text from this page.
   * @returns {string}
   */
  extractText() {
    const { PdfTextExtractor } = pageExtractionHelper;
    return PdfTextExtractor.extractText(this);
  }

  /**
   * Extracts detailed text items with coordinates and metadata from this page.
   * @returns {Array<Object>}
   */
  extractTextItems() {
    const { PdfTextExtractor } = pageExtractionHelper;
    return PdfTextExtractor.extractTextItems(this);
  }

  /**
   * Extracts all images drawn on this page with coordinates and metadata.
   * @returns {Array<Object>}
   */
  extractImages() {
    const { PdfImageExtractor } = pageExtractionHelper;
    return PdfImageExtractor.extractImages(this);
  }

  /**
   * Renders this page to an HTML5 Canvas context.
   * 
   * @param {HTMLCanvasElement|CanvasRenderingContext2D|Object} canvasOrContext
   * @param {Object} [options={}]
   * @returns {Object} - Viewport details
   */
  renderToCanvas(canvasOrContext, options = {}) {
    const { PdfRenderer } = pageExtractionHelper;
    return PdfRenderer.renderToCanvas(this, canvasOrContext, options);
  }

  /**
   * Renders this page to a scalable SVG XML string.
   * 
   * @param {Object} [options={}]
   * @returns {string} - SVG XML string
   */
  renderToSvg(options = {}) {
    const { PdfRenderer } = pageExtractionHelper;
    return PdfRenderer.renderToSvg(this, options);
  }

  /**
   * Returns visual rendering viewport for this page.
   * 
   * @param {Object} [options={}]
   * @returns {Object}
   */
  getViewport(options = {}) {
    const { PdfRenderer } = pageExtractionHelper;
    return PdfRenderer.createViewport(this, options);
  }

  /**
   * Creates a PdfPageModifier for fluent drawing onto this page.
   * @returns {Object}
   */
  createModifier() {
    const { PdfPageModifier } = pageExtractionHelper;
    return new PdfPageModifier(this);
  }

  /**
   * Alias for createModifier().
   * @returns {Object}
   */
  getModifier() {
    return this.createModifier();
  }


  /**
   * Draws text onto this page.
   * 
   * @param {string} text
   * @param {Object} [options={}]
   * @returns {PdfPage}
   */
  drawText(text, options = {}) {
    const modifier = this.createModifier();
    modifier.drawText(text, options);
    modifier.commit();
    return this;
  }

  /**
   * Draws a rectangle onto this page.
   * 
   * @param {Object} options
   * @returns {PdfPage}
   */
  drawRectangle(options = {}) {
    const modifier = this.createModifier();
    modifier.drawRectangle(options);
    modifier.commit();
    return this;
  }

  /**
   * Draws a line onto this page.
   * 
   * @param {Object} options
   * @returns {PdfPage}
   */
  drawLine(options = {}) {
    const modifier = this.createModifier();
    modifier.drawLine(options);
    modifier.commit();
    return this;
  }

  /**
   * Draws a circle onto this page.
   * 
   * @param {Object} options
   * @returns {PdfPage}
   */
  drawCircle(options = {}) {
    const modifier = this.createModifier();
    modifier.drawCircle(options);
    modifier.commit();
    return this;
  }

  /**
   * Draws an image onto this page.
   * 
   * @param {Object|Uint8Array} image
   * @param {Object} options
   * @returns {PdfPage}
   */
  drawImage(image, options = {}) {
    const modifier = this.createModifier();
    modifier.drawImage(image, options);
    modifier.commit();
    return this;
  }

  /**
   * Adds a diagonal watermark to this page.
   * 
   * @param {string} text
   * @param {Object} [options={}]
   * @returns {PdfPage}
   */
  addWatermark(text, options = {}) {
    const modifier = this.createModifier();
    modifier.addWatermark(text, options);
    modifier.commit();
    return this;
  }

  /**
   * Adds a clickable link annotation to this page.
   * 
   * @param {Array<number>} rect - [x1, y1, x2, y2]
   * @param {string} uri
   * @returns {PdfPage}
   */
  addLink(rect, uri) {
    const modifier = this.createModifier();
    modifier.addLink(rect, uri);
    return this;
  }
}

export const pageExtractionHelper = {
  PdfTextExtractor: null,
  PdfImageExtractor: null,
  PdfRenderer: null,
  PdfWriter: null,
  PdfPageOperations: null,
  PdfPageModifier: null,
  PdfDocumentModifier: null,
  PdfAcroForm: null,
  PdfSecurityHandler: null
};


