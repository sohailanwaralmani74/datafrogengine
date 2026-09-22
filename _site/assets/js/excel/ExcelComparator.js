/**
 * ExcelComparator - Deep visual and semantic diffing for Excel spreadsheets.
 * Compares workbooks across sheets, cells, formulas, and structural dimensions.
 */

import { ExcelWorkbook } from './model/ExcelWorkbook.js';

export class ExcelComparator {
  /**
   * Compares two Excel workbooks
   * @param {ExcelWorkbook|Uint8Array} wbA Original workbook
   * @param {ExcelWorkbook|Uint8Array} wbB Modified workbook
   * @param {object} [options]
   * @returns {object} Detailed comparison result
   */
  static compare(wbA, wbB, options = {}) {
    const workbookA = wbA instanceof ExcelWorkbook ? wbA : ExcelWorkbook.open(wbA);
    const workbookB = wbB instanceof ExcelWorkbook ? wbB : ExcelWorkbook.open(wbB);

    const sheetsA = workbookA.sheetNames;
    const sheetsB = workbookB.sheetNames;

    const setA = new Set(sheetsA);
    const setB = new Set(sheetsB);

    const addedSheets = sheetsB.filter(s => !setA.has(s));
    const removedSheets = sheetsA.filter(s => !setB.has(s));
    const commonSheets = sheetsA.filter(s => setB.has(s));

    const sheetDiffs = {};
    let totalCellChanges = 0;

    for (const sheetName of commonSheets) {
      const wsA = workbookA.getWorksheet(sheetName);
      const wsB = workbookB.getWorksheet(sheetName);

      const diff = ExcelComparator.compareSheets(wsA, wsB, options);
      if (!diff.identical) {
        sheetDiffs[sheetName] = diff;
        totalCellChanges += diff.summary.changedCells;
      }
    }

    const identical = addedSheets.length === 0 &&
      removedSheets.length === 0 &&
      Object.keys(sheetDiffs).length === 0;

    return {
      identical,
      summary: {
        sheetsA: sheetsA.length,
        sheetsB: sheetsB.length,
        addedSheets,
        removedSheets,
        commonSheets: commonSheets.length,
        modifiedSheetsCount: Object.keys(sheetDiffs).length,
        totalCellChanges
      },
      sheetDifferences: sheetDiffs
    };
  }

  /**
   * Compares two worksheets cell by cell
   * @param {ExcelWorksheet} wsA
   * @param {ExcelWorksheet} wsB
   * @param {object} [options]
   * @returns {object}
   */
  static compareSheets(wsA, wsB, options = {}) {
    const rowsA = wsA.rowCount;
    const rowsB = wsB.rowCount;
    const maxRows = Math.max(rowsA, rowsB);

    const cellChanges = [];
    const formulaChanges = [];

    for (let r = 1; r <= maxRows; r++) {
      const rowA = wsA.rows.get(r);
      const rowB = wsB.rows.get(r);

      const maxCols = Math.max(
        rowA ? Math.max(...Array.from(rowA.cells.keys()), 0) : 0,
        rowB ? Math.max(...Array.from(rowB.cells.keys()), 0) : 0
      );

      for (let c = 1; c <= maxCols; c++) {
        const cellA = wsA.getCell(r, c);
        const cellB = wsB.getCell(r, c);

        const valA = cellA ? cellA.value : null;
        const valB = cellB ? cellB.value : null;

        const formA = cellA ? cellA.formula : null;
        const formB = cellB ? cellB.formula : null;

        if (formA !== formB) {
          formulaChanges.push({
            cell: cellA.ref,
            row: r,
            col: c,
            oldFormula: formA,
            newFormula: formB
          });
        }

        if (String(valA ?? '') !== String(valB ?? '')) {
          cellChanges.push({
            cell: cellA.ref,
            row: r,
            col: c,
            oldValue: valA,
            newValue: valB
          });
        }
      }
    }

    const identical = cellChanges.length === 0 && formulaChanges.length === 0;

    return {
      identical,
      summary: {
        dimensionsA: wsA.getDimensions(),
        dimensionsB: wsB.getDimensions(),
        changedCells: cellChanges.length,
        changedFormulas: formulaChanges.length
      },
      cellChanges,
      formulaChanges
    };
  }
}
