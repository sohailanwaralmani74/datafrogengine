/**
 * FinancialEngine - Unified master facade for financial data interchange formats:
 * Quicken Interchange Format (QIF), Open Financial Exchange (OFX),
 * Quicken Financial Exchange (QFX), and QuickBooks Online (QBO).
 */

import { FinancialParser, FinancialFormat } from './FinancialParser.js';
import { FinancialSerializer } from './FinancialSerializer.js';
import { FinancialConverter } from './FinancialConverter.js';
import { FinancialEditor } from './FinancialEditor.js';
import { FinancialComparator } from './FinancialComparator.js';
import { FinancialAnalyzer } from './FinancialAnalyzer.js';
import { FinancialCleaner } from './FinancialCleaner.js';
import { FinancialCompressor } from './FinancialCompressor.js';

export class FinancialEngine {
  // Enums
  static get Format() {
    return FinancialFormat;
  }

  // Parsing & Detection
  static parse(text, options) {
    return FinancialParser.parse(text, options);
  }

  static detectFormat(text) {
    return FinancialParser.detectFormat(text);
  }

  // Serialization
  static toQif(statement) {
    return FinancialSerializer.toQif(statement);
  }

  static toOfx(statement, options) {
    return FinancialSerializer.toOfx(statement, options);
  }

  static toQfx(statement, options) {
    return FinancialSerializer.toQfx(statement, options);
  }

  static toQbo(statement, options) {
    return FinancialSerializer.toQbo(statement, options);
  }

  // Cross-Format Conversion
  static toJson(statement) {
    return FinancialConverter.toJson(statement);
  }

  static fromJson(jsonTxs, format) {
    return FinancialConverter.fromJson(jsonTxs, format);
  }

  static toCsv(statement, options) {
    return FinancialConverter.toCsv(statement, options);
  }

  static fromCsv(csvText, format) {
    return FinancialConverter.fromCsv(csvText, format);
  }

  static toExcel(statement) {
    return FinancialConverter.toExcel(statement);
  }

  static toMarkdown(statement) {
    return FinancialConverter.toMarkdown(statement);
  }

  static toXml(statement) {
    return FinancialConverter.toXml(statement);
  }

  // Programmatic Editing & Categorization
  static filter(statement, predicate) {
    return FinancialEditor.filter(statement, predicate);
  }

  static sort(statement, field, ascending) {
    return FinancialEditor.sort(statement, field, ascending);
  }

  static autoCategorize(statement, rules) {
    return FinancialEditor.autoCategorize(statement, rules);
  }

  static updateTransaction(statement, matchIdOrPredicate, updates) {
    return FinancialEditor.updateTransaction(statement, matchIdOrPredicate, updates);
  }

  // Reconciliation & Diffing
  static reconcile(statementA, statementB, options) {
    return FinancialComparator.reconcile(statementA, statementB, options);
  }

  static compare(statementA, statementB, options) {
    return FinancialComparator.compare(statementA, statementB, options);
  }

  static diff(statementA, statementB, options) {
    return FinancialComparator.diff(statementA, statementB, options);
  }

  // Cashflow Analytics & Profiling
  static analyze(statement) {
    return FinancialAnalyzer.analyze(statement);
  }

  static profile(statement) {
    return FinancialAnalyzer.profile(statement);
  }

  // Cleaning & Anonymization
  static clean(statement, options) {
    return FinancialCleaner.clean(statement, options);
  }

  static anonymize(statement) {
    return FinancialCleaner.anonymize(statement);
  }

  // Compression & Minification
  static compress(statement, options) {
    return FinancialCompressor.compress(statement, options);
  }

  static minify(statement, options) {
    return FinancialCompressor.minify(statement, options);
  }
}
