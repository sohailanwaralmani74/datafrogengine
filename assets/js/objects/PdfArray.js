import { PdfObject } from './PdfObject.js';
import { PdfObjectType } from './PdfObjectType.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Represents a PDF Array object `[ ... ]`.
 */
export class PdfArray extends PdfObject {
  /** @type {Array<PdfObject>} */
  #items;

  /**
   * @param {Array<PdfObject>} [items=[]]
   */
  constructor(items = []) {
    super();
    if (!Array.isArray(items)) {
      throw new PdfInvalidArgumentException('items', items, 'Array');
    }
    this.#items = [...items];
  }

  /**
   * Static factory method.
   * @param {Array<PdfObject>} items
   * @returns {PdfArray}
   */
  static of(items = []) {
    return new PdfArray(items);
  }

  get type() {
    return PdfObjectType.ARRAY;
  }

  /**
   * Number of elements in array.
   * @returns {number}
   */
  get length() {
    return this.#items.length;
  }

  /**
   * Number of elements in array.
   * @returns {number}
   */
  size() {
    return this.#items.length;
  }

  /**
   * Retrieves item at index.
   * @param {number} index
   * @returns {PdfObject|undefined}
   */
  get(index) {
    return this.#items[index];
  }

  /**
   * Sets item at index.
   * @param {number} index
   * @param {PdfObject} item
   */
  set(index, item) {
    if (typeof index !== 'number' || index < 0) {
      throw new PdfInvalidArgumentException('index', index, 'non-negative integer');
    }
    if (!(item instanceof PdfObject)) {
      throw new PdfInvalidArgumentException('item', item, 'PdfObject instance');
    }
    this.#items[index] = item;
  }

  /**
   * Adds an item to the end of the array.
   * @param {PdfObject} item
   * @returns {this}
   */
  add(item) {
    if (!(item instanceof PdfObject)) {
      throw new PdfInvalidArgumentException('item', item, 'PdfObject instance');
    }
    this.#items.push(item);
    return this;
  }

  /**
   * Alias for add.
   * @param {PdfObject} item
   * @returns {this}
   */
  push(item) {
    return this.add(item);
  }

  /**
   * Removes item at index.
   * @param {number} index
   * @returns {PdfObject|undefined}
   */
  remove(index) {
    if (index >= 0 && index < this.#items.length) {
      const removed = this.#items.splice(index, 1);
      return removed[0];
    }
    return undefined;
  }

  /**
   * Returns a copy of the items array.
   * @returns {Array<PdfObject>}
   */
  getItems() {
    return [...this.#items];
  }

  /**
   * Returns a copy of the items array.
   * @returns {Array<PdfObject>}
   */
  asArray() {
    return [...this.#items];
  }

  /**
   * Returns numeric value at index, or defaultValue if missing or not a number.
   * @param {number} index
   * @param {number} [defaultValue]
   * @returns {number|undefined}
   */
  getNumber(index, defaultValue = undefined) {
    const item = this.get(index);
    if (item && item.isNumber()) {
      return item.value;
    }
    return defaultValue;
  }

  /**
   * Returns string value at index, or defaultValue if missing or not a string.
   * @param {number} index
   * @param {string} [defaultValue]
   * @returns {string|undefined}
   */
  getString(index, defaultValue = undefined) {
    const item = this.get(index);
    if (item && item.isString()) {
      return item.value;
    }
    return defaultValue;
  }

  /**
   * Returns name string at index, or defaultValue if missing or not a name.
   * @param {number} index
   * @param {string} [defaultValue]
   * @returns {string|undefined}
   */
  getName(index, defaultValue = undefined) {
    const item = this.get(index);
    if (item && item.isName()) {
      return item.value;
    }
    return defaultValue;
  }

  /**
   * Returns child PdfDictionary at index, or null.
   * @param {number} index
   * @returns {PdfDictionary|null}
   */
  getDictionary(index) {
    const item = this.get(index);
    if (item && item.isDictionary()) {
      return item;
    }
    return null;
  }

  /**
   * Returns child PdfArray at index, or null.
   * @param {number} index
   * @returns {PdfArray|null}
   */
  getArray(index) {
    const item = this.get(index);
    if (item && item.isArray()) {
      return item;
    }
    return null;
  }

  /**
   * Returns child PdfReference at index, or null.
   * @param {number} index
   * @returns {PdfReference|null}
   */
  getReference(index) {
    const item = this.get(index);
    if (item && item.isReference()) {
      return item;
    }
    return null;
  }

  /**
   * Iterator implementation over array elements.
   */
  [Symbol.iterator]() {
    return this.#items[Symbol.iterator]();
  }

  toString() {
    return `[ ${this.#items.map(i => i.toString()).join(' ')} ]`;
  }
}
