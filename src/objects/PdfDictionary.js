import { PdfObject } from './PdfObject.js';
import { PdfObjectType } from './PdfObjectType.js';
import { PdfName } from './PdfName.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Represents a PDF Dictionary object `<< /Key1 Val1 /Key2 Val2 >>`.
 * Preserves insertion order and normalizes keys to stripped string format.
 */
export class PdfDictionary extends PdfObject {
  /** @type {Map<string, PdfObject>} */
  #entries;

  /**
   * @param {Map<string, PdfObject>|Object<string, PdfObject>} [initialEntries]
   */
  constructor(initialEntries = null) {
    super();
    this.#entries = new Map();

    if (initialEntries) {
      if (initialEntries instanceof Map) {
        for (const [key, value] of initialEntries.entries()) {
          this.set(key, value);
        }
      } else if (typeof initialEntries === 'object') {
        for (const [key, value] of Object.entries(initialEntries)) {
          this.set(key, value);
        }
      }
    }
  }

  get type() {
    return PdfObjectType.DICTIONARY;
  }

  /**
   * Returns number of key-value pairs.
   * @returns {number}
   */
  get length() {
    return this.#entries.size;
  }

  /**
   * Returns number of key-value pairs.
   * @returns {number}
   */
  size() {
    return this.#entries.size;
  }

  /**
   * Normalizes a key string or PdfName into a plain key string without leading slash.
   * @private
   */
  #normalizeKey(key) {
    if (key instanceof PdfName) {
      return key.value;
    }
    if (typeof key === 'string') {
      return key.startsWith('/') ? key.substring(1) : key;
    }
    throw new PdfInvalidArgumentException('key', key, 'string or PdfName');
  }

  /**
   * Checks if dictionary contains key.
   * @param {string|PdfName} key
   * @returns {boolean}
   */
  has(key) {
    return this.#entries.has(this.#normalizeKey(key));
  }

  /**
   * Retrieves object for key, or defaultValue if absent.
   * @param {string|PdfName} key
   * @param {PdfObject} [defaultValue=undefined]
   * @returns {PdfObject|undefined}
   */
  get(key, defaultValue = undefined) {
    const norm = this.#normalizeKey(key);
    const val = this.#entries.get(norm);
    return val !== undefined ? val : defaultValue;
  }

  /**
   * Sets object for key.
   * @param {string|PdfName} key
   * @param {PdfObject} value
   * @returns {this}
   */
  set(key, value) {
    const norm = this.#normalizeKey(key);
    if (!(value instanceof PdfObject)) {
      throw new PdfInvalidArgumentException('value', value, 'PdfObject instance');
    }
    this.#entries.set(norm, value);
    return this;
  }

  /**
   * Deletes entry by key.
   * @param {string|PdfName} key
   * @returns {boolean}
   */
  delete(key) {
    return this.#entries.delete(this.#normalizeKey(key));
  }

  /**
   * Returns iterator over dictionary keys (strings).
   * @returns {IterableIterator<string>}
   */
  keys() {
    return this.#entries.keys();
  }

  /**
   * Returns iterator over dictionary values (PdfObjects).
   * @returns {IterableIterator<PdfObject>}
   */
  values() {
    return this.#entries.values();
  }

  /**
   * Returns iterator over dictionary entries [key, value].
   * @returns {IterableIterator<[string, PdfObject]>}
   */
  entries() {
    return this.#entries.entries();
  }

  /**
   * Returns name string for key, or defaultValue if missing or not a name.
   * @param {string|PdfName} key
   * @param {string} [defaultValue]
   * @returns {string|undefined}
   */
  getName(key, defaultValue = undefined) {
    const val = this.get(key);
    if (val && val.isName()) {
      return val.value;
    }
    return defaultValue;
  }

  /**
   * Returns number for key, or defaultValue if missing or not a number.
   * @param {string|PdfName} key
   * @param {number} [defaultValue]
   * @returns {number|undefined}
   */
  getNumber(key, defaultValue = undefined) {
    const val = this.get(key);
    if (val && val.isNumber()) {
      return val.value;
    }
    return defaultValue;
  }

  /**
   * Returns string for key, or defaultValue if missing or not a string.
   * @param {string|PdfName} key
   * @param {string} [defaultValue]
   * @returns {string|undefined}
   */
  getString(key, defaultValue = undefined) {
    const val = this.get(key);
    if (val && val.isString()) {
      return val.value;
    }
    return defaultValue;
  }

  /**
   * Returns boolean for key, or defaultValue if missing or not a boolean.
   * @param {string|PdfName} key
   * @param {boolean} [defaultValue]
   * @returns {boolean|undefined}
   */
  getBoolean(key, defaultValue = undefined) {
    const val = this.get(key);
    if (val && val.isBoolean()) {
      return val.value;
    }
    return defaultValue;
  }

  /**
   * Returns child PdfDictionary for key, or null.
   * @param {string|PdfName} key
   * @returns {PdfDictionary|null}
   */
  getDictionary(key) {
    const val = this.get(key);
    if (val && val.isDictionary()) {
      return val;
    }
    return null;
  }

  /**
   * Returns child PdfArray for key, or null.
   * @param {string|PdfName} key
   * @returns {PdfArray|null}
   */
  getArray(key) {
    const val = this.get(key);
    if (val && val.isArray()) {
      return val;
    }
    return null;
  }

  /**
   * Returns child PdfStream for key, or null.
   * @param {string|PdfName} key
   * @returns {PdfStream|null}
   */
  getStream(key) {
    const val = this.get(key);
    if (val && val.isStream()) {
      return val;
    }
    return null;
  }

  /**
   * Returns child PdfReference for key, or null.
   * @param {string|PdfName} key
   * @returns {PdfReference|null}
   */
  getReference(key) {
    const val = this.get(key);
    if (val && val.isReference()) {
      return val;
    }
    return null;
  }

  /**
   * Default iterator over [key, value] pairs.
   */
  [Symbol.iterator]() {
    return this.#entries.entries();
  }

  /**
   * Shallow-clones this dictionary.
   * @returns {PdfDictionary}
   */
  clone() {
    const d = new PdfDictionary();
    for (const [k, v] of this.#entries.entries()) {
      d.set(k, v);
    }
    return d;
  }

  toString() {
    const items = [];
    for (const [k, v] of this.#entries.entries()) {
      items.push(`/${k} ${v.toString()}`);
    }
    return `<< ${items.join(' ')} >>`;
  }
}
