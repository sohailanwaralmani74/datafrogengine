import { PdfContentBuilder } from '../content/PdfContentBuilder.js';
import { PdfAnnotation } from './PdfAnnotation.js';
import { PdfDictionary } from '../objects/PdfDictionary.js';
import { PdfArray } from '../objects/PdfArray.js';
import { PdfName } from '../objects/PdfName.js';
import { PdfNumber } from '../objects/PdfNumber.js';
import { PdfStream } from '../objects/PdfStream.js';
import { PdfImage } from '../images/PdfImage.js';
import { PdfPage, pageExtractionHelper } from '../document/PdfPage.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * High-level modifier for adding text, shapes, images, watermarks, and annotations to a PDF page.
 */
export class PdfPageModifier {
  /** @type {PdfPage} */
  #page;

  /** @type {PdfContentBuilder} */
  #builder;

  /** @type {Map<string, string>} Font base name -> resource key (e.g. 'Helvetica' -> 'F1') */
  #fontResourceMap;

  /** @type {number} */
  #nextImageId = 1;

  /**
   * @param {PdfPage} page
   */
  constructor(page) {
    if (!(page instanceof PdfPage)) {
      throw new PdfInvalidArgumentException('page', page, 'PdfPage');
    }
    this.#page = page;
    this.#builder = new PdfContentBuilder();
    this.#fontResourceMap = new Map();
  }

  get page() {
    return this.#page;
  }

  get builder() {
    return this.#builder;
  }

  /**
   * Draws formatted text onto the page.
   * 
   * @param {string} text
   * @param {Object} [options={}]
   * @param {number} [options.x=50]
   * @param {number} [options.y=50]
   * @param {number} [options.size=12]
   * @param {string} [options.font='Helvetica'] - Standard 14 font name
   * @param {string|Array<number>} [options.color='#000000']
   * @param {number} [options.rotate=0] - Degrees
   * @param {string} [options.align='left'] - 'left' | 'center' | 'right'
   * @returns {PdfPageModifier}
   */
  drawText(text, options = {}) {
    if (typeof text !== 'string' || text.length === 0) {
      return this;
    }

    const {
      x = 50,
      y = 50,
      size = 12,
      font = 'Helvetica',
      color = '#000000',
      rotate = 0,
      align = 'left'
    } = options;

    const fontResKey = this.#getOrRegisterFont(font);
    const [r, g, b] = PdfPageModifier.#parseColor(color);

    this.#builder.saveGraphicsState();
    this.#builder.setFillColorRgb(r, g, b);

    // Calculate alignment offset if center or right
    let drawX = x;
    if (align === 'center' || align === 'right') {
      const approxWidth = text.length * size * 0.55; // Average proportional font width factor
      if (align === 'center') {
        drawX -= approxWidth / 2;
      } else if (align === 'right') {
        drawX -= approxWidth;
      }
    }

    if (rotate !== 0) {
      this.#builder.translate(drawX, y);
      this.#builder.rotate(rotate);
      this.#builder.beginText();
      this.#builder.setFont(fontResKey, size);
      this.#builder.showText(text);
      this.#builder.endText();
    } else {
      this.#builder.beginText();
      this.#builder.setFont(fontResKey, size);
      this.#builder.setTextMatrix(1, 0, 0, 1, drawX, y);
      this.#builder.showText(text);
      this.#builder.endText();
    }

    this.#builder.restoreGraphicsState();
    return this;
  }

  /**
   * Draws a rectangle on the page.
   * 
   * @param {Object} options
   * @param {number} options.x
   * @param {number} options.y
   * @param {number} options.width
   * @param {number} options.height
   * @param {string|Array<number>} [options.fillColor=null]
   * @param {string|Array<number>} [options.borderColor=null]
   * @param {number} [options.borderWidth=1]
   * @param {number} [options.rotate=0]
   * @returns {PdfPageModifier}
   */
  drawRectangle(options = {}) {
    const {
      x = 0,
      y = 0,
      width = 100,
      height = 100,
      fillColor = null,
      borderColor = null,
      borderWidth = 1,
      rotate = 0
    } = options;

    this.#builder.saveGraphicsState();

    if (rotate !== 0) {
      this.#builder.translate(x, y);
      this.#builder.rotate(rotate);
      this.#builder.rectangle(0, 0, width, height);
    } else {
      this.#builder.rectangle(x, y, width, height);
    }

    this.#applyFillAndStroke(fillColor, borderColor, borderWidth);
    this.#builder.restoreGraphicsState();
    return this;
  }

  /**
   * Draws a straight line between two points.
   * 
   * @param {Object} options
   * @param {{ x: number, y: number }} options.start
   * @param {{ x: number, y: number }} options.end
   * @param {string|Array<number>} [options.color='#000000']
   * @param {number} [options.thickness=1]
   * @param {Array<number>} [options.dashArray=null]
   * @returns {PdfPageModifier}
   */
  drawLine(options = {}) {
    const {
      start = { x: 0, y: 0 },
      end = { x: 100, y: 100 },
      color = '#000000',
      thickness = 1,
      dashArray = null
    } = options;

    const [r, g, b] = PdfPageModifier.#parseColor(color);

    this.#builder.saveGraphicsState();
    this.#builder.setStrokeColorRgb(r, g, b);
    this.#builder.setLineWidth(thickness);
    if (dashArray) {
      this.#builder.setDashPattern(dashArray);
    }

    this.#builder.moveTo(start.x, start.y);
    this.#builder.lineTo(end.x, end.y);
    this.#builder.stroke();
    this.#builder.restoreGraphicsState();

    return this;
  }

  /**
   * Draws a circle.
   * 
   * @param {Object} options
   * @param {number} options.x - Center X
   * @param {number} options.y - Center Y
   * @param {number} options.radius
   * @param {string|Array<number>} [options.fillColor=null]
   * @param {string|Array<number>} [options.borderColor=null]
   * @param {number} [options.borderWidth=1]
   * @returns {PdfPageModifier}
   */
  drawCircle(options = {}) {
    const {
      x = 100,
      y = 100,
      radius = 50,
      fillColor = null,
      borderColor = null,
      borderWidth = 1
    } = options;

    this.#builder.saveGraphicsState();
    this.#builder.circle(x, y, radius);
    this.#applyFillAndStroke(fillColor, borderColor, borderWidth);
    this.#builder.restoreGraphicsState();

    return this;
  }

  /**
   * Draws an image (PdfImage instance or raw Uint8Array JPEG/PNG).
   * 
   * @param {PdfImage|Uint8Array} imageInput
   * @param {Object} options
   * @param {number} [options.x=0]
   * @param {number} [options.y=0]
   * @param {number} [options.width=100]
   * @param {number} [options.height=100]
   * @param {number} [options.rotate=0]
   * @returns {PdfPageModifier}
   */
  drawImage(imageInput, options = {}) {
    const {
      x = 0,
      y = 0,
      width = 100,
      height = 100,
      rotate = 0
    } = options;

    const imgResKey = this.#getOrRegisterImage(imageInput);

    this.#builder.saveGraphicsState();
    this.#builder.translate(x, y);
    if (rotate !== 0) {
      this.#builder.rotate(rotate);
    }
    this.#builder.scale(width, height);
    this.#builder.drawXObject(imgResKey);
    this.#builder.restoreGraphicsState();

    return this;
  }

  /**
   * Adds a diagonal semi-transparent watermark text across the page.
   * 
   * @param {string} text
   * @param {Object} [options={}]
   * @param {number} [options.size=48]
   * @param {string|Array<number>} [options.color='#888888']
   * @param {number} [options.rotate=45]
   * @returns {PdfPageModifier}
   */
  addWatermark(text, options = {}) {
    const { width: pageWidth, height: pageHeight } = this.#page.getSize();
    const {
      size = 48,
      color = '#888888',
      rotate = 45
    } = options;

    return this.drawText(text, {
      x: pageWidth / 2,
      y: pageHeight / 2,
      size,
      font: 'Helvetica-Bold',
      color,
      rotate,
      align: 'center'
    });
  }

  /**
   * Adds a clickable URL link annotation on this page.
   * 
   * @param {Array<number>} rect - [x1, y1, x2, y2]
   * @param {string} uri - Target URL
   * @returns {PdfPageModifier}
   */
  addLink(rect, uri) {
    const linkAnnot = PdfAnnotation.createLink(rect, uri);
    this.addAnnotation(linkAnnot);
    return this;
  }

  /**
   * Adds a PDF annotation to the page's /Annots array.
   * 
   * @param {PdfAnnotation} annot
   * @returns {PdfPageModifier}
   */
  addAnnotation(annot) {
    if (!(annot instanceof PdfAnnotation)) {
      throw new PdfInvalidArgumentException('annot', annot, 'PdfAnnotation');
    }

    const dict = this.#page.dictionary;
    let annots = dict.get('Annots');
    if (this.#page.document) {
      annots = this.#page.document.resolve(annots);
    }

    if (!annots || !annots.isArray()) {
      annots = new PdfArray();
      if (this.#page.document) {
        const annotsRef = this.#page.document.registerObject(annots);
        dict.set('Annots', annotsRef);
      } else {
        dict.set('Annots', annots);
      }
    }

    if (this.#page.document) {
      const annotRef = this.#page.document.registerObject(annot.dictionary);
      annots.push(annotRef);
    } else {
      annots.push(annot.dictionary);
    }

    return this;
  }

  /**
   * Commits and appends all recorded drawing operations into the page's /Contents.
   * 
   * @returns {PdfPage}
   */
  commit() {
    if (this.#builder.length === 0) {
      return this.#page;
    }

    const newStream = this.#builder.toStream();
    const doc = this.#page.document;
    const pageDict = this.#page.dictionary;

    let contents = pageDict.get('Contents');
    if (doc) {
      contents = doc.resolve(contents);
    }

    let streamToAttach;
    if (doc) {
      streamToAttach = doc.registerObject(newStream);
    } else {
      streamToAttach = newStream;
    }

    if (!contents) {
      pageDict.set('Contents', streamToAttach);
    } else if (contents instanceof PdfArray || Array.isArray(contents)) {
      const arr = contents instanceof PdfArray ? contents : new PdfArray(contents);
      arr.push(streamToAttach);
      pageDict.set('Contents', arr);
    } else {
      // Convert single stream into an array of streams [ existing, new ]
      const existingRef = pageDict.get('Contents');
      const newContentsArr = new PdfArray([existingRef, streamToAttach]);
      pageDict.set('Contents', newContentsArr);
    }

    this.#builder.clear();
    return this.#page;
  }

  /**
   * Helper to fill/stroke paths based on options.
   * @private
   */
  #applyFillAndStroke(fillColor, borderColor, borderWidth) {
    if (fillColor && borderColor) {
      const [fr, fg, fb] = PdfPageModifier.#parseColor(fillColor);
      const [sr, sg, sb] = PdfPageModifier.#parseColor(borderColor);
      this.#builder.setFillColorRgb(fr, fg, fb);
      this.#builder.setStrokeColorRgb(sr, sg, sb);
      this.#builder.setLineWidth(borderWidth);
      this.#builder.fillAndStroke();
    } else if (fillColor) {
      const [fr, fg, fb] = PdfPageModifier.#parseColor(fillColor);
      this.#builder.setFillColorRgb(fr, fg, fb);
      this.#builder.fill();
    } else if (borderColor) {
      const [sr, sg, sb] = PdfPageModifier.#parseColor(borderColor);
      this.#builder.setStrokeColorRgb(sr, sg, sb);
      this.#builder.setLineWidth(borderWidth);
      this.#builder.stroke();
    } else {
      // Default fill black
      this.#builder.fill();
    }
  }

  /**
   * Registers a standard font in page /Resources.
   * @private
   */
  #getOrRegisterFont(fontName) {
    if (this.#fontResourceMap.has(fontName)) {
      return this.#fontResourceMap.get(fontName);
    }

    const resources = this.#getOrCreateResources();
    let fontDict = resources.get('Font');
    if (this.#page.document) {
      fontDict = this.#page.document.resolve(fontDict);
    }

    if (!fontDict || !fontDict.isDictionary()) {
      fontDict = new PdfDictionary();
      resources.set('Font', fontDict);
    }

    const key = `F${fontDict.size() + 1}`;
    const fontObj = new PdfDictionary();
    fontObj.set('Type', PdfName.of('Font'));
    fontObj.set('Subtype', PdfName.of('Type1'));
    fontObj.set('BaseFont', PdfName.of(fontName));

    if (this.#page.document) {
      const fontRef = this.#page.document.registerObject(fontObj);
      fontDict.set(key, fontRef);
    } else {
      fontDict.set(key, fontObj);
    }

    this.#fontResourceMap.set(fontName, key);
    return key;
  }

  /**
   * Registers an Image XObject in page /Resources.
   * @private
   */
  #getOrRegisterImage(imageInput) {
    const resources = this.#getOrCreateResources();
    let xobjDict = resources.get('XObject');
    if (this.#page.document) {
      xobjDict = this.#page.document.resolve(xobjDict);
    }

    if (!xobjDict || !xobjDict.isDictionary()) {
      xobjDict = new PdfDictionary();
      resources.set('XObject', xobjDict);
    }

    const key = `Im${this.#nextImageId++}`;
    let stream;

    if (imageInput instanceof PdfImage) {
      const imgDict = new PdfDictionary();
      imgDict.set('Type', PdfName.of('XObject'));
      imgDict.set('Subtype', PdfName.of('Image'));
      imgDict.set('Width', PdfNumber.of(imageInput.width));
      imgDict.set('Height', PdfNumber.of(imageInput.height));
      imgDict.set('ColorSpace', PdfName.of(imageInput.colorSpace.family || 'DeviceRGB'));
      imgDict.set('BitsPerComponent', PdfNumber.of(imageInput.bitsPerComponent || 8));

      if (imageInput.format === 'jpeg') {
        imgDict.set('Filter', PdfName.of('DCTDecode'));
      }
      stream = new PdfStream(imgDict, imageInput.bytes);
    } else if (imageInput instanceof Uint8Array) {
      // Raw JPEG pass-through
      const imgDict = new PdfDictionary();
      imgDict.set('Type', PdfName.of('XObject'));
      imgDict.set('Subtype', PdfName.of('Image'));
      imgDict.set('Width', PdfNumber.of(100)); // Default geometry
      imgDict.set('Height', PdfNumber.of(100));
      imgDict.set('ColorSpace', PdfName.of('DeviceRGB'));
      imgDict.set('BitsPerComponent', PdfNumber.of(8));
      imgDict.set('Filter', PdfName.of('DCTDecode'));
      stream = new PdfStream(imgDict, imageInput);
    } else {
      throw new PdfInvalidArgumentException('imageInput', imageInput, 'PdfImage or Uint8Array');
    }

    if (this.#page.document) {
      const streamRef = this.#page.document.registerObject(stream);
      xobjDict.set(key, streamRef);
    } else {
      xobjDict.set(key, stream);
    }

    return key;
  }

  /**
   * Helper to fetch or initialize /Resources dictionary.
   * @private
   */
  #getOrCreateResources() {
    let res = this.#page.dictionary.get('Resources');
    if (this.#page.document) {
      res = this.#page.document.resolve(res);
    }
    if (!res || !res.isDictionary()) {
      res = new PdfDictionary();
      this.#page.dictionary.set('Resources', res);
    }
    return res;
  }

  /**
   * Parses color inputs (hex, array, or rgb string) to [r, g, b] in range 0..1.
   * @private
   */
  static #parseColor(color) {
    if (Array.isArray(color) && color.length >= 3) {
      return [
        color[0] > 1 ? color[0] / 255 : color[0],
        color[1] > 1 ? color[1] / 255 : color[1],
        color[2] > 1 ? color[2] / 255 : color[2]
      ];
    }

    if (typeof color === 'string') {
      if (color.startsWith('#')) {
        const hex = color.slice(1);
        if (hex.length === 3) {
          return [
            parseInt(hex[0] + hex[0], 16) / 255,
            parseInt(hex[1] + hex[1], 16) / 255,
            parseInt(hex[2] + hex[2], 16) / 255
          ];
        } else if (hex.length >= 6) {
          return [
            parseInt(hex.slice(0, 2), 16) / 255,
            parseInt(hex.slice(2, 4), 16) / 255,
            parseInt(hex.slice(4, 6), 16) / 255
          ];
        }
      }
    }

    return [0, 0, 0];
  }
}

pageExtractionHelper.PdfPageModifier = PdfPageModifier;
