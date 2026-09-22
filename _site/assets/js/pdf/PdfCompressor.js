/**
 * PdfCompressor - File size reduction and stream optimization for PDF documents.
 * Purges unreferenced indirect objects and serializes compact binary streams.
 */

import { PdfDocument } from '../document/PdfDocument.js';
import { PdfCleaner } from './PdfCleaner.js';

export class PdfCompressor {
  /**
   * Compresses a PDF document or byte buffer
   * @param {PdfDocument|Uint8Array} docOrBytes
   * @param {object} [options]
   * @param {boolean} [options.stripMetadata=false]
   * @returns {Uint8Array} Compressed PDF bytes
   */
  static compress(docOrBytes, options = {}) {
    const doc = docOrBytes instanceof PdfDocument ? docOrBytes : PdfDocument.load(docOrBytes);

    if (options.stripMetadata) {
      PdfCleaner.clean(doc, { stripMetadata: true });
    }

    // Saving re-collects reachable objects from Catalog, dropping unreferenced objects
    return doc.save();
  }
}
