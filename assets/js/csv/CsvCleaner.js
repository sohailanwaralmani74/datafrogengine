/**
 * CsvCleaner - Data sanitization, deduplication, missing value imputation,
 * header normalization, empty row/column trimming, and structural repair.
 */

import { CsvParser } from './CsvParser.js';
import { CsvSerializer } from './CsvSerializer.js';

export class CsvCleaner {
  /**
   * Clean and normalize CSV dataset
   * @param {string} csvText
   * @param {object} [options]
   * @returns {string} Cleaned CSV text
   */
  static clean(csvText, options = {}) {
    if (typeof csvText !== 'string' || csvText.trim().length === 0) {
      return '';
    }

    const trim = options.trim !== false;
    const deduplicate = options.deduplicate === true;
    const dropEmptyRows = options.dropEmptyRows !== false;
    const dropEmptyColumns = options.dropEmptyColumns === true;
    const fillMissing = options.fillMissing || null;
    const normalizeHeaders = options.normalizeHeaders || null; // 'snake_case', 'camelCase', 'lower', 'upper'
    const deduplicateBy = options.deduplicateBy || null; // specific column name

    const rawRows = CsvParser.parse(csvText, {
      ...options,
      asObjects: false,
      lenient: true,
      trim: trim
    });

    if (rawRows.length === 0) return '';

    let headers = rawRows[0];
    let dataRows = rawRows.slice(1);

    // Normalize headers
    if (normalizeHeaders) {
      headers = headers.map(h => this._normalizeHeader(String(h), normalizeHeaders));
    }

    // Pad ragged rows to match header length
    const maxCols = headers.length;
    dataRows = dataRows.map(row => {
      const padded = [...row];
      while (padded.length < maxCols) {
        padded.push('');
      }
      return padded.slice(0, maxCols);
    });

    // Drop completely empty rows
    if (dropEmptyRows) {
      dataRows = dataRows.filter(row => row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== ''));
    }

    // Deduplicate
    if (deduplicate) {
      const seen = new Set();
      const uniqueRows = [];
      const colIdx = deduplicateBy ? headers.indexOf(deduplicateBy) : -1;

      for (const row of dataRows) {
        const key = colIdx >= 0 ? String(row[colIdx]) : row.join('|||');
        if (!seen.has(key)) {
          seen.add(key);
          uniqueRows.push(row);
        }
      }
      dataRows = uniqueRows;
    }

    // Fill missing values
    if (fillMissing) {
      dataRows = dataRows.map(row => {
        return row.map((cell, c) => {
          const colName = headers[c];
          const isEmpty = cell === null || cell === undefined || String(cell).trim() === '';
          if (isEmpty) {
            if (typeof fillMissing === 'object' && fillMissing[colName] !== undefined) {
              return fillMissing[colName];
            } else if (typeof fillMissing !== 'object') {
              return fillMissing;
            }
          }
          return cell;
        });
      });
    }

    // Drop completely empty columns
    if (dropEmptyColumns) {
      const retainedIndices = [];
      for (let c = 0; c < headers.length; c++) {
        const hasData = dataRows.some(row => row[c] !== null && row[c] !== undefined && String(row[c]).trim() !== '');
        if (hasData) {
          retainedIndices.push(c);
        }
      }

      headers = retainedIndices.map(i => headers[i]);
      dataRows = dataRows.map(row => retainedIndices.map(i => row[i]));
    }

    const allRows = [headers, ...dataRows];
    return CsvSerializer.serialize(allRows, options);
  }

  /**
   * Helper to normalize header string
   * @private
   */
  static _normalizeHeader(header, style) {
    const trimmed = header.trim();
    if (style === 'lower') {
      return trimmed.toLowerCase();
    }
    if (style === 'upper') {
      return trimmed.toUpperCase();
    }
    if (style === 'snake_case') {
      return trimmed
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .replace(/[\s\W-]+/g, '_')
        .toLowerCase()
        .replace(/^_+|_+$/g, '');
    }
    if (style === 'camelCase') {
      return trimmed
        .replace(/[\s\W_]+(.)/g, (_, c) => c.toUpperCase())
        .replace(/^([A-Z])/, (_, c) => c.toLowerCase());
    }
    return trimmed;
  }
}
