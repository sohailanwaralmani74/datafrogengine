/**
 * PdfCompressor - File size reduction and stream optimization for PDF documents.
 */

import { PdfDocument } from '../document/PdfDocument.js';
import { PdfCleaner } from './PdfCleaner.js';
import { PdfStream } from '../objects/PdfStream.js';
import { PdfArray } from '../objects/PdfArray.js';
import { PdfName } from '../objects/PdfName.js';
import { FlateDecode } from '../streams/filters/FlateDecode.js';
import { FlateEncode } from '../streams/filters/FlateEncode.js';

export class PdfCompressor {
  static compress(docOrBytes, options = {}) {
    return PdfCompressor.compressWithReport(docOrBytes, options).bytes;
  }

  /**
   * Compresses a PDF and returns metrics describing the actual result.
   *
   * Stream compression is deliberately lossless. A stream is replaced only
   * when the resulting bytes are smaller than the existing stream bytes.
   */
  static compressWithReport(docOrBytes, options = {}) {
    const startTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    let originalSize = docOrBytes instanceof Uint8Array ? docOrBytes.length : 0;
    const doc = docOrBytes instanceof PdfDocument ? docOrBytes : PdfDocument.load(docOrBytes);

    if (originalSize === 0) originalSize = doc.save().length;

    const level = options.level || 'recommended';
    const stripMeta = options.stripMetadata !== undefined
      ? options.stripMetadata
      : (level === 'extreme' || level === 'recommended');
    const stripAnnots = options.stripAnnotations !== undefined
      ? options.stripAnnotations
      : (level === 'extreme');
    const compressStreams = options.compressStreams !== undefined
      ? options.compressStreams
      : true;

    if (stripMeta) {
      PdfCleaner.clean(doc, { stripMetadata: true, stripAnnotations: stripAnnots });
    } else if (stripAnnots) {
      PdfCleaner.clean(doc, { stripMetadata: false, stripAnnotations: true });
    }

    let originalObjectCount = 0;
    try {
      const xref = doc.getXRefTable();
      if (xref && xref.entries) originalObjectCount = xref.entries.size;
    } catch (_) {}

    const streamStats = { scanned: 0, compressed: 0, bytesSaved: 0, skipped: 0 };

    if (compressStreams) PdfCompressor.#compressStreams(doc, streamStats);

    const compressedBytes = doc.save();
    const compressedSize = compressedBytes.length;

    let finalObjectCount = 0;
    try {
      const reloaded = PdfDocument.load(compressedBytes);
      const xref = reloaded.getXRefTable();
      if (xref && xref.entries) finalObjectCount = xref.entries.size;
    } catch (_) {}

    const objectsPurged = Math.max(0, originalObjectCount - finalObjectCount);
    const savedBytes = originalSize - compressedSize;
    const ratioPercent = originalSize > 0
      ? Number(((savedBytes / originalSize) * 100).toFixed(1))
      : 0;

    const pageCount = doc.getPageCount ? doc.getPageCount() : 1;
    const endTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    return {
      bytes: compressedBytes,
      originalSize,
      compressedSize,
      savedBytes,
      ratioPercent,
      reductionPercent: Math.max(0, ratioPercent),
      grew: savedBytes < 0,
      pageCount,
      objectsPurged,
      durationMs: Math.max(1, Math.round(endTime - startTime)),
      level,
      streams: streamStats
    };
  }

  static #compressStreams(doc, stats) {
    const xref = doc.getXRefTable();
    if (!xref || !xref.entries) return;

    for (const [objectNumber, entry] of xref.entries) {
      if (!entry || (entry.isFree && entry.isFree()) || (entry.isCompressed && entry.isCompressed())) continue;

      let object;
      try {
        object = doc.resolveObject(objectNumber, entry.generationNumber || 0);
      } catch (_) {
        continue;
      }

      if (!(object instanceof PdfStream)) continue;
      stats.scanned++;

      const filterNames = PdfCompressor.#filterNames(object.getFilter());
      let rawBytes;
      let shouldSetFilter = false;

      try {
        if (filterNames.length === 0) {
          rawBytes = object.bytes;
          shouldSetFilter = true;
        } else if (filterNames.length === 1 && filterNames[0] === 'FlateDecode') {
          rawBytes = FlateDecode.decode(object.bytes);
        } else {
          stats.skipped++;
          continue;
        }

        const encoded = FlateEncode.encode(rawBytes);
        if (encoded.length >= object.bytes.length) {
          stats.skipped++;
          continue;
        }

        const oldLength = object.bytes.length;
        object.setBytes(encoded);

        if (shouldSetFilter) object.dictionary.set('Filter', PdfName.of('FlateDecode'));

        stats.compressed++;
        stats.bytesSaved += oldLength - encoded.length;
      } catch (_) {
        stats.skipped++;
      }
    }
  }

  static #filterNames(filter) {
    if (!filter) return [];

    if (filter.isName && filter.isName()) return [filter.value];

    if (filter instanceof PdfArray) {
      return filter.asArray()
        .filter(item => item && item.isName && item.isName())
        .map(item => item.value);
    }

    return [];
  }
}
