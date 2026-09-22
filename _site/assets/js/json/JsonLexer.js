/**
 * Pure JavaScript JSON Lexer & Resilient Tokenizer
 * Supports standard JSON and lenient syntax (comments, unquoted keys, single quotes, trailing commas).
 */

export const JsonTokenType = {
  LEFT_BRACE: 'LEFT_BRACE',       // {
  RIGHT_BRACE: 'RIGHT_BRACE',     // }
  LEFT_BRACKET: 'LEFT_BRACKET',   // [
  RIGHT_BRACKET: 'RIGHT_BRACKET', // ]
  COLON: 'COLON',                 // :
  COMMA: 'COMMA',                 // ,
  STRING: 'STRING',               // "string" or 'string'
  NUMBER: 'NUMBER',               // 123, 3.14, 1e-4
  BOOLEAN: 'BOOLEAN',             // true, false
  NULL: 'NULL',                   // null
  COMMENT: 'COMMENT',             // // or /* */
  EOF: 'EOF'
};

export class JsonToken {
  constructor(type, value, start, end, line, column) {
    this.type = type;
    this.value = value;
    this.start = start;
    this.end = end;
    this.line = line;
    this.column = column;
  }
}

export class JsonLexer {
  constructor(input, options = {}) {
    this.input = typeof input === 'string' ? input : String(input);
    this.len = this.input.length;
    this.pos = 0;
    this.line = 1;
    this.column = 1;
    this.options = {
      lenient: true,       // Allow single quotes, comments, unquoted keys
      includeComments: false,
      ...options
    };
  }

  peek(offset = 0) {
    const idx = this.pos + offset;
    return idx < this.len ? this.input[idx] : null;
  }

  consume() {
    const ch = this.input[this.pos++];
    if (ch === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return ch;
  }

  skipWhitespace() {
    while (this.pos < this.len) {
      const ch = this.input[this.pos];
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        this.consume();
      } else if (ch === '/' && this.options.lenient) {
        const next = this.peek(1);
        if (next === '/') {
          // Line comment
          this.consume();
          this.consume();
          while (this.pos < this.len && this.input[this.pos] !== '\n') {
            this.consume();
          }
        } else if (next === '*') {
          // Block comment
          this.consume();
          this.consume();
          while (this.pos < this.len) {
            if (this.input[this.pos] === '*' && this.peek(1) === '/') {
              this.consume();
              this.consume();
              break;
            }
            this.consume();
          }
        } else {
          break;
        }
      } else {
        break;
      }
    }
  }

  nextToken() {
    this.skipWhitespace();

    if (this.pos >= this.len) {
      return new JsonToken(JsonTokenType.EOF, null, this.pos, this.pos, this.line, this.column);
    }

    const start = this.pos;
    const line = this.line;
    const col = this.column;
    const ch = this.input[this.pos];

    switch (ch) {
      case '{':
        this.consume();
        return new JsonToken(JsonTokenType.LEFT_BRACE, '{', start, this.pos, line, col);
      case '}':
        this.consume();
        return new JsonToken(JsonTokenType.RIGHT_BRACE, '}', start, this.pos, line, col);
      case '[':
        this.consume();
        return new JsonToken(JsonTokenType.LEFT_BRACKET, '[', start, this.pos, line, col);
      case ']':
        this.consume();
        return new JsonToken(JsonTokenType.RIGHT_BRACKET, ']', start, this.pos, line, col);
      case ':':
        this.consume();
        return new JsonToken(JsonTokenType.COLON, ':', start, this.pos, line, col);
      case ',':
        this.consume();
        return new JsonToken(JsonTokenType.COMMA, ',', start, this.pos, line, col);
      case '"':
      case "'":
        return this.readString(ch, start, line, col);
      default:
        if (this.isDigit(ch) || ch === '-' || ch === '+') {
          return this.readNumber(start, line, col);
        }
        return this.readIdentifier(start, line, col);
    }
  }

  readString(quoteChar, start, line, col) {
    this.consume(); // Opening quote
    let str = '';

    while (this.pos < this.len) {
      const ch = this.consume();
      if (ch === quoteChar) {
        return new JsonToken(JsonTokenType.STRING, str, start, this.pos, line, col);
      }
      if (ch === '\\') {
        if (this.pos >= this.len) break;
        const esc = this.consume();
        switch (esc) {
          case '"': str += '"'; break;
          case "'": str += "'"; break;
          case '\\': str += '\\'; break;
          case '/': str += '/'; break;
          case 'b': str += '\b'; break;
          case 'f': str += '\f'; break;
          case 'n': str += '\n'; break;
          case 'r': str += '\r'; break;
          case 't': str += '\t'; break;
          case 'u': {
            const hex = this.input.slice(this.pos, this.pos + 4);
            if (/^[0-9a-fA-F]{4}$/.test(hex)) {
              str += String.fromCharCode(parseInt(hex, 16));
              for (let i = 0; i < 4; i++) this.consume();
            } else {
              str += 'u' + hex;
            }
            break;
          }
          default:
            str += esc;
        }
      } else {
        str += ch;
      }
    }

    throw new Error(`Unterminated string at line ${line}, column ${col}`);
  }

  isDigit(ch) {
    return ch >= '0' && ch <= '9';
  }

  readNumber(start, line, col) {
    let numStr = '';
    if (this.input[this.pos] === '-' || this.input[this.pos] === '+') {
      numStr += this.consume();
    }

    // Check for hex/octal if lenient
    if (numStr === '' && this.input[this.pos] === '0' && (this.peek(1) === 'x' || this.peek(1) === 'X')) {
      numStr += this.consume(); // 0
      numStr += this.consume(); // x
      while (this.pos < this.len && /[0-9a-fA-F]/.test(this.input[this.pos])) {
        numStr += this.consume();
      }
      const val = parseInt(numStr, 16);
      return new JsonToken(JsonTokenType.NUMBER, val, start, this.pos, line, col);
    }

    while (this.pos < this.len && this.isDigit(this.input[this.pos])) {
      numStr += this.consume();
    }

    if (this.pos < this.len && this.input[this.pos] === '.') {
      numStr += this.consume();
      while (this.pos < this.len && this.isDigit(this.input[this.pos])) {
        numStr += this.consume();
      }
    }

    if (this.pos < this.len && (this.input[this.pos] === 'e' || this.input[this.pos] === 'E')) {
      numStr += this.consume();
      if (this.pos < this.len && (this.input[this.pos] === '+' || this.input[this.pos] === '-')) {
        numStr += this.consume();
      }
      while (this.pos < this.len && this.isDigit(this.input[this.pos])) {
        numStr += this.consume();
      }
    }

    const val = Number(numStr);
    if (isNaN(val)) {
      throw new Error(`Invalid number '${numStr}' at line ${line}, column ${col}`);
    }
    return new JsonToken(JsonTokenType.NUMBER, val, start, this.pos, line, col);
  }

  readIdentifier(start, line, col) {
    let id = '';
    while (this.pos < this.len && /[a-zA-Z0-9_$\-]/.test(this.input[this.pos])) {
      id += this.consume();
    }

    if (id === 'true') {
      return new JsonToken(JsonTokenType.BOOLEAN, true, start, this.pos, line, col);
    }
    if (id === 'false') {
      return new JsonToken(JsonTokenType.BOOLEAN, false, start, this.pos, line, col);
    }
    if (id === 'null') {
      return new JsonToken(JsonTokenType.NULL, null, start, this.pos, line, col);
    }
    if (this.options.lenient && (id === 'NaN' || id === 'Infinity' || id === '-Infinity')) {
      const val = id === 'NaN' ? NaN : (id === 'Infinity' ? Infinity : -Infinity);
      return new JsonToken(JsonTokenType.NUMBER, val, start, this.pos, line, col);
    }

    // If lenient, treat unquoted identifier as string (e.g. unquoted key)
    if (this.options.lenient && id.length > 0) {
      return new JsonToken(JsonTokenType.STRING, id, start, this.pos, line, col);
    }

    throw new Error(`Unexpected token '${id || this.input[this.pos]}' at line ${line}, column ${col}`);
  }

  tokenize() {
    const tokens = [];
    let tok;
    do {
      tok = this.nextToken();
      tokens.push(tok);
    } while (tok.type !== JsonTokenType.EOF);
    return tokens;
  }
}
