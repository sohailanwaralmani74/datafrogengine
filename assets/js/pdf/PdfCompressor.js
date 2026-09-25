/**
 * PdfCompressor - File size reduction and stream optimization for PDF documents.
 */

import { PdfDocument } from '../document/PdfDocument.js';
import { PdfCleaner } from './PdfCleaner.js';
import { PdfStream } from '../objects/PdfStream.js';
import { PdfArray } from '../objects/PdfArray.js';
import { PdfName } from '../objects/PdfName.js';
import { PdfNumber } from '../objects/PdfNumber.js';
import { PdfColorSpace } from '../images/PdfColorSpace.js';
import { PdfStreamDecoder } from '../streams/PdfStreamDecoder.js';
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

    let originalBytes = docOrBytes instanceof Uint8Array ? new Uint8Array(docOrBytes) : null;
    let originalSize = originalBytes ? originalBytes.length : 0;
    const doc = docOrBytes instanceof PdfDocument ? docOrBytes : PdfDocument.load(docOrBytes);

    if (!originalBytes) {
      originalBytes = doc.save();
      originalSize = originalBytes.length;
    }

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
    const optimizeImages = options.optimizeImages !== undefined
      ? options.optimizeImages
      : (level === 'recommended' || level === 'extreme');
    const imageQuality = options.imageQuality !== undefined
      ? Math.max(0.1, Math.min(1, Number(options.imageQuality)))
      : (level === 'extreme' ? 0.6 : 0.75);

    if (stripMeta) {
      PdfCleaner.clean(doc, { stripMetadata: true, stripAnnotations: stripAnnots });
    } else if (stripAnnots) {
      PdfCleaner.clean(doc, { stripMetadata: false, stripAnnotations: true });
    }

    let originalObjectCount = 0;
    try {
      const xref = doc.getXRefTable();
      if (xref && typeof xref.getEntries === 'function') originalObjectCount = xref.getEntries().length;
    } catch (_) {}

    const streamStats = { scanned: 0, compressed: 0, bytesSaved: 0, skipped: 0 };
    const imageStats = { scanned: 0, optimized: 0, bytesSaved: 0, skipped: 0 };

    if (compressStreams) PdfCompressor.#compressStreams(doc, streamStats);
    if (optimizeImages) PdfCompressor.#optimizeImages(doc, imageStats, imageQuality);

    let compressedBytes = doc.save({ compact: true });
    const rebuiltSize = compressedBytes.length;
    let compressedSize = rebuiltSize;

    // A compressor must never make the user's PDF larger. The current writer
    // can legitimately add serialization overhead (especially when rebuilding
    // object streams). If the rebuilt file is larger, keep the original bytes.
    // This is a correctness safeguard until the writer has a compact rebuild
    // path for every PDF structure.
    const fallbackUsed = compressedSize > originalSize;
    if (fallbackUsed) {
      compressedBytes = originalBytes;
      compressedSize = originalSize;
    }

    let finalObjectCount = 0;
    try {
      const reloaded = PdfDocument.load(compressedBytes);
      const xref = reloaded.getXRefTable();
      if (xref && typeof xref.getEntries === 'function') finalObjectCount = xref.getEntries().length;
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
      grew: rebuiltSize > originalSize,
      rebuiltSize,
      fallbackUsed,
      pageCount,
      objectsPurged,
      durationMs: Math.max(1, Math.round(endTime - startTime)),
      level,
      streams: streamStats,
      images: imageStats
    };
  }

  static #compressStreams(doc, stats) {
    const xref = doc.getXRefTable();
    if (!xref || typeof xref.getEntries !== 'function') return;

    for (const entry of xref.getEntries()) {
      const objectNumber = entry.objectNumber;
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


  static #optimizeImages(doc, stats, quality) {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;

    const xref = doc.getXRefTable();
    if (!xref || typeof xref.getEntries !== 'function') return;

    for (const entry of xref.getEntries()) {
      if (!entry || (entry.isFree && entry.isFree()) || (entry.isCompressed && entry.isCompressed())) continue;

      let object;
      try {
        object = doc.resolveObject(entry.objectNumber, entry.generationNumber || 0);
      } catch (_) {
        continue;
      }

      if (!(object instanceof PdfStream)) continue;
      const dict = object.dictionary;
      if (dict.getName('Subtype') !== 'Image') continue;

      stats.scanned++;

      if (dict.has('SMask') || dict.has('Mask') || PdfCompressor.#filterNames(dict.get('Filter')).includes('DCTDecode')) {
        stats.skipped++;
        continue;
      }

      const width = dict.getNumber('Width');
      const height = dict.getNumber('Height');
      if (!width || !height || width < 1 || height < 1) {
        stats.skipped++;
        continue;
      }

      try {
        const colorSpace = PdfColorSpace.parseColorSpace(dict.get('ColorSpace'), doc);
        const bits = dict.getNumber('BitsPerComponent') || 8;
        const decode = PdfCompressor.#parseDecodeArray(dict.get('Decode'));
        const decoded = PdfStreamDecoder.decode(object);
        const rgba = PdfColorSpace.toRgba(decoded, width, height, colorSpace, bits, decode, null);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          stats.skipped++;
          continue;
        }

        const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height);
        ctx.putImageData(imageData, 0, 0);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const comma = dataUrl.indexOf(',');
        if (comma < 0) {
          stats.skipped++;
          continue;
        }

        const binary = atob(dataUrl.slice(comma + 1));
        const jpegBytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) jpegBytes[i] = binary.charCodeAt(i);

        const oldLength = object.bytes.length;
        if (jpegBytes.length >= oldLength) {
          stats.skipped++;
          continue;
        }

        object.setBytes(jpegBytes);
        dict.set('Width', PdfNumber.of(width));
        dict.set('Height', PdfNumber.of(height));
        dict.set('ColorSpace', PdfName.of('DeviceRGB'));
        dict.set('BitsPerComponent', PdfNumber.of(8));
        dict.set('Filter', PdfName.of('DCTDecode'));
        dict.delete('Decode');
        dict.delete('DecodeParms');

        stats.optimized++;
        stats.bytesSaved += oldLength - jpegBytes.length;
      } catch (_) {
        stats.skipped++;
      }
    }
  }

  static #parseDecodeArray(value) {
    if (!value || !(value.isArray && value.isArray())) return null;
    return value.asArray ? value.asArray().map(item => item.value) : null;
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
