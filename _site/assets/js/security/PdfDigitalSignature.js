import { Sha256 } from './crypto/Sha256.js';
import { Md5 } from './crypto/Md5.js';
import { PdfDictionary } from '../objects/PdfDictionary.js';
import { PdfName } from '../objects/PdfName.js';
import { PdfString } from '../objects/PdfString.js';
import { PdfHexString } from '../objects/PdfHexString.js';

import { PdfArray } from '../objects/PdfArray.js';
import { PdfNumber } from '../objects/PdfNumber.js';

/**
 * Digital signature dictionary and byte-range calculator per ISO 32000-1 Section 12.8.
 */
export class PdfDigitalSignature {
  /** @type {string} */
  #reason;

  /** @type {string} */
  #location;

  /** @type {string} */
  #contactInfo;

  /** @type {string} */
  #subFilter;

  /** @type {string} */
  #signerName;

  /** @type {Date} */
  #date;

  /** @type {number} */
  #placeholderLength;

  /**
   * @param {Object} [options={}]
   * @param {string} [options.reason='']
   * @param {string} [options.location='']
   * @param {string} [options.contactInfo='']
   * @param {string} [options.signerName='']
   * @param {string} [options.subFilter='adbe.pkcs7.detached']
   * @param {Date} [options.date]
   * @param {number} [options.placeholderLength=8192] - Byte size of PKCS#7 container placeholder
   */
  constructor(options = {}) {
    this.#reason = options.reason || '';
    this.#location = options.location || '';
    this.#contactInfo = options.contactInfo || '';
    this.#signerName = options.signerName || '';
    this.#subFilter = options.subFilter || 'adbe.pkcs7.detached';
    this.#date = options.date instanceof Date ? options.date : new Date();
    this.#placeholderLength = typeof options.placeholderLength === 'number' ? options.placeholderLength : 8192;
  }

  get reason() { return this.#reason; }
  get location() { return this.#location; }
  get contactInfo() { return this.#contactInfo; }
  get signerName() { return this.#signerName; }
  get subFilter() { return this.#subFilter; }
  get date() { return this.#date; }
  get placeholderLength() { return this.#placeholderLength; }

  /**
   * Formats a JS Date to PDF Date string format: D:YYYYMMDDHHmmSSOHH'mm'
   * @param {Date} date
   * @returns {string}
   */
  static formatPdfDate(date) {
    const pad = (n) => String(n).padStart(2, '0');
    const y = date.getUTCFullYear();
    const m = pad(date.getUTCMonth() + 1);
    const d = pad(date.getUTCDate());
    const h = pad(date.getUTCHours());
    const min = pad(date.getUTCMinutes());
    const s = pad(date.getUTCSeconds());
    return `D:${y}${m}${d}${h}${min}${s}Z`;
  }

  /**
   * Creates a PDF Signature Dictionary (/Type /Sig).
   * 
   * @returns {PdfDictionary}
   */
  toDictionary() {
    const dict = new PdfDictionary();
    dict.set('Type', PdfName.of('Sig'));
    dict.set('Filter', PdfName.of('Adobe.PPKLite'));
    dict.set('SubFilter', PdfName.of(this.#subFilter));
    dict.set('M', PdfString.of(PdfDigitalSignature.formatPdfDate(this.#date)));

    if (this.#signerName) {
      dict.set('Name', PdfString.of(this.#signerName));
    }
    if (this.#reason) {
      dict.set('Reason', PdfString.of(this.#reason));
    }
    if (this.#location) {
      dict.set('Location', PdfString.of(this.#location));
    }
    if (this.#contactInfo) {
      dict.set('ContactInfo', PdfString.of(this.#contactInfo));
    }

    // Allocate placeholder for /Contents hex string
    const placeholderBytes = new Uint8Array(this.#placeholderLength);
    dict.set('Contents', PdfHexString.of(placeholderBytes));

    // Allocate placeholder for /ByteRange [ 0, 0, 0, 0 ]
    dict.set('ByteRange', new PdfArray([
      PdfNumber.of(0),
      PdfNumber.of(0),
      PdfNumber.of(0),
      PdfNumber.of(0)
    ]));

    return dict;
  }

  /**
   * Calculates the 4 /ByteRange integers given the file length and placeholder position.
   * 
   * @param {number} totalFileLength
   * @param {number} contentsOffset - Byte offset where '<' of /Contents begins
   * @param {number} contentsLength - Byte length of the hex contents including '<' and '>'
   * @returns {[number, number, number, number]} [0, offset1, offset2, length2]
   */
  static calculateByteRange(totalFileLength, contentsOffset, contentsLength) {
    const part1Start = 0;
    const part1Len = contentsOffset;
    const part2Start = contentsOffset + contentsLength;
    const part2Len = Math.max(0, totalFileLength - part2Start);

    return [part1Start, part1Len, part2Start, part2Len];
  }

  /**
   * Computes the cryptographic digest of the document ranges defined by /ByteRange.
   * 
   * @param {Uint8Array} fileBytes
   * @param {Array<number>} byteRange - [0, len1, offset2, len2]
   * @param {'SHA-256'|'MD5'} [algorithm='SHA-256']
   * @returns {Uint8Array}
   */
  static computeDigest(fileBytes, byteRange, algorithm = 'SHA-256') {
    const [part1Start, part1Len, part2Start, part2Len] = byteRange;
    const part1 = fileBytes.subarray(part1Start, part1Start + part1Len);
    const part2 = fileBytes.subarray(part2Start, part2Start + part2Len);

    const combined = new Uint8Array(part1.length + part2.length);
    combined.set(part1, 0);
    combined.set(part2, part1.length);

    if (algorithm === 'MD5') {
      return Md5.hash(combined);
    }
    return Sha256.hash(combined);
  }
}
