/**
 * Pure JavaScript JSON Engine Suite
 * Comprehensive data processing tools: converters, editors, validators,
 * analyzers, inspectors, cleaners, and formatters.
 */

export { JsonLexer, JsonToken, JsonTokenType } from './JsonLexer.js';
export { JsonParser, JsonParseException, JsonNode } from './JsonParser.js';
export { JsonConverter } from './JsonConverter.js';
export { JsonEditor } from './JsonEditor.js';
export { JsonValidator } from './JsonValidator.js';
export { JsonAnalyzer } from './JsonAnalyzer.js';
export { JsonInspector } from './JsonInspector.js';
export { JsonCleaner } from './JsonCleaner.js';

import { JsonParser } from './JsonParser.js';
import { JsonConverter } from './JsonConverter.js';
import { JsonEditor } from './JsonEditor.js';
import { JsonValidator } from './JsonValidator.js';
import { JsonAnalyzer } from './JsonAnalyzer.js';
import { JsonInspector } from './JsonInspector.js';
import { JsonCleaner } from './JsonCleaner.js';

/**
 * Unified Facade for the JSON Data Processing Engine
 */
export class JsonEngine {
  static parse(text, options) {
    return JsonParser.parse(text, options);
  }

  static stringify(value, replacer, space) {
    return JSON.stringify(value, replacer, space);
  }

  // Converters
  static toXml(data, rootTag, options) {
    return JsonConverter.toXml(data, rootTag, options);
  }

  static fromXml(xmlStr, options) {
    return JsonConverter.fromXml(xmlStr, options);
  }

  static toCsv(data, options) {
    return JsonConverter.toCsv(data, options);
  }

  static fromCsv(csvStr, options) {
    return JsonConverter.fromCsv(csvStr, options);
  }

  static toYaml(data) {
    return JsonConverter.toYaml(data);
  }

  static fromYaml(yamlStr) {
    return JsonConverter.fromYaml(yamlStr);
  }

  static toNdjson(data) {
    return JsonConverter.toNdjson(data);
  }

  static fromNdjson(ndjsonStr) {
    return JsonConverter.fromNdjson(ndjsonStr);
  }

  static toExcel(data, options) {
    return JsonConverter.toExcel(data, options);
  }

  static toPdf(data, options) {
    return JsonConverter.toPdf(data, options);
  }

  // Editors & Paths
  static get(obj, path, defaultValue) {
    return JsonEditor.get(obj, path, defaultValue);
  }

  static set(obj, path, value, options) {
    return JsonEditor.set(obj, path, value, options);
  }

  static delete(obj, path, options) {
    return JsonEditor.delete(obj, path, options);
  }

  static applyPatch(doc, patch, options) {
    return JsonEditor.applyPatch(doc, patch, options);
  }

  static createPatch(source, target) {
    return JsonEditor.createPatch(source, target);
  }

  static flatten(obj, delimiter) {
    return JsonEditor.flatten(obj, delimiter);
  }

  static unflatten(flatObj, delimiter) {
    return JsonEditor.unflatten(flatObj, delimiter);
  }

  // Validators
  static validate(jsonText, options) {
    return JsonValidator.validateSyntax(jsonText, options);
  }

  static validateSchema(data, schema) {
    return JsonValidator.validateSchema(data, schema);
  }

  // Analyzers
  static analyze(data) {
    return JsonAnalyzer.analyze(data);
  }

  static inferSchema(data, options) {
    return JsonAnalyzer.inferSchema(data, options);
  }

  static detectAnomalies(data) {
    return JsonAnalyzer.detectAnomalies(data);
  }

  // Inspectors & Diff
  static diff(oldData, newData) {
    return JsonInspector.diff(oldData, newData);
  }

  static query(data, jsonPath) {
    return JsonInspector.query(data, jsonPath);
  }

  static outline(data) {
    return JsonInspector.outline(data);
  }

  // Cleaners & Formatters
  static clean(data, options) {
    return JsonCleaner.clean(data, options);
  }

  static format(input, options) {
    return JsonCleaner.format(input, options);
  }

  static minify(input) {
    return JsonCleaner.minify(input);
  }

  static repair(malformedJsonText) {
    return JsonCleaner.repair(malformedJsonText);
  }
}
