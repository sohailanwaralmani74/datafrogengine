/**
 * ExcelEditor - Powerful programmatic spreadsheet modification, row/column reordering,
 * sheet management, cell manipulation, filtering, and sorting.
 */

import { ExcelWorkbook } from './model/ExcelWorkbook.js';
import { ExcelStyle } from './styles/ExcelStyle.js';

export class ExcelEditor {
  /**
   * Set value of a specific cell in a sheet
   * @param {ExcelWorkbook} workbook
   * @param {string|number} sheet
   * @param {string|number} refOrRow e.g. 'A1' or 1
   * @param {number|any} [colOrVal] column index or value if ref was 'A1'
   * @param {any} [value] value if row and col were provided
   */
  static setCell(workbook, sheet, refOrRow, colOrVal, value) {
    const ws = typeof sheet === 'object' && sheet.getCell ? sheet : workbook.getWorksheet(sheet);
    if (!ws) throw new Error(`Worksheet not found: ${sheet}`);

    if (value !== undefined) {
      const cell = ws.getCell(refOrRow, colOrVal);
      cell.setValue(value);
      return cell;
    } else {
      const cell = ws.getCell(refOrRow);
      cell.setValue(colOrVal);
      return cell;
    }
  }

  /**
   * Set formula of a cell
   * @param {ExcelWorkbook} workbook
   * @param {string|number} sheet
   * @param {string} cellRef
   * @param {string} formula
   */
  static setFormula(workbook, sheet, cellRef, formula) {
    const ws = workbook.getWorksheet(sheet);
    if (!ws) throw new Error(`Worksheet not found: ${sheet}`);
    const cell = ws.getCell(cellRef);
    cell.setFormula(formula);
    return cell;
  }

  /**
   * Set style of a cell or range
   * @param {ExcelWorkbook} workbook
   * @param {string|number} sheet
   * @param {string} cellRef
   * @param {object|ExcelStyle} style
   */
  static setStyle(workbook, sheet, cellRef, style) {
    const ws = workbook.getWorksheet(sheet);
    if (!ws) throw new Error(`Worksheet not found: ${sheet}`);
    const cell = ws.getCell(cellRef);
    cell.setStyle(style instanceof ExcelStyle ? style : new ExcelStyle(style));
    return cell;
  }

  /**
   * Reorder sheets in a workbook
   * @param {ExcelWorkbook} workbook
   * @param {Array<string>} newSheetOrder List of sheet names in desired order
   * @returns {ExcelWorkbook}
   */
  static reorderSheets(workbook, newSheetOrder) {
    const map = new Map(workbook.worksheets.map(ws => [ws.name.toLowerCase(), ws]));
    const reordered = [];

    for (const name of newSheetOrder) {
      const ws = map.get(name.toLowerCase());
      if (ws) {
        reordered.push(ws);
        map.delete(name.toLowerCase());
      }
    }

    // Append any unmentioned sheets
    for (const ws of map.values()) {
      reordered.push(ws);
    }

    workbook.worksheets = reordered;
    return workbook;
  }

  /**
   * Reorder columns in a worksheet (preserving row 1 as headers)
   * @param {ExcelWorkbook} workbook
   * @param {string|number} sheet
   * @param {Array<string>} newColumnOrder List of column header names
   * @returns {ExcelWorksheet}
   */
  static reorderColumns(workbook, sheet, newColumnOrder) {
    const ws = workbook.getWorksheet(sheet);
    if (!ws) throw new Error(`Worksheet not found: ${sheet}`);

    const records = ws.toJson();
    if (records.length === 0) return ws;

    const currentCols = Object.keys(records[0]);
    const requestedCols = new Set(newColumnOrder);
    const remaining = currentCols.filter(c => !requestedCols.has(c));
    const finalCols = [...newColumnOrder.filter(c => currentCols.includes(c)), ...remaining];

    // Rebuild worksheet rows
    ws.rows.clear();
    ws.addRow(finalCols);

    for (const rec of records) {
      const rowVals = finalCols.map(c => (rec[c] !== undefined ? rec[c] : ''));
      ws.addRow(rowVals);
    }

    return ws;
  }

  /**
   * Reorder data rows (preserving header row 1) according to 0-based record indices
   * @param {ExcelWorkbook} workbook
   * @param {string|number} sheet
   * @param {Array<number>} newRecordOrder
   * @returns {ExcelWorksheet}
   */
  static reorderRows(workbook, sheet, newRecordOrder) {
    const ws = workbook.getWorksheet(sheet);
    if (!ws) throw new Error(`Worksheet not found: ${sheet}`);

    const records = ws.toJson();
    if (records.length === 0) return ws;

    const headers = Object.keys(records[0]);
    const reorderedRecords = [];
    for (const idx of newRecordOrder) {
      if (idx >= 0 && idx < records.length) {
        reorderedRecords.push(records[idx]);
      }
    }

    ws.rows.clear();
    ws.addRow(headers);
    for (const rec of reorderedRecords) {
      ws.addRow(headers.map(h => (rec[h] !== undefined ? rec[h] : '')));
    }

    return ws;
  }

  /**
   * Filter data rows in a worksheet
   * @param {ExcelWorkbook} workbook
   * @param {string|number} sheet
   * @param {Function} predicate (record) => boolean
   * @returns {ExcelWorksheet}
   */
  static filterRows(workbook, sheet, predicate) {
    const ws = workbook.getWorksheet(sheet);
    if (!ws) throw new Error(`Worksheet not found: ${sheet}`);

    const records = ws.toJson();
    if (records.length === 0) return ws;

    const headers = Object.keys(records[0]);
    const filtered = records.filter(predicate);

    ws.rows.clear();
    ws.addRow(headers);
    for (const rec of filtered) {
      ws.addRow(headers.map(h => (rec[h] !== undefined ? rec[h] : '')));
    }

    return ws;
  }

  /**
   * Sort data rows in a worksheet
   * @param {ExcelWorkbook} workbook
   * @param {string|number} sheet
   * @param {string} column Column header name
   * @param {'asc'|'desc'} [direction='asc']
   * @returns {ExcelWorksheet}
   */
  static sortRows(workbook, sheet, column, direction = 'asc') {
    const ws = workbook.getWorksheet(sheet);
    if (!ws) throw new Error(`Worksheet not found: ${sheet}`);

    const records = ws.toJson();
    if (records.length === 0) return ws;

    const headers = Object.keys(records[0]);
    const dir = direction === 'desc' ? -1 : 1;

    records.sort((a, b) => {
      const vA = a[column];
      const vB = b[column];
      if (vA === vB) return 0;
      if (vA === undefined || vA === null) return 1;
      if (vB === undefined || vB === null) return -1;
      if (typeof vA === 'number' && typeof vB === 'number') {
        return (vA - vB) * dir;
      }
      return String(vA).localeCompare(String(vB)) * dir;
    });

    ws.rows.clear();
    ws.addRow(headers);
    for (const rec of records) {
      ws.addRow(headers.map(h => (rec[h] !== undefined ? rec[h] : '')));
    }

    return ws;
  }

  /**
   * Rename an existing sheet
   * @param {ExcelWorkbook} workbook
   * @param {string} oldName
   * @param {string} newName
   */
  static renameSheet(workbook, oldName, newName) {
    const ws = workbook.getWorksheet(oldName);
    if (!ws) throw new Error(`Worksheet not found: ${oldName}`);
    ws.name = newName;
    return ws;
  }
}
