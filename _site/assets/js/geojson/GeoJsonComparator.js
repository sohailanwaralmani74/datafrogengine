/**
 * GeoJsonComparator - Deep structural and spatial difference auditing for GeoJSON.
 * Detects coordinate shifts, added/removed features, bounding box changes,
 * and property drift.
 */

import { GeoJsonConverter } from './GeoJsonConverter.js';
import { JsonComparator } from '../json/JsonComparator.js';

export class GeoJsonComparator {
  /**
   * Compares two GeoJSON documents or objects
   * @param {object|string} geojsonA
   * @param {object|string} geojsonB
   * @param {object} [options]
   * @returns {object} Structural and spatial diff
   */
  static compare(geojsonA, geojsonB, options = {}) {
    const a = typeof geojsonA === 'string' ? JSON.parse(geojsonA) : geojsonA;
    const b = typeof geojsonB === 'string' ? JSON.parse(geojsonB) : geojsonB;

    const bboxA = GeoJsonConverter.calculateBBox(a);
    const bboxB = GeoJsonConverter.calculateBBox(b);

    const bboxShift = {
      deltaMinX: bboxB[0] - bboxA[0],
      deltaMinY: bboxB[1] - bboxA[1],
      deltaMaxX: bboxB[2] - bboxA[2],
      deltaMaxY: bboxB[3] - bboxA[3]
    };

    const countFeatures = (data) => {
      if (data.type === 'FeatureCollection') return data.features ? data.features.length : 0;
      if (data.type === 'Feature') return 1;
      return 1;
    };

    const countA = countFeatures(a);
    const countB = countFeatures(b);

    // Deep JSON diff
    const deepDiff = JsonComparator.compare(a, b, options);

    return {
      typeA: a.type,
      typeB: b.type,
      featureCountDelta: countB - countA,
      bboxA,
      bboxB,
      bboxShift,
      hasSpatialShift: Object.values(bboxShift).some(v => Math.abs(v) > 1e-6),
      differences: deepDiff.differences,
      identical: deepDiff.identical
    };
  }

  static diff(geojsonA, geojsonB, options) {
    return GeoJsonComparator.compare(geojsonA, geojsonB, options);
  }
}
