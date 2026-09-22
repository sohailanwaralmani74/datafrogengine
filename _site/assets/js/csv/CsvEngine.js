/**
 * CsvEngine - Master facade providing a unified, high-performance API
 * for parsing, serialization, cross-format conversion, SQL-like querying,
 * schema validation, dataset profiling, and data cleaning.
 */

import { CsvParser } from './CsvParser.js';
import { CsvSerializer, CsvBuilder } from './CsvSerializer.js';
import { CsvConverter } from './CsvConverter.js';
import { CsvEditor } from './CsvEditor.js';
import { CsvValidator } from './CsvValidator.js';
import { CsvAnalyzer } from './CsvAnalyzer.js';
import { CsvCleaner } from './CsvCleaner.js';
import { CsvComparator } from './CsvComparator.js';

export class CsvEngine {
  // Parsing & Serialization
  static parse(text, options) {
    return CsvParser.parse(text, options);
  }

  static stringify(data, options) {
    return CsvSerializer.serialize(data, options);
  }

  static serialize(data, options) {
    return CsvSerializer.serialize(data, options);
  }

  static builder(options) {
    return new CsvBuilder(options);
  }

  static detectDelimiter(text) {
    return CsvParser.detectDelimiter(text);
  }

  // Cross-Format Conversions
  static toJson(csvText, options) {
    return CsvConverter.csvToJson(csvText, options);
  }

  static fromJson(jsonData, options) {
    return CsvConverter.jsonToCsv(jsonData, options);
  }

  static toXml(csvText, options) {
    return CsvConverter.csvToXml(csvText, options);
  }

  static fromXml(xmlText, options) {
    return CsvConverter.xmlToCsv(xmlText, options);
  }

  static toYaml(csvText, options) {
    return CsvConverter.csvToYaml(csvText, options);
  }

  static toMarkdown(csvText, options) {
    return CsvConverter.csvToMarkdown(csvText, options);
  }

  static fromMarkdown(mdText, options) {
    return CsvConverter.markdownToCsv(mdText, options);
  }

  static toHtml(csvText, options) {
    return CsvConverter.csvToHtml(csvText, options);
  }

  static toExcel(csvText, options) {
    return CsvConverter.csvToExcel(csvText, options);
  }

  static toPdf(csvText, options) {
    return CsvConverter.csvToPdf(csvText, options);
  }

  // Data Manipulation & SQL-like Queries
  static filter(csvText, predicate, options) {
    return CsvEditor.filter(csvText, predicate, options);
  }

  static sort(csvText, column, direction, type, options) {
    return CsvEditor.sort(csvText, column, direction, type, options);
  }

  static select(csvText, columns, options) {
    return CsvEditor.select(csvText, columns, options);
  }

  static drop(csvText, columns, options) {
    return CsvEditor.drop(csvText, columns, options);
  }

  static rename(csvText, columnMap, options) {
    return CsvEditor.rename(csvText, columnMap, options);
  }

  static groupBy(csvText, groupCol, aggregations, options) {
    return CsvEditor.groupBy(csvText, groupCol, aggregations, options);
  }

  static pivot(csvText, rowKey, colKey, valKey, agg, options) {
    return CsvEditor.pivot(csvText, rowKey, colKey, valKey, agg, options);
  }

  static join(csvA, csvB, keyA, keyB, type, options) {
    return CsvEditor.join(csvA, csvB, keyA, keyB, type, options);
  }

  static update(csvText, where, updates, options) {
    return CsvEditor.update(csvText, where, updates, options);
  }

  static insert(csvText, newRows, options) {
    return CsvEditor.insert(csvText, newRows, options);
  }

  static delete(csvText, where, options) {
    return CsvEditor.delete(csvText, where, options);
  }

  static reorderColumns(csvText, newColumnOrder, options) {
    return CsvEditor.reorderColumns(csvText, newColumnOrder, options);
  }

  static reorderRows(csvText, newRowOrder, options) {
    return CsvEditor.reorderRows(csvText, newRowOrder, options);
  }

  // Comparing & Diffing Tool
  static compare(csvA, csvB, options) {
    return CsvComparator.compare(csvA, csvB, options);
  }

  static diff(csvA, csvB, options) {
    return CsvComparator.compare(csvA, csvB, options);
  }

  // Validation & Diagnostics
  static validateSyntax(csvText, options) {
    return CsvValidator.validateSyntax(csvText, options);
  }

  static validateSchema(csvData, schema, options) {
    return CsvValidator.validateSchema(csvData, schema, options);
  }

  // Profiling & Analytics
  static profile(csvText, options) {
    return CsvAnalyzer.profile(csvText, options);
  }

  // Cleaning & Normalization
  static clean(csvText, options) {
    return CsvCleaner.clean(csvText, options);
  }
}
