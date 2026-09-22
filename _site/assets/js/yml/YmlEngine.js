/**
 * YmlEngine - Master facade providing a unified, high-performance API for
 * YAML parsing, serialization, cross-format conversion, programmatic editing,
 * key reordering, diffing/comparing, profiling, cleaning, and compression.
 */

import { YmlParser } from './YmlParser.js';
import { YmlSerializer } from './YmlSerializer.js';
import { YmlConverter } from './YmlConverter.js';
import { YmlEditor } from './YmlEditor.js';
import { YmlComparator } from './YmlComparator.js';
import { YmlAnalyzer } from './YmlAnalyzer.js';
import { YmlCleaner } from './YmlCleaner.js';
import { YmlCompressor } from './YmlCompressor.js';

export class YmlEngine {
  // Parsing & Serialization
  static parse(yamlText, options) {
    return YmlParser.parse(yamlText, options);
  }

  static stringify(data, options) {
    return YmlSerializer.serialize(data, options);
  }

  static serialize(data, options) {
    return YmlSerializer.serialize(data, options);
  }

  // Cross-Format Conversion
  static toJson(yamlText, asString, space) {
    return YmlConverter.toJson(yamlText, asString, space);
  }

  static fromJson(jsonData, options) {
    return YmlConverter.fromJson(jsonData, options);
  }

  static toXml(yamlText, rootTag, options) {
    return YmlConverter.toXml(yamlText, rootTag, options);
  }

  static fromXml(xmlText, options) {
    return YmlConverter.fromXml(xmlText, options);
  }

  static toCsv(yamlText, options) {
    return YmlConverter.toCsv(yamlText, options);
  }

  static fromCsv(csvText, options) {
    return YmlConverter.fromCsv(csvText, options);
  }

  static toMarkdown(yamlText, options) {
    return YmlConverter.toMarkdown(yamlText, options);
  }

  // Programmatic Editing & Reordering
  static get(yaml, path, defaultValue) {
    return YmlEditor.get(yaml, path, defaultValue);
  }

  static set(yaml, path, value, serializeOptions) {
    return YmlEditor.set(yaml, path, value, serializeOptions);
  }

  static remove(yaml, path, serializeOptions) {
    return YmlEditor.remove(yaml, path, serializeOptions);
  }

  static reorderKeys(yaml, keyOrder, recursive) {
    return YmlEditor.reorderKeys(yaml, keyOrder, recursive);
  }

  static sortKeys(yaml, options) {
    return YmlEditor.sortKeys(yaml, options);
  }

  static merge(target, ...sources) {
    return YmlEditor.merge(target, ...sources);
  }

  // Diffing & Comparing
  static compare(ymlA, ymlB, options) {
    return YmlComparator.compare(ymlA, ymlB, options);
  }

  static diff(ymlA, ymlB, options) {
    return YmlComparator.diff(ymlA, ymlB, options);
  }

  // Profiling & Analyzing
  static analyze(yaml) {
    return YmlAnalyzer.analyze(yaml);
  }

  static profile(yaml) {
    return YmlAnalyzer.profile(yaml);
  }

  // Cleaning & Sanitization
  static clean(yaml, options) {
    return YmlCleaner.clean(yaml, options);
  }

  static stripComments(yamlText) {
    return YmlCleaner.stripComments(yamlText);
  }

  static removeEmpty(yaml) {
    return YmlCleaner.removeEmpty(yaml);
  }

  // Compression & Minification
  static compress(yaml) {
    return YmlCompressor.compress(yaml);
  }

  static minify(yaml) {
    return YmlCompressor.minify(yaml);
  }
}
