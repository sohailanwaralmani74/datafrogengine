/**
 * ExcelCompressor - Spreadsheet file size optimizer and memory compressor.
 * Prunes empty trailing boundaries, unifies styles, and minimizes OpenXML payloads.
 */

import { ExcelWorkbook } from './model/ExcelWorkbook.js';
import { ExcelWriter } from './io/ExcelWriter.js';

export class ExcelCompressor {
  /**
   * Compresses an Excel workbook, pruning unused space and returning optimized Uint8Array bytes
   * @param {ExcelWorkbook|Uint8Array} wb
   * @param {object} [options]
   * @returns {Uint8Array}
   */
  static compress(wb, options = {}) {
    const workbook = wb instanceof ExcelWorkbook ? wb : ExcelWorkbook.open(wb);

    for (const ws of workbook.worksheets) {
      // Find true populated boundary
      let maxPopulatedRow = 0;
      let maxPopulatedCol = 0;

      for (const [rNum, row] of ws.rows) {
        for (const [cNum, cell] of row.cells) {
          const v = cell.value;
          const hasContent = (v !== null && v !== undefined && v !== '') || cell.formula;
          if (hasContent) {
            if (rNum > maxPopulatedRow) maxPopulatedRow = rNum;
            if (cNum > maxPopulatedCol) maxPopulatedCol = cNum;
          }
        }
      }

      // Remove rows beyond maxPopulatedRow
      for (const rNum of Array.from(ws.rows.keys())) {
        if (rNum > maxPopulatedRow) {
          ws.rows.delete(rNum);
        } else {
          const row = ws.rows.get(rNum);
          for (const cNum of Array.from(row.cells.keys())) {
            if (cNum > maxPopulatedCol) {
              row.cells.delete(cNum);
            }
          }
        }
      }
    }

    return ExcelWriter.write(workbook);
  }
}
