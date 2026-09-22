/**
 * Enumeration of all PDF lexical token types.
 */
export const PdfTokenType = Object.freeze({
  INTEGER: 'INTEGER',
  REAL: 'REAL',
  BOOLEAN: 'BOOLEAN',
  NULL: 'NULL',
  NAME: 'NAME',
  STRING: 'STRING',
  HEX_STRING: 'HEX_STRING',
  DICT_START: 'DICT_START',   // <<
  DICT_END: 'DICT_END',       // >>
  ARRAY_START: 'ARRAY_START', // [
  ARRAY_END: 'ARRAY_END',     // ]
  OBJ: 'OBJ',
  ENDOBJ: 'ENDOBJ',
  STREAM: 'STREAM',
  ENDSTREAM: 'ENDSTREAM',
  XREF: 'XREF',
  TRAILER: 'TRAILER',
  STARTXREF: 'STARTXREF',
  EOF: 'EOF',                 // %%EOF
  KEYWORD: 'KEYWORD',
  COMMENT: 'COMMENT'
});

/**
 * Represents a token produced by the PDF Lexer with source offset and type metadata.
 */
export class PdfToken {
  /** @type {string} */
  #type;

  /** @type {*} */
  #value;

  /** @type {string} */
  #raw;

  /** @type {number} */
  #offset;

  /** @type {Uint8Array|null} */
  #bytes;

  /**
   * @param {string} type - Token type from PdfTokenType
   * @param {*} value - Parsed semantic value
   * @param {string} raw - Raw text representation
   * @param {number} offset - Starting byte offset in source buffer
   * @param {Uint8Array} [bytes=null] - Optional binary byte payload for strings
   */
  constructor(type, value, raw, offset, bytes = null) {
    this.#type = type;
    this.#value = value;
    this.#raw = raw;
    this.#offset = offset;
    this.#bytes = bytes;
  }

  /**
   * Returns the token type.
   * @returns {string}
   */
  get type() {
    return this.#type;
  }

  /**
   * Returns the parsed semantic value.
   * @returns {*}
   */
  get value() {
    return this.#value;
  }

  /**
   * Returns the raw textual representation.
   * @returns {string}
   */
  get raw() {
    return this.#raw;
  }

  /**
   * Returns the starting byte offset in the buffer.
   * @returns {number}
   */
  get offset() {
    return this.#offset;
  }

  /**
   * Returns the binary byte payload if this token is a string or hex string.
   * @returns {Uint8Array|null}
   */
  get bytes() {
    return this.#bytes;
  }

  /**
   * Checks if this token is a keyword with a specific name.
   * @param {string} [name]
   * @returns {boolean}
   */
  isKeyword(name) {
    if (this.#type !== PdfTokenType.KEYWORD &&
        this.#type !== PdfTokenType.OBJ &&
        this.#type !== PdfTokenType.ENDOBJ &&
        this.#type !== PdfTokenType.STREAM &&
        this.#type !== PdfTokenType.ENDSTREAM &&
        this.#type !== PdfTokenType.XREF &&
        this.#type !== PdfTokenType.TRAILER &&
        this.#type !== PdfTokenType.STARTXREF &&
        this.#type !== PdfTokenType.EOF) {
      return false;
    }
    return name === undefined || this.#value === name;
  }

  /**
   * Checks if this token is a Name token, optionally matching a specific name value.
   * @param {string} [name]
   * @returns {boolean}
   */
  isName(name) {
    if (this.#type !== PdfTokenType.NAME) {
      return false;
    }
    return name === undefined || this.#value === name;
  }

  /**
   * Checks if this token is a numeric value (INTEGER or REAL).
   * @returns {boolean}
   */
  isNumber() {
    return this.#type === PdfTokenType.INTEGER || this.#type === PdfTokenType.REAL;
  }

  /**
   * Checks if this token is an integer.
   * @returns {boolean}
   */
  isInteger() {
    return this.#type === PdfTokenType.INTEGER;
  }

  /**
   * Checks if this token is a real / floating-point number.
   * @returns {boolean}
   */
  isReal() {
    return this.#type === PdfTokenType.REAL;
  }

  /**
   * Checks if this token is a literal or hex string.
   * @returns {boolean}
   */
  isString() {
    return this.#type === PdfTokenType.STRING || this.#type === PdfTokenType.HEX_STRING;
  }

  /**
   * Checks if this token is a boolean.
   * @returns {boolean}
   */
  isBoolean() {
    return this.#type === PdfTokenType.BOOLEAN;
  }

  /**
   * Checks if this token is null.
   * @returns {boolean}
   */
  isNull() {
    return this.#type === PdfTokenType.NULL;
  }

  /**
   * Returns a debug string representation.
   * @returns {string}
   */
  toString() {
    return `PdfToken(${this.#type}, value=${JSON.stringify(this.#value)}, offset=${this.#offset})`;
  }
}
