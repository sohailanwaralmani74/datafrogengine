import { PdfDictionary } from '../objects/PdfDictionary.js';
import { PdfName } from '../objects/PdfName.js';
import { PdfArray } from '../objects/PdfArray.js';
import { PdfNumber } from '../objects/PdfNumber.js';
import { PdfString } from '../objects/PdfString.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Factory and container for PDF Annotations (Links, Text Notes, Highlights).
 */
export class PdfAnnotation {
  /** @type {PdfDictionary} */
  #dictionary;

  /**
   * @param {PdfDictionary} dictionary
   */
  constructor(dictionary) {
    if (!(dictionary instanceof PdfDictionary)) {
      throw new PdfInvalidArgumentException('dictionary', dictionary, 'PdfDictionary');
    }
    this.#dictionary = dictionary;
  }

  get dictionary() {
    return this.#dictionary;
  }

  get subtype() {
    return this.#dictionary.getName('Subtype');
  }

  get rect() {
    const r = this.#dictionary.get('Rect');
    return r && r.isArray && r.isArray() ? [r.getNumber(0), r.getNumber(1), r.getNumber(2), r.getNumber(3)] : [0, 0, 0, 0];
  }

  /**
   * Creates a clickable web or destination link annotation (`/Subtype /Link`).
   * 
   * @param {Array<number>} rect - [x1, y1, x2, y2]
   * @param {string} uri - Target URL (e.g. 'https://example.com')
   * @returns {PdfAnnotation}
   */
  static createLink(rect, uri) {
    if (!Array.isArray(rect) || rect.length < 4) {
      throw new PdfInvalidArgumentException('rect', rect, '[x1, y1, x2, y2]');
    }
    if (typeof uri !== 'string' || uri.length === 0) {
      throw new PdfInvalidArgumentException('uri', uri, 'non-empty string');
    }

    const dict = new PdfDictionary();
    dict.set('Type', PdfName.of('Annot'));
    dict.set('Subtype', PdfName.of('Link'));
    dict.set('Rect', new PdfArray([
      PdfNumber.of(rect[0]), PdfNumber.of(rect[1]),
      PdfNumber.of(rect[2]), PdfNumber.of(rect[3])
    ]));
    dict.set('Border', new PdfArray([PdfNumber.of(0), PdfNumber.of(0), PdfNumber.of(0)]));

    // Action dictionary
    const actionDict = new PdfDictionary();
    actionDict.set('S', PdfName.of('URI'));
    actionDict.set('URI', PdfString.of(uri));
    dict.set('A', actionDict);

    return new PdfAnnotation(dict);
  }

  /**
   * Creates a text note annotation (`/Subtype /Text`).
   * 
   * @param {Array<number>} rect
   * @param {string} contents
   * @param {Object} [options={}]
   * @returns {PdfAnnotation}
   */
  static createTextNote(rect, contents, options = {}) {
    const dict = new PdfDictionary();
    dict.set('Type', PdfName.of('Annot'));
    dict.set('Subtype', PdfName.of('Text'));
    dict.set('Rect', new PdfArray([
      PdfNumber.of(rect[0]), PdfNumber.of(rect[1]),
      PdfNumber.of(rect[2]), PdfNumber.of(rect[3])
    ]));
    dict.set('Contents', PdfString.of(contents));

    if (options.author) {
      dict.set('T', PdfString.of(options.author));
    }
    if (options.name) {
      dict.set('Name', PdfName.of(options.name)); // Comment, Key, Note, Help, Paragraph
    }

    return new PdfAnnotation(dict);
  }

  /**
   * Creates a text highlight annotation (`/Subtype /Highlight`).
   * 
   * @param {Array<number>} rect
   * @param {Object} [options={}]
   * @returns {PdfAnnotation}
   */
  static createHighlight(rect, options = {}) {
    const dict = new PdfDictionary();
    dict.set('Type', PdfName.of('Annot'));
    dict.set('Subtype', PdfName.of('Highlight'));
    dict.set('Rect', new PdfArray([
      PdfNumber.of(rect[0]), PdfNumber.of(rect[1]),
      PdfNumber.of(rect[2]), PdfNumber.of(rect[3])
    ]));

    // QuadPoints: 8 coordinates [x1,y1, x2,y2, x3,y3, x4,y4]
    const [x1, y1, x2, y2] = rect;
    const quadPoints = options.quadPoints || [x1, y2, x2, y2, x1, y1, x2, y1];
    dict.set('QuadPoints', new PdfArray(quadPoints.map(n => PdfNumber.of(n))));

    // Color (yellow default)
    const color = options.color || [1, 1, 0];
    dict.set('C', new PdfArray(color.map(c => PdfNumber.of(c))));

    return new PdfAnnotation(dict);
  }
}
