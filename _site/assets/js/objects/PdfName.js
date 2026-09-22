import { PdfObject } from './PdfObject.js';
import { PdfObjectType } from './PdfObjectType.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Represents a PDF Name object (`/Name`).
 * Stores the name string without the leading slash.
 */
export class PdfName extends PdfObject {
  /** @type {string} */
  #value;

  /** @type {Map<string, PdfName>} */
  static #pool = new Map();

  /**
   * @param {string} value - The name value (without leading slash)
   */
  constructor(value) {
    super();
    if (typeof value !== 'string') {
      throw new PdfInvalidArgumentException('value', value, 'string');
    }
    // Strip leading slash if inadvertently provided
    this.#value = value.startsWith('/') ? value.substring(1) : value;
  }

  /**
   * Factory method with pooling for common names.
   * @param {string} value
   * @returns {PdfName}
   */
  static of(value) {
    if (typeof value !== 'string') {
      throw new PdfInvalidArgumentException('value', value, 'string');
    }
    const clean = value.startsWith('/') ? value.substring(1) : value;
    let nameObj = PdfName.#pool.get(clean);
    if (!nameObj) {
      nameObj = new PdfName(clean);
      if (PdfName.#pool.size < 1000) {
        PdfName.#pool.set(clean, nameObj);
      }
    }
    return nameObj;
  }

  // Predefined standard PDF names
  static get TYPE() { return PdfName.of('Type'); }
  static get PAGES() { return PdfName.of('Pages'); }
  static get PAGE() { return PdfName.of('Page'); }
  static get CATALOG() { return PdfName.of('Catalog'); }
  static get ROOT() { return PdfName.of('Root'); }
  static get SIZE() { return PdfName.of('Size'); }
  static get LENGTH() { return PdfName.of('Length'); }
  static get FILTER() { return PdfName.of('Filter'); }
  static get COUNT() { return PdfName.of('Count'); }
  static get KIDS() { return PdfName.of('Kids'); }
  static get PARENT() { return PdfName.of('Parent'); }
  static get MEDIA_BOX() { return PdfName.of('MediaBox'); }
  static get CROP_BOX() { return PdfName.of('CropBox'); }
  static get CONTENTS() { return PdfName.of('Contents'); }
  static get RESOURCES() { return PdfName.of('Resources'); }
  static get FONT() { return PdfName.of('Font'); }
  static get XOBJECT() { return PdfName.of('XObject'); }
  static get INFO() { return PdfName.of('Info'); }
  static get PREV() { return PdfName.of('Prev'); }
  static get XREF() { return PdfName.of('XRef'); }
  static get OBJ_STM() { return PdfName.of('ObjStm'); }

  get type() {
    return PdfObjectType.NAME;
  }

  get value() {
    return this.#value;
  }

  get name() {
    return this.#value;
  }

  equals(other) {
    if (typeof other === 'string') {
      const clean = other.startsWith('/') ? other.substring(1) : other;
      return this.#value === clean;
    }
    return other instanceof PdfName && this.#value === other.#value;
  }

  toString() {
    return `/${this.#value}`;
  }
}
