import { PdfBinaryReader } from './PdfBinaryReader.js';
import { PdfToken, PdfTokenType } from './PdfToken.js';
import { PdfLexerException } from '../errors/PdfLexerException.js';
import { PdfInvalidArgumentException } from '../errors/PdfInvalidArgumentException.js';

/**
 * Character code constants for PDF lexical parsing.
 */
const CHAR_NUL = 0x00;
const CHAR_TAB = 0x09;
const CHAR_LF  = 0x0A;
const CHAR_FF  = 0x0C;
const CHAR_CR  = 0x0D;
const CHAR_SP  = 0x20;

const CHAR_LPAREN = 0x28; // (
const CHAR_RPAREN = 0x29; // )
const CHAR_LANGLE = 0x3C; // <
const CHAR_RANGLE = 0x3E; // >
const CHAR_LBRACK = 0x5B; // [
const CHAR_RBRACK = 0x5D; // ]
const CHAR_LBRACE = 0x7B; // {
const CHAR_RBRACE = 0x7D; // }
const CHAR_SLASH  = 0x2F; // /
const CHAR_PERCENT= 0x25; // %
const CHAR_BSLASH = 0x5C; // \
const CHAR_PLUS   = 0x2B; // +
const CHAR_MINUS  = 0x2D; // -
const CHAR_DOT    = 0x2E; // .

const CHAR_0 = 0x30;
const CHAR_9 = 0x39;
const CHAR_A = 0x41;
const CHAR_E = 0x45;
const CHAR_F = 0x46;
const CHAR_O = 0x4F;
const CHAR_a = 0x61;
const CHAR_f = 0x66;

/**
 * PdfLexer tokenizes raw binary PDF data according to ISO 32000-1 specification.
 */
export class PdfLexer {
  /** @type {PdfBinaryReader} */
  #reader;

  /**
   * @param {PdfBinaryReader} reader - Binary reader over PDF data
   */
  constructor(reader) {
    if (!(reader instanceof PdfBinaryReader)) {
      throw new PdfInvalidArgumentException('reader', reader, 'PdfBinaryReader instance');
    }
    this.#reader = reader;
  }

  /**
   * Returns the underlying binary reader.
   * @returns {PdfBinaryReader}
   */
  get reader() {
    return this.#reader;
  }

  /**
   * Returns current byte position in reader.
   * @returns {number}
   */
  position() {
    return this.#reader.position();
  }

  /**
   * Seeks to a specific position in reader.
   * @param {number} pos
   */
  seek(pos) {
    this.#reader.seek(pos);
  }

  /**
   * Returns true if character is a PDF whitespace (NUL, TAB, LF, FF, CR, SPACE).
   * @param {number} byte
   * @returns {boolean}
   */
  static isWhitespace(byte) {
    return byte === CHAR_NUL ||
           byte === CHAR_TAB ||
           byte === CHAR_LF  ||
           byte === CHAR_FF  ||
           byte === CHAR_CR  ||
           byte === CHAR_SP;
  }

  /**
   * Returns true if character is a PDF delimiter.
   * @param {number} byte
   * @returns {boolean}
   */
  static isDelimiter(byte) {
    return byte === CHAR_LPAREN ||
           byte === CHAR_RPAREN ||
           byte === CHAR_LANGLE ||
           byte === CHAR_RANGLE ||
           byte === CHAR_LBRACK ||
           byte === CHAR_RBRACK ||
           byte === CHAR_LBRACE ||
           byte === CHAR_RBRACE ||
           byte === CHAR_SLASH  ||
           byte === CHAR_PERCENT;
  }

  /**
   * Skips all whitespace and optionally comments.
   * 
   * @param {boolean} [skipComments=true] - Whether to skip comments as well
   */
  skipWhitespaceAndComments(skipComments = true) {
    while (this.#reader.hasRemaining()) {
      const byte = this.#reader.peekByte();

      if (PdfLexer.isWhitespace(byte)) {
        this.#reader.readByte();
        continue;
      }

      if (skipComments && byte === CHAR_PERCENT) {
        if (this.#isAtEofMarker()) {
          break; // Do not skip %%EOF marker
        }
        this.#skipComment();
        continue;
      }

      break;
    }
  }

  /**
   * Checks if cursor is at %%EOF marker.
   * @private
   */
  #isAtEofMarker() {
    if (this.#reader.remaining() >= 5) {
      return this.#reader.peekByte(0) === CHAR_PERCENT &&
             this.#reader.peekByte(1) === CHAR_PERCENT &&
             this.#reader.peekByte(2) === CHAR_E &&
             this.#reader.peekByte(3) === CHAR_O &&
             this.#reader.peekByte(4) === CHAR_F;
    }
    return false;
  }

  /**
   * Skips past the current comment line.
   * @private
   */
  #skipComment() {
    this.#reader.readByte(); // consume %
    while (this.#reader.hasRemaining()) {
      const b = this.#reader.readByte();
      if (b === CHAR_CR) {
        if (this.#reader.hasRemaining() && this.#reader.peekByte() === CHAR_LF) {
          this.#reader.readByte();
        }
        break;
      } else if (b === CHAR_LF) {
        break;
      }
    }
  }

  /**
   * Peeks the next token without advancing the lexer's position.
   * 
   * @param {boolean} [includeComments=false]
   * @returns {PdfToken|null}
   */
  peekToken(includeComments = false) {
    const savedPos = this.#reader.position();
    try {
      return this.nextToken(includeComments);
    } finally {
      this.#reader.seek(savedPos);
    }
  }

  /**
   * Reads and returns the next lexical token from the stream, or null if EOF.
   * 
   * @param {boolean} [includeComments=false] - If true, returns COMMENT tokens instead of skipping
   * @returns {PdfToken|null}
   * @throws {PdfLexerException}
   */
  nextToken(includeComments = false) {
    this.skipWhitespaceAndComments(!includeComments);

    if (!this.#reader.hasRemaining()) {
      return null;
    }

    const startOffset = this.#reader.position();
    const byte = this.#reader.peekByte();

    // Check for %%EOF
    if (this.#isAtEofMarker()) {
      this.#reader.skip(5);
      return new PdfToken(PdfTokenType.EOF, '%%EOF', '%%EOF', startOffset);
    }

    // Comment
    if (byte === CHAR_PERCENT) {
      return this.#readCommentToken(startOffset);
    }

    // String literal: (...)
    if (byte === CHAR_LPAREN) {
      return this.#readLiteralString(startOffset);
    }

    // Hex string or Dictionary start: < or <<
    if (byte === CHAR_LANGLE) {
      return this.#readAngleBracketToken(startOffset);
    }

    // Dictionary end: >>
    if (byte === CHAR_RANGLE) {
      return this.#readClosingAngleBracketToken(startOffset);
    }

    // Array start: [
    if (byte === CHAR_LBRACK) {
      this.#reader.readByte();
      return new PdfToken(PdfTokenType.ARRAY_START, '[', '[', startOffset);
    }

    // Array end: ]
    if (byte === CHAR_RBRACK) {
      this.#reader.readByte();
      return new PdfToken(PdfTokenType.ARRAY_END, ']', ']', startOffset);
    }

    // Name: /Name
    if (byte === CHAR_SLASH) {
      return this.#readNameToken(startOffset);
    }

    // Numbers or Keywords/Identifiers
    return this.#readWordOrNumberToken(startOffset);
  }

  /**
   * Reads a comment token.
   * @private
   */
  #readCommentToken(startOffset) {
    this.#reader.readByte(); // consume %
    let commentText = '';

    while (this.#reader.hasRemaining()) {
      const b = this.#reader.readByte();
      if (b === CHAR_CR) {
        if (this.#reader.hasRemaining() && this.#reader.peekByte() === CHAR_LF) {
          this.#reader.readByte();
        }
        break;
      } else if (b === CHAR_LF) {
        break;
      }
      commentText += String.fromCharCode(b);
    }

    if (commentText.startsWith('%EOF')) {
      return new PdfToken(PdfTokenType.EOF, '%%EOF', '%%' + commentText, startOffset);
    }

    return new PdfToken(PdfTokenType.COMMENT, commentText, '%' + commentText, startOffset);
  }

  /**
   * Reads a literal string `( ... )` handling nested parentheses and escape sequences.
   * @private
   */
  #readLiteralString(startOffset) {
    this.#reader.readByte(); // consume (
    const bytes = [];
    let parenDepth = 1;

    while (this.#reader.hasRemaining()) {
      const b = this.#reader.readByte();

      if (b === CHAR_BSLASH) {
        if (!this.#reader.hasRemaining()) {
          break;
        }
        const esc = this.#reader.readByte();
        switch (esc) {
          case 0x6E: // \n
            bytes.push(CHAR_LF);
            break;
          case 0x72: // \r
            bytes.push(CHAR_CR);
            break;
          case 0x74: // \t
            bytes.push(CHAR_TAB);
            break;
          case 0x62: // \b
            bytes.push(0x08);
            break;
          case 0x66: // \f
            bytes.push(CHAR_FF);
            break;
          case CHAR_LPAREN: // \(
            bytes.push(CHAR_LPAREN);
            break;
          case CHAR_RPAREN: // \)
            bytes.push(CHAR_RPAREN);
            break;
          case CHAR_BSLASH: // \\
            bytes.push(CHAR_BSLASH);
            break;
          case CHAR_CR: // \<CR> line continuation
            if (this.#reader.hasRemaining() && this.#reader.peekByte() === CHAR_LF) {
              this.#reader.readByte();
            }
            break;
          case CHAR_LF: // \<LF> line continuation
            break;
          default:
            // Check octal escape \ddd (1 to 3 octal digits: 0-7)
            if (esc >= CHAR_0 && esc <= 0x37) {
              let octalVal = esc - CHAR_0;
              let digitsRead = 1;
              while (digitsRead < 3 && this.#reader.hasRemaining()) {
                const nextB = this.#reader.peekByte();
                if (nextB >= CHAR_0 && nextB <= 0x37) {
                  this.#reader.readByte();
                  octalVal = (octalVal << 3) + (nextB - CHAR_0);
                  digitsRead++;
                } else {
                  break;
                }
              }
              bytes.push(octalVal & 0xFF);
            } else {
              // Unrecognized escape: ignore backslash, emit char
              bytes.push(esc);
            }
            break;
        }
      } else if (b === CHAR_LPAREN) {
        parenDepth++;
        bytes.push(b);
      } else if (b === CHAR_RPAREN) {
        parenDepth--;
        if (parenDepth === 0) {
          // Finished literal string
          const byteArr = new Uint8Array(bytes);
          const rawStr = this.#bytesToAscii(byteArr);
          return new PdfToken(PdfTokenType.STRING, rawStr, `(${rawStr})`, startOffset, byteArr);
        }
        bytes.push(b);
      } else if (b === CHAR_CR) {
        // Unescaped CR in string is converted to LF (per PDF standard)
        if (this.#reader.hasRemaining() && this.#reader.peekByte() === CHAR_LF) {
          this.#reader.readByte();
        }
        bytes.push(CHAR_LF);
      } else {
        bytes.push(b);
      }
    }

    throw new PdfLexerException('Unterminated literal string', startOffset);
  }

  /**
   * Reads `<` token: either `<<` (DICT_START) or `<...>` (HEX_STRING).
   * @private
   */
  #readAngleBracketToken(startOffset) {
    this.#reader.readByte(); // consume '<'

    if (this.#reader.hasRemaining() && this.#reader.peekByte() === CHAR_LANGLE) {
      this.#reader.readByte(); // consume second '<'
      return new PdfToken(PdfTokenType.DICT_START, '<<', '<<', startOffset);
    }

    // Hexadecimal string: <48656C6C6F>
    const hexChars = [];
    let closed = false;

    while (this.#reader.hasRemaining()) {
      const b = this.#reader.readByte();
      if (b === CHAR_RANGLE) {
        closed = true;
        break;
      }
      if (PdfLexer.isWhitespace(b)) {
        continue;
      }
      if (PdfLexer.#isHexDigit(b)) {
        hexChars.push(String.fromCharCode(b));
      } else {
        throw new PdfLexerException(`Invalid hex character '${String.fromCharCode(b)}' (0x${b.toString(16)})`, this.#reader.position() - 1);
      }
    }

    if (!closed) {
      throw new PdfLexerException('Unterminated hexadecimal string', startOffset);
    }

    // If odd number of hex characters, pad with '0'
    if (hexChars.length % 2 !== 0) {
      hexChars.push('0');
    }

    const hexStr = hexChars.join('');
    const bytes = new Uint8Array(hexStr.length / 2);
    for (let i = 0; i < hexStr.length; i += 2) {
      bytes[i / 2] = parseInt(hexStr.substring(i, i + 2), 16);
    }

    const valueStr = this.#bytesToAscii(bytes);
    return new PdfToken(PdfTokenType.HEX_STRING, valueStr, `<${hexStr}>`, startOffset, bytes);
  }

  /**
   * Reads `>` token: checks for `>>` (DICT_END).
   * @private
   */
  #readClosingAngleBracketToken(startOffset) {
    this.#reader.readByte(); // consume '>'
    if (this.#reader.hasRemaining() && this.#reader.peekByte() === CHAR_RANGLE) {
      this.#reader.readByte(); // consume second '>'
      return new PdfToken(PdfTokenType.DICT_END, '>>', '>>', startOffset);
    }
    throw new PdfLexerException("Unexpected single '>' outside hexadecimal string", startOffset);
  }

  /**
   * Reads a Name token `/Name` with `#XX` hex sequence support.
   * @private
   */
  #readNameToken(startOffset) {
    this.#reader.readByte(); // consume '/'
    let nameStr = '';
    const rawChars = ['/'];

    while (this.#reader.hasRemaining()) {
      const b = this.#reader.peekByte();
      if (PdfLexer.isWhitespace(b) || PdfLexer.isDelimiter(b)) {
        break;
      }
      this.#reader.readByte();
      rawChars.push(String.fromCharCode(b));

      if (b === 0x23) { // '#'
        if (this.#reader.remaining() >= 2) {
          const h1 = this.#reader.peekByte(0);
          const h2 = this.#reader.peekByte(1);
          if (PdfLexer.#isHexDigit(h1) && PdfLexer.#isHexDigit(h2)) {
            this.#reader.readByte();
            this.#reader.readByte();
            rawChars.push(String.fromCharCode(h1), String.fromCharCode(h2));
            const charCode = parseInt(String.fromCharCode(h1, h2), 16);
            nameStr += String.fromCharCode(charCode);
            continue;
          }
        }
      }

      nameStr += String.fromCharCode(b);
    }

    return new PdfToken(PdfTokenType.NAME, nameStr, rawChars.join(''), startOffset);
  }

  /**
   * Reads a word, keyword, boolean, null, integer, or real number token.
   * @private
   */
  #readWordOrNumberToken(startOffset) {
    let word = '';

    while (this.#reader.hasRemaining()) {
      const b = this.#reader.peekByte();
      if (PdfLexer.isWhitespace(b) || PdfLexer.isDelimiter(b)) {
        break;
      }
      this.#reader.readByte();
      word += String.fromCharCode(b);
    }

    if (word.length === 0) {
      const b = this.#reader.peekByte();
      throw new PdfLexerException(`Unexpected byte 0x${b.toString(16)}`, startOffset);
    }

    // Check for Keywords & Constants
    switch (word) {
      case 'true':
        return new PdfToken(PdfTokenType.BOOLEAN, true, word, startOffset);
      case 'false':
        return new PdfToken(PdfTokenType.BOOLEAN, false, word, startOffset);
      case 'null':
        return new PdfToken(PdfTokenType.NULL, null, word, startOffset);
      case 'obj':
        return new PdfToken(PdfTokenType.OBJ, 'obj', word, startOffset);
      case 'endobj':
        return new PdfToken(PdfTokenType.ENDOBJ, 'endobj', word, startOffset);
      case 'stream':
        return new PdfToken(PdfTokenType.STREAM, 'stream', word, startOffset);
      case 'endstream':
        return new PdfToken(PdfTokenType.ENDSTREAM, 'endstream', word, startOffset);
      case 'xref':
        return new PdfToken(PdfTokenType.XREF, 'xref', word, startOffset);
      case 'trailer':
        return new PdfToken(PdfTokenType.TRAILER, 'trailer', word, startOffset);
      case 'startxref':
        return new PdfToken(PdfTokenType.STARTXREF, 'startxref', word, startOffset);
      case '%%EOF':
        return new PdfToken(PdfTokenType.EOF, '%%EOF', word, startOffset);
      default:
        break;
    }

    // Check if it represents a number (Integer or Real)
    if (PdfLexer.#isNumberString(word)) {
      if (word.includes('.')) {
        const val = parseFloat(word);
        return new PdfToken(PdfTokenType.REAL, val, word, startOffset);
      } else {
        const val = parseInt(word, 10);
        return new PdfToken(PdfTokenType.INTEGER, val, word, startOffset);
      }
    }

    // Generic Keyword / Identifier
    return new PdfToken(PdfTokenType.KEYWORD, word, word, startOffset);
  }

  /**
   * Reads stream binary data following a `stream` keyword.
   * Handles stream newline convention (either CRLF or LF immediately after `stream`).
   * 
   * @param {number} length - Number of bytes in stream as specified by /Length
   * @returns {Uint8Array}
   * @throws {PdfLexerException}
   */
  readStreamBytes(length) {
    if (typeof length !== 'number' || length < 0) {
      throw new PdfInvalidArgumentException('length', length, 'non-negative integer');
    }

    // Skip the EOL immediately following 'stream' keyword
    if (this.#reader.hasRemaining()) {
      const b = this.#reader.peekByte();
      if (b === CHAR_CR) {
        this.#reader.readByte();
        if (this.#reader.hasRemaining() && this.#reader.peekByte() === CHAR_LF) {
          this.#reader.readByte();
        }
      } else if (b === CHAR_LF) {
        this.#reader.readByte();
      }
    }

    return this.#reader.readBytes(length);
  }

  /**
   * Scans for the `endstream` keyword boundary from current position.
   * @returns {number} Offset where endstream starts, or -1 if not found
   */
  findEndstream() {
    return this.#reader.indexOf('endstream');
  }

  /**
   * Returns true if byte is 0-9, A-F, a-f.
   * @private
   */
  static #isHexDigit(byte) {
    return (byte >= CHAR_0 && byte <= CHAR_9) ||
           (byte >= CHAR_A && byte <= CHAR_F) ||
           (byte >= CHAR_a && byte <= CHAR_f);
  }

  /**
   * Returns true if string conforms to PDF numeric format (+/- digits.digits).
   * @private
   */
  static #isNumberString(str) {
    return /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(str);
  }

  /**
   * Fast byte array to ASCII string conversion.
   * @private
   */
  #bytesToAscii(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) {
      s += String.fromCharCode(bytes[i]);
    }
    return s;
  }
}
