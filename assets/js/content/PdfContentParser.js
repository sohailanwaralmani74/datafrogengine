import { PdfBinaryReader } from '../core/PdfBinaryReader.js';
import { PdfLexer } from '../core/PdfLexer.js';
import { PdfTokenType } from '../core/PdfToken.js';
import { PdfParser } from '../core/PdfParser.js';
import { PdfOperator } from './PdfOperator.js';
import { PdfStream } from '../objects/PdfStream.js';
import { PdfDictionary } from '../objects/PdfDictionary.js';
import { PdfName } from '../objects/PdfName.js';
import { PdfNumber } from '../objects/PdfNumber.js';
import { PdfStreamDecoder } from '../streams/PdfStreamDecoder.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Parses PDF graphics and text content streams into structured sequences of PdfOperators.
 */
export class PdfContentParser {
  /** @type {PdfBinaryReader} */
  #reader;

  /**
   * @param {PdfStream|Array<PdfStream>|Uint8Array|ArrayBuffer|string} source
   */
  constructor(source) {
    const rawBytes = PdfContentParser.#extractBytes(source);
    this.#reader = new PdfBinaryReader(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
  }

  /**
   * Static convenience parser.
   * 
   * @param {PdfStream|Array<PdfStream>|Uint8Array|ArrayBuffer|string} source
   * @returns {Array<PdfOperator>}
   */
  static parse(source) {
    const parser = new PdfContentParser(source);
    return parser.parse();
  }

  /**
   * Parses the content stream into an ordered list of PdfOperators.
   * 
   * @returns {Array<PdfOperator>}
   */
  parse() {
    const operators = [];
    const operandStack = [];
    const lexer = new PdfLexer(this.#reader);
    const parser = new PdfParser(lexer);

    while (this.#reader.hasRemaining()) {
      lexer.skipWhitespaceAndComments();
      const peek = lexer.peekToken();
      if (!peek) {
        break;
      }

      // Check for inline image start 'BI'
      if (peek.isKeyword('BI')) {
        lexer.nextToken(); // consume 'BI'
        const inlineOp = this.#parseInlineImage(lexer);
        operators.push(inlineOp);
        continue;
      }

      // Complex structures: Arrays '[' or Dictionaries '<<'
      if (peek.type === PdfTokenType.ARRAY_START) {
        const arr = parser.parseArray();
        operandStack.push(arr);
        continue;
      }

      if (peek.type === PdfTokenType.DICT_START) {
        const dict = parser.parseDictionary();
        operandStack.push(dict);
        continue;
      }

      // Primitive objects & operators
      const token = lexer.nextToken();
      if (!token) {
        break;
      }

      switch (token.type) {
        case PdfTokenType.INTEGER:
        case PdfTokenType.REAL:
          operandStack.push(token.value);
          break;

        case PdfTokenType.BOOLEAN:
        case PdfTokenType.NULL:
          operandStack.push(token.value);
          break;

        case PdfTokenType.NAME:
          operandStack.push(PdfName.of(token.value));
          break;

        case PdfTokenType.STRING:
        case PdfTokenType.HEX_STRING:
          operandStack.push(token.value);
          break;

        case PdfTokenType.KEYWORD:
        case PdfTokenType.OBJ:
        case PdfTokenType.ENDOBJ:
        case PdfTokenType.STREAM:
        case PdfTokenType.ENDSTREAM: {
          // It is an operator keyword (e.g. 'Tj', 'cm', 'm', 're', 'BT', 'ET', etc.)
          const operatorName = token.value;
          const operands = operandStack.splice(0, operandStack.length);
          operators.push(new PdfOperator(operatorName, operands));
          break;
        }

        default:
          break;
      }
    }

    return operators;
  }

  /**
   * Parses an inline image block: BI ... ID <bytes> EI.
   * @private
   */
  #parseInlineImage(lexer) {
    const dict = new PdfDictionary();

    // Parse inline image dictionary key-values until 'ID' keyword
    while (this.#reader.hasRemaining()) {
      lexer.skipWhitespaceAndComments();
      const peek = lexer.peekToken();
      if (!peek || peek.isKeyword('ID')) {
        lexer.nextToken(); // consume 'ID'
        break;
      }

      const keyToken = lexer.nextToken();
      if (!keyToken) break;
      const keyName = keyToken.type === PdfTokenType.NAME ? keyToken.value : keyToken.raw;

      lexer.skipWhitespaceAndComments();
      const valToken = lexer.nextToken();
      if (!valToken) break;

      if (valToken.type === PdfTokenType.INTEGER || valToken.type === PdfTokenType.REAL) {
        dict.set(keyName, PdfNumber.of(valToken.value));
      } else if (valToken.type === PdfTokenType.NAME) {
        dict.set(keyName, PdfName.of(valToken.value));
      } else {
        dict.set(keyName, PdfName.of(valToken.raw));
      }
    }

    // Skip the single whitespace character immediately after 'ID' (per PDF spec: SP, CR, LF, CRLF)
    if (this.#reader.hasRemaining()) {
      const b = this.#reader.peekByte();
      if (b === 0x20 || b === 0x0A) { // SP or LF
        this.#reader.readByte();
      } else if (b === 0x0D) { // CR or CRLF
        this.#reader.readByte();
        if (this.#reader.hasRemaining() && this.#reader.peekByte() === 0x0A) {
          this.#reader.readByte();
        }
      }
    }

    // Scan for 'EI' keyword delimiter (End Inline Image)
    const eiOffset = this.#findInlineImageEnd();
    let imageBytes;

    if (eiOffset !== -1) {
      const startPos = this.#reader.position();
      let byteLen = eiOffset - startPos;
      // Strip the whitespace delimiter immediately preceding EI
      if (byteLen > 0) {
        const lastByte = this.#reader.peekByte(byteLen - 1);
        if (lastByte === 0x0A) {
          byteLen--;
          if (byteLen > 0 && this.#reader.peekByte(byteLen - 1) === 0x0D) {
            byteLen--;
          }
        } else if (lastByte === 0x0D || lastByte === 0x20) {
          byteLen--;
        }
      }
      imageBytes = this.#reader.readBytes(byteLen);
      this.#reader.seek(eiOffset + 2); // skip 'EI'
    } else {
      imageBytes = this.#reader.readBytes(this.#reader.remaining());
    }

    return new PdfOperator('BI', [dict, imageBytes]);
  }

  /**
   * Scans forward for the 'EI' inline image delimiter.
   * @private
   */
  #findInlineImageEnd() {
    const reader = this.#reader;
    const len = reader.length();
    const start = reader.position();

    for (let i = start; i < len - 1; i++) {
      if (reader.peekByte(i - start) === 0x45 && reader.peekByte(i - start + 1) === 0x49) { // 'E' 'I'
        // Verify EI is preceded by whitespace and followed by whitespace or delimiter
        const prevByte = i > 0 ? reader.peekByte(i - start - 1) : 0x20;
        const nextByte = (i + 2 < len) ? reader.peekByte(i - start + 2) : 0x20;

        if (PdfLexer.isWhitespace(prevByte) && (PdfLexer.isWhitespace(nextByte) || PdfLexer.isDelimiter(nextByte))) {
          return i;
        }
      }
    }
    return -1;
  }

  /**
   * Helper to normalize any input into a Uint8Array.
   * @private
   */
  static #extractBytes(source) {
    if (source instanceof PdfStream) {
      return PdfStreamDecoder.decode(source);
    }
    if (Array.isArray(source)) {
      const chunks = source.map(item => PdfContentParser.#extractBytes(item));
      const totalLen = chunks.reduce((acc, c) => acc + c.length + 1, 0);
      const combined = new Uint8Array(totalLen);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
        combined[offset++] = 0x20; // Separator space
      }
      return combined;
    }
    if (source instanceof Uint8Array) {
      return source;
    }
    if (source instanceof ArrayBuffer) {
      return new Uint8Array(source);
    }
    if (typeof source === 'string') {
      return new TextEncoder().encode(source);
    }
    throw new PdfInvalidArgumentException('source', source, 'PdfStream, Array<PdfStream>, Uint8Array, or string');
  }
}
