import { PdfObject } from './PdfObject.js';
import { PdfObjectType } from './PdfObjectType.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Represents a hexadecimal PDF string object `<48656C6C6F>`.
 */
export class PdfHexString extends PdfObject {
  /** @type {string} */
  #value;

  /** @type {Uint8Array} */
  #bytes;

  /** @type {string} */
  #hex;

  /**
   * @param {string} value - ASCII decoded text value
   * @param {Uint8Array} bytes - Raw binary bytes
   * @param {string} [hex] - Raw hex representation without angle brackets
   */
  constructor(value, bytes, hex = undefined) {
    super();
    if (typeof value !== 'string') {
      throw new PdfInvalidArgumentException('value', value, 'string');
    }
    if (!(bytes instanceof Uint8Array)) {
      throw new PdfInvalidArgumentException('bytes', bytes, 'Uint8Array');
    }
    this.#value = value;
    this.#bytes = bytes;
    if (hex !== undefined) {
      this.#hex = hex;
    } else {
      let h = '';
      for (let i = 0; i < bytes.length; i++) {
        h += bytes[i].toString(16).padStart(2, '0').toUpperCase();
      }
      this.#hex = h;
    }
  }

  /**
   * Constructs a PdfHexString from a byte array.
   * @param {Uint8Array} bytes
   * @returns {PdfHexString}
   */
  static fromBytes(bytes) {
    let value = '';
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
      value += String.fromCharCode(bytes[i]);
      hex += bytes[i].toString(16).padStart(2, '0').toUpperCase();
    }
    return new PdfHexString(value, bytes, hex);
  }

  /**
   * Static factory method.
   * @param {string|Uint8Array} value
   * @param {Uint8Array} [bytes]
   * @param {string} [hex]
   * @returns {PdfHexString}
   */
  static of(value, bytes = undefined, hex = undefined) {
    if (value instanceof Uint8Array) {
      return PdfHexString.fromBytes(value);
    }
    return new PdfHexString(value, bytes, hex);
  }


  /**
   * Constructs a PdfHexString from a hex string.
   * @param {string} hex
   * @returns {PdfHexString}
   */
  static fromHex(hex) {
    let clean = hex.replace(/[^0-9A-Fa-f]/g, '');
    if (clean.length % 2 !== 0) {
      clean += '0';
    }
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < clean.length; i += 2) {
      bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
    }
    let value = '';
    for (let i = 0; i < bytes.length; i++) {
      value += String.fromCharCode(bytes[i]);
    }
    return new PdfHexString(value, bytes, clean);
  }

  get type() {
    return PdfObjectType.HEX_STRING;
  }

  get value() {
    return this.#value;
  }

  get bytes() {
    return this.#bytes;
  }

  get hex() {
    return this.#hex;
  }

  /**
   * Decodes string respecting UTF-16BE BOM if present.
   * @returns {string}
   */
  asUtf8() {
    if (this.#bytes.length >= 2 && this.#bytes[0] === 0xFE && this.#bytes[1] === 0xFF) {
      return new TextDecoder('utf-16be').decode(this.#bytes.subarray(2));
    }
    return new TextDecoder('utf-8').decode(this.#bytes);
  }

  equals(other) {
    if (typeof other === 'string') {
      return this.#value === other || this.#hex.toLowerCase() === other.toLowerCase();
    }
    return other instanceof PdfHexString && this.#hex.toLowerCase() === other.#hex.toLowerCase();
  }

  toString() {
    return `<${this.#hex}>`;
  }
}
