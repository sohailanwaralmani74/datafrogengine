import { PdfObject } from './PdfObject.js';
import { PdfObjectType } from './PdfObjectType.js';
import { PdfDictionary } from './PdfDictionary.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Represents a PDF Stream object `<< /Length ... >> stream ... endstream`.
 */
export class PdfStream extends PdfObject {
  /** @type {PdfDictionary} */
  #dictionary;

  /** @type {Uint8Array} */
  #bytes;

  /**
   * @param {PdfDictionary} dictionary - The stream metadata dictionary
   * @param {Uint8Array} bytes - Raw stream bytes (unfiltered or encoded as in source)
   */
  constructor(dictionary, bytes) {
    super();
    if (!(dictionary instanceof PdfDictionary)) {
      throw new PdfInvalidArgumentException('dictionary', dictionary, 'PdfDictionary');
    }
    if (!(bytes instanceof Uint8Array)) {
      throw new PdfInvalidArgumentException('bytes', bytes, 'Uint8Array');
    }
    this.#dictionary = dictionary;
    this.#bytes = bytes;
  }

  get type() {
    return PdfObjectType.STREAM;
  }

  /**
   * Stream header/metadata dictionary.
   * @returns {PdfDictionary}
   */
  get dictionary() {
    return this.#dictionary;
  }

  /**
   * Raw bytes contained in stream.
   * @returns {Uint8Array}
   */
  get bytes() {
    return this.#bytes;
  }

  /**
   * Updates the raw bytes contained in the stream.
   * @param {Uint8Array} bytes
   */
  setBytes(bytes) {
    if (!(bytes instanceof Uint8Array)) {
      throw new PdfInvalidArgumentException('bytes', bytes, 'Uint8Array');
    }
    this.#bytes = bytes;
  }

  /**
   * Length in bytes of the stream data.

   * @returns {number}
   */
  get length() {
    return this.#bytes.length;
  }

  /**
   * Delegates lookup to the stream's dictionary.
   * @param {string} key
   * @param {PdfObject} [defaultValue]
   * @returns {PdfObject|undefined}
   */
  get(key, defaultValue = undefined) {
    return this.#dictionary.get(key, defaultValue);
  }

  /**
   * Returns number for key from dictionary.
   * @param {string} key
   * @param {number} [defaultValue]
   * @returns {number|undefined}
   */
  getNumber(key, defaultValue = undefined) {
    return this.#dictionary.getNumber(key, defaultValue);
  }

  /**
   * Returns name string for key from dictionary.
   * @param {string} key
   * @param {string} [defaultValue]
   * @returns {string|undefined}
   */
  getName(key, defaultValue = undefined) {
    return this.#dictionary.getName(key, defaultValue);
  }

  /**
   * Returns string for key from dictionary.
   * @param {string} key
   * @param {string} [defaultValue]
   * @returns {string|undefined}
   */
  getString(key, defaultValue = undefined) {
    return this.#dictionary.getString(key, defaultValue);
  }

  /**
   * Returns boolean for key from dictionary.
   * @param {string} key
   * @param {boolean} [defaultValue]
   * @returns {boolean|undefined}
   */
  getBoolean(key, defaultValue = undefined) {
    return this.#dictionary.getBoolean(key, defaultValue);
  }

  /**
   * Returns child array from dictionary.
   * @param {string} key
   * @returns {PdfArray|null}
   */
  getArray(key) {
    return this.#dictionary.getArray(key);
  }

  /**
   * Returns child dictionary from dictionary.
   * @param {string} key
   * @returns {PdfDictionary|null}
   */
  getDictionary(key) {
    return this.#dictionary.getDictionary(key);
  }

  /**
   * Returns the /Filter specification (name, array of names, or null).
   * @returns {PdfObject|null}
   */
  getFilter() {
    return this.#dictionary.get('Filter') || null;
  }

  toString() {
    return `${this.#dictionary.toString()} stream\n[${this.#bytes.length} bytes]\nendstream`;
  }
}
