/**
 * YmlAnalyzer - Statistical profiling, depth inspection, type frequencies,
 * and anomaly detection for YAML structures.
 */

import { YmlParser } from './YmlParser.js';
import { JsonAnalyzer } from '../json/JsonAnalyzer.js';

export class YmlAnalyzer {
  /**
   * Profiles a YAML string or object
   * @param {string|object} yaml
   * @returns {object} Analysis report
   */
  static analyze(yaml) {
    const data = typeof yaml === 'string' ? YmlParser.parse(yaml) : yaml;

    const stats = JsonAnalyzer.profile(data);
    const schema = JsonAnalyzer.inferSchema(data);
    const anomalies = JsonAnalyzer.detectAnomalies(data);

    return {
      rootType: Array.isArray(data) ? 'array' : typeof data,
      stats,
      schema,
      anomalies
    };
  }

  /**
   * Alias for analyze()
   */
  static profile(yaml) {
    return YmlAnalyzer.analyze(yaml);
  }
}
