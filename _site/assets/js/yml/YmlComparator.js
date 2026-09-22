/**
 * YmlComparator - Semantic comparison and structural diffing between YAML documents.
 */

import { YmlParser } from './YmlParser.js';
import { JsonComparator } from '../json/JsonComparator.js';

export class YmlComparator {
  /**
   * Compares two YAML documents or data objects
   * @param {string|object} ymlA
   * @param {string|object} ymlB
   * @param {object} [options]
   * @returns {object} Comparison results with additions, deletions, modifications
   */
  static compare(ymlA, ymlB, options = {}) {
    const dataA = typeof ymlA === 'string' ? YmlParser.parse(ymlA) : ymlA;
    const dataB = typeof ymlB === 'string' ? YmlParser.parse(ymlB) : ymlB;

    return JsonComparator.compare(dataA, dataB, options);
  }

  /**
   * Alias for compare()
   */
  static diff(ymlA, ymlB, options) {
    return YmlComparator.compare(ymlA, ymlB, options);
  }
}
