/**
 * PDF compressor built on the existing PDF engine.
 */
import { PdfDocument } from '../document/PdfDocument.js';
import { PdfCleaner } from './PdfCleaner.js';
import { PdfStream } from '../objects/PdfStream.js';
import { PdfArray } from '../objects/PdfArray.js';
import { PdfName } from '../objects/PdfName.js';
import { PdfNumber } from '../objects/PdfNumber.js';
import { PdfColorSpace } from '../images/PdfColorSpace.js';
import { PdfImageExtractor } from '../images/PdfImageExtractor.js';
import { PdfStreamDecoder } from '../streams/PdfStreamDecoder.js';
import { FlateEncode } from '../streams/filters/FlateEncode.js';
import { PdfWriter } from '../writer/PdfWriter.js';

export class PdfCompressor {
  static compress(docOrBytes, options = {}) {
    return this.compressWithReport(docOrBytes, options).bytes;
  }

  static compressWithReport(docOrBytes, options = {}) {
    const start = this.#now();
    const original = docOrBytes instanceof Uint8Array
      ? new Uint8Array(docOrBytes)
      : PdfDocument.load(docOrBytes).save();
    const doc = PdfDocument.load(original);
    const level = options.level || 'recommended';
    const report = this.#report(original.length, level, doc);

    try { report.images.discovered = PdfImageExtractor.extractAllImages(doc).length; } catch (_) {}

    const stripMetadata = options.stripMetadata !== undefined ? options.stripMetadata : level !== 'lossless';
    const stripAnnotations = options.stripAnnotations !== undefined ? options.stripAnnotations : level === 'extreme';
    if (stripMetadata || stripAnnotations) {
      PdfCleaner.clean(doc, { stripMetadata, stripAnnotations });
    }

    if (options.compressStreams !== false) this.#compressStreams(doc, report.streams);

    // The synchronous API can safely optimize decoded/raw images. JPEG/JPX
    // decoding is browser-asynchronous and is handled by compressWithReportAsync.
    if (options.optimizeImages !== false && level !== 'lossless') {
      this.#optimizeRawImages(doc, report.images, this.#quality(level, options));
    }

    const selected = this.#select(this.#candidates(doc, original), original, report.pageCount, report);
    return this.#finish(report, selected, original, start);
  }

  static async compressWithReportAsync(docOrBytes, options = {}) {
    const start = this.#now();
    const original = docOrBytes instanceof Uint8Array
      ? new Uint8Array(docOrBytes)
      : PdfDocument.load(docOrBytes).save();
    const doc = PdfDocument.load(original);
    const level = options.level || 'recommended';
    const report = this.#report(original.length, level, doc);

    try { report.images.discovered = PdfImageExtractor.extractAllImages(doc).length; } catch (_) {}

    const stripMetadata = options.stripMetadata !== undefined ? options.stripMetadata : level !== 'lossless';
    const stripAnnotations = options.stripAnnotations !== undefined ? options.stripAnnotations : level === 'extreme';
    if (stripMetadata || stripAnnotations) PdfCleaner.clean(doc, { stripMetadata, stripAnnotations });

    if (options.compressStreams !== false) await this.#compressStreamsAsync(doc, report.streams);

    if (options.optimizeImages !== false && level !== 'lossless') {
      await this.#optimizeImagesAsync(doc, report.images, {
        quality: this.#quality(level, options),
        maxDimension: options.maxImageDimension || (level === 'extreme' ? 1600 : 2400)
      });
    }

    const selected = this.#select(this.#candidates(doc, original), original, report.pageCount, report);
    return this.#finish(report, selected, original, start);
  }

  static #report(size, level, doc) {
    let objects = 0;
    try { objects = doc.getXRefTable().getEntries().length; } catch (_) {}
    return {
      bytes: null, originalSize: size, compressedSize: size, savedBytes: 0,
      ratioPercent: 0, reductionPercent: 0, grew: false, rebuiltSize: size,
      fallbackUsed: false, writerMode: 'original', pageCount: doc.getPageCount(),
      originalObjectCount: objects, finalObjectCount: objects, objectsPurged: 0,
      durationMs: 0, level,
      streams: { scanned: 0, compressed: 0, bytesSaved: 0, skipped: 0 },
      images: { discovered: 0, scanned: 0, optimized: 0, bytesSaved: 0, skipped: 0 },
      validationErrors: [],
      pageSnapshot: this.#capturePageSnapshot(doc),
      pageDetails: []
    };
  }

  static #compressStreams(doc, stats) {
    const xref = doc.getXRefTable();
    for (const entry of xref.getEntries()) {
      if (!entry || entry.isFree?.()) continue;
      let stream;
      try { stream = doc.resolveObject(entry.objectNumber, entry.generationNumber || 0); } catch (_) { continue; }
      if (!(stream instanceof PdfStream)) continue;
      stats.scanned++;
      const filters = this.#filters(stream.getFilter());
      if (stream.dictionary.getName('Subtype') === 'Image' &&
          filters.some(f => f === 'DCTDecode' || f === 'DCT' || f === 'JPXDecode')) {
        stats.skipped++;
        continue;
      }
      try {
        const raw = filters.length ? PdfStreamDecoder.decode(stream) : stream.bytes;
        const encoded = FlateEncode.encode(raw);
        if (encoded.length >= stream.bytes.length) { stats.skipped++; continue; }
        stats.bytesSaved += stream.bytes.length - encoded.length;
        stats.compressed++;
        stream.setBytes(encoded);
        stream.dictionary.set('Filter', PdfName.of('FlateDecode'));
        stream.dictionary.delete('DecodeParms');
      } catch (_) { stats.skipped++; }
    }
  }

  static async #compressStreamsAsync(doc, stats) {
    const xref = doc.getXRefTable();
    for (const entry of xref.getEntries()) {
      if (!entry || entry.isFree?.()) continue;
      let stream;
      try { stream = doc.resolveObject(entry.objectNumber, entry.generationNumber || 0); } catch (_) { continue; }
      if (!(stream instanceof PdfStream)) continue;
      stats.scanned++;
      const filters = this.#filters(stream.getFilter());
      if (stream.dictionary.getName('Subtype') === 'Image' &&
          filters.some(f => f === 'DCTDecode' || f === 'DCT' || f === 'JPXDecode')) {
        stats.skipped++;
        continue;
      }
      try {
        const raw = filters.length ? PdfStreamDecoder.decode(stream) : stream.bytes;
        const encoded = await this.#deflate(raw);
        if (encoded.length >= stream.bytes.length) { stats.skipped++; continue; }
        stats.bytesSaved += stream.bytes.length - encoded.length;
        stats.compressed++;
        stream.setBytes(encoded);
        stream.dictionary.set('Filter', PdfName.of('FlateDecode'));
        stream.dictionary.delete('DecodeParms');
      } catch (_) { stats.skipped++; }
    }
  }

  static async #deflate(bytes) {
    // Use the engine's browser-safe Flate encoder for deterministic completion.
    // CompressionStream is intentionally not used here because browser stream
    // implementations can remain pending on large PDF streams.
    return FlateEncode.encode(bytes);
  }

  static #optimizeRawImages(doc, stats, quality) {
    if (typeof document === 'undefined' || !document.createElement) return;
    const xref = doc.getXRefTable();
    for (const entry of xref.getEntries()) {
      if (!entry || entry.isFree?.()) continue;
      let image;
      try { image = doc.resolveObject(entry.objectNumber, entry.generationNumber || 0); } catch (_) { continue; }
      if (!(image instanceof PdfStream) || image.dictionary.getName('Subtype') !== 'Image') continue;
      stats.scanned++;
      const filters = this.#filters(image.getFilter());
      if (filters.some(f => f === 'DCTDecode' || f === 'DCT' || f === 'JPXDecode') ||
          image.dictionary.has('Mask') || image.dictionary.has('SMask')) {
        stats.skipped++;
        continue;
      }
      try {
        const width = image.dictionary.getNumber('Width');
        const height = image.dictionary.getNumber('Height');
        const cs = PdfColorSpace.parseColorSpace(image.dictionary.get('ColorSpace'), doc);
        const bits = image.dictionary.getNumber('BitsPerComponent') || 8;
        const decode = this.#decodeArray(image.dictionary.get('Decode'));
        const raw = PdfStreamDecoder.decode(image);
        const rgba = PdfColorSpace.toRgba(raw, width, height, cs, bits, decode, null);
        const jpeg = this.#canvasJpeg(rgba, width, height, quality);
        if (!jpeg || jpeg.length >= image.bytes.length) { stats.skipped++; continue; }
        const saved = image.bytes.length - jpeg.length;
        image.setBytes(jpeg);
        image.dictionary.set('Filter', PdfName.of('DCTDecode'));
        image.dictionary.set('ColorSpace', PdfName.of('DeviceRGB'));
        image.dictionary.set('BitsPerComponent', PdfNumber.of(8));
        image.dictionary.delete('Decode');
        image.dictionary.delete('DecodeParms');
        stats.optimized++;
        stats.bytesSaved += saved;
      } catch (_) { stats.skipped++; }
    }
  }

  static async #optimizeImagesAsync(doc, stats, options) {
    if (typeof document === 'undefined' || !document.createElement || typeof createImageBitmap !== 'function') return;
    const xref = doc.getXRefTable();
    for (const entry of xref.getEntries()) {
      if (!entry || entry.isFree?.()) continue;
      let image;
      try { image = doc.resolveObject(entry.objectNumber, entry.generationNumber || 0); } catch (_) { continue; }
      if (!(image instanceof PdfStream) || image.dictionary.getName('Subtype') !== 'Image') continue;
      stats.scanned++;
      const filters = this.#filters(image.getFilter());
      if (image.dictionary.has('Mask') || image.dictionary.has('SMask')) { stats.skipped++; continue; }
      if (filters.length === 1 && filters[0] === 'JPXDecode') { stats.skipped++; continue; }
      try {
        const width = image.dictionary.getNumber('Width');
        const height = image.dictionary.getNumber('Height');
        let rgba;
        if (filters.length === 1 && (filters[0] === 'DCTDecode' || filters[0] === 'DCT')) {
          rgba = await this.#jpegRgba(image.bytes, width, height);
        } else {
          const cs = PdfColorSpace.parseColorSpace(image.dictionary.get('ColorSpace'), doc);
          const bits = image.dictionary.getNumber('BitsPerComponent') || 8;
          const decode = this.#decodeArray(image.dictionary.get('Decode'));
          rgba = PdfColorSpace.toRgba(PdfStreamDecoder.decode(image), width, height, cs, bits, decode, null);
        }
        const scaled = this.#downsample(rgba, width, height, options.maxDimension);
        const jpeg = this.#canvasJpeg(scaled.rgba, scaled.width, scaled.height, options.quality);
        if (!jpeg || jpeg.length >= image.bytes.length) { stats.skipped++; continue; }
        const saved = image.bytes.length - jpeg.length;
        image.setBytes(jpeg);
        image.dictionary.set('Width', PdfNumber.of(scaled.width));
        image.dictionary.set('Height', PdfNumber.of(scaled.height));
        image.dictionary.set('ColorSpace', PdfName.of('DeviceRGB'));
        image.dictionary.set('BitsPerComponent', PdfNumber.of(8));
        image.dictionary.set('Filter', PdfName.of('DCTDecode'));
        image.dictionary.delete('Decode');
        image.dictionary.delete('DecodeParms');
        stats.optimized++;
        stats.bytesSaved += saved;
      } catch (_) { stats.skipped++; }
    }
  }

  static async #jpegRgba(bytes, width, height) {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, width, height);
    const rgba = new Uint8Array(ctx.getImageData(0, 0, width, height).data);
    bitmap.close();
    return rgba;
  }

  static #canvasJpeg(rgba, width, height, quality) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
    const url = canvas.toDataURL('image/jpeg', quality);
    const comma = url.indexOf(',');
    if (comma < 0) return null;
    const bin = atob(url.slice(comma + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  static #downsample(rgba, width, height, maxDimension) {
    if (!maxDimension || Math.max(width, height) <= maxDimension) return { rgba, width, height };
    const scale = maxDimension / Math.max(width, height);
    const nw = Math.max(1, Math.round(width * scale));
    const nh = Math.max(1, Math.round(height * scale));
    const src = document.createElement('canvas');
    const dst = document.createElement('canvas');
    src.width = width; src.height = height; dst.width = nw; dst.height = nh;
    src.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
    const ctx = dst.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0, nw, nh);
    return { rgba: new Uint8Array(ctx.getImageData(0, 0, nw, nh).data), width: nw, height: nh };
  }

  static #candidates(doc, original) {
    const out = [];
    try { out.push({ bytes: PdfWriter.write(doc), mode: 'standard' }); } catch (_) {}
    try { out.push({ bytes: PdfWriter.write(doc, { compact: true }), mode: 'compact' }); } catch (_) {}
    return out;
  }

  static #select(candidates, original, pageCount, report = null) {
    const valid = [];
    for (const candidate of candidates) {
      try {
        const loaded = PdfDocument.load(candidate.bytes);
        const actualPages = loaded.getPageCount();
        if (actualPages !== pageCount) {
          if (report) {
            report.validationErrors.push({
              mode: candidate.mode,
              error: `Page count changed: expected ${pageCount}, got ${actualPages}`
            });
          }
          continue;
        }
        loaded.getCatalog().getPageTree().getAllPages();
        valid.push(candidate);
      } catch (error) {
        if (report) {
          report.validationErrors.push({
            mode: candidate.mode,
            error: error?.stack || error?.message || String(error)
          });
        }
      }
    }
    valid.sort((a, b) => a.bytes.length - b.bytes.length);
    return valid[0] || { bytes: original, mode: 'original' };
  }

  static #finish(report, selected, original, start) {
    report.bytes = selected.bytes;
    report.compressedSize = selected.bytes.length;
    report.writerMode = selected.mode;
    report.fallbackUsed = selected.bytes === original;
    report.rebuiltSize = report.compressedSize;
    try {
      const finalDoc = PdfDocument.load(selected.bytes);
      report.finalObjectCount = finalDoc.getXRefTable().getEntries().length;
      report.pageDetails = this.#comparePageSnapshots(report.pageSnapshot, finalDoc);
    } catch (_) {}
    report.objectsPurged = Math.max(0, report.originalObjectCount - report.finalObjectCount);
    report.savedBytes = report.originalSize - report.compressedSize;
    report.ratioPercent = report.originalSize ? Number(((report.savedBytes / report.originalSize) * 100).toFixed(1)) : 0;
    report.reductionPercent = Math.max(0, report.ratioPercent);
    report.grew = report.compressedSize > report.originalSize;
    report.durationMs = Math.max(1, Math.round(this.#now() - start));
    return report;
  }

  static #capturePageSnapshot(doc) {
    const pages = doc.getCatalog().getPageTree().getAllPages();
    return pages.map((page, index) => {
      let contentBytes = 0;
      try {
        for (const stream of page.getContents()) {
          if (stream instanceof PdfStream) contentBytes += stream.bytes.length;
        }
      } catch (_) {}

      let imageBytes = 0;
      let imageCount = 0;
      try {
        const images = PdfImageExtractor.extractImages(page);
        imageCount = images.length;
        for (const image of images) imageBytes += image?.bytes?.length || 0;
      } catch (_) {}

      return { pageNumber: index + 1, contentBytes, imageBytes, imageCount };
    });
  }

  static #comparePageSnapshots(before, doc) {
    const after = this.#capturePageSnapshot(doc);
    return after.map((page, index) => {
      const prior = before[index] || {
        pageNumber: page.pageNumber,
        contentBytes: 0,
        imageBytes: 0,
        imageCount: 0
      };
      const contentSaved = Math.max(0, prior.contentBytes - page.contentBytes);
      const imageSaved = Math.max(0, prior.imageBytes - page.imageBytes);
      const changes = [];
      if (contentSaved > 0) changes.push({
        type: 'content',
        label: 'Page content',
        savedBytes: contentSaved
      });
      if (imageSaved > 0) changes.push({
        type: 'images',
        label: page.imageCount === 1 ? 'Image data' : 'Images',
        savedBytes: imageSaved
      });
      return {
        pageNumber: page.pageNumber,
        imageCount: page.imageCount,
        contentSavedBytes: contentSaved,
        imageSavedBytes: imageSaved,
        savedBytes: contentSaved + imageSaved,
        changes
      };
    }).filter(page => page.savedBytes > 0 || page.imageCount > 0);
  }

  static #filters(filter) {
    if (!filter) return [];
    if (filter.isName?.()) return [filter.value];
    if (filter instanceof PdfArray) return filter.asArray().filter(x => x?.isName?.()).map(x => x.value);
    return [];
  }

  static #decodeArray(value) {
    if (!value?.isArray?.()) return null;
    const out = [];
    for (let i = 0; i < value.size(); i++) out.push(value.getNumber(i));
    return out;
  }

  static #quality(level, options) {
    if (options.imageQuality !== undefined) return Math.max(0.1, Math.min(1, Number(options.imageQuality)));
    return level === 'extreme' ? 0.6 : 0.75;
  }

  static #now() {
    return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  }
}