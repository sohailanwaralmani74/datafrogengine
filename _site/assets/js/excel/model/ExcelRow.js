import { ExcelCell } from './ExcelCell.js';
import { CellAddress } from '../utils/CellAddress.js';

/**
 * Represents a row in an Excel worksheet.
 */
export class ExcelRow {
  /**
   * @param {number} rowNumber 1-based row index
   * @param {Object} worksheet Parent worksheet
   */
  constructor(rowNumber, worksheet) {
    this.rowNumber = rowNumber;
    this.worksheet = worksheet;
    this.height = null;
    this.hidden = false;
    /** @type {Map<number, ExcelCell>} */
    this.cells = new Map();
  }

  /**
   * Retrieves or creates a cell in this row.
   * @param {number|string} colNumberOrName 1-based col index or letter (e.g. 1 or 'A')
   * @returns {ExcelCell}
   */
  getCell(colNumberOrName) {
    const colNumber = typeof colNumberOrName === 'string'
      ? CellAddress.colNameToIndex(colNumberOrName)
      : colNumberOrName;

    let cell = this.cells.get(colNumber);
    if (!cell) {
      cell = new ExcelCell(this.rowNumber, colNumber, this.worksheet);
      this.cells.set(colNumber, cell);
    }
    return cell;
  }

  /**
   * Iterates through all existing cells in this row.
   * @param {function(ExcelCell, number): void} callback
   */
  eachCell(callback) {
    const sortedCols = Array.from(this.cells.keys()).sort((a, b) => a - b);
    for (const col of sortedCols) {
      callback(this.cells.get(col), col);
    }
  }

  /**
   * Sets multiple values across cells in this row starting at startCol.
   * @param {Array<*>} values
   * @param {number} [startCol=1]
   * @returns {ExcelRow}
   */
  setValues(values, startCol = 1) {
    if (!Array.isArray(values)) return this;
    for (let i = 0; i < values.length; i++) {
      this.getCell(startCol + i).setValue(values[i]);
    }
    return this;
  }

  /**
   * Returns array of row cell values up to the highest column in this row.
   * @returns {Array<*>}
   */
  getValues() {
    if (this.cells.size === 0) return [];
    const maxCol = Math.max(...this.cells.keys());
    const res = [];
    for (let col = 1; col <= maxCol; col++) {
      const cell = this.cells.get(col);
      res.push(cell ? cell.value : null);
    }
    return res;
  }
}
