import { PdfDictionary } from '../objects/PdfDictionary.js';
import { PdfArray } from '../objects/PdfArray.js';
import { CMap } from './CMap.js';
import { DEFAULT_GLYPH_WIDTHS, WIN_ANSI_MAP, HELVETICA_WIDTHS } from './StandardFonts.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Base class for all PDF font representations.
 */
export class PdfFont {
  /** @type {PdfDictionary} */
  dictionary;

  /** @type {string} */
  subtype;

  /** @type {string} */
  baseFont;

  /** @type {number} */
  firstChar = 0;

  /** @type {number} */
  lastChar = 255;

  /** @type {Map<number, number>} */
  widths = new Map();

  /** @type {number} */
  defaultWidth = 1000;

  /** @type {CMap|null} */
  toUnicode = null;

  /** @type {boolean} */
  isVertical = false;

  /**
   * @param {PdfDictionary} dictionary
   * @param {Object} [document=null]
   */
  constructor(dictionary, document = null) {
    if (!(dictionary instanceof PdfDictionary)) {
      throw new PdfInvalidArgumentException('dictionary', dictionary, 'PdfDictionary');
    }
    this.dictionary = dictionary;
    this.subtype = dictionary.getName('Subtype') || 'Type1';
    this.baseFont = dictionary.getName('BaseFont') || 'Helvetica';
    this.firstChar = dictionary.getNumber('FirstChar') || 0;
    this.lastChar = dictionary.getNumber('LastChar') || 255;

    // Load /Widths array if present
    const widthsObj = document ? document.resolve(dictionary.get('Widths')) : dictionary.get('Widths');
    if (widthsObj && widthsObj.isArray()) {
      for (let i = 0; i < widthsObj.size(); i++) {
        const charCode = this.firstChar + i;
        this.widths.set(charCode, widthsObj.getNumber(i) || 0);
      }
    }

    // Default width fallback based on BaseFont family
    for (const [fontFamily, width] of Object.entries(DEFAULT_GLYPH_WIDTHS)) {
      if (this.baseFont.includes(fontFamily)) {
        this.defaultWidth = width;
        break;
      }
    }

    // Load /ToUnicode CMap if present
    const toUnicodeObj = document ? document.resolve(dictionary.get('ToUnicode')) : dictionary.get('ToUnicode');
    if (toUnicodeObj) {
      this.toUnicode = CMap.parse(toUnicodeObj);
    }
  }

  /**
   * Factory method creating appropriate font subclass.
   * 
   * @param {PdfDictionary} fontDict
   * @param {Object} [document=null]
   * @returns {PdfFont}
   */
  static create(fontDict, document = null) {
    if (!fontDict || !fontDict.isDictionary()) {
      return new PdfFont(new PdfDictionary(), document);
    }

    const subtype = fontDict.getName('Subtype');
    switch (subtype) {
      case 'Type0': {
        const { Type0Font } = fontClasses;
        return new Type0Font(fontDict, document);
      }
      case 'TrueType': {
        const { TrueTypeFont } = fontClasses;
        return new TrueTypeFont(fontDict, document);
      }
      case 'Type1':
      case 'MMType1':
      default: {
        const { Type1Font } = fontClasses;
        return new Type1Font(fontDict, document);
      }
    }
  }

  /**
   * Returns glyph width in 1/1000 of a text space unit.
   * 
   * @param {number} charCode
   * @returns {number}
   */
  getWidth(charCode) {
    if (this.widths.has(charCode)) {
      return this.widths.get(charCode);
    }
    // Helvetica fallback table
    if (this.baseFont.includes('Helvetica') && HELVETICA_WIDTHS[charCode] !== undefined) {
      return HELVETICA_WIDTHS[charCode];
    }
    return this.defaultWidth;
  }

  /**
   * Decodes a single character code to Unicode string.
   * 
   * @param {number} charCode
   * @returns {string}
   */
  decodeGlyph(charCode) {
    if (this.toUnicode && this.toUnicode.hasCode(charCode)) {
      return this.toUnicode.mapCode(charCode);
    }
    if (WIN_ANSI_MAP[charCode] !== undefined) {
      return String.fromCharCode(WIN_ANSI_MAP[charCode]);
    }
    return String.fromCharCode(charCode);
  }

  /**
   * Decodes a byte sequence into a Unicode text string.
   * 
   * @param {Uint8Array|string} bytesOrString
   * @returns {string}
   */
  decodeString(bytesOrString) {
    if (this.toUnicode) {
      return this.toUnicode.decodeString(bytesOrString, false);
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
    for (let i = 0; i < bytes.length; i++) {
      res += this.decodeGlyph(bytes[i]);
    }
    return res;
  }
}

// Registry placeholder for circular dependency resolution
export const fontClasses = {
  Type1Font: PdfFont,
  TrueTypeFont: PdfFont,
  Type0Font: PdfFont
};
