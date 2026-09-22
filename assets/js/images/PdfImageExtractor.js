import { PdfContentParser } from '../content/PdfContentParser.js';
import { PdfGraphicsState } from '../content/PdfGraphicsState.js';
import { PdfImage } from './PdfImage.js';
import { PdfColorSpace } from './PdfColorSpace.js';
import { PdfPage, pageExtractionHelper } from '../document/PdfPage.js';
import { PdfDocument } from '../document/PdfDocument.js';
import { PdfStream } from '../objects/PdfStream.js';
import { PdfStreamDecoder } from '../streams/PdfStreamDecoder.js';
import { PdfName } from '../objects/PdfName.js';
import { PdfArray } from '../objects/PdfArray.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Extracts embedded XObject and inline images from PDF pages and documents.
 */
export class PdfImageExtractor {
  /**
   * Extracts all images drawn on a page during content stream execution,
   * including exact page coordinates, dimensions, and color data.
   * 
   * @param {PdfPage} page
   * @returns {Array<PdfImage>}
   */
  static extractImages(page) {
    if (!(page instanceof PdfPage)) {
      throw new PdfInvalidArgumentException('page', page, 'PdfPage');
    }

    const contentStreams = page.getContents();
    if (!contentStreams || contentStreams.length === 0) {
      return [];
    }

    const operators = PdfContentParser.parse(contentStreams);
    const resources = page.getResources();
    const doc = page.document;

    let gstate = new PdfGraphicsState();
    const gstateStack = [];
    const images = [];
    let inlineCount = 0;

    for (const op of operators) {
      switch (op.name) {
        case 'q':
          gstateStack.push(gstate.clone());
          break;

        case 'Q':
          if (gstateStack.length > 0) {
            gstate = gstateStack.pop();
          }
          break;

        case 'cm':
          gstate.transform(
            op.getNumber(0), op.getNumber(1),
            op.getNumber(2), op.getNumber(3),
            op.getNumber(4), op.getNumber(5)
          );
          break;

        case 'Do': {
          const xobjName = op.getName(0);
          const xobj = resources.getXObject(xobjName);
          if (xobj && xobj.isStream && xobj.isStream()) {
            const dict = xobj.dictionary;
            const subtype = dict.getName('Subtype');
            if (subtype === 'Image') {
              const pos = PdfImageExtractor.#computePositionFromCtm(gstate.ctm);
              const img = PdfImageExtractor.#buildImageFromStream(xobj, xobjName, doc, pos, false);
              if (img) {
                images.push(img);
              }
            }
          }
          break;
        }

        case 'BI': {
          // Inline Image
          inlineCount++;
          const dict = op.args[0];
          const rawBytes = op.args[1];
          const pos = PdfImageExtractor.#computePositionFromCtm(gstate.ctm);
          const img = PdfImageExtractor.#buildInlineImage(dict, rawBytes, `inline_img_${inlineCount}`, doc, pos);
          if (img) {
            images.push(img);
          }
          break;
        }

        default:
          break;
      }
    }

    return images;
  }

  /**
   * Extracts all XObject images declared in the page's resources dictionary,
   * regardless of whether they were called by 'Do'.
   * 
   * @param {PdfPage} page
   * @returns {Array<PdfImage>}
   */
  static extractResourceImages(page) {
    if (!(page instanceof PdfPage)) {
      throw new PdfInvalidArgumentException('page', page, 'PdfPage');
    }

    const resources = page.getResources();
    const doc = page.document;
    const xobjDict = resources.getXObjects();
    if (!xobjDict || !xobjDict.isDictionary()) {
      return [];
    }

    const images = [];
    for (const [name, objRef] of xobjDict.entries()) {
      const xobj = doc ? doc.resolve(objRef) : objRef;
      if (xobj && xobj.isStream && xobj.isStream()) {
        const subtype = xobj.dictionary.getName('Subtype');
        if (subtype === 'Image') {
          const img = PdfImageExtractor.#buildImageFromStream(xobj, name, doc, null, false);
          if (img) {
            images.push(img);
          }
        }
      }
    }

    return images;
  }

  /**
   * Extracts all images from all pages across the entire document.
   * 
   * @param {PdfDocument} document
   * @returns {Array<{ pageNumber: number, image: PdfImage }>}
   */
  static extractAllImages(document) {
    if (!(document instanceof PdfDocument)) {
      throw new PdfInvalidArgumentException('document', document, 'PdfDocument');
    }

    const pages = document.getCatalog().getPageTree().getAllPages();
    const results = [];

    for (let i = 0; i < pages.length; i++) {
      const pageImages = PdfImageExtractor.extractImages(pages[i]);
      for (const img of pageImages) {
        results.push({
          pageNumber: i + 1,
          image: img
        });
      }
    }

    return results;
  }

  /**
   * Builds a PdfImage from an Image XObject stream.
   * @private
   */
  static #buildImageFromStream(stream, name, doc, position, isInline) {
    const dict = stream.dictionary;
    const width = dict.getNumber('Width');
    const height = dict.getNumber('Height');
    if (!width || !height) {
      return null;
    }

    const csObj = dict.get('ColorSpace');
    const colorSpace = PdfColorSpace.parseColorSpace(csObj, doc);
    const bitsPerComponent = dict.getNumber('BitsPerComponent') || 8;

    // Determine format & bytes
    const filterObj = dict.get('Filter');
    let format = 'raw';
    let bytes;

    const isJpeg = PdfImageExtractor.#isJpegFilter(filterObj);
    if (isJpeg) {
      format = 'jpeg';
      bytes = stream.bytes; // Raw JPEG pass-through
    } else {
      bytes = PdfStreamDecoder.decode(stream);
    }

    // Decode array (for inverting color components or 1-bit masks)
    const decodeArray = PdfImageExtractor.#parseDecodeArray(dict.get('Decode'), doc);

    // Soft Mask (SMask)
    let smask = null;
    const smaskObj = dict.get('SMask');
    if (smaskObj) {
      const resolvedSmask = doc ? doc.resolve(smaskObj) : smaskObj;
      if (resolvedSmask && resolvedSmask.isStream && resolvedSmask.isStream()) {
        smask = PdfImageExtractor.#buildImageFromStream(resolvedSmask, `${name}_smask`, doc, null, false);
      }
    }

    return new PdfImage({
      name,
      width,
      height,
      colorSpace,
      bitsPerComponent,
      bytes,
      format,
      decode: decodeArray,
      smask,
      isInline,
      position
    });
  }

  /**
   * Builds a PdfImage from an inline image dictionary and byte payload.
   * @private
   */
  static #buildInlineImage(dict, rawBytes, name, doc, position) {
    const width = dict.getNumber('Width') || dict.getNumber('W');
    const height = dict.getNumber('Height') || dict.getNumber('H');
    if (!width || !height) {
      return null;
    }

    const csObj = dict.get('ColorSpace') || dict.get('CS');
    const colorSpace = PdfColorSpace.parseColorSpace(csObj, doc);
    const bitsPerComponent = dict.getNumber('BitsPerComponent') || dict.getNumber('BPC') || 8;

    const filterObj = dict.get('Filter') || dict.get('F');
    const decodeParms = dict.get('DecodeParms') || dict.get('DP');
    const decodeObj = dict.get('Decode') || dict.get('D');

    let format = 'raw';
    let bytes;

    const isJpeg = PdfImageExtractor.#isJpegFilter(filterObj);
    if (isJpeg) {
      format = 'jpeg';
      bytes = rawBytes;
    } else {
      bytes = PdfStreamDecoder.decode(rawBytes, filterObj, decodeParms);
    }

    const decodeArray = PdfImageExtractor.#parseDecodeArray(decodeObj, doc);

    return new PdfImage({
      name,
      width,
      height,
      colorSpace,
      bitsPerComponent,
      bytes,
      format,
      decode: decodeArray,
      smask: null,
      isInline: true,
      position
    });
  }

  /**
   * Calculates the image bounding box and matrix from Current Transformation Matrix (CTM).
   * In PDF, images are defined in the unit square [0, 0, 1, 1].
   * @private
   */
  static #computePositionFromCtm(ctm) {
    // 4 corners of unit square transformed by CTM
    // (x, y) * CTM: x' = x*a + y*c + e, y' = x*b + y*d + f
    const [a, b, c, d, e, f] = ctm;
    const x0 = e;
    const y0 = f;
    const x1 = a + e;
    const y1 = b + f;
    const x2 = c + e;
    const y2 = d + f;
    const x3 = a + c + e;
    const y3 = b + d + f;

    const minX = Math.min(x0, x1, x2, x3);
    const maxX = Math.max(x0, x1, x2, x3);
    const minY = Math.min(y0, y1, y2, y3);
    const maxY = Math.max(y0, y1, y2, y3);

    return {
      x: Math.round(minX * 100) / 100,
      y: Math.round(minY * 100) / 100,
      width: Math.round((maxX - minX) * 100) / 100,
      height: Math.round((maxY - minY) * 100) / 100,
      matrix: [...ctm]
    };
  }

  /**
   * Checks if filter specifies JPEG / DCTDecode.
   * @private
   */
  static #isJpegFilter(filterObj) {
    if (!filterObj) return false;
    if (filterObj instanceof PdfName) {
      return filterObj.value === 'DCTDecode' || filterObj.value === 'DCT';
    }
    if (typeof filterObj === 'string') {
      const clean = filterObj.replace(/^\//, '');
      return clean === 'DCTDecode' || clean === 'DCT';
    }
    if (filterObj instanceof PdfArray || Array.isArray(filterObj)) {
      const items = filterObj instanceof PdfArray ? filterObj.getItems() : filterObj;
      if (items.length === 1) {
        const item = items[0];
        const val = item instanceof PdfName ? item.value : String(item).replace(/^\//, '');
        return val === 'DCTDecode' || val === 'DCT';
      }
    }
    return false;
  }

  /**
   * Helper to parse /Decode array.
   * @private
   */
  static #parseDecodeArray(decodeObj, doc) {
    if (!decodeObj) return null;
    const resolved = doc ? doc.resolve(decodeObj) : decodeObj;
    if (resolved && (resolved.isArray && resolved.isArray())) {
      const nums = [];
      for (let i = 0; i < resolved.size(); i++) {
        nums.push(resolved.getNumber(i));
      }
      return nums;
    }
    if (Array.isArray(resolved)) {
      return resolved.map(n => Number(n));
    }
    return null;
  }
}

pageExtractionHelper.PdfImageExtractor = PdfImageExtractor;
