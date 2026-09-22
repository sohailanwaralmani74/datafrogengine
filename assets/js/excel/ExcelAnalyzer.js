/**
 * ExcelAnalyzer - Deep spreadsheet auditing, statistical profiling,
 * formula inventory, and structural metrics.
 */

import { ExcelWorkbook } from './model/ExcelWorkbook.js';
import { DateUtils } from './utils/DateUtils.js';

export class ExcelAnalyzer {
  /**
   * Analyzes an entire ExcelWorkbook
   * @param {ExcelWorkbook|Uint8Array} wb
   * @returns {object} Full workbook profile
   */
  static analyze(wb) {
    const workbook = wb instanceof ExcelWorkbook ? wb : ExcelWorkbook.open(wb);

    const sheetProfiles = workbook.worksheets.map(ws => ExcelAnalyzer.analyzeSheet(ws));

    const totalCells = sheetProfiles.reduce((acc, s) => acc + s.cellStats.totalCells, 0);
    const totalFormulas = sheetProfiles.reduce((acc, s) => acc + s.cellStats.formulas, 0);

    return {
      title: workbook.properties.title,
      creator: workbook.properties.creator,
      sheetCount: workbook.worksheets.length,
      sheetNames: workbook.sheetNames,
      totalCells,
      totalFormulas,
      sheets: sheetProfiles
    };
  }

  /**
   * Profiles a single worksheet
   * @param {ExcelWorksheet} ws
   * @returns {object}
   */
  static analyzeSheet(ws) {
    let populatedCells = 0;
    let numbers = 0;
    let strings = 0;
    let booleans = 0;
    let dates = 0;
    let formulas = 0;
    let emptyCells = 0;

    const formulaInventory = {};

    for (const [, row] of ws.rows) {
      for (const [, cell] of row.cells) {
        populatedCells++;
        if (cell.formula) {
          formulas++;
          const formName = cell.formula.split('(')[0].replace(/^=/, '').toUpperCase();
          formulaInventory[formName] = (formulaInventory[formName] || 0) + 1;
        }

        const v = cell.value;
        if (v === null || v === undefined || v === '') {
          emptyCells++;
        } else if (typeof v === 'number') {
          numbers++;
        } else if (typeof v === 'boolean') {
          booleans++;
        } else if (DateUtils.isDate(v)) {
          dates++;
        } else {
          strings++;
        }
      }
    }

    const records = ws.toJson();
    const columns = records.length > 0 ? Object.keys(records[0]) : [];

    return {
      name: ws.name,
      dimensions: ws.getDimensions(),
      rowCount: ws.rowCount,
      columnCount: ws.columnCount,
      columns,
      mergeCount: ws.merges.size,
      cellStats: {
        totalCells: populatedCells,
        numbers,
        strings,
        booleans,
        dates,
        formulas,
        emptyCells
      },
      formulaInventory
    };
  }
}
