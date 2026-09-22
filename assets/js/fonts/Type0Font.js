import { PdfFont, fontClasses } from './PdfFont.js';
import { PdfDictionary } from '../objects/PdfDictionary.js';
import { PdfArray } from '../objects/PdfArray.js';

/**
 * Represents a composite Type 0 font wrapping 16-bit CIDFonts (CIDFontType0 / CIDFontType2).
 */
export class Type0Font extends PdfFont {
  /** @type {Map<number, number>} */
  #cidWidths;

  /** @type {number} */
  #dw;

  /**
   * @param {PdfDictionary} dictionary
   * @param {Object} [document=null]
   */
  constructor(dictionary, document = null) {
    super(dictionary, document);
    this.#cidWidths = new Map();
    this.#dw = 1000;

    // Resolve DescendantFont
    const descArray = document ? document.resolve(dictionary.get('DescendantFonts')) : dictionary.get('DescendantFonts');
    if (descArray && descArray.isArray() && descArray.size() > 0) {
      const descFont = document ? document.resolve(descArray.get(0)) : descArray.get(0);
      if (descFont && descFont.isDictionary()) {
        this.#dw = descFont.getNumber('DW') || 1000;

        // Parse /W array: [ c [w1 w2 ...] c_first c_last w ... ]
        const wArray = document ? document.resolve(descFont.get('W')) : descFont.get('W');
        if (wArray && wArray.isArray()) {
          this.#parseWArray(wArray, document);
        }
      }
    }
  }

  /**
   * Parses the CIDFont /W width array.
   * @private
   */
  #parseWArray(wArray, document) {
    let i = 0;
    while (i < wArray.size()) {
      const startCid = wArray.getNumber(i++);
      if (startCid === undefined || i >= wArray.size()) break;

      const nextItem = document ? document.resolve(wArray.get(i++)) : wArray.get(i++);
      if (!nextItem) break;

      if (nextItem.isArray()) {
        // Format: startCid [ w1 w2 w3 ... ]
        for (let j = 0; j < nextItem.size(); j++) {
          const width = nextItem.getNumber(j) || this.#dw;
          this.#cidWidths.set(startCid + j, width);
        }
      } else if (nextItem.isNumber()) {
        // Format: startCid endCid width
        const endCid = nextItem.value;
        const width = wArray.getNumber(i++) || this.#dw;
        for (let c = startCid; c <= endCid; c++) {
          this.#cidWidths.set(c, width);
        }
      }
    }
  }

  /**
   * Returns glyph width for 16-bit CID.
   * @param {number} cid
   * @returns {number}
   */
  getWidth(cid) {
    if (this.#cidWidths.has(cid)) {
      return this.#cidWidths.get(cid);
    }
    return this.#dw;
  }

  /**
   * Decodes 2-byte CID string into Unicode text.
   * 
   * @param {Uint8Array|string} bytesOrString
   * @returns {string}
   */
  decodeString(bytesOrString) {
    if (this.toUnicode) {
      return this.toUnicode.decodeString(bytesOrString, true);
    }

    let bytes;
    if (typeof bytesOrString === 'string') {
      bytes = new Uint8Array(bytesOrString.length);
      for (let i = 0; i < bytesOrString.length; i++) {
        bytes[i] = bytesOrString.charCodeAt(i) & 0xFF;
      }
    } else if (bytesOrString instanceof Uint8Array) {
      bytes = bytesOrString;
    } else {
      return '';
    }

    let res = '';
    for (let i = 0; i < bytes.length; i += 2) {
      if (i + 1 < bytes.length) {
        const cid = (bytes[i] << 8) | bytes[i + 1];
        res += String.fromCharCode(cid);
      }
    }
    return res;
  }
}

fontClasses.Type0Font = Type0Font;
