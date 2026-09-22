/**
 * JsonComparator - Semantic comparison, structural diffing, and schema drift detection for JSON data.
 */

import { JsonInspector } from './JsonInspector.js';

export class JsonComparator {
  /**
   * Compares two JSON objects or values
   * @param {any} oldData
   * @param {any} newData
   * @returns {object} Diff results including additions, deletions, modifications
   */
  static compare(oldData, newData) {
    const changes = JsonInspector.diff(oldData, newData);
    const added = changes.filter(c => c.type === 'added');
    const removed = changes.filter(c => c.type === 'removed');
    const modified = changes.filter(c => c.type === 'modified');

    return {
      identical: changes.length === 0,
      differences: changes,
      changes,
      summary: {
        total: changes.length,
        added: added.length,
        removed: removed.length,
        modified: modified.length
      }
    };
  }

  /**
   * Alias for compare()
   */
  static diff(oldData, newData) {
    return JsonComparator.compare(oldData, newData);
  }
}
