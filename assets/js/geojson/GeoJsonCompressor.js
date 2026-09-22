/**
 * GeoJsonCompressor - Lossless & lossy coordinate precision truncation and minification.
 * Dramatically reduces GeoJSON payload size by truncating coordinate decimals (e.g. 5 decimals ≈ 1m precision)
 * and stripping superfluous whitespace.
 */

import { GeoJsonEditor } from './GeoJsonEditor.js';

export class GeoJsonCompressor {
  /**
   * Compresses GeoJSON by truncating coordinate decimal precision and minifying
   * @param {object|string} geojson
   * @param {object} [options]
   * @param {number} [options.precision=5] Coordinate decimal places (5 ≈ 1.1m precision)
   * @param {number} [options.simplifyTolerance=0] Optional Ramer-Douglas-Peucker tolerance
   * @returns {string} Minified compressed GeoJSON string
   */
  static compress(geojson, options = {}) {
    let data = typeof geojson === 'string' ? JSON.parse(geojson) : JSON.parse(JSON.stringify(geojson));
    const precision = options.precision !== undefined ? options.precision : 5;
    const factor = 10 ** precision;

    if (options.simplifyTolerance && options.simplifyTolerance > 0) {
      data = GeoJsonEditor.simplify(data, options.simplifyTolerance);
    }

    const roundCoords = (coords) => {
      if (typeof coords[0] === 'number') {
        coords[0] = Math.round(coords[0] * factor) / factor;
        coords[1] = Math.round(coords[1] * factor) / factor;
        if (coords.length > 2 && typeof coords[2] === 'number') {
          coords[2] = Math.round(coords[2] * factor) / factor;
        }
      } else {
        coords.forEach(roundCoords);
      }
    };

    const process = (node) => {
      if (!node) return;
      if (node.coordinates) roundCoords(node.coordinates);
      if (node.geometries) node.geometries.forEach(process);
      if (node.features) node.features.forEach(f => process(f.geometry));
      if (node.geometry) process(node.geometry);
    };

    process(data);
    return JSON.stringify(data);
  }

  static minify(geojson, options) {
    return GeoJsonCompressor.compress(geojson, options);
  }
}
