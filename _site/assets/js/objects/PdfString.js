import { PdfObject } from './PdfObject.js';
import { PdfObjectType } from './PdfObjectType.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';
export { PdfHexString } from './PdfHexString.js';


/**
 * Represents a literal PDF string object `(string)`.
 */
export class PdfString extends PdfObject {
  /** @type {string} */
  #value;

  /** @type {Uint8Array} */
  #bytes;

  /**
   * @param {string} value
   * @param {Uint8Array} [bytes]
   */
  constructor(value, bytes = undefined) {
    super();
    if (typeof value !== 'string') {
      throw new PdfInvalidArgumentException('value', value, 'string');
    }
    this.#value = value;
    if (bytes instanceof Uint8Array) {
      this.#bytes = bytes;
    } else {
      this.#bytes = new Uint8Array(value.length);
      for (let i = 0; i < value.length; i++) {
        this.#bytes[i] = value.charCodeAt(i) & 0xFF;
      }
    }
  }

  /**
   * Static factory method.
   * @param {string} value
   * @param {Uint8Array} [bytes]
   * @returns {PdfString}
   */
  static of(value, bytes = undefined) {
    return new PdfString(value, bytes);
  }

  get type() {
    return PdfObjectType.STRING;
  }

  get value() {
    return this.#value;
  }

  get bytes() {
    return this.#bytes;
  }

  /**
   * Returns text decoded as UTF-8 (handling UTF-8 BOM if present).
   * @returns {string}
   */
  asUtf8() {
    // Check for UTF-16BE BOM: 0xFE, 0xFF
    if (this.#bytes.length >= 2 && this.#bytes[0] === 0xFE && this.#bytes[1] === 0xFF) {
      return new TextDecoder('utf-16be').decode(this.#bytes.subarray(2));
    }
    // Check for UTF-8 BOM: 0xEF, 0xBB, 0xBF
    if (this.#bytes.length >= 3 && this.#bytes[0] === 0xEF && this.#bytes[1] === 0xBB && this.#bytes[2] === 0xBF) {
      return new TextDecoder('utf-8').decode(this.#bytes.subarray(3));
    }
    return new TextDecoder('utf-8').decode(this.#bytes);
  }

  /**
   * Returns Latin-1/PDFDocEncoding text.
   * @returns {string}
   */
  asAscii() {
    return this.#value;
  }

  equals(other) {
    if (typeof other === 'string') {
      return this.#value === other;
    }
    return other instanceof PdfString && this.#value === other.#value;
  }

  toString() {
    return `(${this.#value})`;
  }
}
