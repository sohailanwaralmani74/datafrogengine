/**
 * GeoJsonCleaner - Sanitizes GeoJSON objects: strips null properties, repairs
 * unclosed polygon rings, removes duplicate consecutive vertices, and filters empty geometries.
 */

export class GeoJsonCleaner {
  /**
   * Sanitizes and cleans GeoJSON object
   * @param {object} geojson
   * @param {object} [options]
   * @returns {object} Cleaned GeoJSON
   */
  static clean(geojson, options = {}) {
    const clone = JSON.parse(JSON.stringify(geojson));
    const removeNullProps = options.removeNullProps !== false;
    const deduplicateVertices = options.deduplicateVertices !== false;
    const fixUnclosedRings = options.fixUnclosedRings !== false;

    const cleanCoords = (coords, depth) => {
      if (depth === 1) {
        // Point
        return coords;
      }
      if (depth === 2) {
        // LineString or ring
        if (!deduplicateVertices) return coords;
        const deduped = [];
        for (let i = 0; i < coords.length; i++) {
          const pt = coords[i];
          if (i === 0) {
            deduped.push(pt);
          } else {
            const prev = deduped[deduped.length - 1];
            if (prev[0] !== pt[0] || prev[1] !== pt[1]) {
              deduped.push(pt);
            }
          }
        }
        return deduped;
      }
      return coords.map(sub => cleanCoords(sub, depth - 1));
    };

    const cleanGeom = (geom) => {
      if (!geom) return null;

      if (geom.type === 'Polygon' && Array.isArray(geom.coordinates)) {
        geom.coordinates = geom.coordinates.map(ring => {
          let cleanedRing = deduplicateVertices ? cleanCoords(ring, 2) : ring;
          if (fixUnclosedRings && cleanedRing.length >= 3) {
            const first = cleanedRing[0];
            const last = cleanedRing[cleanedRing.length - 1];
            if (first[0] !== last[0] || first[1] !== last[1]) {
              cleanedRing.push([first[0], first[1]]);
            }
          }
          return cleanedRing;
        });
      } else if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
        geom.coordinates = cleanCoords(geom.coordinates, 2);
      }

      return geom;
    };

    const cleanProps = (props) => {
      if (!props || !removeNullProps) return props;
      const clean = {};
      for (const [k, v] of Object.entries(props)) {
        if (v !== null && v !== undefined && v !== '') {
          clean[k] = v;
        }
      }
      return clean;
    };

    if (clone.type === 'FeatureCollection') {
      clone.features = (clone.features || [])
        .map(f => {
          f.geometry = cleanGeom(f.geometry);
          f.properties = cleanProps(f.properties);
          return f;
        })
        .filter(f => f.geometry !== null);
    } else if (clone.type === 'Feature') {
      clone.geometry = cleanGeom(clone.geometry);
      clone.properties = cleanProps(clone.properties);
    } else {
      return cleanGeom(clone);
    }

    return clone;
  }
}
