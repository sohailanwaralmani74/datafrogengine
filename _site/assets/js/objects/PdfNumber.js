import { PdfObject } from './PdfObject.js';
import { PdfObjectType } from './PdfObjectType.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Represents a PDF numeric object (integer or real/floating-point).
 */
export class PdfNumber extends PdfObject {
  /** @type {number} */
  #value;

  /** @type {boolean} */
  #isInteger;

  /**
   * @param {number} value
   * @param {boolean} [isInteger]
   */
  constructor(value, isInteger = undefined) {
    super();
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new PdfInvalidArgumentException('value', value, 'valid number');
    }
    this.#value = value;
    this.#isInteger = isInteger !== undefined ? Boolean(isInteger) : Number.isInteger(value);
  }

  /**
   * Static factory method.
   * @param {number} value
   * @param {boolean} [isInteger]
   * @returns {PdfNumber}
   */
  static of(value, isInteger = undefined) {
    return new PdfNumber(value, isInteger);
  }

  get type() {
    return PdfObjectType.NUMBER;
  }

  get value() {
    return this.#value;
  }

  isInteger() {
    return this.#isInteger;
  }

  isReal() {
    return !this.#isInteger;
  }

  intValue() {
    return Math.trunc(this.#value);
  }

  floatValue() {
    return this.#value;
  }

  equals(other) {
    return other instanceof PdfNumber && this.#value === other.#value;
  }

  toString() {
    if (this.#isInteger) {
      return String(Math.trunc(this.#value));
    }
    // Real numbers: remove trailing zeros if clean or format nicely
    return String(this.#value);
  }
}
