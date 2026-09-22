import { CellAddress } from '../utils/CellAddress.js';
import { DateUtils } from '../utils/DateUtils.js';
import { ExcelStyle } from '../styles/ExcelStyle.js';

/**
 * Represents an individual worksheet cell.
 */
export class ExcelCell {
  /**
   * @param {number} row 1-based row index
   * @param {number} col 1-based col index
   * @param {Object} [worksheet=null]
   */
  constructor(row, col, worksheet = null) {
    this.row = row;
    this.col = col;
    this.ref = CellAddress.toAddress(col, row);
    this.worksheet = worksheet;

    this.#value = null;
    this.formula = null;
    this.style = new ExcelStyle();
    this.comment = null;
    this.hyperlink = null;
  }

  #value;

  /**
   * Returns cell raw value. If cell has a formula and no cached value, evaluates formula.
   * @returns {*}
   */
  get value() {
    if (this.formula && this.#value === null && this.worksheet) {
      this.#value = this.evaluateFormula();
    }
    return this.#value;
  }

  /**
   * Sets cell value directly.
   * @param {*} val
   */
  set value(val) {
    this.setValue(val);
  }

  /**
   * Sets the cell value.
   * @param {*} val
   * @returns {ExcelCell}
   */
  setValue(val) {
    if (typeof val === 'string' && val.startsWith('=')) {
      this.formula = val;
      this.#value = null;
    } else {
      this.#value = val;
    }
    return this;
  }

  /**
   * Sets cell formula expression (e.g. "=SUM(A1:A10)").
   * @param {string} formula
   * @param {*} [cachedValue=null]
   * @returns {ExcelCell}
   */
  setFormula(formula, cachedValue = null) {
    this.formula = formula ? (formula.startsWith('=') ? formula : `=${formula}`) : null;
    if (cachedValue !== null && cachedValue !== undefined) {
      this.#value = cachedValue;
    } else {
      this.#value = null;
    }
    return this;
  }

  /**
   * Sets or merges cell style.
   * @param {ExcelStyle|Object} style
   * @returns {ExcelCell}
   */
  setStyle(style) {
    if (style instanceof ExcelStyle) {
      this.style = style;
    } else if (style && typeof style === 'object') {
      this.style = new ExcelStyle(style);
    }
    return this;
  }

  /**
   * Evaluates the cell's formula if present.
   * @returns {*}
   */
  evaluateFormula() {
    if (!this.formula || !this.worksheet) return this.#value;
    const { FormulaEvaluator } = this.worksheet.getEvaluatorHelper ? this.worksheet.getEvaluatorHelper() : {};
    if (FormulaEvaluator) {
      return FormulaEvaluator.evaluate(this.formula, this.worksheet);
    }
    return this.#value;
  }

  /**
   * Returns cell data type according to OpenXML spec:
   * 'b' (boolean), 'n' (number), 'd' (date), 's' (shared string), 'str' (formula string), 'e' (error).
   * @returns {string}
   */
  get type() {
    const val = this.value;
    if (val === null || val === undefined) return 's';
    if (typeof val === 'boolean') return 'b';
    if (typeof val === 'number') return 'n';
    if (DateUtils.isDate(val)) return 'd';
    if (typeof val === 'string') {
      if (val.startsWith('#') && val.endsWith('!')) return 'e';
      return this.formula ? 'str' : 's';
    }
    return 's';
  }

  /**
   * Clears cell content and formula.
   * @returns {ExcelCell}
   */
  clear() {
    this.#value = null;
    this.formula = null;
    this.comment = null;
    this.hyperlink = null;
    return this;
  }

  /**
   * Returns formatted string representation.
   * @returns {string}
   */
  toString() {
    const val = this.value;
    if (val === null || val === undefined) return '';
    if (DateUtils.isDate(val)) {
      return val.toISOString().split('T')[0];
    }
    return String(val);
  }
}
