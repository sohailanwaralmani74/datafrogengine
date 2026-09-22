import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Represents a single cross-reference entry pointing to an object's location or status.
 */
export class PdfXRefEntry {
  /** Entry type enum constants */
  static TYPE_FREE = 0;
  static TYPE_IN_USE = 1;
  static TYPE_COMPRESSED = 2;

  /** @type {number} */
  #objectNumber;

  /** @type {number} */
  #generationNumber;

  /** @type {number} */
  #offset;

  /** @type {number} */
  #type;

  /** @type {number} */
  #streamObjectNumber;

  /** @type {number} */
  #indexInStream;

  /** @type {number} */
  #nextFreeObject;

  /**
   * @param {number} objectNumber
   * @param {number} generationNumber
   * @param {number} offset
   * @param {number} type
   * @param {number} [streamObjectNumber=0]
   * @param {number} [indexInStream=0]
   * @param {number} [nextFreeObject=0]
   */
  constructor(
    objectNumber,
    generationNumber,
    offset,
    type,
    streamObjectNumber = 0,
    indexInStream = 0,
    nextFreeObject = 0
  ) {
    if (typeof objectNumber !== 'number' || !Number.isInteger(objectNumber) || objectNumber < 0) {
      throw new PdfInvalidArgumentException('objectNumber', objectNumber, 'non-negative integer');
    }
    if (typeof generationNumber !== 'number' || !Number.isInteger(generationNumber) || generationNumber < 0) {
      throw new PdfInvalidArgumentException('generationNumber', generationNumber, 'non-negative integer');
    }
    this.#objectNumber = objectNumber;
    this.#generationNumber = generationNumber;
    this.#offset = offset;
    this.#type = type;
    this.#streamObjectNumber = streamObjectNumber;
    this.#indexInStream = indexInStream;
    this.#nextFreeObject = nextFreeObject;
  }

  /**
   * Creates an in-use uncompressed cross-reference entry.
   * @param {number} objectNumber
   * @param {number} offset
   * @param {number} [generationNumber=0]
   * @returns {PdfXRefEntry}
   */
  static createInUse(objectNumber, offset, generationNumber = 0) {
    if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
      throw new PdfInvalidArgumentException('offset', offset, 'non-negative integer offset');
    }
    return new PdfXRefEntry(objectNumber, generationNumber, offset, PdfXRefEntry.TYPE_IN_USE);
  }

  /**
   * Creates a free object cross-reference entry.
   * @param {number} objectNumber
   * @param {number} [nextFreeObject=0]
   * @param {number} [generationNumber=65535]
   * @returns {PdfXRefEntry}
   */
  static createFree(objectNumber, nextFreeObject = 0, generationNumber = 65535) {
    return new PdfXRefEntry(
      objectNumber,
      generationNumber,
      0,
      PdfXRefEntry.TYPE_FREE,
      0,
      0,
      nextFreeObject
    );
  }

  /**
   * Creates a compressed cross-reference entry located in an object stream.
   * @param {number} objectNumber
   * @param {number} streamObjectNumber
   * @param {number} indexInStream
   * @returns {PdfXRefEntry}
   */
  static createCompressed(objectNumber, streamObjectNumber, indexInStream) {
    return new PdfXRefEntry(
      objectNumber,
      0,
      0,
      PdfXRefEntry.TYPE_COMPRESSED,
      streamObjectNumber,
      indexInStream
    );
  }

  get objectNumber() {
    return this.#objectNumber;
  }

  get generationNumber() {
    return this.#generationNumber;
  }

  get offset() {
    return this.#offset;
  }

  get type() {
    return this.#type;
  }

  get streamObjectNumber() {
    return this.#streamObjectNumber;
  }

  get indexInStream() {
    return this.#indexInStream;
  }

  get nextFreeObject() {
    return this.#nextFreeObject;
  }

  isFree() {
    return this.#type === PdfXRefEntry.TYPE_FREE;
  }

  isInUse() {
    return this.#type === PdfXRefEntry.TYPE_IN_USE;
  }

  isCompressed() {
    return this.#type === PdfXRefEntry.TYPE_COMPRESSED;
  }

  toString() {
    if (this.isFree()) {
      return `PdfXRefEntry(Obj: ${this.#objectNumber}, FREE, Next: ${this.#nextFreeObject}, Gen: ${this.#generationNumber})`;
    }
    if (this.isCompressed()) {
      return `PdfXRefEntry(Obj: ${this.#objectNumber}, COMPRESSED in ObjStm ${this.#streamObjectNumber} at index ${this.#indexInStream})`;
    }
    return `PdfXRefEntry(Obj: ${this.#objectNumber}, Offset: ${this.#offset}, Gen: ${this.#generationNumber})`;
  }
}
