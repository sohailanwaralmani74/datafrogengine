/**
 * Pure JavaScript JSON Engine Suite - Master Facade
 * Provides comprehensive data processing tools: converters, editors, validators,
 * analyzers, inspectors, cleaners, schema generators, and formatters.
 */

import { JsonParser } from './JsonParser.js';
import { JsonConverter } from './JsonConverter.js';
import { JsonEditor } from './JsonEditor.js';
import { JsonValidator } from './JsonValidator.js';
import { JsonAnalyzer } from './JsonAnalyzer.js';
import { JsonInspector } from './JsonInspector.js';
import { JsonCleaner } from './JsonCleaner.js';
import { JsonComparator } from './JsonComparator.js';
import { JsonCompressor } from './JsonCompressor.js';

export class JsonEngine {
  // Parsing & Stringification
  static parse(text, options) {
    return JsonParser.parse(text, options);
  }

  static stringify(value, replacer, space) {
    return JSON.stringify(value, replacer, space);
  }

  // Converters
  static toXml(data, rootTag, options) {
    return JsonConverter.toXml(data, rootTag, options);
  }

  static fromXml(xmlStr, options) {
    return JsonConverter.fromXml(xmlStr, options);
  }

  static toCsv(data, options) {
    return JsonConverter.toCsv(data, options);
  }

  static fromCsv(csvStr, options) {
    return JsonConverter.fromCsv(csvStr, options);
  }

  static toYaml(data) {
    return JsonConverter.toYaml(data);
  }

  static fromYaml(yamlStr) {
    return JsonConverter.fromYaml(yamlStr);
  }

  static toNdjson(data) {
    return JsonConverter.toNdjson(data);
  }

  static fromNdjson(ndjsonStr) {
    return JsonConverter.fromNdjson(ndjsonStr);
  }

  static toExcel(data, options) {
    return JsonConverter.toExcel(data, options);
  }

  static toPdf(data, options) {
    return JsonConverter.toPdf(data, options);
  }

  // Editors & Paths
  static get(obj, path, defaultValue) {
    return JsonEditor.get(obj, path, defaultValue);
  }

  static set(obj, path, value, options) {
    return JsonEditor.set(obj, path, value, options);
  }

  static delete(obj, path, options) {
    return JsonEditor.delete(obj, path, options);
  }

  static applyPatch(doc, patch, options) {
    return JsonEditor.applyPatch(doc, patch, options);
  }

  static createPatch(source, target) {
    return JsonEditor.createPatch(source, target);
  }

  static flatten(obj, delimiter) {
    return JsonEditor.flatten(obj, delimiter);
  }

  static unflatten(flatObj, delimiter) {
    return JsonEditor.unflatten(flatObj, delimiter);
  }

  static reorderKeys(obj, keyOrder, recursive) {
    return JsonEditor.reorderKeys(obj, keyOrder, recursive);
  }

  static sortKeys(obj, options) {
    return JsonEditor.sortKeys(obj, options);
  }

  // Advanced transformations for tool building
  static transform(data, mapping) {
    if (!data || typeof data !== 'object') return data;
    if (Array.isArray(data)) {
      return data.map(item => JsonEngine.transform(item, mapping));
    }
    const result = {};
    for (const [targetKey, sourceExpr] of Object.entries(mapping)) {
      if (typeof sourceExpr === 'string') {
        result[targetKey] = JsonEditor.get(data, sourceExpr);
      } else if (typeof sourceExpr === 'function') {
        result[targetKey] = sourceExpr(data);
      } else if (typeof sourceExpr === 'object' && sourceExpr !== null) {
        result[targetKey] = JsonEngine.transform(data, sourceExpr);
      }
    }
    return result;
  }

  static toTable(data) {
    if (!Array.isArray(data) || data.length === 0) {
      return { headers: [], rows: [] };
    }
    const headersSet = new Set();
    data.forEach(item => {
      if (item && typeof item === 'object') {
        Object.keys(item).forEach(k => headersSet.add(k));
      }
    });
    const headers = Array.from(headersSet);
    const rows = data.map(item => {
      if (!item || typeof item !== 'object') return [item];
      return headers.map(h => (item[h] !== undefined ? item[h] : null));
    });
    return { headers, rows };
  }

  static fromTable(headers, rows) {
    if (!Array.isArray(rows)) return [];
    return rows.map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] !== undefined ? row[i] : null;
      });
      return obj;
    });
  }

  static deepClone(data) {
    if (data === null || typeof data !== 'object') return data;
    if (typeof structuredClone === 'function') {
      try { return structuredClone(data); } catch { /* fallback */ }
    }
    return JSON.parse(JSON.stringify(data));
  }

  static maskSensitive(data, sensitiveKeys = ['password', 'secret', 'token', 'key', 'ssn', 'creditCard', 'auth']) {
    const clone = JsonEngine.deepClone(data);
    const mask = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        obj.forEach(mask);
        return;
      }
      for (const [key, val] of Object.entries(obj)) {
        const isSensitive = sensitiveKeys.some(s => key.toLowerCase().includes(s.toLowerCase()));
        if (isSensitive) {
          obj[key] = '********';
        } else if (typeof val === 'object' && val !== null) {
          mask(val);
        }
      }
    };
    mask(clone);
    return clone;
  }

  // Validators
  static validate(jsonText, options) {
    return JsonValidator.validateSyntax(jsonText, options);
  }

  static validateSchema(data, schema) {
    return JsonValidator.validateSchema(data, schema);
  }

  // Analyzers
  static analyze(data) {
    return JsonAnalyzer.analyze(data);
  }

  static inferSchema(data, options) {
    return JsonAnalyzer.inferSchema(data, options);
  }

  static generateSchema(data, options = {}) {
    return JsonAnalyzer.inferSchema(data, options);
  }

  static detectAnomalies(data) {
    return JsonAnalyzer.detectAnomalies(data);
  }

  // Comparing & Diffing
  static compare(oldData, newData) {
    return JsonComparator.compare(oldData, newData);
  }

  static diff(oldData, newData) {
    return JsonComparator.diff(oldData, newData);
  }

  static query(data, jsonPath) {
    return JsonInspector.query(data, jsonPath);
  }

  static batchQuery(data, queryMap) {
    const results = {};
    for (const [key, path] of Object.entries(queryMap)) {
      results[key] = JsonInspector.query(data, path);
    }
    return results;
  }

  static outline(data) {
    return JsonInspector.outline(data);
  }

  // Cleaners & Formatters
  static clean(data, options) {
    return JsonCleaner.clean(data, options);
  }

  static format(input, options) {
    return JsonCleaner.format(input, options);
  }

  static minify(input) {
    return JsonCleaner.minify(input);
  }

  static compress(input) {
    return JsonCompressor.compress(input);
  }

  static repair(malformedJsonText) {
    return JsonCleaner.repair(malformedJsonText);
  }
}
