import { PdfOutOfBoundsException } from '../errors/PdfOutOfBoundsException.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * PdfBinaryReader provides bounds-checked, high-performance binary reading operations
 * over an underlying ArrayBuffer / Uint8Array.
 * 
 * Designed in Java-like object-oriented style with full encapsulation and private state.
 */
export class PdfBinaryReader {
  /** @type {Uint8Array} */
  #bytes;

  /** @type {DataView} */
  #dataView;

  /** @type {number} */
  #position;

  /** @type {number} */
  #length;

  /** @type {number} */
  #byteOffset;

  /** @type {TextDecoder} */
  static #utf8Decoder = new TextDecoder('utf-8');

  /**
   * Constructs a new PdfBinaryReader.
   * 
   * @param {ArrayBuffer|Uint8Array|DataView} source - The binary data source.
   * @param {number} [byteOffset=0] - Optional offset within the source.
   * @param {number} [byteLength] - Optional length from the offset.
   * @throws {PdfInvalidArgumentException} if the source is invalid or parameters are malformed.
   */
  constructor(source, byteOffset = 0, byteLength = undefined) {
    if (!source) {
      throw new PdfInvalidArgumentException('source', source, 'ArrayBuffer, Uint8Array, or DataView');
    }

    if (typeof byteOffset !== 'number' || !Number.isInteger(byteOffset) || byteOffset < 0) {
      throw new PdfInvalidArgumentException('byteOffset', byteOffset, 'non-negative integer');
    }

    let rawBuffer;
    let actualOffset = 0;
    let actualLength = 0;

    if (source instanceof ArrayBuffer) {
      rawBuffer = source;
      actualOffset = byteOffset;
      actualLength = byteLength !== undefined ? byteLength : (rawBuffer.byteLength - actualOffset);
    } else if (ArrayBuffer.isView(source)) {
      rawBuffer = source.buffer;
      actualOffset = source.byteOffset + byteOffset;
      const maxAvailable = source.byteLength - byteOffset;
      actualLength = byteLength !== undefined ? byteLength : maxAvailable;
    } else {
      throw new PdfInvalidArgumentException('source', source, 'ArrayBuffer, Uint8Array, or DataView');
    }

    if (typeof actualLength !== 'number' || !Number.isInteger(actualLength) || actualLength < 0) {
      throw new PdfInvalidArgumentException('byteLength', byteLength, 'non-negative integer');
    }

    if (actualOffset < 0 || actualOffset > rawBuffer.byteLength) {
      throw new PdfOutOfBoundsException(actualOffset, rawBuffer.byteLength, 0, 'construct reader');
    }

    if (actualOffset + actualLength > rawBuffer.byteLength) {
      throw new PdfOutOfBoundsException(actualOffset, rawBuffer.byteLength, actualLength, 'construct reader');
    }

    this.#byteOffset = actualOffset;
    this.#length = actualLength;
    this.#position = 0;
    this.#bytes = new Uint8Array(rawBuffer, actualOffset, actualLength);
    this.#dataView = new DataView(rawBuffer, actualOffset, actualLength);
  }

  /**
   * Static factory method to create a PdfBinaryReader from supported inputs.
   * 
   * @param {ArrayBuffer|Uint8Array|DataView|Array<number>} data - Binary input
   * @returns {PdfBinaryReader}
   */
  static from(data) {
    if (data instanceof PdfBinaryReader) {
      return new PdfBinaryReader(data.#bytes.buffer, data.#byteOffset, data.#length);
    }
    if (Array.isArray(data)) {
      return new PdfBinaryReader(new Uint8Array(data).buffer);
    }
    return new PdfBinaryReader(data);
  }

  /**
   * Returns the current cursor byte position (0-indexed relative to reader start).
   * @returns {number}
   */
  position() {
    return this.#position;
  }

  /**
   * Returns the total length in bytes of the binary buffer.
   * @returns {number}
   */
  length() {
    return this.#length;
  }

  /**
   * Returns the number of unread bytes remaining in the buffer.
   * @returns {number}
   */
  remaining() {
    return this.#length - this.#position;
  }

  /**
   * Checks whether there are remaining unread bytes in the buffer.
   * @returns {boolean}
   */
  hasRemaining() {
    return this.#position < this.#length;
  }

  /**
   * Seeks to the specified absolute position in the buffer.
   * 
   * @param {number} position - Target position (0 <= position <= length).
   * @throws {PdfInvalidArgumentException} if position is not an integer.
   * @throws {PdfOutOfBoundsException} if position is outside [0, length].
   */
  seek(position) {
    if (typeof position !== 'number' || !Number.isInteger(position)) {
      throw new PdfInvalidArgumentException('position', position, 'integer position');
    }
    if (position < 0 || position > this.#length) {
      throw new PdfOutOfBoundsException(position, this.#length, 0, 'seek');
    }
    this.#position = position;
  }

  /**
   * Skips relative number of bytes from current position.
   * Positive length skips forward; negative length skips backward.
   * 
   * @param {number} length - Number of bytes to skip.
   * @throws {PdfInvalidArgumentException} if length is not an integer.
   * @throws {PdfOutOfBoundsException} if target position is outside [0, length].
   */
  skip(length) {
    if (typeof length !== 'number' || !Number.isInteger(length)) {
      throw new PdfInvalidArgumentException('length', length, 'integer skip distance');
    }
    const target = this.#position + length;
    if (target < 0 || target > this.#length) {
      throw new PdfOutOfBoundsException(target, this.#length, length, 'skip');
    }
    this.#position = target;
  }

  /**
   * Reads a single unsigned 8-bit byte (0 to 255) and advances the cursor by 1.
   * 
   * @returns {number}
   * @throws {PdfOutOfBoundsException} if cursor is at or beyond buffer end.
   */
  readByte() {
    this.#assertAvailable(1, 'readByte');
    const val = this.#bytes[this.#position];
    this.#position += 1;
    return val;
  }

  /**
   * Reads a single unsigned 8-bit integer (0 to 255) and advances the cursor by 1.
   * 
   * @returns {number}
   * @throws {PdfOutOfBoundsException} if cursor is at or beyond buffer end.
   */
  readUInt8() {
    return this.readByte();
  }

  /**
   * Reads a single signed 8-bit integer (-128 to 127) and advances the cursor by 1.
   * 
   * @returns {number}
   * @throws {PdfOutOfBoundsException} if cursor is at or beyond buffer end.
   */
  readInt8() {
    this.#assertAvailable(1, 'readInt8');
    const val = this.#dataView.getInt8(this.#position);
    this.#position += 1;
    return val;
  }

  /**
   * Reads a 16-bit unsigned integer (2 bytes) and advances the cursor by 2.
   * Default byte order is Big-Endian (PDF standard).
   * 
   * @param {boolean} [littleEndian=false] - Optional endianness flag
   * @returns {number}
   * @throws {PdfOutOfBoundsException} if fewer than 2 bytes remain.
   */
  readUInt16(littleEndian = false) {
    this.#assertAvailable(2, 'readUInt16');
    const val = this.#dataView.getUint16(this.#position, Boolean(littleEndian));
    this.#position += 2;
    return val;
  }

  /**
   * Reads a 16-bit signed integer (2 bytes) and advances the cursor by 2.
   * Default byte order is Big-Endian (PDF standard).
   * 
   * @param {boolean} [littleEndian=false] - Optional endianness flag
   * @returns {number}
   * @throws {PdfOutOfBoundsException} if fewer than 2 bytes remain.
   */
  readInt16(littleEndian = false) {
    this.#assertAvailable(2, 'readInt16');
    const val = this.#dataView.getInt16(this.#position, Boolean(littleEndian));
    this.#position += 2;
    return val;
  }

  /**
   * Reads a 32-bit unsigned integer (4 bytes) and advances the cursor by 4.
   * Default byte order is Big-Endian (PDF standard).
   * 
   * @param {boolean} [littleEndian=false] - Optional endianness flag
   * @returns {number}
   * @throws {PdfOutOfBoundsException} if fewer than 4 bytes remain.
   */
  readUInt32(littleEndian = false) {
    this.#assertAvailable(4, 'readUInt32');
    const val = this.#dataView.getUint32(this.#position, Boolean(littleEndian));
    this.#position += 4;
    return val;
  }

  /**
   * Reads a 32-bit signed integer (4 bytes) and advances the cursor by 4.
   * Default byte order is Big-Endian (PDF standard).
   * 
   * @param {boolean} [littleEndian=false] - Optional endianness flag
   * @returns {number}
   * @throws {PdfOutOfBoundsException} if fewer than 4 bytes remain.
   */
  readInt32(littleEndian = false) {
    this.#assertAvailable(4, 'readInt32');
    const val = this.#dataView.getInt32(this.#position, Boolean(littleEndian));
    this.#position += 4;
    return val;
  }

  /**
   * Reads a sequence of `length` bytes and advances the cursor.
   * Returns a copy as a new Uint8Array.
   * 
   * @param {number} length - Number of bytes to read.
   * @returns {Uint8Array}
   * @throws {PdfInvalidArgumentException} if length is not a valid non-negative integer.
   * @throws {PdfOutOfBoundsException} if requested bytes exceed remaining buffer.
   */
  readBytes(length) {
    if (typeof length !== 'number' || !Number.isInteger(length) || length < 0) {
      throw new PdfInvalidArgumentException('length', length, 'non-negative integer');
    }
    if (length === 0) {
      return new Uint8Array(0);
    }
    this.#assertAvailable(length, 'readBytes');
    const slice = this.#bytes.slice(this.#position, this.#position + length);
    this.#position += length;
    return slice;
  }

  /**
   * Reads `length` bytes as an ASCII/Latin-1 string (1 byte = 1 character code).
   * 
   * @param {number} length - Number of characters/bytes to read.
   * @returns {string}
   * @throws {PdfInvalidArgumentException} if length is not a valid non-negative integer.
   * @throws {PdfOutOfBoundsException} if requested bytes exceed remaining buffer.
   */
  readAscii(length) {
    if (typeof length !== 'number' || !Number.isInteger(length) || length < 0) {
      throw new PdfInvalidArgumentException('length', length, 'non-negative integer');
    }
    if (length === 0) {
      return '';
    }
    this.#assertAvailable(length, 'readAscii');

    let result = '';
    const end = this.#position + length;
    for (let i = this.#position; i < end; i++) {
      result += String.fromCharCode(this.#bytes[i]);
    }
    this.#position = end;
    return result;
  }

  /**
   * Reads `length` bytes decoded as a string with the specified encoding (defaults to UTF-8).
   * 
   * @param {number} length - Number of bytes to read.
   * @param {string} [encoding='utf-8'] - Target string encoding.
   * @returns {string}
   * @throws {PdfInvalidArgumentException} if length is invalid.
   * @throws {PdfOutOfBoundsException} if requested bytes exceed remaining buffer.
   */
  readString(length, encoding = 'utf-8') {
    if (typeof length !== 'number' || !Number.isInteger(length) || length < 0) {
      throw new PdfInvalidArgumentException('length', length, 'non-negative integer');
    }
    if (length === 0) {
      return '';
    }
    this.#assertAvailable(length, 'readString');

    const byteSlice = this.#bytes.subarray(this.#position, this.#position + length);
    this.#position += length;

    if (encoding.toLowerCase() === 'utf-8' || encoding.toLowerCase() === 'utf8') {
      return PdfBinaryReader.#utf8Decoder.decode(byteSlice);
    }

    const decoder = new TextDecoder(encoding);
    return decoder.decode(byteSlice);
  }

  /**
   * Peeks at a single unsigned byte without advancing the cursor.
   * 
   * @param {number} [offset=0] - Offset relative to current position.
   * @returns {number}
   * @throws {PdfOutOfBoundsException} if target position is outside buffer bounds.
   */
  peekByte(offset = 0) {
    const target = this.#position + offset;
    if (target < 0 || target >= this.#length) {
      throw new PdfOutOfBoundsException(target, this.#length, 1, 'peekByte');
    }
    return this.#bytes[target];
  }

  /**
   * Peeks at `length` bytes without advancing the cursor.
   * 
   * @param {number} length - Number of bytes to peek.
   * @param {number} [offset=0] - Offset relative to current position.
   * @returns {Uint8Array}
   * @throws {PdfOutOfBoundsException} if target range exceeds buffer bounds.
   */
  peekBytes(length, offset = 0) {
    if (typeof length !== 'number' || !Number.isInteger(length) || length < 0) {
      throw new PdfInvalidArgumentException('length', length, 'non-negative integer');
    }
    if (length === 0) {
      return new Uint8Array(0);
    }
    const start = this.#position + offset;
    const end = start + length;
    if (start < 0 || end > this.#length) {
      throw new PdfOutOfBoundsException(start, this.#length, length, 'peekBytes');
    }
    return this.#bytes.slice(start, end);
  }

  /**
   * Creates a child sub-reader spanning a specific slice of the current reader.
   * 
   * @param {number} offset - Starting offset relative to current reader start.
   * @param {number} length - Length in bytes of the sub-reader.
   * @returns {PdfBinaryReader}
   */
  subReader(offset, length) {
    if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
      throw new PdfInvalidArgumentException('offset', offset, 'non-negative integer');
    }
    if (typeof length !== 'number' || !Number.isInteger(length) || length < 0) {
      throw new PdfInvalidArgumentException('length', length, 'non-negative integer');
    }
    if (offset + length > this.#length) {
      throw new PdfOutOfBoundsException(offset, this.#length, length, 'subReader');
    }
    return new PdfBinaryReader(this.#bytes.buffer, this.#byteOffset + offset, length);
  }

  /**
   * Returns a Uint8Array view of the entire buffer managed by this reader.
   * @returns {Uint8Array}
   */
  getBytes() {
    return this.#bytes;
  }

  /**
   * Searches forward for a sequence of bytes or ASCII string starting from `fromPosition`.
   * Does NOT advance the cursor position.
   * 
   * @param {Uint8Array|Array<number>|string} pattern - Pattern to find.
   * @param {number} [fromPosition] - Search start position (defaults to current position).
   * @param {number} [maxScanLength] - Maximum bytes to scan from fromPosition.
   * @returns {number} The absolute 0-indexed position where pattern begins, or -1 if not found.
   */
  indexOf(pattern, fromPosition = this.#position, maxScanLength = undefined) {
    let targetPattern;
    if (typeof pattern === 'string') {
      targetPattern = new Uint8Array(pattern.length);
      for (let i = 0; i < pattern.length; i++) {
        targetPattern[i] = pattern.charCodeAt(i) & 0xFF;
      }
    } else if (pattern instanceof Uint8Array) {
      targetPattern = pattern;
    } else if (Array.isArray(pattern)) {
      targetPattern = new Uint8Array(pattern);
    } else {
      throw new PdfInvalidArgumentException('pattern', pattern, 'string, Uint8Array, or Array of byte numbers');
    }

    if (targetPattern.length === 0) {
      return fromPosition;
    }

    const start = Math.max(0, fromPosition);
    const maxEnd = maxScanLength !== undefined
      ? Math.min(this.#length, start + maxScanLength)
      : this.#length;

    const limit = maxEnd - targetPattern.length;
    if (limit < start) {
      return -1;
    }

    const firstByte = targetPattern[0];
    const patternLen = targetPattern.length;

    for (let i = start; i <= limit; i++) {
      if (this.#bytes[i] === firstByte) {
        let match = true;
        for (let j = 1; j < patternLen; j++) {
          if (this.#bytes[i + j] !== targetPattern[j]) {
            match = false;
            break;
          }
        }
        if (match) {
          return i;
        }
      }
    }

    return -1;
  }

  /**
   * Searches backward for a sequence of bytes or ASCII string starting from `fromPosition`.
   * Does NOT advance the cursor position.
   * 
   * @param {Uint8Array|Array<number>|string} pattern - Pattern to find.
   * @param {number} [fromPosition] - Search start position (defaults to end of buffer).
   * @returns {number} The absolute 0-indexed position where pattern begins, or -1 if not found.
   */
  lastIndexOf(pattern, fromPosition = this.#length - 1) {
    let targetPattern;
    if (typeof pattern === 'string') {
      targetPattern = new Uint8Array(pattern.length);
      for (let i = 0; i < pattern.length; i++) {
        targetPattern[i] = pattern.charCodeAt(i) & 0xFF;
      }
    } else if (pattern instanceof Uint8Array) {
      targetPattern = pattern;
    } else if (Array.isArray(pattern)) {
      targetPattern = new Uint8Array(pattern);
    } else {
      throw new PdfInvalidArgumentException('pattern', pattern, 'string, Uint8Array, or Array of byte numbers');
    }

    if (targetPattern.length === 0) {
      return Math.min(fromPosition, this.#length);
    }

    const patternLen = targetPattern.length;
    const start = Math.min(fromPosition, this.#length - patternLen);
    const firstByte = targetPattern[0];

    for (let i = start; i >= 0; i--) {
      if (this.#bytes[i] === firstByte) {
        let match = true;
        for (let j = 1; j < patternLen; j++) {
          if (this.#bytes[i + j] !== targetPattern[j]) {
            match = false;
            break;
          }
        }
        if (match) {
          return i;
        }
      }
    }

    return -1;
  }

  /**
   * Resets position to 0.
   */
  reset() {
    this.#position = 0;
  }

  /**
   * Asserts that `count` bytes are available from current position.
   * 
   * @param {number} count - Number of required bytes.
   * @param {string} operation - Operation name for error context.
   * @private
   */
  #assertAvailable(count, operation) {
    if (this.#position + count > this.#length) {
      throw new PdfOutOfBoundsException(this.#position, this.#length, count, operation);
    }
  }
}
