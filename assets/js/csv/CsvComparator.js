/**
 * CsvComparator - High-precision structural and semantic comparison tool for CSV datasets.
 * Computes row-by-row, column-by-column diffs, value mutations, row additions/deletions,
 * and column schema drift.
 */

import { CsvParser } from './CsvParser.js';

export class CsvComparator {
  /**
   * Compare two CSV strings or record arrays
   * @param {string|Array<object>} csvA First (original) CSV
   * @param {string|Array<object>} csvB Second (modified) CSV
   * @param {object} [options]
   * @param {string} [options.keyColumn] Optional primary key column for row-level matching
   * @param {boolean} [options.ignoreWhitespace=true] Ignore whitespace differences in values
   * @param {boolean} [options.ignoreCase=false] Case-insensitive value comparison
   * @returns {object} Detailed comparison report
   */
  static compare(csvA, csvB, options = {}) {
    const recordsA = typeof csvA === 'string'
      ? CsvParser.parse(csvA, { ...options, asObjects: true })
      : csvA;
    const recordsB = typeof csvB === 'string'
      ? CsvParser.parse(csvB, { ...options, asObjects: true })
      : csvB;

    const ignoreWhitespace = options.ignoreWhitespace !== false;
    const ignoreCase = options.ignoreCase === true;
    const keyCol = options.keyColumn || null;

    // Analyze Column Schema Differences
    const colsA = recordsA.length > 0 ? Object.keys(recordsA[0]) : [];
    const colsB = recordsB.length > 0 ? Object.keys(recordsB[0]) : [];

    const colsSetA = new Set(colsA);
    const colsSetB = new Set(colsB);

    const addedColumns = colsB.filter(c => !colsSetA.has(c));
    const removedColumns = colsA.filter(c => !colsSetB.has(c));
    const commonColumns = colsA.filter(c => colsSetB.has(c));

    const isIdenticalCols = addedColumns.length === 0 && removedColumns.length === 0 &&
      colsA.every((c, i) => colsB[i] === c);

    // Normalize value helper
    const norm = (v) => {
      if (v === null || v === undefined) return '';
      let s = String(v);
      if (ignoreWhitespace) s = s.trim();
      if (ignoreCase) s = s.toLowerCase();
      return s;
    };

    const addedRows = [];
    const removedRows = [];
    const modifiedRows = [];
    let unchangedRowCount = 0;

    if (keyCol && (colsSetA.has(keyCol) || colsSetB.has(keyCol))) {
      // Keyed comparison
      const mapA = new Map();
      recordsA.forEach((r, idx) => mapA.set(norm(r[keyCol]), { row: r, index: idx + 1 }));

      const mapB = new Map();
      recordsB.forEach((r, idx) => mapB.set(norm(r[keyCol]), { row: r, index: idx + 1 }));

      // Find removed and modified
      for (const [key, itemA] of mapA.entries()) {
        if (!mapB.has(key)) {
          removedRows.push({ rowNumber: itemA.index, key, data: itemA.row });
        } else {
          const itemB = mapB.get(key);
          const cellChanges = [];

          for (const col of commonColumns) {
            const valA = itemA.row[col];
            const valB = itemB.row[col];
            if (norm(valA) !== norm(valB)) {
              cellChanges.push({ column: col, oldValue: valA, newValue: valB });
            }
          }

          if (cellChanges.length > 0) {
            modifiedRows.push({
              key,
              rowNumberA: itemA.index,
              rowNumberB: itemB.index,
              changes: cellChanges
            });
          } else {
            unchangedRowCount++;
          }
        }
      }

      // Find added
      for (const [key, itemB] of mapB.entries()) {
        if (!mapA.has(key)) {
          addedRows.push({ rowNumber: itemB.index, key, data: itemB.row });
        }
      }
    } else {
      // Positional (index-based) comparison
      const maxRows = Math.max(recordsA.length, recordsB.length);

      for (let i = 0; i < maxRows; i++) {
        const rowNum = i + 1;
        const rowA = recordsA[i];
        const rowB = recordsB[i];

        if (!rowA && rowB) {
          addedRows.push({ rowNumber: rowNum, data: rowB });
        } else if (rowA && !rowB) {
          removedRows.push({ rowNumber: rowNum, data: rowA });
        } else {
          const cellChanges = [];
          for (const col of commonColumns) {
            const valA = rowA[col];
            const valB = rowB[col];
            if (norm(valA) !== norm(valB)) {
              cellChanges.push({ column: col, oldValue: valA, newValue: valB });
            }
          }

          if (cellChanges.length > 0) {
            modifiedRows.push({
              rowNumber: rowNum,
              changes: cellChanges
            });
          } else {
            unchangedRowCount++;
          }
        }
      }
    }

    const isIdentical = isIdenticalCols &&
      addedRows.length === 0 &&
      removedRows.length === 0 &&
      modifiedRows.length === 0;

    return {
      identical: isIdentical,
      summary: {
        totalRowsA: recordsA.length,
        totalRowsB: recordsB.length,
        addedRows: addedRows.length,
        removedRows: removedRows.length,
        modifiedRows: modifiedRows.length,
        unchangedRows: unchangedRowCount,
        addedColumns,
        removedColumns,
        commonColumns: commonColumns.length
      },
      schema: {
        columnsA: colsA,
        columnsB: colsB,
        addedColumns,
        removedColumns
      },
      differences: {
        addedRows,
        removedRows,
        modifiedRows
      }
    };
  }
}
