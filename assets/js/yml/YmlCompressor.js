/**
 * YmlCompressor - Minification and compact serialization for YAML.
 * Employs compact flow styling [a, b] & {a: 1} and removes redundant comments and spaces.
 */

import { YmlParser } from './YmlParser.js';

export class YmlCompressor {
  /**
   * Compresses YAML to dense, compact flow representation
   * @param {string|object} yaml
   * @returns {string} Minified YAML
   */
  static compress(yaml) {
    const data = typeof yaml === 'string' ? YmlParser.parse(yaml) : yaml;

    function toFlow(val) {
      if (val === null || val === undefined) return 'null';
      if (typeof val === 'boolean' || typeof val === 'number') return String(val);
      if (typeof val === 'string') {
        if (/[:#\[\]{},&*!|>'"%@`]/.test(val) || val === '' || /^\s|\s$/.test(val)) {
          return JSON.stringify(val);
        }
        return val;
      }
      if (Array.isArray(val)) {
        return '[' + val.map(toFlow).join(', ') + ']';
      }
      if (typeof val === 'object') {
        const pairs = Object.keys(val).map(k => {
          const safeKey = /[:#\[\]{},&*!|>'"%@`]/.test(k) ? JSON.stringify(k) : k;
          return `${safeKey}: ${toFlow(val[k])}`;
        });
        return '{' + pairs.join(', ') + '}';
      }
      return String(val);
    }

    return toFlow(data);
  }

  /**
   * Alias for compress()
   */
  static minify(yaml) {
    return YmlCompressor.compress(yaml);
  }
}
