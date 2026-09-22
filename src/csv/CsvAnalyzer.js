/**
 * CsvAnalyzer - Profiling, type inference, cardinality metrics, distribution,
 * and anomaly diagnostics for CSV datasets.
 */

import { CsvParser } from './CsvParser.js';

export class CsvAnalyzer {
  /**
   * Profile CSV data and return rich statistical summary
   * @param {string} csvText
   * @param {object} [options]
   * @returns {object} Profiler report
   */
  static profile(csvText, options = {}) {
    if (typeof csvText !== 'string' || csvText.trim().length === 0) {
      return { rowCount: 0, columnCount: 0, columns: {}, anomalies: [] };
    }

    const delimiter = CsvParser.detectDelimiter(csvText);
    const lineTerminator = csvText.includes('\r\n') ? 'CRLF (\\r\\n)' : 'LF (\\n)';
    const rawBytes = new Blob ? new Blob([csvText]).size : Buffer.from(csvText).length;

    const rawRows = CsvParser.parse(csvText, { ...options, asObjects: false, dynamicTyping: false });
    if (rawRows.length === 0) {
      return { rowCount: 0, columnCount: 0, columns: {}, anomalies: [] };
    }

    const headers = rawRows[0].map(h => String(h).trim());
    const dataRows = rawRows.slice(1);
    const rowCount = dataRows.length;
    const colCount = headers.length;

    const columnStats = {};
    for (let c = 0; c < colCount; c++) {
      const colName = headers[c] || `col_${c + 1}`;
      const values = dataRows.map(r => r[c]);

      columnStats[colName] = this._analyzeColumn(values);
    }

    // Dataset level anomalies
    const anomalies = [];

    // Check duplicate rows
    const rowSignatures = new Set();
    let duplicateRows = 0;
    for (const r of dataRows) {
      const sig = r.join('|||');
      if (rowSignatures.has(sig)) duplicateRows++;
      else rowSignatures.add(sig);
    }
    if (duplicateRows > 0) {
      anomalies.push({
        type: 'DUPLICATE_ROWS',
        severity: 'warning',
        message: `Found ${duplicateRows} completely duplicate row(s) out of ${rowCount} rows.`
      });
    }

    // Check columns with high missing rate
    for (const [col, stat] of Object.entries(columnStats)) {
      if (stat.missingRate > 0.5) {
        anomalies.push({
          type: 'HIGH_MISSING_RATE',
          severity: 'warning',
          message: `Column '${col}' has a ${Math.round(stat.missingRate * 100)}% missing/empty rate.`
        });
      }
    }

    return {
      overview: {
        totalRows: rawRows.length,
        dataRows: rowCount,
        columnCount: colCount,
        delimiter: delimiter === '\t' ? 'TAB (\\t)' : delimiter,
        lineTerminator,
        rawBytes,
        estimatedGzipBytes: Math.round(rawBytes * 0.35)
      },
      columns: columnStats,
      anomalies
    };
  }

  /**
   * Analyze individual column values
   * @private
   */
  static _analyzeColumn(values) {
    const total = values.length;
    let nullCount = 0;
    let emptyCount = 0;
    const distinctSet = new Map();

    let intCount = 0;
    let floatCount = 0;
    let boolCount = 0;
    let dateCount = 0;
    let stringCount = 0;

    const numbers = [];
    let minStrLen = Infinity;
    let maxStrLen = 0;

    for (const rawVal of values) {
      if (rawVal === null || rawVal === undefined) {
        nullCount++;
        continue;
      }
      const valStr = String(rawVal).trim();
      if (valStr === '') {
        emptyCount++;
        continue;
      }

      // Frequency tracking
      distinctSet.set(valStr, (distinctSet.get(valStr) || 0) + 1);

      minStrLen = Math.min(minStrLen, valStr.length);
      maxStrLen = Math.max(maxStrLen, valStr.length);

      // Type analysis
      if (valStr.toLowerCase() === 'true' || valStr.toLowerCase() === 'false') {
        boolCount++;
      } else if (/^-?\d+$/.test(valStr)) {
        intCount++;
        numbers.push(Number(valStr));
      } else if (/^-?\d+\.\d+([eE][+-]?\d+)?$/.test(valStr)) {
        floatCount++;
        numbers.push(Number(valStr));
      } else if (!isNaN(Date.parse(valStr)) && valStr.length >= 8 && /[/-]/.test(valStr)) {
        dateCount++;
      } else {
        stringCount++;
      }
    }

    const validCount = total - nullCount - emptyCount;
    let inferredType = 'string';

    if (validCount > 0) {
      if (intCount === validCount) inferredType = 'integer';
      else if (intCount + floatCount === validCount) inferredType = 'number';
      else if (boolCount === validCount) inferredType = 'boolean';
      else if (dateCount === validCount) inferredType = 'date';
      else if ((intCount + floatCount) / validCount > 0.8) inferredType = 'mixed (predominantly numeric)';
    }

    const stats = {
      inferredType,
      totalValues: total,
      nonNullCount: validCount,
      nullCount: nullCount + emptyCount,
      missingRate: total > 0 ? (nullCount + emptyCount) / total : 0,
      distinctCount: distinctSet.size,
      cardinalityRatio: validCount > 0 ? Math.round((distinctSet.size / validCount) * 100) / 100 : 0
    };

    if (numbers.length > 0) {
      const sum = numbers.reduce((a, b) => a + b, 0);
      stats.min = Math.min(...numbers);
      stats.max = Math.max(...numbers);
      stats.avg = Math.round((sum / numbers.length) * 100) / 100;
      stats.sum = Math.round(sum * 100) / 100;
    } else if (validCount > 0) {
      stats.minLength = minStrLen === Infinity ? 0 : minStrLen;
      stats.maxLength = maxStrLen;
    }

    // Top frequent values
    const sortedFrequencies = Array.from(distinctSet.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([val, freq]) => ({ value: val, count: freq, percentage: Math.round((freq / total) * 100) }));

    stats.topFrequencies = sortedFrequencies;

    return stats;
  }
}
