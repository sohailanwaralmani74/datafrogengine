import { PdfObject } from '../objects/PdfObject.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Categorization of standard PDF content stream operators.
 */
const TEXT_OPERATORS = new Set([
  'BT', 'ET', 'Tf', 'Tj', 'TJ', '\'', '"', 'Td', 'TD', 'Tm', 'T*', 'Tc', 'Tw', 'Tz', 'TL', 'Tr', 'Ts'
]);

const GRAPHICS_STATE_OPERATORS = new Set([
  'q', 'Q', 'cm', 'w', 'J', 'j', 'M', 'd', 'ri', 'i', 'gs'
]);

const PATH_OPERATORS = new Set([
  'm', 'l', 'c', 'v', 'y', 'h', 're', 'S', 's', 'f', 'F', 'f*', 'B', 'b', 'B*', 'b*', 'W', 'W*', 'n'
]);

const COLOR_OPERATORS = new Set([
  'CS', 'cs', 'SC', 'SCN', 'sc', 'scn', 'G', 'g', 'RG', 'rg', 'K', 'k'
]);

const IMAGE_OPERATORS = new Set([
  'Do', 'BI', 'ID', 'EI'
]);

/**
 * Represents an individual PDF graphics or text operator with its operands.
 */
export class PdfOperator {
  /** @type {string} */
  #name;

  /** @type {Array<*>} */
  #args;

  /**
   * @param {string} name - Operator name (e.g. 'Tj', 'cm', 'BT', 're')
   * @param {Array<*>} [args=[]] - Operands passed to this operator
   */
  constructor(name, args = []) {
    if (typeof name !== 'string' || name.length === 0) {
      throw new PdfInvalidArgumentException('name', name, 'non-empty string');
    }
    if (!Array.isArray(args)) {
      throw new PdfInvalidArgumentException('args', args, 'Array');
    }
    this.#name = name;
    this.#args = [...args];
  }

  get name() {
    return this.#name;
  }

  get args() {
    return this.#args;
  }

  /**
   * Number of arguments.
   * @returns {number}
   */
  get argCount() {
    return this.#args.length;
  }

  /**
   * Returns argument at index or defaultValue.
   * @param {number} index
   * @param {*} [defaultValue=undefined]
   * @returns {*}
   */
  getArg(index, defaultValue = undefined) {
    if (index >= 0 && index < this.#args.length) {
      const arg = this.#args[index];
      if (arg instanceof PdfObject && 'value' in arg) {
        return arg.value;
      }
      return arg;
    }
    return defaultValue;
  }

  /**
   * Returns numeric argument value at index.
   * @param {number} index
   * @param {number} [defaultValue=0]
   * @returns {number}
   */
  getNumber(index, defaultValue = 0) {
    const val = this.getArg(index);
    if (typeof val === 'number') {
      return val;
    }
    return defaultValue;
  }

  /**
   * Returns string argument value at index.
   * @param {number} index
   * @param {string} [defaultValue='']
   * @returns {string}
   */
  getString(index, defaultValue = '') {
    const val = this.getArg(index);
    if (typeof val === 'string') {
      return val;
    }
    return defaultValue;
  }

  /**
   * Returns name argument value at index.
   * @param {number} index
   * @param {string} [defaultValue='']
   * @returns {string}
   */
  getName(index, defaultValue = '') {
    return this.getString(index, defaultValue);
  }

  /**
   * Checks if this is a text operator (BT, ET, Tf, Tj, TJ, etc.).
   * @returns {boolean}
   */
  isText() {
    return TEXT_OPERATORS.has(this.#name);
  }

  /**
   * Checks if this is a graphics state operator (q, Q, cm, w, gs, etc.).
   * @returns {boolean}
   */
  isGraphicsState() {
    return GRAPHICS_STATE_OPERATORS.has(this.#name);
  }

  /**
   * Checks if this is a path operator (m, l, c, re, f, S, etc.).
   * @returns {boolean}
   */
  isPath() {
    return PATH_OPERATORS.has(this.#name);
  }

  /**
   * Checks if this is a color operator (rg, RG, g, G, k, K, sc, cs, etc.).
   * @returns {boolean}
   */
  isColor() {
    return COLOR_OPERATORS.has(this.#name);
  }

  /**
   * Checks if this is an image operator (Do, BI, etc.).
   * @returns {boolean}
   */
  isImage() {
    return IMAGE_OPERATORS.has(this.#name);
  }

  toString() {
    if (this.#args.length === 0) {
      return this.#name;
    }
    const formattedArgs = this.#args.map(arg => {
      if (arg && typeof arg.toString === 'function') {
        return arg.toString();
      }
      return String(arg);
    }).join(' ');
    return `${formattedArgs} ${this.#name}`;
  }
}
