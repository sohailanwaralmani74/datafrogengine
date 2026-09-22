import { PdfObject } from './PdfObject.js';
import { PdfObjectType } from './PdfObjectType.js';

/**
 * Represents the PDF `null` object.
 */
export class PdfNull extends PdfObject {
  /** @type {PdfNull} */
  static readonly_INSTANCE = null;

  /**
   * Singleton instance of PdfNull.
   * @returns {PdfNull}
   */
  static get INSTANCE() {
    if (!PdfNull.readonly_INSTANCE) {
      PdfNull.readonly_INSTANCE = new PdfNull();
    }
    return PdfNull.readonly_INSTANCE;
  }

  get type() {
    return PdfObjectType.NULL;
  }

  get value() {
    return null;
  }

  equals(other) {
    return other instanceof PdfNull;
  }

  toString() {
    return 'null';
  }
}
