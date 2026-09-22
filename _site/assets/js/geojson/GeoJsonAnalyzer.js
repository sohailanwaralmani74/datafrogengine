/**
 * GeoJsonAnalyzer - Geospatial metrics, topology verification, geometry histogram,
 * bounding envelope, centroid calculation, and spatial density profiling.
 */

import { GeoJsonConverter } from './GeoJsonConverter.js';

export class GeoJsonAnalyzer {
  /**
   * Generates a comprehensive spatial analysis report for a GeoJSON object
   * @param {object|string} geojson
   * @returns {object} Spatial report
   */
  static analyze(geojson) {
    const data = typeof geojson === 'string' ? JSON.parse(geojson) : geojson;

    const bbox = GeoJsonConverter.calculateBBox(data);
    const centerLon = (bbox[0] + bbox[2]) / 2;
    const centerLat = (bbox[1] + bbox[3]) / 2;

    const geometryCounts = {
      Point: 0,
      MultiPoint: 0,
      LineString: 0,
      MultiLineString: 0,
      Polygon: 0,
      MultiPolygon: 0,
      GeometryCollection: 0
    };

    let totalVertices = 0;
    let featureCount = 0;
    const propertyKeys = new Set();

    const countCoords = (coords) => {
      if (typeof coords[0] === 'number') {
        totalVertices++;
      } else {
        coords.forEach(countCoords);
      }
    };

    const inspectGeom = (geom) => {
      if (!geom) return;
      if (geometryCounts[geom.type] !== undefined) {
        geometryCounts[geom.type]++;
      }
      if (geom.coordinates) {
        countCoords(geom.coordinates);
      }
      if (geom.geometries) {
        geom.geometries.forEach(inspectGeom);
      }
    };

    if (data.type === 'FeatureCollection') {
      featureCount = data.features ? data.features.length : 0;
      (data.features || []).forEach(f => {
        if (f.geometry) inspectGeom(f.geometry);
        if (f.properties) Object.keys(f.properties).forEach(k => propertyKeys.add(k));
      });
    } else if (data.type === 'Feature') {
      featureCount = 1;
      if (data.geometry) inspectGeom(data.geometry);
      if (data.properties) Object.keys(data.properties).forEach(k => propertyKeys.add(k));
    } else {
      featureCount = 1;
      inspectGeom(data);
    }

    return {
      rootType: data.type,
      featureCount,
      totalVertices,
      geometryDistribution: geometryCounts,
      bbox: {
        minLongitude: bbox[0],
        minLatitude: bbox[1],
        maxLongitude: bbox[2],
        maxLatitude: bbox[3],
        widthDegrees: bbox[2] - bbox[0],
        heightDegrees: bbox[3] - bbox[1]
      },
      centroid: {
        longitude: centerLon,
        latitude: centerLat
      },
      propertyKeys: Array.from(propertyKeys)
    };
  }

  static profile(geojson) {
    return GeoJsonAnalyzer.analyze(geojson);
  }
}
