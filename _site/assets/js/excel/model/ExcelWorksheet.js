import { ExcelRow } from './ExcelRow.js';
import { ExcelColumn } from './ExcelColumn.js';
import { ExcelCell } from './ExcelCell.js';
import { CellAddress } from '../utils/CellAddress.js';
import { FormulaEvaluator } from '../formula/FormulaEvaluator.js';

/**
 * Represents a spreadsheet worksheet with cells, rows, columns, styles, merges, and formulas.
 */
export class ExcelWorksheet {
  /**
   * @param {string} name Sheet name
   * @param {Object} [workbook=null] Parent workbook
   */
  constructor(name, workbook = null) {
    this.name = name;
    this.workbook = workbook;
    /** @type {Map<number, ExcelRow>} */
    this.rows = new Map();
    /** @type {Map<number, ExcelColumn>} */
    this.columns = new Map();
    /** @type {Set<string>} */
    this.merges = new Set();
    this.autoFilter = null;
    this.freezePanes = null;
    this.showGridLines = true;
  }

  getEvaluatorHelper() {
    return { FormulaEvaluator };
  }

  /**
   * Retrieves a cell either by A1 reference (e.g. 'B5') or by (row, col) indices.
   * 
   * @param {string|number} refOrRow 'A1' or 1-based row number
   * @param {number|string} [col] 1-based column number or letter if first arg was row
   * @returns {ExcelCell}
   */
  getCell(refOrRow, col = undefined) {
    if (typeof refOrRow === 'string' && col === undefined) {
      const { col: parsedCol, row: parsedRow } = CellAddress.parseAddress(refOrRow);
      return this.getRow(parsedRow).getCell(parsedCol);
    }

    const rowNum = Number(refOrRow);
    const colNum = typeof col === 'string' ? CellAddress.colNameToIndex(col) : Number(col);
    return this.getRow(rowNum).getCell(colNum);
  }

  /**
   * Retrieves or creates a row by 1-based row number.
   * @param {number} rowNumber
   * @returns {ExcelRow}
   */
  getRow(rowNumber) {
    if (typeof rowNumber !== 'number' || rowNumber < 1) {
      throw new RangeError(`Row number must be >= 1, got ${rowNumber}`);
    }
    let row = this.rows.get(rowNumber);
    if (!row) {
      row = new ExcelRow(rowNumber, this);
      this.rows.set(rowNumber, row);
    }
    return row;
  }

  /**
   * Retrieves or creates a column by 1-based column index or letter.
   * @param {number|string} colNumberOrName
   * @returns {ExcelColumn}
   */
  getColumn(colNumberOrName) {
    const colNumber = typeof colNumberOrName === 'string'
      ? CellAddress.colNameToIndex(colNumberOrName)
      : Number(colNumberOrName);

    let column = this.columns.get(colNumber);
    if (!column) {
      column = new ExcelColumn(colNumber, this);
      this.columns.set(colNumber, column);
    }
    return column;
  }

  /**
   * Sets width for a specific column.
   * @param {number|string} colNumberOrName
   * @param {number} width
   * @returns {ExcelWorksheet}
   */
  setColumnWidth(colNumberOrName, width) {
    this.getColumn(colNumberOrName).setWidth(width);
    return this;
  }

  /**
   * Sets height for a specific row.
   * @param {number} rowNumber
   * @param {number} height
   * @returns {ExcelWorksheet}
   */
  setRowHeight(rowNumber, height) {
    this.getRow(rowNumber).height = height;
    return this;
  }

  /**
   * Appends a row of values to the bottom of the worksheet.
   * 
   * @param {Array<*>} values
   * @param {Object|ExcelStyle} [style=null]
   * @returns {ExcelRow}
   */
  addRow(values, style = null) {
    const nextRowNumber = this.rowCount + 1;
    const row = this.getRow(nextRowNumber);
    if (Array.isArray(values)) {
      row.setValues(values);
      if (style) {
        for (let c = 1; c <= values.length; c++) {
          row.getCell(c).setStyle(style);
        }
      }
    }
    return row;
  }

  /**
   * Appends multiple rows of values.
   * @param {Array<Array<*>>} rows
   * @returns {ExcelWorksheet}
   */
  addRows(rows) {
    if (Array.isArray(rows)) {
      for (const r of rows) {
        this.addRow(r);
      }
    }
    return this;
  }

  /**
   * Merges a cell range (e.g. "A1:C1").
   * @param {string} rangeStr
   * @returns {ExcelWorksheet}
   */
  mergeCells(rangeStr) {
    const parsed = CellAddress.parseRange(rangeStr);
    this.merges.add(parsed.range);
    return this;
  }

  /**
   * Unmerges a previously merged range.
   * @param {string} rangeStr
   * @returns {boolean}
   */
  unmergeCells(rangeStr) {
    const parsed = CellAddress.parseRange(rangeStr);
    return this.merges.delete(parsed.range);
  }

  /**
   * Returns array of all merged range strings.
   * @returns {string[]}
   */
  getMergedRanges() {
    return Array.from(this.merges);
  }

  /**
   * Freezes pane at specified row and column.
   * @param {number} [row=1]
   * @param {number} [col=0]
   * @returns {ExcelWorksheet}
   */
  freezePane(row = 1, col = 0) {
    this.freezePanes = { row, col };
    return this;
  }

  /**
   * Total number of rows with cell data.
   * @returns {number}
   */
  get rowCount() {
    let maxRow = 0;
    for (const [r, row] of this.rows.entries()) {
      if (row.cells.size > 0) {
        maxRow = Math.max(maxRow, r);
      }
    }
    return maxRow;
  }

  /**
   * Total number of columns with data or configuration.
   * @returns {number}
   */
  get columnCount() {
    let maxCol = 0;
    for (const row of this.rows.values()) {
      if (row.cells.size > 0) {
        maxCol = Math.max(maxCol, ...row.cells.keys());
      }
    }
    for (const col of this.columns.keys()) {
      maxCol = Math.max(maxCol, col);
    }
    return maxCol;
  }

  /**
   * Returns sheet dimensions range string (e.g. "A1:E25").
   * @returns {string}
   */
  getDimensions() {
    const totalRows = this.rowCount;
    const totalCols = this.columnCount;
    if (totalRows === 0 || totalCols === 0) return 'A1:A1';
    return `A1:${CellAddress.toAddress(totalCols, totalRows)}`;
  }

  /**
   * Evaluates all formulas in the worksheet.
   * @returns {ExcelWorksheet}
   */
  calculateFormulas() {
    for (const row of this.rows.values()) {
      for (const cell of row.cells.values()) {
        if (cell.formula) {
          cell.evaluateFormula();
        }
      }
    }
    return this;
  }

  /**
   * Converts sheet contents to a 2D array of cell values.
   * @returns {Array<Array<*>>}
   */
  toArray() {
    const res = [];
    const maxR = this.rowCount;
    const maxC = this.columnCount;
    for (let r = 1; r <= maxR; r++) {
      const rowArr = [];
      const row = this.rows.get(r);
      for (let c = 1; c <= maxC; c++) {
        rowArr.push(row ? row.getCell(c).value : null);
      }
      res.push(rowArr);
    }
    return res;
  }

  /**
   * Exports sheet data as an array of JSON objects using row 1 as column headers.
   * @returns {Array<Record<string, *>>}
   */
  toJson() {
    const grid = this.toArray();
    if (grid.length === 0) return [];

    const headers = grid[0].map((h, i) => String(h ?? `col_${i + 1}`).trim());
    const items = [];

    for (let r = 1; r < grid.length; r++) {
      const row = grid[r];
      const obj = {};
      let hasValue = false;
      for (let c = 0; c < headers.length; c++) {
        const val = row[c];
        if (val !== null && val !== undefined && val !== '') {
          hasValue = true;
        }
        obj[headers[c]] = val ?? null;
      }
      if (hasValue) {
        items.push(obj);
      }
    }
    return items;
  }

  /**
   * Exports sheet data as CSV text.
   * @param {string} [delimiter=',']
   * @returns {string}
   */
  toCsv(delimiter = ',') {
    const grid = this.toArray();
    const lines = [];

    for (const row of grid) {
      const formatted = row.map((val) => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(delimiter) || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
      lines.push(formatted.join(delimiter));
    }

    return lines.join('\n');
  }

  /**
   * Exports sheet as a styled HTML <table> string.
   * @returns {string}
   */
  toHtmlTable() {
    const grid = this.toArray();
    const rowsHtml = [];

    for (let r = 0; r < grid.length; r++) {
      const cellsHtml = [];
      const isHeader = r === 0;
      const tag = isHeader ? 'th' : 'td';
      for (let c = 0; c < grid[r].length; c++) {
        const val = grid[r][c] ?? '';
        cellsHtml.push(`<${tag}>${String(val)}</${tag}>`);
      }
      rowsHtml.push(`  <tr>${cellsHtml.join('')}</tr>`);
    }

    return `<table class="excel-table">\n${rowsHtml.join('\n')}\n</table>`;
  }
}
