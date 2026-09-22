import { PdfBinaryReader } from '../core/PdfBinaryReader.js';
import { PdfLexer } from '../core/PdfLexer.js';
import { PdfTokenType } from '../core/PdfToken.js';
import { PdfStream } from '../objects/PdfStream.js';
import { PdfStreamDecoder } from '../streams/PdfStreamDecoder.js';

/**
 * Parses and executes /ToUnicode Character Maps (CMaps) for mapping glyph codes to Unicode.
 */
export class CMap {
  /** @type {Map<number, string>} */
  #map;

  constructor() {
    this.#map = new Map();
  }

  /**
   * Returns number of mapped codes.
   * @returns {number}
   */
  get size() {
    return this.#map.size;
  }

  /**
   * Adds a mapping from char/CID code to Unicode string.
   * @param {number} code
   * @param {string} unicodeStr
   */
  addMapping(code, unicodeStr) {
    this.#map.set(code, unicodeStr);
  }

  /**
   * Maps a character or CID code to its corresponding Unicode string.
   * @param {number} code
   * @returns {string|null}
   */
  mapCode(code) {
    return this.#map.get(code) || null;
  }

  /**
   * Checks if code has a mapping.
   * @param {number} code
   * @returns {boolean}
   */
  hasCode(code) {
    return this.#map.has(code);
  }

  /**
   * Decodes a byte sequence into a Unicode string.
   * 
   * @param {Uint8Array|string} bytesOrString
   * @param {boolean} [isTwoByte=false] - True for 16-bit CID fonts (Type0)
   * @returns {string}
   */
  decodeString(bytesOrString, isTwoByte = false) {
    let bytes;
    if (typeof bytesOrString === 'string') {
      bytes = new Uint8Array(bytesOrString.length);
      for (let i = 0; i < bytesOrString.length; i++) {
        bytes[i] = bytesOrString.charCodeAt(i) & 0xFF;
      }
    } else if (bytesOrString instanceof Uint8Array) {
      bytes = bytesOrString;
    } else {
      return '';
    }

    let result = '';

    if (isTwoByte) {
      for (let i = 0; i < bytes.length; i += 2) {
        if (i + 1 < bytes.length) {
          const code = (bytes[i] << 8) | bytes[i + 1];
          const mapped = this.mapCode(code);
          result += mapped !== null ? mapped : String.fromCharCode(code);
        }
      }
    } else {
      for (let i = 0; i < bytes.length; i++) {
        const code = bytes[i];
        const mapped = this.mapCode(code);
        result += mapped !== null ? mapped : String.fromCharCode(code);
      }
    }

    return result;
  }

  /**
   * Parses a CMap from a stream, byte buffer, or string.
   * 
   * @param {PdfStream|Uint8Array|string} source
   * @returns {CMap}
   */
  static parse(source) {
    const cmap = new CMap();
    if (!source) {
      return cmap;
    }

    let text;
    if (source instanceof PdfStream) {
      text = PdfStreamDecoder.decodeText(source);
    } else if (source instanceof Uint8Array) {
      text = new TextDecoder('utf-8').decode(source);
    } else if (typeof source === 'string') {
      text = source;
    } else {
      return cmap;
    }

    const reader = new PdfBinaryReader(new TextEncoder().encode(text).buffer);
    const lexer = new PdfLexer(reader);

    while (reader.hasRemaining()) {
      lexer.skipWhitespaceAndComments();
      const token = lexer.nextToken();
      if (!token) break;

      // beginbfchar
      if (token.isKeyword('beginbfchar')) {
        CMap.#parseBfChar(lexer, cmap);
      } else if (token.isKeyword('beginbfrange')) {
        CMap.#parseBfRange(lexer, cmap);
      }
    }

    return cmap;
  }

  /**
   * Parses beginbfchar ... endbfchar block.
   * @private
   */
  static #parseBfChar(lexer, cmap) {
    while (true) {
      lexer.skipWhitespaceAndComments();
      const peek = lexer.peekToken();
      if (!peek || peek.isKeyword('endbfchar')) {
        lexer.nextToken(); // consume endbfchar
        break;
      }

      const srcToken = lexer.nextToken();
      const dstToken = lexer.nextToken();
      if (!srcToken || !dstToken) break;

      const code = CMap.#hexTokenToNumber(srcToken);
      const unicodeStr = CMap.#hexTokenToUnicodeString(dstToken);
      if (code !== null && unicodeStr !== null) {
        cmap.addMapping(code, unicodeStr);
      }
    }
  }

  /**
   * Parses beginbfrange ... endbfrange block.
   * @private
   */
  static #parseBfRange(lexer, cmap) {
    while (true) {
      lexer.skipWhitespaceAndComments();
      const peek = lexer.peekToken();
      if (!peek || peek.isKeyword('endbfrange')) {
        lexer.nextToken(); // consume endbfrange
        break;
      }

      const startToken = lexer.nextToken();
      const endToken = lexer.nextToken();
      if (!startToken || !endToken) break;

      const startCode = CMap.#hexTokenToNumber(startToken);
      const endCode = CMap.#hexTokenToNumber(endToken);
      if (startCode === null || endCode === null) break;

      lexer.skipWhitespaceAndComments();
      const nextTok = lexer.peekToken();

      if (nextTok && nextTok.type === PdfTokenType.ARRAY_START) {
        // Range to array: <start> <end> [ <dst1> <dst2> ... ]
        lexer.nextToken(); // consume '['
        let curr = startCode;
        while (true) {
          lexer.skipWhitespaceAndComments();
          const arrPeek = lexer.peekToken();
          if (!arrPeek || arrPeek.type === PdfTokenType.ARRAY_END) {
            lexer.nextToken(); // consume ']'
            break;
          }
          const dstItem = lexer.nextToken();
          const uStr = CMap.#hexTokenToUnicodeString(dstItem);
          if (uStr !== null && curr <= endCode) {
            cmap.addMapping(curr++, uStr);
          }
        }
      } else {
        // Range to start character: <start> <end> <startDst>
        const dstToken = lexer.nextToken();
        const baseDstNumber = CMap.#hexTokenToNumber(dstToken);

        if (baseDstNumber !== null) {
          for (let code = startCode; code <= endCode; code++) {
            const charCode = baseDstNumber + (code - startCode);
            cmap.addMapping(code, String.fromCharCode(charCode));
          }
        }
      }
    }
  }

  /**
   * Converts a hex string token `<0041>` into an integer.
   * @private
   */
  static #hexTokenToNumber(token) {
    if (token.type === PdfTokenType.HEX_STRING) {
      const hex = token.raw.replace(/[<>]/g, '').trim();
      return parseInt(hex, 16);
    }
    if (token.type === PdfTokenType.INTEGER) {
      return token.value;
    }
    return null;
  }

  /**
   * Converts a hex string token `<00410042>` into a decoded Unicode string.
   * @private
   */
  static #hexTokenToUnicodeString(token) {
    if (token.type === PdfTokenType.HEX_STRING) {
      const hex = token.raw.replace(/[<>]/g, '').trim();
      let res = '';
      for (let i = 0; i < hex.length; i += 4) {
        if (i + 4 <= hex.length) {
          const cp = parseInt(hex.substring(i, i + 4), 16);
          res += String.fromCharCode(cp);
        } else {
          const cp = parseInt(hex.substring(i), 16);
          res += String.fromCharCode(cp);
        }
      }
      return res;
    }
    if (token.type === PdfTokenType.STRING) {
      return token.value;
    }
    return null;
  }
}
