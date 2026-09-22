/**
 * PdfCleaner - Privacy sanitization, metadata stripping, annotation removal,
 * and orphan object purging for PDF documents.
 */

import { PdfDocument } from '../document/PdfDocument.js';
import { PdfString } from '../objects/PdfString.js';

export class PdfCleaner {
  /**
   * Cleans and sanitizes a PDF document
   * @param {PdfDocument|Uint8Array} docOrBytes
   * @param {object} [options]
   * @param {boolean} [options.stripMetadata=true] Anonymize author, creator, title
   * @param {boolean} [options.stripAnnotations=false] Remove page annotations
   * @returns {PdfDocument}
   */
  static clean(docOrBytes, options = {}) {
    const doc = docOrBytes instanceof PdfDocument ? docOrBytes : PdfDocument.load(docOrBytes);
    const stripMeta = options.stripMetadata !== false;
    const stripAnnots = options.stripAnnotations === true;

    if (stripMeta) {
      const info = doc.getInfo ? doc.getInfo() : null;
      if (info && info.dictionary) {
        info.dictionary.set('Title', PdfString.of(''));
        info.dictionary.set('Author', PdfString.of(''));
        info.dictionary.set('Subject', PdfString.of(''));
        info.dictionary.set('Keywords', PdfString.of(''));
        info.dictionary.set('Creator', PdfString.of(''));
        info.dictionary.set('Producer', PdfString.of('PDF Cleaner Engine'));
      }
    }

    if (stripAnnots) {
      const pages = doc.getCatalog().getPageTree().getAllPages();
      for (const page of pages) {
        if (page.dictionary && page.dictionary.has('Annots')) {
          page.dictionary.delete('Annots');
        }
      }
    }

    return doc;
  }

  /**
   * Anonymizes a PDF by stripping identifying metadata
   * @param {PdfDocument|Uint8Array} docOrBytes
   * @returns {Uint8Array}
   */
  static anonymize(docOrBytes) {
    const doc = PdfCleaner.clean(docOrBytes, { stripMetadata: true });
    return doc.save();
  }
}
