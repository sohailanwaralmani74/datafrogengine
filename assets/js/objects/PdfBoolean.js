import { PdfObject } from './PdfObject.js';
import { PdfObjectType } from './PdfObjectType.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Represents a PDF boolean object (`true` or `false`).
 */
export class PdfBoolean extends PdfObject {
  /** @type {boolean} */
  #value;

  static #TRUE_INSTANCE = null;
  static #FALSE_INSTANCE = null;

  /**
   * @param {boolean} value
   */
  constructor(value) {
    super();
    if (typeof value !== 'boolean') {
      throw new PdfInvalidArgumentException('value', value, 'boolean');
    }
    this.#value = value;
  }

  static get TRUE() {
    if (!PdfBoolean.#TRUE_INSTANCE) {
      PdfBoolean.#TRUE_INSTANCE = new PdfBoolean(true);
    }
    return PdfBoolean.#TRUE_INSTANCE;
  }

  static get FALSE() {
    if (!PdfBoolean.#FALSE_INSTANCE) {
      PdfBoolean.#FALSE_INSTANCE = new PdfBoolean(false);
    }
    return PdfBoolean.#FALSE_INSTANCE;
  }

  /**
   * Factory method returning shared instances.
   * @param {boolean} value
   * @returns {PdfBoolean}
   */
  static of(value) {
    return value ? PdfBoolean.TRUE : PdfBoolean.FALSE;
  }

  get type() {
    return PdfObjectType.BOOLEAN;
  }

  get value() {
    return this.#value;
  }

  equals(other) {
    return other instanceof PdfBoolean && this.#value === other.#value;
  }

  toString() {
    return this.#value ? 'true' : 'false';
  }
}
