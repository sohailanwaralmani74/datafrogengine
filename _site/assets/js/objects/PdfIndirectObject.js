import { PdfObject } from './PdfObject.js';
import { PdfObjectType } from './PdfObjectType.js';
import { PdfReference } from './PdfReference.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Represents a top-level indirect object container `12 0 obj ... endobj`.
 */
export class PdfIndirectObject extends PdfObject {
  /** @type {number} */
  #objectNumber;

  /** @type {number} */
  #generationNumber;

  /** @type {PdfObject} */
  #value;

  /**
   * @param {number} objectNumber
   * @param {number} generationNumber
   * @param {PdfObject} value
   */
  constructor(objectNumber, generationNumber, value) {
    super();
    if (typeof objectNumber !== 'number' || !Number.isInteger(objectNumber) || objectNumber <= 0) {
      throw new PdfInvalidArgumentException('objectNumber', objectNumber, 'positive integer');
    }
    if (typeof generationNumber !== 'number' || !Number.isInteger(generationNumber) || generationNumber < 0) {
      throw new PdfInvalidArgumentException('generationNumber', generationNumber, 'non-negative integer');
    }
    if (!(value instanceof PdfObject)) {
      throw new PdfInvalidArgumentException('value', value, 'PdfObject instance');
    }
    this.#objectNumber = objectNumber;
    this.#generationNumber = generationNumber;
    this.#value = value;
  }

  get type() {
    return PdfObjectType.INDIRECT_OBJECT;
  }

  get objectNumber() {
    return this.#objectNumber;
  }

  get generationNumber() {
    return this.#generationNumber;
  }

  get value() {
    return this.#value;
  }

  /**
   * Sets or updates the inner value.
   * @param {PdfObject} newValue
   */
  setValue(newValue) {
    if (!(newValue instanceof PdfObject)) {
      throw new PdfInvalidArgumentException('newValue', newValue, 'PdfObject instance');
    }
    this.#value = newValue;
  }

  /**
   * Checks if inner value is a PdfStream.
   * @returns {boolean}
   */
  isStream() {
    return this.#value.isStream();
  }

  /**
   * Checks if inner value is a PdfDictionary.
   * @returns {boolean}
   */
  isDictionary() {
    return this.#value.isDictionary();
  }

  /**
   * Returns an indirect reference pointing to this object.
   * @returns {PdfReference}
   */
  getReference() {
    return new PdfReference(this.#objectNumber, this.#generationNumber);
  }

  toString() {
    return `${this.#objectNumber} ${this.#generationNumber} obj\n${this.#value.toString()}\nendobj`;
  }
}
