import { XmlParseException } from '../errors/XmlException.js';

export const XmlTokenType = Object.freeze({
  DECLARATION: 'DECLARATION',
  DOCTYPE: 'DOCTYPE',
  PI: 'PI',
  COMMENT: 'COMMENT',
  CDATA: 'CDATA',
  TAG_OPEN: 'TAG_OPEN',
  TAG_CLOSE: 'TAG_CLOSE',
  TAG_SELF_CLOSE: 'TAG_SELF_CLOSE',
  TAG_END: 'TAG_END',
  ATTR_NAME: 'ATTR_NAME',
  ATTR_VALUE: 'ATTR_VALUE',
  TEXT: 'TEXT',
  EOF: 'EOF'
});

export class XmlToken {
  /**
   * @param {string} type
   * @param {string} value
   * @param {number} line
   * @param {number} column
   */
  constructor(type, value, line, column) {
    this.type = type;
    this.value = value;
    this.line = line;
    this.column = column;
  }
}

/**
 * High-performance, streaming-capable XML Lexer.
 */
export class XmlLexer {
  /**
   * @param {string} source
   */
  constructor(source) {
    this.source = source || '';
    this.pos = 0;
    this.line = 1;
    this.column = 1;
    this.length = this.source.length;
  }

  get eof() {
    return this.pos >= this.length;
  }

  peek() {
    return this.source[this.pos] || '';
  }

  advance() {
    const ch = this.source[this.pos++];
    if (ch === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return ch;
  }

  startsWith(str) {
    return this.source.startsWith(str, this.pos);
  }

  skipWhitespace() {
    while (!this.eof && /\s/.test(this.peek())) {
      this.advance();
    }
  }

  /**
   * Reads next token in stream.
   * @param {'CONTENT'|'INSIDE_TAG'} state
   * @returns {XmlToken}
   */
  nextToken(state = 'CONTENT') {
    if (this.eof) {
      return new XmlToken(XmlTokenType.EOF, '', this.line, this.column);
    }

    if (state === 'INSIDE_TAG') {
      this.skipWhitespace();
      if (this.eof) {
        return new XmlToken(XmlTokenType.EOF, '', this.line, this.column);
      }

      const line = this.line;
      const col = this.column;

      if (this.startsWith('/>')) {
        this.advance();
        this.advance();
        return new XmlToken(XmlTokenType.TAG_SELF_CLOSE, '/>', line, col);
      }

      if (this.peek() === '>') {
        this.advance();
        return new XmlToken(XmlTokenType.TAG_END, '>', line, col);
      }

      if (this.peek() === '?') {
        if (this.startsWith('?>')) {
          this.advance();
          this.advance();
          return new XmlToken(XmlTokenType.TAG_END, '?>', line, col);
        }
      }

      // Attribute name
      const name = this.readName();
      if (name) {
        return new XmlToken(XmlTokenType.ATTR_NAME, name, line, col);
      }

      // Attribute equals and value
      if (this.peek() === '=') {
        this.advance();
        this.skipWhitespace();
        const val = this.readAttributeValue();
        return new XmlToken(XmlTokenType.ATTR_VALUE, val, line, col);
      }

      // Unexpected char
      const unexpected = this.advance();
      throw new XmlParseException(`Unexpected character '${unexpected}' inside tag attributes`, line, col);
    }

    // State is 'CONTENT'
    const startLine = this.line;
    const startCol = this.column;

    if (this.peek() === '<') {
      // 1. CDATA
      if (this.startsWith('<![CDATA[')) {
        this.pos += 9;
        this.column += 9;
        const cdataEnd = this.source.indexOf(']]>', this.pos);
        if (cdataEnd === -1) {
          throw new XmlParseException('Unterminated CDATA section', startLine, startCol);
        }
        const data = this.source.slice(this.pos, cdataEnd);
        this.updateLineCol(data + ']]>');
        this.pos = cdataEnd + 3;
        return new XmlToken(XmlTokenType.CDATA, data, startLine, startCol);
      }

      // 2. Comment
      if (this.startsWith('<!--')) {
        this.pos += 4;
        this.column += 4;
        const commentEnd = this.source.indexOf('-->', this.pos);
        if (commentEnd === -1) {
          throw new XmlParseException('Unterminated comment', startLine, startCol);
        }
        const data = this.source.slice(this.pos, commentEnd);
        this.updateLineCol(data + '-->');
        this.pos = commentEnd + 3;
        return new XmlToken(XmlTokenType.COMMENT, data, startLine, startCol);
      }

      // 3. DOCTYPE
      if (this.startsWith('<!DOCTYPE') || this.startsWith('<!doctype')) {
        this.pos += 9;
        this.column += 9;
        let depth = 0;
        let inInternal = false;
        let doctypeContent = '';
        while (!this.eof) {
          const ch = this.advance();
          if (ch === '[') inInternal = true;
          if (ch === ']') inInternal = false;
          if (ch === '>' && !inInternal) break;
          doctypeContent += ch;
        }
        return new XmlToken(XmlTokenType.DOCTYPE, doctypeContent.trim(), startLine, startCol);
      }

      // 4. Processing Instruction or XML Declaration
      if (this.startsWith('<?')) {
        this.pos += 2;
        this.column += 2;
        const name = this.readName();
        if (name.toLowerCase() === 'xml') {
          return new XmlToken(XmlTokenType.DECLARATION, name, startLine, startCol);
        }
        return new XmlToken(XmlTokenType.PI, name, startLine, startCol);
      }

      // 5. Closing tag </name>
      if (this.startsWith('</')) {
        this.pos += 2;
        this.column += 2;
        this.skipWhitespace();
        const closeName = this.readName();
        this.skipWhitespace();
        if (this.peek() === '>') {
          this.advance();
        }
        return new XmlToken(XmlTokenType.TAG_CLOSE, closeName, startLine, startCol);
      }

      // 6. Opening tag <name
      this.advance(); // consume '<'
      this.skipWhitespace();
      const tagName = this.readName();
      if (!tagName) {
        throw new XmlParseException('Expected element tag name following "<"', startLine, startCol);
      }
      return new XmlToken(XmlTokenType.TAG_OPEN, tagName, startLine, startCol);
    }

    // Text content until next '<'
    let text = '';
    while (!this.eof && this.peek() !== '<') {
      text += this.advance();
    }
    return new XmlToken(XmlTokenType.TEXT, text, startLine, startCol);
  }

  readName() {
    let name = '';
    while (!this.eof && /^[a-zA-Z0-9_\-.:]$/.test(this.peek())) {
      name += this.advance();
    }
    return name;
  }

  readAttributeValue() {
    const quote = this.peek();
    if (quote === '"' || quote === "'") {
      this.advance(); // consume opening quote
      let val = '';
      while (!this.eof && this.peek() !== quote) {
        val += this.advance();
      }
      if (this.peek() === quote) {
        this.advance(); // consume closing quote
      }
      return val;
    }

    // Unquoted attribute value (lenient)
    let val = '';
    while (!this.eof && !/\s|[/>]/.test(this.peek())) {
      val += this.advance();
    }
    return val;
  }

  updateLineCol(str) {
    for (let i = 0; i < str.length; i++) {
      if (str[i] === '\n') {
        this.line++;
        this.column = 1;
      } else {
        this.column++;
      }
    }
  }
}
