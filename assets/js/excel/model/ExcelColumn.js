import { CellAddress } from '../utils/CellAddress.js';
import { ExcelStyle } from '../styles/ExcelStyle.js';

/**
 * Represents a column configuration in an Excel worksheet.
 */
export class ExcelColumn {
  /**
   * @param {number} colNumber 1-based column number
   * @param {Object} worksheet Parent worksheet
   */
  constructor(colNumber, worksheet) {
    this.colNumber = colNumber;
    this.colName = CellAddress.colIndexToName(colNumber);
    this.worksheet = worksheet;
    this.width = null;
    this.hidden = false;
    this.style = new ExcelStyle();
  }

  /**
   * Sets width in standard Excel character units.
   * @param {number} width
   * @returns {ExcelColumn}
   */
  setWidth(width) {
    this.width = typeof width === 'number' ? width : null;
    return this;
  }

  /**
   * Sets default column style.
   * @param {ExcelStyle|Object} style
   * @returns {ExcelColumn}
   */
  setStyle(style) {
    this.style = style instanceof ExcelStyle ? style : new ExcelStyle(style);
    return this;
  }
}
