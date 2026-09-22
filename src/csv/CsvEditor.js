/**
 * CsvEditor - SQL-like data manipulation, relational operations, projections,
 * sorting, grouping, pivoting, and joins on CSV datasets.
 */

import { CsvParser } from './CsvParser.js';
import { CsvSerializer } from './CsvSerializer.js';

export class CsvEditor {
  /**
   * Filter rows by predicate or condition object
   * @param {string} csvText
   * @param {Function|object} predicate
   * @param {object} [options]
   * @returns {string} Filtered CSV text
   */
  static filter(csvText, predicate, options = {}) {
    const records = CsvParser.parse(csvText, { ...options, asObjects: true, dynamicTyping: true });

    let filtered = [];
    if (typeof predicate === 'function') {
      filtered = records.filter(predicate);
    } else if (typeof predicate === 'object' && predicate !== null) {
      filtered = records.filter(row => {
        for (const [key, expected] of Object.entries(predicate)) {
          const actual = row[key];
          if (expected !== null && typeof expected === 'object' && !Array.isArray(expected)) {
            // Operator support: $eq, $ne, $gt, $gte, $lt, $lte, $in, $like
            if (expected.$eq !== undefined && actual !== expected.$eq) return false;
            if (expected.$ne !== undefined && actual === expected.$ne) return false;
            if (expected.$gt !== undefined && !(actual > expected.$gt)) return false;
            if (expected.$gte !== undefined && !(actual >= expected.$gte)) return false;
            if (expected.$lt !== undefined && !(actual < expected.$lt)) return false;
            if (expected.$lte !== undefined && !(actual <= expected.$lte)) return false;
            if (expected.$in !== undefined && (!Array.isArray(expected.$in) || !expected.$in.includes(actual))) return false;
            if (expected.$like !== undefined) {
              const reg = new RegExp(expected.$like.replace(/%/g, '.*'), 'i');
              if (!reg.test(String(actual))) return false;
            }
          } else {
            if (actual !== expected) return false;
          }
        }
        return true;
      });
    }

    return CsvSerializer.serialize(filtered, options);
  }

  /**
   * Sort CSV data by column
   * @param {string} csvText
   * @param {string} column
   * @param {'asc'|'desc'} [direction='asc']
   * @param {'auto'|'number'|'string'|'date'} [type='auto']
   * @param {object} [options]
   * @returns {string} Sorted CSV text
   */
  static sort(csvText, column, direction = 'asc', type = 'auto', options = {}) {
    const records = CsvParser.parse(csvText, { ...options, asObjects: true, dynamicTyping: true });
    const isDesc = direction.toLowerCase() === 'desc';

    records.sort((a, b) => {
      let valA = a[column];
      let valB = b[column];

      if (valA === null || valA === undefined) return isDesc ? 1 : -1;
      if (valB === null || valB === undefined) return isDesc ? -1 : 1;

      if (type === 'number' || (type === 'auto' && typeof valA === 'number' && typeof valB === 'number')) {
        return isDesc ? valB - valA : valA - valB;
      }

      if (type === 'date' || (type === 'auto' && !isNaN(Date.parse(valA)) && !isNaN(Date.parse(valB)))) {
        const timeA = new Date(valA).getTime();
        const timeB = new Date(valB).getTime();
        return isDesc ? timeB - timeA : timeA - timeB;
      }

      const strA = String(valA);
      const strB = String(valB);
      const cmp = strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' });
      return isDesc ? -cmp : cmp;
    });

    return CsvSerializer.serialize(records, options);
  }

  /**
   * Select and project specific columns in defined order
   * @param {string} csvText
   * @param {Array<string>} columns
   * @param {object} [options]
   * @returns {string}
   */
  static select(csvText, columns, options = {}) {
    const records = CsvParser.parse(csvText, { ...options, asObjects: true });
    const projected = records.map(rec => {
      const row = {};
      for (const col of columns) {
        row[col] = rec[col] !== undefined ? rec[col] : null;
      }
      return row;
    });

    return CsvSerializer.serialize(projected, { ...options, columns });
  }

  /**
   * Drop specific columns from CSV
   * @param {string} csvText
   * @param {Array<string>} columnsToDrop
   * @param {object} [options]
   * @returns {string}
   */
  static drop(csvText, columnsToDrop, options = {}) {
    const records = CsvParser.parse(csvText, { ...options, asObjects: true });
    const dropSet = new Set(columnsToDrop);

    const projected = records.map(rec => {
      const row = {};
      for (const [k, v] of Object.entries(rec)) {
        if (!dropSet.has(k)) row[k] = v;
      }
      return row;
    });

    return CsvSerializer.serialize(projected, options);
  }

  /**
   * Rename columns in CSV header
   * @param {string} csvText
   * @param {object} columnMap Dictionary mapping old names to new names
   * @param {object} [options]
   * @returns {string}
   */
  static rename(csvText, columnMap, options = {}) {
    const records = CsvParser.parse(csvText, { ...options, asObjects: true });
    const renamed = records.map(rec => {
      const row = {};
      for (const [k, v] of Object.entries(rec)) {
        const targetName = columnMap[k] !== undefined ? columnMap[k] : k;
        row[targetName] = v;
      }
      return row;
    });

    return CsvSerializer.serialize(renamed, options);
  }

  /**
   * Group rows by column and calculate aggregations
   * @param {string} csvText
   * @param {string} groupCol
   * @param {object} aggregations e.g. { total: { col: 'amount', op: 'sum' }, count: { op: 'count' } }
   * @param {object} [options]
   * @returns {string}
   */
  static groupBy(csvText, groupCol, aggregations = {}, options = {}) {
    const records = CsvParser.parse(csvText, { ...options, asObjects: true, dynamicTyping: true });
    const groups = new Map();

    for (const rec of records) {
      const key = rec[groupCol] !== undefined ? rec[groupCol] : '(null)';
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(rec);
    }

    const result = [];
    for (const [key, rows] of groups.entries()) {
      const item = { [groupCol]: key };

      for (const [targetName, aggDef] of Object.entries(aggregations)) {
        const op = (aggDef.op || 'count').toLowerCase();
        const col = aggDef.col;

        if (op === 'count') {
          item[targetName] = rows.length;
        } else if (op === 'sum' || op === 'avg' || op === 'min' || op === 'max') {
          const nums = rows.map(r => Number(r[col])).filter(n => !isNaN(n));
          if (nums.length === 0) {
            item[targetName] = null;
          } else if (op === 'sum') {
            item[targetName] = Math.round(nums.reduce((a, b) => a + b, 0) * 100) / 100;
          } else if (op === 'avg') {
            const sum = nums.reduce((a, b) => a + b, 0);
            item[targetName] = Math.round((sum / nums.length) * 100) / 100;
          } else if (op === 'min') {
            item[targetName] = Math.min(...nums);
          } else if (op === 'max') {
            item[targetName] = Math.max(...nums);
          }
        } else if (op === 'first') {
          item[targetName] = rows[0] ? rows[0][col] : null;
        } else if (op === 'last') {
          item[targetName] = rows[rows.length - 1] ? rows[rows.length - 1][col] : null;
        }
      }
      result.push(item);
    }

    return CsvSerializer.serialize(result, options);
  }

  /**
   * Pivot CSV data
   * @param {string} csvText
   * @param {string} rowKey
   * @param {string} colKey
   * @param {string} valKey
   * @param {'sum'|'count'|'avg'|'first'} [agg='sum']
   * @param {object} [options]
   * @returns {string}
   */
  static pivot(csvText, rowKey, colKey, valKey, agg = 'sum', options = {}) {
    const records = CsvParser.parse(csvText, { ...options, asObjects: true, dynamicTyping: true });
    const distinctCols = Array.from(new Set(records.map(r => String(r[colKey])))).sort();
    const rowsMap = new Map();

    for (const rec of records) {
      const rVal = rec[rowKey];
      const cVal = String(rec[colKey]);
      const vVal = Number(rec[valKey]) || 0;

      if (!rowsMap.has(rVal)) {
        const initial = { [rowKey]: rVal };
        distinctCols.forEach(c => { initial[c] = 0; });
        rowsMap.set(rVal, initial);
      }

      const rowObj = rowsMap.get(rVal);
      if (agg === 'count') {
        rowObj[cVal] = (rowObj[cVal] || 0) + 1;
      } else if (agg === 'sum') {
        rowObj[cVal] = Math.round(((rowObj[cVal] || 0) + vVal) * 100) / 100;
      } else if (agg === 'first') {
        if (!rowObj[cVal]) rowObj[cVal] = rec[valKey];
      }
    }

    const pivoted = Array.from(rowsMap.values());
    const columns = [rowKey, ...distinctCols];
    return CsvSerializer.serialize(pivoted, { ...options, columns });
  }

  /**
   * Relational Join between two CSV datasets
   * @param {string} csvTextA
   * @param {string} csvTextB
   * @param {string} keyA
   * @param {string} keyB
   * @param {'inner'|'left'} [type='inner']
   * @param {object} [options]
   * @returns {string}
   */
  static join(csvTextA, csvTextB, keyA, keyB, type = 'inner', options = {}) {
    const recordsA = CsvParser.parse(csvTextA, { ...options, asObjects: true, dynamicTyping: true });
    const recordsB = CsvParser.parse(csvTextB, { ...options, asObjects: true, dynamicTyping: true });

    const lookupB = new Map();
    for (const b of recordsB) {
      const k = String(b[keyB]);
      if (!lookupB.has(k)) lookupB.set(k, []);
      lookupB.get(k).push(b);
    }

    const joined = [];
    for (const a of recordsA) {
      const k = String(a[keyA]);
      const matches = lookupB.get(k);

      if (matches && matches.length > 0) {
        for (const m of matches) {
          joined.push({ ...a, ...m });
        }
      } else if (type === 'left') {
        joined.push({ ...a });
      }
    }

    return CsvSerializer.serialize(joined, options);
  }

  /**
   * Update matching records
   * @param {string} csvText
   * @param {Function|object} where
   * @param {object} updates
   * @param {object} [options]
   * @returns {string}
   */
  static update(csvText, where, updates = {}, options = {}) {
    const records = CsvParser.parse(csvText, { ...options, asObjects: true, dynamicTyping: true });

    const matchFn = typeof where === 'function'
      ? where
      : (row) => Object.entries(where).every(([k, v]) => row[k] === v);

    const updatedRecords = records.map(row => {
      if (matchFn(row)) {
        return { ...row, ...updates };
      }
      return row;
    });

    return CsvSerializer.serialize(updatedRecords, options);
  }

  /**
   * Insert new records into CSV
   * @param {string} csvText
   * @param {Array<object>|object} newRows
   * @param {object} [options]
   * @returns {string}
   */
  static insert(csvText, newRows, options = {}) {
    const records = CsvParser.parse(csvText, { ...options, asObjects: true });
    const rowsToAdd = Array.isArray(newRows) ? newRows : [newRows];
    records.push(...rowsToAdd);
    return CsvSerializer.serialize(records, options);
  }

  /**
   * Delete matching records from CSV
   * @param {string} csvText
   * @param {Function|object} where
   * @param {object} [options]
   * @returns {string}
   */
  static delete(csvText, where, options = {}) {
    const records = CsvParser.parse(csvText, { ...options, asObjects: true, dynamicTyping: true });

    const matchFn = typeof where === 'function'
      ? where
      : (row) => Object.entries(where).every(([k, v]) => row[k] === v);

    const retained = records.filter(row => !matchFn(row));
    return CsvSerializer.serialize(retained, options);
  }
}
