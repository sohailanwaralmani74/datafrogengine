/**
 * ExcelCleaner - Sanitization, whitespace normalization, blank row/column elimination,
 * and header cleansing for Excel Workbooks.
 */

import { ExcelWorkbook } from './model/ExcelWorkbook.js';

export class ExcelCleaner {
  /**
   * Cleans all sheets within an ExcelWorkbook
   * @param {ExcelWorkbook} workbook
   * @param {object} [options]
   * @returns {ExcelWorkbook}
   */
  static cleanWorkbook(workbook, options = {}) {
    if (!(workbook instanceof ExcelWorkbook)) {
      throw new TypeError('Expected ExcelWorkbook instance');
    }
    for (const ws of workbook.worksheets) {
      ExcelCleaner.cleanSheet(ws, options);
    }
    return workbook;
  }

  /**
   * Cleans and normalizes a specific worksheet
   * @param {ExcelWorksheet} ws
   * @param {object} [options]
   * @param {boolean} [options.trim=true] Trim string cell values
   * @param {boolean} [options.dropEmptyRows=true] Drop blank rows
   * @param {boolean} [options.normalizeHeaders=false] Lowercase and clean header row
   * @returns {ExcelWorksheet}
   */
  static cleanSheet(ws, options = {}) {
    const trim = options.trim !== false;
    const dropEmptyRows = options.dropEmptyRows !== false;
    const normalizeHeaders = options.normalizeHeaders === true;

    // Collect non-empty rows
    const cleanedRowsData = [];
    const maxRow = ws.rowCount;

    for (let r = 1; r <= maxRow; r++) {
      const row = ws.rows.get(r);
      if (!row) continue;

      const cellVals = [];
      let hasData = false;
      const colIndices = Array.from(row.cells.keys()).sort((a, b) => a - b);
      const maxCol = colIndices.length > 0 ? colIndices[colIndices.length - 1] : 0;

      for (let c = 1; c <= maxCol; c++) {
        let val = row.getCell(c).value;
        if (trim && typeof val === 'string') {
          val = val.trim();
        }
        if (val !== null && val !== undefined && val !== '') {
          hasData = true;
        }
        cellVals.push(val);
      }

      if (!hasData && dropEmptyRows) {
        continue;
      }

      if (r === 1 && normalizeHeaders) {
        const normRow = cellVals.map(h => (typeof h === 'string' ? h.trim().toLowerCase().replace(/[^\w]+/g, '_').replace(/^_|_$/g, '') : h));
        cleanedRowsData.push(normRow);
      } else {
        cleanedRowsData.push(cellVals);
      }
    }

    // Clear and rebuild sheet rows
    ws.rows.clear();
    for (const rowData of cleanedRowsData) {
      ws.addRow(rowData);
    }

    return ws;
  }
}
