/**
 * PdfEngine - Master facade providing a unified, high-performance API for
 * PDF creation, loading, procedural generation, cross-format extraction,
 * rendering to SVG/Canvas, form handling, encryption, digital signing,
 * page editing, reordering, diffing/comparing, profiling, cleaning, and compression.
 */

import { PdfDocument } from '../document/PdfDocument.js';
import { PdfDocumentBuilder } from '../builder/PdfDocumentBuilder.js';
import { PdfRenderer } from '../rendering/PdfRenderer.js';
import { PdfConverter } from './PdfConverter.js';
import { PdfEditor } from './PdfEditor.js';
import { PdfComparator } from './PdfComparator.js';
import { PdfAnalyzer } from './PdfAnalyzer.js';
import { PdfCleaner } from './PdfCleaner.js';
import { PdfCompressor } from './PdfCompressor.js';
import { PdfDigitalSignature } from '../security/PdfDigitalSignature.js';

function ensureDoc(docOrBytes) {
  if (docOrBytes instanceof PdfDocument) return docOrBytes;
  return PdfDocument.load(docOrBytes);
}

export class PdfEngine {
  // Loading, Creation & Building
  static load(bytes) {
    return PdfDocument.load(bytes);
  }

  static create(options) {
    return PdfDocument.create(options);
  }

  static builder(options) {
    return new PdfDocumentBuilder(options);
  }

  static save(doc) {
    return doc.save();
  }

  // Document Inspection & Metadata
  static getPageCount(docOrBytes) {
    const doc = ensureDoc(docOrBytes);
    return doc.getPageCount();
  }

  static getPageSize(docOrBytes, pageIndex = 0) {
    const doc = ensureDoc(docOrBytes);
    return doc.getPageSize(pageIndex);
  }

  static getPageRotation(docOrBytes, pageIndex = 0) {
    const doc = ensureDoc(docOrBytes);
    return doc.getPageRotation(pageIndex);
  }

  static getVersion(docOrBytes) {
    const doc = ensureDoc(docOrBytes);
    return doc.getPdfVersion();
  }

  static getMetadata(docOrBytes) {
    const doc = ensureDoc(docOrBytes);
    return doc.getMetadata();
  }

  static setMetadata(doc, metadata = {}) {
    return doc.setMetadata(metadata);
  }

  // Rendering & Visuals
  static renderToSvg(docOrBytes, pageIndex = 0, options = {}) {
    const doc = ensureDoc(docOrBytes);
    return doc.renderToSvg(pageIndex, options);
  }

  static renderAllPagesToSvg(docOrBytes, options = {}) {
    const doc = ensureDoc(docOrBytes);
    const count = doc.getPageCount();
    const svgs = [];
    for (let i = 0; i < count; i++) {
      svgs.push(doc.renderToSvg(i, options));
    }
    return svgs;
  }

  static renderToCanvas(docOrBytes, pageIndex, canvasOrContext, options = {}) {
    const doc = ensureDoc(docOrBytes);
    return doc.renderToCanvas(pageIndex, canvasOrContext, options);
  }

  static createViewport(docOrBytes, pageIndex = 0, options = {}) {
    const doc = ensureDoc(docOrBytes);
    return doc.getViewport(pageIndex, options);
  }

  // Cross-Format Conversion & Extraction
  static toText(docOrBytes, options) {
    return PdfConverter.toText(docOrBytes, options);
  }

  static extractText(docOrBytes, pageIndex = undefined) {
    const doc = ensureDoc(docOrBytes);
    return doc.extractText(pageIndex);
  }

  static extractTextItems(docOrBytes, pageIndex = 0) {
    const doc = ensureDoc(docOrBytes);
    return doc.extractTextItems(pageIndex);
  }

  static extractImages(docOrBytes, pageIndex = undefined) {
    const doc = ensureDoc(docOrBytes);
    return doc.extractImages(pageIndex);
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

  // Page Editing, Structuring & Annotations
  static addPage(doc, width = 612, height = 792) {
    return doc.addPage(width, height);
  }

  static insertPage(doc, index, width = 612, height = 792) {
    return doc.insertPage(index, width, height);
  }

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

  static addPageNumbers(doc, options = {}) {
    return doc.addPageNumbers(options);
  }

  // Interactive Forms (AcroForms)
  static hasForm(docOrBytes) {
    const doc = ensureDoc(docOrBytes);
    return doc.hasForm();
  }

  static getForm(docOrBytes) {
    const doc = ensureDoc(docOrBytes);
    return doc.getForm();
  }

  static fillForm(doc, fieldValues = {}) {
    const form = doc.getForm();
    if (!form) return false;
    for (const [name, val] of Object.entries(fieldValues)) {
      const field = form.getField(name);
      if (field && typeof field.setValue === 'function') {
        field.setValue(val);
      }
    }
    return true;
  }

  static flattenForm(doc) {
    const form = doc.getForm();
    if (form && typeof form.flatten === 'function') {
      return form.flatten();
    }
    return false;
  }

  // Security, Cryptography & Digital Signatures
  static isEncrypted(docOrBytes) {
    const doc = ensureDoc(docOrBytes);
    return doc.isEncrypted;
  }

  static authenticate(doc, password = '') {
    return doc.authenticate(password);
  }

  static encrypt(doc, options = {}) {
    return doc.encrypt(options);
  }

  static sign(doc, options = {}) {
    return PdfDigitalSignature.signDocument(doc, options);
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

  static compressWithReport(docOrBytes, options) {
    return PdfCompressor.compressWithReport(docOrBytes, options);
  }
}
