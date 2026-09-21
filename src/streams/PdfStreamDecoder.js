import { PdfStream } from '../objects/PdfStream.js';
import { PdfArray } from '../objects/PdfArray.js';
import { PdfDictionary } from '../objects/PdfDictionary.js';
import { PdfName } from '../objects/PdfName.js';
import {
  ASCIIHexDecode,
  ASCII85Decode,
  RunLengthDecode,
  LZWDecode,
  FlateDecode,
  Predictor
} from './filters/index.js';
import { PdfStreamException } from '../errors/PdfStreamException.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Manages decoding pipelines for PDF streams with filter chains and predictor post-processing.
 */
export class PdfStreamDecoder {
  /**
   * Decompresses and decodes a PdfStream or raw bytes with filter specifications.
   * 
   * @param {PdfStream|Uint8Array} streamOrBytes
   * @param {string|PdfName|PdfArray} [filterSpec] - Optional filter name or array of filter names
   * @param {PdfDictionary|PdfArray|Object} [decodeParmsSpec] - Optional decode parameters
   * @returns {Uint8Array} - Fully decoded byte stream
   */
  static decode(streamOrBytes, filterSpec = undefined, decodeParmsSpec = undefined) {
    let data;
    let filters = [];
    let parmsList = [];

    if (streamOrBytes instanceof PdfStream) {
      data = streamOrBytes.bytes;
      const f = streamOrBytes.get('Filter');
      const p = streamOrBytes.get('DecodeParms');
      filters = PdfStreamDecoder.#normalizeFilters(filterSpec !== undefined ? filterSpec : f);
      parmsList = PdfStreamDecoder.#normalizeParams(decodeParmsSpec !== undefined ? decodeParmsSpec : p, filters.length);
    } else if (streamOrBytes instanceof Uint8Array) {
      data = streamOrBytes;
      filters = PdfStreamDecoder.#normalizeFilters(filterSpec);
      parmsList = PdfStreamDecoder.#normalizeParams(decodeParmsSpec, filters.length);
    } else {
      throw new PdfInvalidArgumentException('streamOrBytes', streamOrBytes, 'PdfStream or Uint8Array');
    }

    if (filters.length === 0) {
      return data;
    }

    let current = data;
    for (let i = 0; i < filters.length; i++) {
      const filterName = filters[i];
      const params = parmsList[i] || {};
      current = PdfStreamDecoder.#applyFilter(current, filterName, params);
    }

    return current;
  }

  /**
   * Decodes a PdfStream and converts output to a UTF-8 or ASCII string.
   * 
   * @param {PdfStream} stream
   * @param {string} [encoding='utf-8']
   * @returns {string}
   */
  static decodeText(stream, encoding = 'utf-8') {
    const bytes = PdfStreamDecoder.decode(stream);
    if (encoding.toLowerCase() === 'utf-8' || encoding.toLowerCase() === 'utf8') {
      return new TextDecoder('utf-8').decode(bytes);
    }
    const decoder = new TextDecoder(encoding);
    return decoder.decode(bytes);
  }

  /**
   * Applies a single filter by canonical name.
   * @private
   */
  static #applyFilter(data, filterName, params) {
    const canonical = PdfStreamDecoder.#canonicalFilterName(filterName);

    switch (canonical) {
      case 'FlateDecode': {
        const decoded = FlateDecode.decode(data);
        return Predictor.process(decoded, params);
      }

      case 'LZWDecode': {
        const decoded = LZWDecode.decode(data, params);
        return Predictor.process(decoded, params);
      }

      case 'ASCIIHexDecode':
        return ASCIIHexDecode.decode(data);

      case 'ASCII85Decode':
        return ASCII85Decode.decode(data);

      case 'RunLengthDecode':
        return RunLengthDecode.decode(data);

      case 'DCTDecode':
      case 'JPXDecode':
        // Image format pass-through (JPEG / JPEG 2000 native streams)
        return data;

      default:
        throw new PdfStreamException(`Unsupported filter '${filterName}'`, filterName);
    }
  }

  /**
   * Converts standard PDF filter abbreviation into canonical name.
   * @private
   */
  static #canonicalFilterName(name) {
    switch (name) {
      case 'Fl':
      case 'FlateDecode':
        return 'FlateDecode';
      case 'AHx':
      case 'ASCIIHexDecode':
        return 'ASCIIHexDecode';
      case 'A85':
      case 'ASCII85Decode':
        return 'ASCII85Decode';
      case 'RL':
      case 'RunLengthDecode':
        return 'RunLengthDecode';
      case 'LZW':
      case 'LZWDecode':
        return 'LZWDecode';
      case 'DCT':
      case 'DCTDecode':
        return 'DCTDecode';
      case 'JPXDecode':
        return 'JPXDecode';
      default:
        return name;
    }
  }

  /**
   * Normalizes filter specification into an array of string filter names.
   * @private
   */
  static #normalizeFilters(filterObj) {
    if (!filterObj) {
      return [];
    }
    if (typeof filterObj === 'string') {
      return [filterObj.startsWith('/') ? filterObj.substring(1) : filterObj];
    }
    if (filterObj instanceof PdfName) {
      return [filterObj.value];
    }
    if (filterObj instanceof PdfArray) {
      const list = [];
      for (const item of filterObj) {
        if (item instanceof PdfName) {
          list.push(item.value);
        } else if (typeof item === 'string') {
          list.push(item.startsWith('/') ? item.substring(1) : item);
        }
      }
      return list;
    }
    return [];
  }

  /**
   * Normalizes decode parameters into an array of plain JavaScript option objects.
   * @private
   */
  static #normalizeParams(parmsObj, filterCount) {
    if (!parmsObj) {
      return new Array(filterCount).fill({});
    }

    const dictToObj = (dict) => {
      if (!dict || !(dict instanceof PdfDictionary)) {
        return typeof dict === 'object' ? dict : {};
      }
      const obj = {};
      for (const [k, v] of dict.entries()) {
        if (v && v.isNumber && v.isNumber()) {
          obj[k] = v.value;
        } else if (v && v.isBoolean && v.isBoolean()) {
          obj[k] = v.value;
        } else if (v && v.isString && v.isString()) {
          obj[k] = v.value;
        } else if (v && v.isName && v.isName()) {
          obj[k] = v.value;
        }
      }
      return obj;
    };

    if (parmsObj instanceof PdfDictionary || (typeof parmsObj === 'object' && !Array.isArray(parmsObj) && !(parmsObj instanceof PdfArray))) {
      return [dictToObj(parmsObj)];
    }

    if (parmsObj instanceof PdfArray) {
      const list = [];
      for (const item of parmsObj) {
        list.push(dictToObj(item));
      }
      return list;
    }

    return new Array(filterCount).fill({});
  }
}
