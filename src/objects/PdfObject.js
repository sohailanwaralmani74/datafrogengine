import { PdfObjectType } from './PdfObjectType.js';

/**
 * Abstract base class for all PDF objects in the object hierarchy.
 */
export class PdfObject {
  /**
   * Returns the object type string from PdfObjectType.
   * @returns {string}
   */
  get type() {
    throw new Error('PdfObject.type getter must be implemented by subclass');
  }

  /**
   * Returns true if this is a direct object (not an indirect reference).
   * @returns {boolean}
   */
  isDirect() {
    return this.type !== PdfObjectType.REFERENCE;
  }

  /**
   * Checks if this object is a PdfNull.
   * @returns {boolean}
   */
  isNull() {
    return this.type === PdfObjectType.NULL;
  }

  /**
   * Checks if this object is a PdfBoolean.
   * @returns {boolean}
   */
  isBoolean() {
    return this.type === PdfObjectType.BOOLEAN;
  }

  /**
   * Checks if this object is a PdfNumber.
   * @returns {boolean}
   */
  isNumber() {
    return this.type === PdfObjectType.NUMBER;
  }

  /**
   * Checks if this object is a PdfName.
   * @returns {boolean}
   */
  isName() {
    return this.type === PdfObjectType.NAME;
  }

  /**
   * Checks if this object is a PdfString (literal or hex).
   * @returns {boolean}
   */
  isString() {
    return this.type === PdfObjectType.STRING || this.type === PdfObjectType.HEX_STRING;
  }

  /**
   * Checks if this object is a PdfHexString.
   * @returns {boolean}
   */
  isHexString() {
    return this.type === PdfObjectType.HEX_STRING;
  }

  /**
   * Checks if this object is a PdfArray.
   * @returns {boolean}
   */
  isArray() {
    return this.type === PdfObjectType.ARRAY;
  }

  /**
   * Checks if this object is a PdfDictionary.
   * @returns {boolean}
   */
  isDictionary() {
    return this.type === PdfObjectType.DICTIONARY;
  }

  /**
   * Checks if this object is a PdfStream.
   * @returns {boolean}
   */
  isStream() {
    return this.type === PdfObjectType.STREAM;
  }

  /**
   * Checks if this object is an indirect PdfReference.
   * @returns {boolean}
   */
  isReference() {
    return this.type === PdfObjectType.REFERENCE;
  }

  /**
   * Checks if this object is a PdfIndirectObject container.
   * @returns {boolean}
   */
  isIndirectObject() {
    return this.type === PdfObjectType.INDIRECT_OBJECT;
  }

  /**
   * Returns a debug string representation.
   * @returns {string}
   */
  toString() {
    return `[${this.type}]`;
  }
}
