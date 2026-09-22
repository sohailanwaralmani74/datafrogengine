/**
 * Pure JavaScript JSON Cleaner, Sanitizer, Formatter & Auto-Repair Engine
 * Strips nulls/empty keys, normalizes keys, cleans whitespace, and heals broken JSON.
 */

import { JsonLexer, JsonTokenType } from './JsonLexer.js';

export class JsonCleaner {
  /**
   * Clean and sanitize JSON data structure
   */
  static clean(data, options = {}) {
    const {
      stripNulls = false,
      stripEmpty = false,
      trimStrings = false,
      sortKeys = false,
      coerceTypes = false
    } = options;

    const sanitize = (node) => {
      if (node === null || node === undefined) {
        return stripNulls ? undefined : node;
      }

      if (typeof node === 'string') {
        let val = trimStrings ? node.trim() : node;
        if (stripEmpty && val === '') return undefined;
        if (coerceTypes) {
          if (val === 'true') return true;
          if (val === 'false') return false;
          if (val === 'null') return null;
          if (/^-?\d+$/.test(val)) return parseInt(val, 10);
          if (/^-?\d+\.\d+$/.test(val)) return parseFloat(val);
        }
        return val;
      }

      if (typeof node !== 'object') {
        return node;
      }

      if (Array.isArray(node)) {
        const cleanedArr = [];
        for (let i = 0; i < node.length; i++) {
          const cleanedItem = sanitize(node[i]);
          if (cleanedItem !== undefined) {
            cleanedArr.push(cleanedItem);
          }
        }
        if (stripEmpty && cleanedArr.length === 0) return undefined;
        return cleanedArr;
      }

      // Object sanitization
      let keys = Object.keys(node);
      if (sortKeys) {
        keys = keys.sort();
      }

      const cleanedObj = {};
      let hasKeys = false;

      for (const key of keys) {
        const cleanedVal = sanitize(node[key]);
        if (cleanedVal !== undefined) {
          cleanedObj[key] = cleanedVal;
          hasKeys = true;
        }
      }

      if (stripEmpty && !hasKeys) return undefined;
      return cleanedObj;
    };

    const res = sanitize(data);
    return res !== undefined ? res : (Array.isArray(data) ? [] : {});
  }

  /**
   * Minify JSON string or object
   */
  static minify(input) {
    if (typeof input === 'object' && input !== null) {
      return JSON.stringify(input);
    }
    const parsed = typeof input === 'string' ? JSON.parse(input) : input;
    return JSON.stringify(parsed);
  }

  /**
   * Pretty format JSON with custom options
   */
  static format(input, options = {}) {
    const {
      indent = 2,
      sortKeys = false
    } = options;

    let data = input;
    if (typeof input === 'string') {
      try {
        data = JSON.parse(input);
      } catch (e) {
        data = JsonCleaner.repairAndParse(input);
      }
    }

    if (sortKeys) {
      data = JsonCleaner.clean(data, { sortKeys: true });
    }

    const space = typeof indent === 'number' ? indent : (indent === '\t' ? '\t' : 2);
    return JSON.stringify(data, null, space);
  }

  /**
   * Auto-heal malformed JSON string (fixes trailing commas, comments, unquoted keys, single quotes)
   */
  static repair(malformedJsonText) {
    if (typeof malformedJsonText !== 'string') return '';

    let text = malformedJsonText;

    // 1. Strip line comments (// ...) and block comments (/* ... */)
    text = text.replace(/\/\*[\s\S]*?\*\//g, '');
    text = text.replace(/(^|[^:])\/\/[^\r\n]*/g, '$1');

    // 2. Convert single quotes to double quotes, properly preserving escapes
    text = text.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (match, content) => {
      const unescaped = content.replace(/\\'/g, "'").replace(/"/g, '\\"');
      return `"${unescaped}"`;
    });

    // 3. Quote unquoted object keys: { foo: 1 } -> { "foo": 1 }
    text = text.replace(/([{,]\s*)([a-zA-Z0-9_$]+)\s*:/g, '$1"$2":');

    // 4. Remove trailing commas before } or ]
    text = text.replace(/,\s*([}\]])/g, '$1');

    // 5. Replace 'undefined' with 'null'
    text = text.replace(/:\s*undefined\b/g, ': null');

    // 6. Handle missing commas between adjacent properties: "a": 1 \n "b": 2
    text = text.replace(/(["\dtruefalsenull}])\s*\n\s*(["a-zA-Z0-9_$]+\s*:)/g, '$1,\n$2');

    return text.trim();
  }

  /**
   * Repair and parse in a single step
   */
  static repairAndParse(malformedJsonText) {
    const repaired = JsonCleaner.repair(malformedJsonText);
    return JSON.parse(repaired);
  }
}
