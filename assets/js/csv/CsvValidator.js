/**
 * CsvValidator - Comprehensive syntax validation, RFC 4180 compliance diagnostics,
 * and column-level schema enforcement (data types, uniqueness, regex patterns, enums, bounds).
 */

import { CsvParser } from './CsvParser.js';

export class CsvValidator {
  /**
   * Validate CSV syntax and RFC 4180 compliance
   * @param {string} csvText
   * @param {object} [options]
   * @returns {{ valid: boolean, errors: Array<{ line: number, message: string, snippet?: string }>, stats: object }}
   */
  static validateSyntax(csvText, options = {}) {
    if (typeof csvText !== 'string' || csvText.trim().length === 0) {
      return {
        valid: false,
        errors: [{ line: 1, message: 'CSV input is empty or not a string' }],
        stats: { rows: 0, columns: 0 }
      };
    }

    const errors = [];
    let insideQuotes = false;
    let quoteStartLine = 1;
    let quoteStartCol = 1;
    let line = 1;
    let col = 1;
    const len = csvText.length;

    const quoteChar = options.quote || '"';
    const delimiter = options.delimiter || CsvParser.detectDelimiter(csvText);

    for (let i = 0; i < len; i++) {
      const ch = csvText[i];
      const nextCh = i + 1 < len ? csvText[i + 1] : '';

      if (insideQuotes) {
        if (ch === quoteChar) {
          if (nextCh === quoteChar) {
            // Escaped quote
            i++;
            col += 2;
            continue;
          } else {
            insideQuotes = false;
          }
        }
      } else {
        if (ch === quoteChar) {
          insideQuotes = true;
          quoteStartLine = line;
          quoteStartCol = col;
        }
      }

      if (ch === '\n') {
        line++;
        col = 1;
      } else if (ch === '\r') {
        if (nextCh === '\n') {
          // Will be handled on next char
        } else {
          line++;
          col = 1;
        }
      } else {
        col++;
      }
    }

    if (insideQuotes) {
      const lines = csvText.split(/\r?\n/);
      const snippetLine = lines[quoteStartLine - 1] || '';
      const pointer = ' '.repeat(Math.max(0, quoteStartCol - 1)) + '^';
      errors.push({
        line: quoteStartLine,
        col: quoteStartCol,
        message: `Unclosed quoted field opened at line ${quoteStartLine}, column ${quoteStartCol}`,
        snippet: `${snippetLine}\n${pointer}`
      });
    }

    // Check column consistency across rows
    try {
      const rows = CsvParser.parse(csvText, { ...options, asObjects: false, lenient: false });
      if (rows.length > 0) {
        const expectedCols = rows[0].length;
        if (expectedCols === 0) {
          errors.push({ line: 1, message: 'Header row contains no columns' });
        }

        for (let r = 1; r < rows.length; r++) {
          if (rows[r].length !== expectedCols) {
            errors.push({
              line: r + 1,
              message: `Column count mismatch: expected ${expectedCols} columns, found ${rows[r].length}`
            });
          }
        }

        return {
          valid: errors.length === 0,
          errors,
          stats: {
            rows: rows.length,
            columns: expectedCols,
            delimiter
          }
        };
      }
    } catch (err) {
      errors.push({ line: 1, message: err.message });
    }

    return {
      valid: errors.length === 0,
      errors,
      stats: { rows: 0, columns: 0, delimiter }
    };
  }

  /**
   * Validate CSV records against a structured column schema
   * @param {string|Array<object>} csvData
   * @param {object} schema
   * @param {object} [options]
   * @returns {{ valid: boolean, errors: Array<{ row: number, column: string, message: string, value: any }>, rowCount: number }}
   */
  static validateSchema(csvData, schema = {}, options = {}) {
    let records = [];
    if (typeof csvData === 'string') {
      records = CsvParser.parse(csvData, { ...options, asObjects: true, dynamicTyping: true });
    } else if (Array.isArray(csvData)) {
      records = csvData;
    }

    const errors = [];
    const colRules = schema.columns || schema;
    const uniquenessTrackers = {};

    // Initialize uniqueness trackers
    for (const [colName, rule] of Object.entries(colRules)) {
      if (rule.unique) {
        uniquenessTrackers[colName] = new Set();
      }
    }

    for (let r = 0; r < records.length; r++) {
      const row = records[r];
      const rowNum = r + 2; // Row 1 is header, 1-indexed

      for (const [colName, rule] of Object.entries(colRules)) {
        const val = row[colName];
        const isEmpty = val === null || val === undefined || val === '';

        // Required check
        if (rule.required && isEmpty) {
          errors.push({
            row: rowNum,
            column: colName,
            message: `Missing required field '${colName}'`,
            value: val
          });
          continue;
        }

        if (isEmpty) continue; // Skip further checks if optional and empty

        // Type checks
        if (rule.type) {
          const type = rule.type.toLowerCase();
          if (type === 'number') {
            if (typeof val !== 'number' || isNaN(val)) {
              errors.push({ row: rowNum, column: colName, message: `'${colName}' must be a valid number`, value: val });
            }
          } else if (type === 'integer') {
            if (!Number.isInteger(val)) {
              errors.push({ row: rowNum, column: colName, message: `'${colName}' must be an integer`, value: val });
            }
          } else if (type === 'boolean') {
            if (typeof val !== 'boolean') {
              errors.push({ row: rowNum, column: colName, message: `'${colName}' must be a boolean (true/false)`, value: val });
            }
          } else if (type === 'date') {
            if (isNaN(Date.parse(val))) {
              errors.push({ row: rowNum, column: colName, message: `'${colName}' must be a valid ISO/RFC date string`, value: val });
            }
          } else if (type === 'email') {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val))) {
              errors.push({ row: rowNum, column: colName, message: `'${colName}' must be a valid email address`, value: val });
            }
          } else if (type === 'url') {
            if (!/^https?:\/\/[^\s$.?#].[^\s]*$/i.test(String(val))) {
              errors.push({ row: rowNum, column: colName, message: `'${colName}' must be a valid HTTP(S) URL`, value: val });
            }
          } else if (type === 'regex') {
            if (rule.pattern && !rule.pattern.test(String(val))) {
              errors.push({ row: rowNum, column: colName, message: `'${colName}' does not match pattern ${rule.pattern}`, value: val });
            }
          }
        }

        // Numeric bounds
        if (typeof val === 'number') {
          if (rule.min !== undefined && val < rule.min) {
            errors.push({ row: rowNum, column: colName, message: `'${colName}' (${val}) is less than minimum (${rule.min})`, value: val });
          }
          if (rule.max !== undefined && val > rule.max) {
            errors.push({ row: rowNum, column: colName, message: `'${colName}' (${val}) is greater than maximum (${rule.max})`, value: val });
          }
        }

        // String length bounds
        if (typeof val === 'string') {
          if (rule.minLength !== undefined && val.length < rule.minLength) {
            errors.push({ row: rowNum, column: colName, message: `'${colName}' length (${val.length}) is below minimum (${rule.minLength})`, value: val });
          }
          if (rule.maxLength !== undefined && val.length > rule.maxLength) {
            errors.push({ row: rowNum, column: colName, message: `'${colName}' length (${val.length}) exceeds maximum (${rule.maxLength})`, value: val });
          }
        }

        // Enum check
        if (Array.isArray(rule.enum)) {
          if (!rule.enum.includes(val)) {
            errors.push({ row: rowNum, column: colName, message: `'${colName}' (${val}) must be one of [${rule.enum.join(', ')}]`, value: val });
          }
        }

        // Uniqueness check
        if (rule.unique && uniquenessTrackers[colName]) {
          const strKey = String(val);
          if (uniquenessTrackers[colName].has(strKey)) {
            errors.push({ row: rowNum, column: colName, message: `Duplicate value '${val}' violates unique constraint on column '${colName}'`, value: val });
          } else {
            uniquenessTrackers[colName].add(strKey);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      rowCount: records.length
    };
  }
}
