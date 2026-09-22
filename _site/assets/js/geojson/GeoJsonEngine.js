/**
 * GeoJsonEngine - Master facade providing a unified, high-performance API for
 * GeoJSON parsing, validation, cross-format conversion (WKT, CSV, KML, SVG),
 * spatial transformations, bounding box auditing, topological cleaning, and compression.
 */

import { GeoJsonValidator } from './GeoJsonValidator.js';
import { GeoJsonConverter } from './GeoJsonConverter.js';
import { GeoJsonEditor } from './GeoJsonEditor.js';
import { GeoJsonComparator } from './GeoJsonComparator.js';
import { GeoJsonAnalyzer } from './GeoJsonAnalyzer.js';
import { GeoJsonCleaner } from './GeoJsonCleaner.js';
import { GeoJsonCompressor } from './GeoJsonCompressor.js';

export class GeoJsonEngine {
  // Parsing & Serialization
  static parse(text) {
    return typeof text === 'string' ? JSON.parse(text) : text;
  }

  static stringify(geojson, space = 2) {
    return JSON.stringify(geojson, null, space);
  }

  // Validation
  static validate(geojson) {
    return GeoJsonValidator.validate(geojson);
  }

  static isValid(geojson) {
    return GeoJsonValidator.isValid(geojson);
  }

  // Cross-Format Conversions
  static toWkt(geojson) {
    return GeoJsonConverter.toWkt(geojson);
  }

  static fromWkt(wkt) {
    return GeoJsonConverter.fromWkt(wkt);
  }

  static toCsv(geojson) {
    return GeoJsonConverter.toCsv(geojson);
  }

  static fromCsv(csvText, options) {
    return GeoJsonConverter.fromCsv(csvText, options);
  }

  static toKml(geojson, docName) {
    return GeoJsonConverter.toKml(geojson, docName);
  }

  static toSvgPaths(geojson, options) {
    return GeoJsonConverter.toSvgPaths(geojson, options);
  }

  static calculateBBox(geojson) {
    return GeoJsonConverter.calculateBBox(geojson);
  }

  // Spatial Editing & Transformations
  static translate(geojson, deltaLon, deltaLat) {
    return GeoJsonEditor.translate(geojson, deltaLon, deltaLat);
  }

  static scale(geojson, scaleFactor) {
    return GeoJsonEditor.scale(geojson, scaleFactor);
  }

  static updateBBox(geojson) {
    return GeoJsonEditor.updateBBox(geojson);
  }

  static filterFeatures(featureCollection, predicate) {
    return GeoJsonEditor.filterFeatures(featureCollection, predicate);
  }

  static setProperties(geojson, keyOrProps, value) {
    return GeoJsonEditor.setProperties(geojson, keyOrProps, value);
  }

  static rewind(geojson, clockwise) {
    return GeoJsonEditor.rewind(geojson, clockwise);
  }

  static simplify(geojson, tolerance) {
    return GeoJsonEditor.simplify(geojson, tolerance);
  }

  // Diffing & Comparing
  static compare(geojsonA, geojsonB, options) {
    return GeoJsonComparator.compare(geojsonA, geojsonB, options);
  }

  static diff(geojsonA, geojsonB, options) {
    return GeoJsonComparator.diff(geojsonA, geojsonB, options);
  }

  // Spatial Profiling & Metrics
  static analyze(geojson) {
    return GeoJsonAnalyzer.analyze(geojson);
  }

  static profile(geojson) {
    return GeoJsonAnalyzer.profile(geojson);
  }

  // Cleaning & Sanitizing
  static clean(geojson, options) {
    return GeoJsonCleaner.clean(geojson, options);
  }

  // Compression & Coordinate Truncation
  static compress(geojson, options) {
    return GeoJsonCompressor.compress(geojson, options);
  }

  static minify(geojson, options) {
    return GeoJsonCompressor.minify(geojson, options);
  }
}
