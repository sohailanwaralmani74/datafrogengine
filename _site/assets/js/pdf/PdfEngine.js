/**
 * PdfEngine - Master facade providing a unified, high-performance API for
 * PDF creation, loading, procedural generation, cross-format extraction,
 * page editing, reordering, diffing/comparing, profiling, cleaning, and compression.
 */

import { PdfDocument } from '../document/PdfDocument.js';
import { PdfDocumentBuilder } from '../builder/PdfDocumentBuilder.js';
import { PdfConverter } from './PdfConverter.js';
import { PdfEditor } from './PdfEditor.js';
import { PdfComparator } from './PdfComparator.js';
import { PdfAnalyzer } from './PdfAnalyzer.js';
import { PdfCleaner } from './PdfCleaner.js';
import { PdfCompressor } from './PdfCompressor.js';

export class PdfEngine {
  // Loading, Creation & Building
  static load(bytes) {
    return PdfDocument.load(bytes);
  }

  static create() {
    return PdfDocument.create();
  }

  static builder(options) {
    return new PdfDocumentBuilder(options);
  }

  static save(doc) {
    return doc.save();
  }

  // Cross-Format Conversion & Extraction
  static toText(docOrBytes, options) {
    return PdfConverter.toText(docOrBytes, options);
  }

  static toPageTextList(docOrBytes) {
    return PdfConverter.toPageTextList(docOrBytes);
  }

  static toJson(docOrBytes) {
    return PdfConverter.toJson(docOrBytes);
  }

  static toXml(docOrBytes) {
    return PdfConverter.toXml(docOrBytes);
  }

  // Page Editing & Reordering
  static rotatePage(doc, pageIndex, degrees) {
    return PdfEditor.rotatePage(doc, pageIndex, degrees);
  }

  static rotateAll(doc, degrees) {
    return PdfEditor.rotateAll(doc, degrees);
  }

  static deletePage(doc, pageIndex) {
    return PdfEditor.deletePage(doc, pageIndex);
  }

  static deletePages(doc, indices) {
    return PdfEditor.deletePages(doc, indices);
  }

  static movePage(doc, fromIndex, toIndex) {
    return PdfEditor.movePage(doc, fromIndex, toIndex);
  }

  static reorderPages(doc, newOrder) {
    return PdfEditor.reorderPages(doc, newOrder);
  }

  static extractPages(doc, indices) {
    return PdfEditor.extractPages(doc, indices);
  }

  static split(doc, pagesPerSplit) {
    return PdfEditor.split(doc, pagesPerSplit);
  }

  static merge(docs) {
    return PdfEditor.merge(docs);
  }

  static addWatermark(doc, text, options) {
    return PdfEditor.addWatermark(doc, text, options);
  }

  // Comparing & Diffing
  static compare(pdfA, pdfB, options) {
    return PdfComparator.compare(pdfA, pdfB, options);
  }

  static diff(pdfA, pdfB, options) {
    return PdfComparator.compare(pdfA, pdfB, options);
  }

  // Inspection & Analysis
  static analyze(docOrBytes) {
    return PdfAnalyzer.analyze(docOrBytes);
  }

  // Cleaning & Privacy
  static clean(docOrBytes, options) {
    return PdfCleaner.clean(docOrBytes, options);
  }

  static anonymize(docOrBytes) {
    return PdfCleaner.anonymize(docOrBytes);
  }

  // Compression & Optimization
  static compress(docOrBytes, options) {
    return PdfCompressor.compress(docOrBytes, options);
  }
}
