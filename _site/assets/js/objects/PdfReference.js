import { PdfObject } from './PdfObject.js';
import { PdfObjectType } from './PdfObjectType.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Represents an indirect object reference `12 0 R`.
 */
export class PdfReference extends PdfObject {
  /** @type {number} */
  #objectNumber;

  /** @type {number} */
  #generationNumber;

  /**
   * @param {number} objectNumber - Positive integer object ID
   * @param {number} [generationNumber=0] - Non-negative integer generation ID
   */
  constructor(objectNumber, generationNumber = 0) {
    super();
    if (typeof objectNumber !== 'number' || !Number.isInteger(objectNumber) || objectNumber <= 0) {
      throw new PdfInvalidArgumentException('objectNumber', objectNumber, 'positive integer');
    }
    if (typeof generationNumber !== 'number' || !Number.isInteger(generationNumber) || generationNumber < 0) {
      throw new PdfInvalidArgumentException('generationNumber', generationNumber, 'non-negative integer');
    }
    this.#objectNumber = objectNumber;
    this.#generationNumber = generationNumber;
  }

  /**
   * Static factory method.
   * @param {number} objectNumber
   * @param {number} [generationNumber=0]
   * @returns {PdfReference}
   */
  static of(objectNumber, generationNumber = 0) {
    return new PdfReference(objectNumber, generationNumber);
  }

  get type() {
    return PdfObjectType.REFERENCE;
  }

  get objectNumber() {
    return this.#objectNumber;
  }

  get generationNumber() {
    return this.#generationNumber;
  }

  equals(other) {
    return other instanceof PdfReference &&
           this.#objectNumber === other.#objectNumber &&
           this.#generationNumber === other.#generationNumber;
  }

  toString() {
    return `${this.#objectNumber} ${this.#generationNumber} R`;
  }
}
