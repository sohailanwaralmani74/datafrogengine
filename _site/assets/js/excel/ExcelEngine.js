/**
 * ExcelEngine - Master facade providing a unified, high-performance API for
 * Excel spreadsheet reading, writing, building, cross-format conversion,
 * editing, reordering, diffing/comparing, profiling, cleaning, and compression.
 */

import { ExcelWorkbook } from './model/ExcelWorkbook.js';
import { ExcelBuilder } from './builder/ExcelBuilder.js';
import { ExcelWriter } from './io/ExcelWriter.js';
import { ExcelReader } from './io/ExcelReader.js';
import { ExcelConverter } from './ExcelConverter.js';
import { ExcelEditor } from './ExcelEditor.js';
import { ExcelComparator } from './ExcelComparator.js';
import { ExcelAnalyzer } from './ExcelAnalyzer.js';
import { ExcelCleaner } from './ExcelCleaner.js';
import { ExcelCompressor } from './ExcelCompressor.js';

export class ExcelEngine {
  // Reading & Writing
  static open(bufferOrPath) {
    return ExcelWorkbook.open(bufferOrPath);
  }

  static create() {
    return new ExcelWorkbook();
  }

  static builder(options) {
    return new ExcelBuilder(options);
  }

  static write(workbook) {
    return ExcelWriter.write(workbook);
  }

  static save(workbook) {
    return ExcelWriter.write(workbook);
  }

  // Cross-Format Conversion
  static toJson(workbook, sheet) {
    return ExcelConverter.toJson(workbook, sheet);
  }

  static toMultiSheetJson(workbook) {
    return ExcelConverter.toMultiSheetJson(workbook);
  }

  static toCsv(workbook, sheet, delimiter) {
    return ExcelConverter.toCsv(workbook, sheet, delimiter);
  }

  static toMarkdown(workbook, sheet) {
    return ExcelConverter.toMarkdown(workbook, sheet);
  }

  static toHtml(workbook, sheet, options) {
    return ExcelConverter.toHtml(workbook, sheet, options);
  }

  static toXml(workbook, options) {
    return ExcelConverter.toXml(workbook, options);
  }

  static toPdf(workbook, sheet, options) {
    return ExcelConverter.toPdf(workbook, sheet, options);
  }

  static fromJson(jsonData, sheetName) {
    return ExcelConverter.fromJson(jsonData, sheetName);
  }

  static fromCsv(csvText, sheetName, delimiter) {
    return ExcelConverter.fromCsv(csvText, sheetName, delimiter);
  }

  // Programmatic Editing & Reordering
  static setCell(workbook, sheet, refOrRow, colOrVal, value) {
    return ExcelEditor.setCell(workbook, sheet, refOrRow, colOrVal, value);
  }

  static setFormula(workbook, sheet, cellRef, formula) {
    return ExcelEditor.setFormula(workbook, sheet, cellRef, formula);
  }

  static setStyle(workbook, sheet, cellRef, style) {
    return ExcelEditor.setStyle(workbook, sheet, cellRef, style);
  }

  static reorderSheets(workbook, newSheetOrder) {
    return ExcelEditor.reorderSheets(workbook, newSheetOrder);
  }

  static reorderColumns(workbook, sheet, newColumnOrder) {
    return ExcelEditor.reorderColumns(workbook, sheet, newColumnOrder);
  }

  static reorderRows(workbook, sheet, newRowOrder) {
    return ExcelEditor.reorderRows(workbook, sheet, newRowOrder);
  }

  static filterRows(workbook, sheet, predicate) {
    return ExcelEditor.filterRows(workbook, sheet, predicate);
  }

  static sortRows(workbook, sheet, column, direction) {
    return ExcelEditor.sortRows(workbook, sheet, column, direction);
  }

  static renameSheet(workbook, oldName, newName) {
    return ExcelEditor.renameSheet(workbook, oldName, newName);
  }

  // Comparing & Diffing
  static compare(wbA, wbB, options) {
    return ExcelComparator.compare(wbA, wbB, options);
  }

  static diff(wbA, wbB, options) {
    return ExcelComparator.compare(wbA, wbB, options);
  }

  // Profiling & Analyzing
  static analyze(workbook) {
    return ExcelAnalyzer.analyze(workbook);
  }

  static analyzeSheet(worksheet) {
    return ExcelAnalyzer.analyzeSheet(worksheet);
  }

  // Cleaning & Normalization
  static clean(workbook, options) {
    return ExcelCleaner.cleanWorkbook(workbook, options);
  }

  static cleanSheet(worksheet, options) {
    return ExcelCleaner.cleanSheet(worksheet, options);
  }

  // Compression & Optimization
  static compress(workbook, options) {
    return ExcelCompressor.compress(workbook, options);
  }
}
