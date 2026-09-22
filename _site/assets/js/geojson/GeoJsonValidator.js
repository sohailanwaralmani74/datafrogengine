/**
 * GeoJsonValidator - Pure JavaScript RFC 7946 GeoJSON Validator and Spec Conformance Checker.
 * Validates Point, MultiPoint, LineString, MultiLineString, Polygon, MultiPolygon,
 * GeometryCollection, Feature, and FeatureCollection objects.
 */

export const GEOJSON_TYPES = [
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
  'GeometryCollection',
  'Feature',
  'FeatureCollection'
];

export class GeoJsonValidator {
  /**
   * Validate GeoJSON object or string
   * @param {string|object} geojson
   * @returns {{ valid: boolean, errors: Array<{ path: string, message: string }> }}
   */
  static validate(geojson) {
    let data;
    try {
      data = typeof geojson === 'string' ? JSON.parse(geojson) : geojson;
    } catch (e) {
      return { valid: false, errors: [{ path: '$', message: `Invalid JSON syntax: ${e.message}` }] };
    }

    const errors = [];
    if (!data || typeof data !== 'object') {
      errors.push({ path: '$', message: 'GeoJSON must be a valid JSON object' });
      return { valid: false, errors };
    }

    GeoJsonValidator.#validateObject(data, '$', errors);
    return { valid: errors.length === 0, errors };
  }

  static isValid(geojson) {
    return GeoJsonValidator.validate(geojson).valid;
  }

  static #validateObject(obj, path, errors) {
    if (!obj.type || typeof obj.type !== 'string') {
      errors.push({ path, message: 'GeoJSON object must have a valid "type" member' });
      return;
    }

    if (!GEOJSON_TYPES.includes(obj.type)) {
      errors.push({ path: `${path}.type`, message: `Unknown GeoJSON type: "${obj.type}"` });
      return;
    }

    if (obj.bbox) {
      GeoJsonValidator.#validateBBox(obj.bbox, `${path}.bbox`, errors);
    }

    switch (obj.type) {
      case 'Point':
        GeoJsonValidator.#validateCoordinates(obj.coordinates, 1, `${path}.coordinates`, errors);
        break;
      case 'MultiPoint':
      case 'LineString':
        GeoJsonValidator.#validateCoordinates(obj.coordinates, 2, `${path}.coordinates`, errors);
        break;
      case 'MultiLineString':
      case 'Polygon':
        GeoJsonValidator.#validateCoordinates(obj.coordinates, 3, `${path}.coordinates`, errors);
        if (obj.type === 'Polygon' && Array.isArray(obj.coordinates)) {
          // Check linear rings (first and last coordinate match)
          obj.coordinates.forEach((ring, idx) => {
            if (Array.isArray(ring) && ring.length >= 4) {
              const first = ring[0];
              const last = ring[ring.length - 1];
              if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
                errors.push({ path: `${path}.coordinates[${idx}]`, message: 'LinearRing first and last coordinates must be equivalent' });
              }
            } else if (Array.isArray(ring) && ring.length < 4) {
              errors.push({ path: `${path}.coordinates[${idx}]`, message: 'LinearRing must contain at least 4 positions' });
            }
          });
        }
        break;
      case 'MultiPolygon':
        GeoJsonValidator.#validateCoordinates(obj.coordinates, 4, `${path}.coordinates`, errors);
        break;
      case 'GeometryCollection':
        if (!Array.isArray(obj.geometries)) {
          errors.push({ path: `${path}.geometries`, message: 'GeometryCollection must have a "geometries" array' });
        } else {
          obj.geometries.forEach((g, idx) => GeoJsonValidator.#validateObject(g, `${path}.geometries[${idx}]`, errors));
        }
        break;
      case 'Feature':
        if (obj.geometry !== null && typeof obj.geometry !== 'object') {
          errors.push({ path: `${path}.geometry`, message: 'Feature geometry must be an object or null' });
        } else if (obj.geometry !== null) {
          GeoJsonValidator.#validateObject(obj.geometry, `${path}.geometry`, errors);
        }
        if (obj.properties !== null && typeof obj.properties !== 'object') {
          errors.push({ path: `${path}.properties`, message: 'Feature properties must be an object or null' });
        }
        break;
      case 'FeatureCollection':
        if (!Array.isArray(obj.features)) {
          errors.push({ path: `${path}.features`, message: 'FeatureCollection must have a "features" array' });
        } else {
          obj.features.forEach((f, idx) => GeoJsonValidator.#validateObject(f, `${path}.features[${idx}]`, errors));
        }
        break;
    }
  }

  static #validateBBox(bbox, path, errors) {
    if (!Array.isArray(bbox) || (bbox.length !== 4 && bbox.length !== 6)) {
      errors.push({ path, message: 'Bbox must be an array of 4 or 6 numbers ([minX, minY, maxX, maxY])' });
      return;
    }
    if (bbox.some(n => typeof n !== 'number' || Number.isNaN(n))) {
      errors.push({ path, message: 'Bbox values must all be valid numbers' });
    }
  }

  static #validateCoordinates(coords, expectedDepth, path, errors) {
    if (!Array.isArray(coords)) {
      errors.push({ path, message: 'Coordinates must be an array' });
      return;
    }

    if (expectedDepth === 1) {
      if (coords.length < 2 || coords.length > 3) {
        errors.push({ path, message: 'Coordinate position must contain [longitude, latitude] or [longitude, latitude, elevation]' });
      }
      if (typeof coords[0] !== 'number' || typeof coords[1] !== 'number') {
        errors.push({ path, message: 'Coordinates must be numbers' });
      }
      if (coords[0] < -180 || coords[0] > 180) {
        errors.push({ path: `${path}[0]`, message: `Longitude ${coords[0]} out of standard bounds [-180, 180]` });
      }
      if (coords[1] < -90 || coords[1] > 90) {
        errors.push({ path: `${path}[1]`, message: `Latitude ${coords[1]} out of standard bounds [-90, 90]` });
      }
    } else {
      coords.forEach((sub, idx) => {
        GeoJsonValidator.#validateCoordinates(sub, expectedDepth - 1, `${path}[${idx}]`, errors);
      });
    }
  }
}
