/**
 * YmlCleaner - Whitespace trimming, null/empty removal, comment stripping,
 * and key normalization for YAML data.
 */

import { YmlParser } from './YmlParser.js';
import { YmlSerializer } from './YmlSerializer.js';
import { JsonCleaner } from '../json/JsonCleaner.js';

export class YmlCleaner {
  /**
   * Cleans YAML document removing nulls, empty collections, and normalizing keys
   * @param {string|object} yaml
   * @param {object} [options]
   * @returns {string|object}
   */
  static clean(yaml, options = {}) {
    const isString = typeof yaml === 'string';
    const data = isString ? YmlParser.parse(yaml) : yaml;

    const cleaned = JsonCleaner.clean(data, options);

    return isString ? YmlSerializer.serialize(cleaned, options) : cleaned;
  }

  /**
   * Strips all YAML comment lines (# ...)
   * @param {string} yamlText
   * @returns {string}
   */
  static stripComments(yamlText) {
    if (typeof yamlText !== 'string') return '';
    return yamlText
      .split(/\r?\n/)
      .filter(line => !line.trim().startsWith('#'))
      .map(line => {
        const commentIdx = line.indexOf(' #');
        return commentIdx !== -1 ? line.substring(0, commentIdx).trimEnd() : line;
      })
      .filter(line => line.trim())
      .join('\n');
  }

  /**
   * Removes empty or null fields recursively
   * @param {string|object} yaml
   * @returns {string|object}
   */
  static removeEmpty(yaml) {
    return YmlCleaner.clean(yaml, { removeNulls: true, removeEmptyStrings: true, removeEmptyArrays: true, removeEmptyObjects: true });
  }
}
