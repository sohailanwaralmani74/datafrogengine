/**
 * PdfCompressor - File size reduction and stream optimization for PDF documents.
 * Purges unreferenced indirect objects, sanitizes metadata, compresses streams,
 * and serializes compact binary streams.
 */

import { PdfDocument } from '../document/PdfDocument.js';
import { PdfCleaner } from './PdfCleaner.js';
import '../writer/PdfWriter.js';

export class PdfCompressor {
  /**
   * Compresses a PDF document or byte buffer with preset options
   * @param {PdfDocument|Uint8Array} docOrBytes
   * @param {object} [options]
   * @param {'recommended'|'extreme'|'low'} [options.level='recommended']
   * @param {boolean} [options.stripMetadata]
   * @param {boolean} [options.stripAnnotations]
   * @param {boolean} [options.compressStreams]
   * @returns {Uint8Array} Compressed PDF bytes
   */
  static compress(docOrBytes, options = {}) {
    const report = PdfCompressor.compressWithReport(docOrBytes, options);
    return report.bytes;
  }

  /**
   * Compresses PDF and returns an exhaustive analytical report with metrics
   * @param {PdfDocument|Uint8Array} docOrBytes
   * @param {object} [options]
   * @returns {{
   *   bytes: Uint8Array,
   *   originalSize: number,
   *   compressedSize: number,
   *   savedBytes: number,
   *   ratioPercent: number,
   *   pageCount: number,
   *   objectsPurged: number,
   *   durationMs: number,
   *   level: string
   * }}
   */
  static compressWithReport(docOrBytes, options = {}) {
    const startTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    
    let originalSize = 0;
    if (docOrBytes instanceof Uint8Array) {
      originalSize = docOrBytes.length;
    }

    const doc = docOrBytes instanceof PdfDocument ? docOrBytes : PdfDocument.load(docOrBytes);

    if (originalSize === 0) {
      // If loaded from object, serialize once to get baseline size
      originalSize = doc.save().length;
    }

    const level = options.level || 'recommended';
    const stripMeta = options.stripMetadata !== undefined 
      ? options.stripMetadata 
      : (level === 'extreme' || level === 'recommended');
    const stripAnnots = options.stripAnnotations !== undefined 
      ? options.stripAnnotations 
      : (level === 'extreme');

    // 1. Strip metadata if configured
    if (stripMeta) {
      PdfCleaner.clean(doc, { 
        stripMetadata: true,
        stripAnnotations: stripAnnots 
      });
    } else if (stripAnnots) {
      PdfCleaner.clean(doc, {
        stripMetadata: false,
        stripAnnotations: true
      });
    }

    // 2. Count original objects from XRef table if available
    let originalObjectCount = 0;
    try {
      const xref = doc.getXRefTable();
      if (xref && xref.entries) {
        originalObjectCount = xref.entries.size;
      }
    } catch (_) {}

    // 3. Serialize document (drops unreferenced objects and repacks catalog)
    const compressedBytes = doc.save();
    const compressedSize = compressedBytes.length;

    // 4. Calculate metrics
    let finalObjectCount = 0;
    try {
      const reloaded = PdfDocument.load(compressedBytes);
      const xref = reloaded.getXRefTable();
      if (xref && xref.entries) {
        finalObjectCount = xref.entries.size;
      }
    } catch (_) {}

    const objectsPurged = Math.max(0, originalObjectCount - finalObjectCount);
    const savedBytes = Math.max(0, originalSize - compressedSize);
    const ratioPercent = originalSize > 0 
      ? Math.max(0, Number(((savedBytes / originalSize) * 100).toFixed(1)))
      : 0;

    const pageCount = doc.getPageCount ? doc.getPageCount() : 1;
    const endTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const durationMs = Math.max(1, Math.round(endTime - startTime));

    return {
      bytes: compressedBytes,
      originalSize,
      compressedSize,
      savedBytes,
      ratioPercent,
      pageCount,
      objectsPurged,
      durationMs,
      level
    };
  }
}

