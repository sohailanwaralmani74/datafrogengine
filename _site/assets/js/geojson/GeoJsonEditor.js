/**
 * GeoJsonEditor - Spatial transformations, coordinate shifting, projection scaling,
 * bounding box calculation, feature filtering, property mutations, and polygon simplification.
 */

import { GeoJsonConverter } from './GeoJsonConverter.js';

export class GeoJsonEditor {
  /**
   * Translates (shifts) all coordinates by deltaLon and deltaLat
   * @param {object} geojson
   * @param {number} deltaLon
   * @param {number} deltaLat
   * @returns {object} Transformed GeoJSON
   */
  static translate(geojson, deltaLon, deltaLat) {
    const clone = JSON.parse(JSON.stringify(geojson));

    const transform = (coords) => {
      if (typeof coords[0] === 'number') {
        coords[0] += deltaLon;
        coords[1] += deltaLat;
      } else {
        coords.forEach(transform);
      }
    };

    GeoJsonEditor.#applyCoordTransform(clone, transform);
    return clone;
  }

  /**
   * Scales coordinates relative to centroid
   * @param {object} geojson
   * @param {number} scaleFactor
   * @returns {object}
   */
  static scale(geojson, scaleFactor) {
    const clone = JSON.parse(JSON.stringify(geojson));
    const bbox = GeoJsonConverter.calculateBBox(clone);
    const centerLon = (bbox[0] + bbox[2]) / 2;
    const centerLat = (bbox[1] + bbox[3]) / 2;

    const transform = (coords) => {
      if (typeof coords[0] === 'number') {
        coords[0] = centerLon + (coords[0] - centerLon) * scaleFactor;
        coords[1] = centerLat + (coords[1] - centerLat) * scaleFactor;
      } else {
        coords.forEach(transform);
      }
    };

    GeoJsonEditor.#applyCoordTransform(clone, transform);
    return clone;
  }

  /**
   * Compute and attach/update 'bbox' property on GeoJSON object
   * @param {object} geojson
   * @returns {object}
   */
  static updateBBox(geojson) {
    const clone = JSON.parse(JSON.stringify(geojson));
    clone.bbox = GeoJsonConverter.calculateBBox(clone);
    return clone;
  }

  /**
   * Filter features in a FeatureCollection by predicate
   * @param {object} featureCollection
   * @param {Function} predicate (feature, index) => boolean
   * @returns {object}
   */
  static filterFeatures(featureCollection, predicate) {
    if (featureCollection.type !== 'FeatureCollection') {
      throw new Error('filterFeatures requires a FeatureCollection');
    }
    const clone = JSON.parse(JSON.stringify(featureCollection));
    clone.features = (clone.features || []).filter(predicate);
    return clone;
  }

  /**
   * Add or update properties across all features
   * @param {object} geojson
   * @param {string|object} keyOrProps
   * @param {any} [value]
   * @returns {object}
   */
  static setProperties(geojson, keyOrProps, value) {
    const clone = JSON.parse(JSON.stringify(geojson));
    const features = clone.type === 'FeatureCollection'
      ? clone.features
      : clone.type === 'Feature' ? [clone] : [];

    for (const f of features) {
      if (!f.properties) f.properties = {};
      if (typeof keyOrProps === 'object') {
        Object.assign(f.properties, keyOrProps);
      } else {
        f.properties[keyOrProps] = value;
      }
    }

    return clone;
  }

  /**
   * Reverses coordinate winding order (useful for exterior/interior ring compliance)
   * @param {object} geojson
   * @returns {object}
   */
  static rewind(geojson, clockwise = true) {
    const clone = JSON.parse(JSON.stringify(geojson));

    const checkAndRewind = (ring) => {
      let area = 0;
      for (let i = 0; i < ring.length - 1; i++) {
        area += (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1]);
      }
      const isCw = area > 0;
      if (isCw !== clockwise) {
        ring.reverse();
      }
    };

    const processGeom = (geom) => {
      if (!geom) return;
      if (geom.type === 'Polygon' && Array.isArray(geom.coordinates)) {
        geom.coordinates.forEach((ring, idx) => {
          checkAndRewind(ring, idx === 0 ? clockwise : !clockwise);
        });
      } else if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
        geom.coordinates.forEach(poly => {
          poly.forEach((ring, idx) => {
            checkAndRewind(ring, idx === 0 ? clockwise : !clockwise);
          });
        });
      }
    };

    if (clone.type === 'FeatureCollection') {
      (clone.features || []).forEach(f => processGeom(f.geometry));
    } else if (clone.type === 'Feature') {
      processGeom(clone.geometry);
    } else {
      processGeom(clone);
    }

    return clone;
  }

  /**
   * Simplifies LineString and Polygon geometries using Ramer-Douglas-Peucker algorithm
   * @param {object} geojson
   * @param {number} tolerance in degrees
   * @returns {object} Simplified GeoJSON
   */
  static simplify(geojson, tolerance = 0.001) {
    const clone = JSON.parse(JSON.stringify(geojson));

    const rdp = (points) => {
      if (points.length <= 2) return points;
      let dmax = 0;
      let index = 0;
      const end = points.length - 1;

      for (let i = 1; i < end; i++) {
        const d = perpendicularDistance(points[i], points[0], points[end]);
        if (d > dmax) {
          index = i;
          dmax = d;
        }
      }

      if (dmax > tolerance) {
        const rec1 = rdp(points.slice(0, index + 1));
        const rec2 = rdp(points.slice(index));
        return rec1.slice(0, rec1.length - 1).concat(rec2);
      } else {
        return [points[0], points[end]];
      }
    };

    const processGeom = (geom) => {
      if (!geom) return;
      if (geom.type === 'LineString') {
        geom.coordinates = rdp(geom.coordinates);
      } else if (geom.type === 'Polygon') {
        geom.coordinates = geom.coordinates.map(ring => {
          const simplified = rdp(ring);
          if (simplified.length < 4) return ring; // Maintain valid ring
          return simplified;
        });
      }
    };

    if (clone.type === 'FeatureCollection') {
      (clone.features || []).forEach(f => processGeom(f.geometry));
    } else if (clone.type === 'Feature') {
      processGeom(clone.geometry);
    } else {
      processGeom(clone);
    }

    return clone;
  }

  static #applyCoordTransform(node, fn) {
    if (!node) return;
    if (node.coordinates) {
      fn(node.coordinates);
    }
    if (node.geometries) {
      node.geometries.forEach(g => GeoJsonEditor.#applyCoordTransform(g, fn));
    }
    if (node.features) {
      node.features.forEach(f => GeoJsonEditor.#applyCoordTransform(f.geometry, fn));
    }
    if (node.geometry) {
      GeoJsonEditor.#applyCoordTransform(node.geometry, fn);
    }
  }
}

function perpendicularDistance(point, lineStart, lineEnd) {
  const dx = lineEnd[0] - lineStart[0];
  const dy = lineEnd[1] - lineStart[1];
  const mag = Math.sqrt(dx * dx + dy * dy);
  if (mag === 0) {
    const px = point[0] - lineStart[0];
    const py = point[1] - lineStart[1];
    return Math.sqrt(px * px + py * py);
  }
  const u = ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) / (mag * mag);
  const ix = lineStart[0] + u * dx;
  const iy = lineStart[1] + u * dy;
  const dist = Math.sqrt((point[0] - ix) ** 2 + (point[1] - iy) ** 2);
  return dist;
}
