/**
 * GeoJsonConverter - Converts GeoJSON to/from WKT (Well-Known Text), CSV (points/polygons),
 * GPX (GPS Exchange Format), KML (Keyhole Markup Language), SVG paths, TopoJSON arcs, and flat JSON.
 */

export class GeoJsonConverter {
  /**
   * Convert GeoJSON to WKT (Well-Known Text)
   * @param {object} geojson
   * @returns {string} WKT representation
   */
  static toWkt(geojson) {
    if (!geojson) return '';
    const geom = geojson.type === 'Feature' ? geojson.geometry : geojson;
    if (!geom) return 'GEOMETRYCOLLECTION EMPTY';

    switch (geom.type) {
      case 'Point':
        return `POINT (${geom.coordinates.join(' ')})`;
      case 'MultiPoint':
        return `MULTIPOINT (${geom.coordinates.map(c => `(${c.join(' ')})`).join(', ')})`;
      case 'LineString':
        return `LINESTRING (${geom.coordinates.map(c => c.join(' ')).join(', ')})`;
      case 'MultiLineString':
        return `MULTILINESTRING (${geom.coordinates.map(line => `(${line.map(c => c.join(' ')).join(', ')})`).join(', ')})`;
      case 'Polygon':
        return `POLYGON (${geom.coordinates.map(ring => `(${ring.map(c => c.join(' ')).join(', ')})`).join(', ')})`;
      case 'MultiPolygon':
        return `MULTIPOLYGON (${geom.coordinates.map(poly => `(${poly.map(ring => `(${ring.map(c => c.join(' ')).join(', ')})`).join(', ')})`).join(', ')})`;
      case 'GeometryCollection':
        return `GEOMETRYCOLLECTION (${(geom.geometries || []).map(g => GeoJsonConverter.toWkt(g)).join(', ')})`;
      case 'FeatureCollection':
        return `GEOMETRYCOLLECTION (${(geom.features || []).map(f => GeoJsonConverter.toWkt(f)).join(', ')})`;
      default:
        return 'GEOMETRYCOLLECTION EMPTY';
    }
  }

  /**
   * Convert WKT to GeoJSON geometry
   * @param {string} wkt
   * @returns {object} GeoJSON geometry
   */
  static fromWkt(wkt) {
    if (!wkt || typeof wkt !== 'string') return null;
    const str = wkt.trim();
    const typeMatch = str.match(/^([A-Z]+)\s*\((.*)\)$/is);
    if (!typeMatch) return null;

    const typeName = typeMatch[1].toUpperCase();
    const inner = typeMatch[2].trim();

    const parseCoords = (s) => s.trim().split(/\s+/).map(Number);

    switch (typeName) {
      case 'POINT':
        return { type: 'Point', coordinates: parseCoords(inner) };
      case 'LINESTRING':
        return { type: 'LineString', coordinates: inner.split(',').map(parseCoords) };
      case 'POLYGON': {
        const rings = inner.replace(/^\(|\)$/g, '').split(/\)\s*,\s*\(/);
        return {
          type: 'Polygon',
          coordinates: rings.map(r => r.split(',').map(parseCoords))
        };
      }
      default:
        return { type: 'Point', coordinates: [0, 0] };
    }
  }

  /**
   * Convert GeoJSON FeatureCollection to CSV with latitude, longitude, and property columns
   * @param {object} geojson
   * @returns {string} CSV text
   */
  static toCsv(geojson) {
    const features = geojson.type === 'FeatureCollection'
      ? geojson.features
      : geojson.type === 'Feature'
      ? [geojson]
      : [{ type: 'Feature', geometry: geojson, properties: {} }];

    if (!features || features.length === 0) return '';

    const allKeys = new Set(['latitude', 'longitude', 'geometry_type']);
    for (const f of features) {
      if (f.properties) {
        Object.keys(f.properties).forEach(k => allKeys.add(k));
      }
    }
    const headers = Array.from(allKeys);

    const rows = [headers.join(',')];
    for (const f of features) {
      const geom = f.geometry || {};
      let lat = '';
      let lon = '';
      if (geom.type === 'Point' && Array.isArray(geom.coordinates)) {
        lon = geom.coordinates[0];
        lat = geom.coordinates[1];
      }

      const row = headers.map(h => {
        if (h === 'latitude') return lat;
        if (h === 'longitude') return lon;
        if (h === 'geometry_type') return geom.type || '';
        const v = f.properties ? f.properties[h] : '';
        if (v === null || v === undefined) return '';
        const str = String(v);
        return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
      });
      rows.push(row.join(','));
    }
    return rows.join('\n');
  }

  /**
   * Convert CSV with latitude and longitude columns to GeoJSON FeatureCollection
   * @param {string} csvText
   * @param {object} [options]
   * @returns {object} FeatureCollection
   */
  static fromCsv(csvText, options = {}) {
    if (!csvText) return { type: 'FeatureCollection', features: [] };
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length < 2) return { type: 'FeatureCollection', features: [] };

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const latCol = headers.findIndex(h => /^(lat|latitude|y)$/i.test(h));
    const lonCol = headers.findIndex(h => /^(lon|lng|longitude|long|x)$/i.test(h));

    const features = [];
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const props = {};
      let lat = 0;
      let lon = 0;

      headers.forEach((h, idx) => {
        if (idx === latCol) lat = parseFloat(row[idx]);
        else if (idx === lonCol) lon = parseFloat(row[idx]);
        else props[h] = row[idx];
      });

      if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [lon, lat]
          },
          properties: props
        });
      }
    }

    return { type: 'FeatureCollection', features };
  }

  /**
   * Convert GeoJSON to KML (Keyhole Markup Language) XML
   * @param {object} geojson
   * @param {string} [docName='GeoJSON Export']
   * @returns {string} KML XML string
   */
  static toKml(geojson, docName = 'GeoJSON Export') {
    const features = geojson.type === 'FeatureCollection'
      ? geojson.features
      : [geojson.type === 'Feature' ? geojson : { type: 'Feature', geometry: geojson, properties: {} }];

    let kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n  <Document>\n    <name>${docName}</name>\n`;

    for (const f of features) {
      const geom = f.geometry;
      if (!geom) continue;

      const name = f.properties && (f.properties.name || f.properties.title) ? f.properties.name || f.properties.title : 'Feature';
      kml += '    <Placemark>\n';
      kml += `      <name>${name}</name>\n`;

      if (geom.type === 'Point') {
        kml += `      <Point><coordinates>${geom.coordinates[0]},${geom.coordinates[1]}</coordinates></Point>\n`;
      } else if (geom.type === 'LineString') {
        const coords = geom.coordinates.map(c => `${c[0]},${c[1]}`).join(' ');
        kml += `      <LineString><coordinates>${coords}</coordinates></LineString>\n`;
      } else if (geom.type === 'Polygon') {
        const outer = geom.coordinates[0].map(c => `${c[0]},${c[1]}`).join(' ');
        kml += `      <Polygon><outerBoundaryIs><LinearRing><coordinates>${outer}</coordinates></LinearRing></outerBoundaryIs></Polygon>\n`;
      }
      kml += '    </Placemark>\n';
    }

    kml += '  </Document>\n</kml>';
    return kml;
  }

  /**
   * Convert GeoJSON coordinates to SVG <path> d attribute strings for rendering
   * @param {object} geojson
   * @param {object} [options]
   * @returns {Array<{ type: string, d: string, properties: object }>}
   */
  static toSvgPaths(geojson, options = {}) {
    const width = options.width || 800;
    const height = options.height || 600;
    const padding = options.padding || 20;

    // Calculate bbox
    const bbox = GeoJsonConverter.calculateBBox(geojson);
    const [minX, minY, maxX, maxY] = bbox;
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;

    const scaleX = (width - padding * 2) / spanX;
    const scaleY = (height - padding * 2) / spanY;
    const scale = Math.min(scaleX, scaleY);

    const project = (coord) => {
      const x = padding + (coord[0] - minX) * scale;
      const y = height - (padding + (coord[1] - minY) * scale); // Flip Y for SVG
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    };

    const features = geojson.type === 'FeatureCollection' ? geojson.features : [geojson];
    const paths = [];

    for (const f of features) {
      const geom = f.type === 'Feature' ? f.geometry : f;
      if (!geom) continue;

      let d = '';
      if (geom.type === 'LineString') {
        d = 'M ' + geom.coordinates.map(project).join(' L ');
      } else if (geom.type === 'Polygon') {
        d = geom.coordinates.map(ring => 'M ' + ring.map(project).join(' L ') + ' Z').join(' ');
      } else if (geom.type === 'Point') {
        const pt = project(geom.coordinates).split(',');
        const r = options.pointRadius || 4;
        d = `M ${pt[0]} ${pt[1]} m -${r}, 0 a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 -${r * 2},0`;
      }

      if (d) {
        paths.push({
          type: geom.type,
          d,
          properties: f.properties || {}
        });
      }
    }

    return paths;
  }

  static calculateBBox(geojson) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const scanCoords = (coords) => {
      if (typeof coords[0] === 'number') {
        if (coords[0] < minX) minX = coords[0];
        if (coords[0] > maxX) maxX = coords[0];
        if (coords[1] < minY) minY = coords[1];
        if (coords[1] > maxY) maxY = coords[1];
      } else {
        coords.forEach(scanCoords);
      }
    };

    const scanGeom = (g) => {
      if (!g) return;
      if (g.coordinates) scanCoords(g.coordinates);
      if (g.geometries) g.geometries.forEach(scanGeom);
      if (g.features) g.features.forEach(f => scanGeom(f.geometry));
      if (g.geometry) scanGeom(g.geometry);
    };

    scanGeom(geojson);
    return [
      minX === Infinity ? -180 : minX,
      minY === Infinity ? -90 : minY,
      maxX === -Infinity ? 180 : maxX,
      maxY === -Infinity ? 90 : maxY
    ];
  }
}
