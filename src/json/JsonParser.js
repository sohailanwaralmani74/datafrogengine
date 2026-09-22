/**
 * Pure JavaScript Resilient JSON Parser
 * Provides robust error diagnostics (line, column, context snippet)
 * and AST generation with source locations.
 */

import { JsonLexer, JsonTokenType } from './JsonLexer.js';

export class JsonParseException extends Error {
  constructor(message, line, column, offset, snippet = '') {
    const fullMsg = `${message} at line ${line}, column ${column}${snippet ? '\n' + snippet : ''}`;
    super(fullMsg);
    this.name = 'JsonParseException';
    this.line = line;
    this.column = column;
    this.offset = offset;
    this.snippet = snippet;
  }
}

export class JsonNode {
  constructor(type, value, start, end, line, column) {
    this.type = type; // 'Object', 'Array', 'String', 'Number', 'Boolean', 'Null', 'Property'
    this.value = value;
    this.start = start;
    this.end = end;
    this.line = line;
    this.column = column;
    this.children = []; // For Object and Array
  }
}

export class JsonParser {
  constructor(input, options = {}) {
    this.input = typeof input === 'string' ? input : String(input);
    this.options = {
      lenient: false,      // Allow trailing commas, unquoted keys, single quotes
      preserveLocations: false,
      reviver: null,
      ...options
    };
    this.lexer = new JsonLexer(this.input, { lenient: this.options.lenient });
    this.currentToken = this.lexer.nextToken();
  }

  static parse(text, options = {}) {
    // If strict mode and no special options requested, try fast native JSON.parse first
    if (!options.lenient && !options.preserveLocations) {
      try {
        return JSON.parse(text, options.reviver);
      } catch (nativeErr) {
        // Fall back to custom parser for precise line/col diagnostics!
        const parser = new JsonParser(text, options);
        return parser.parseValue();
      }
    }

    const parser = new JsonParser(text, options);
    return parser.parse();
  }

  static parseWithAst(text, options = {}) {
    const parser = new JsonParser(text, { ...options, preserveLocations: true });
    return parser.parseAst();
  }

  createSnippet(line, column) {
    const lines = this.input.split(/\r?\n/);
    const lineIdx = line - 1;
    if (lineIdx < 0 || lineIdx >= lines.length) return '';

    const srcLine = lines[lineIdx];
    const pointer = ' '.repeat(Math.max(0, column - 1)) + '^';
    return `${srcLine}\n${pointer}`;
  }

  error(message, token = this.currentToken) {
    const snippet = this.createSnippet(token.line, token.column);
    throw new JsonParseException(message, token.line, token.column, token.start, snippet);
  }

  peek() {
    return this.currentToken;
  }

  consume(expectedType = null) {
    if (expectedType && this.currentToken.type !== expectedType) {
      this.error(`Expected token '${expectedType}' but found '${this.currentToken.type}'`);
    }
    const tok = this.currentToken;
    this.currentToken = this.lexer.nextToken();
    return tok;
  }

  parse() {
    const result = this.parseValue();
    if (this.currentToken.type !== JsonTokenType.EOF) {
      this.error(`Unexpected trailing data after valid JSON at line ${this.currentToken.line}`);
    }
    return result;
  }

  parseValue() {
    const tok = this.peek();

    switch (tok.type) {
      case JsonTokenType.LEFT_BRACE:
        return this.parseObject();
      case JsonTokenType.LEFT_BRACKET:
        return this.parseArray();
      case JsonTokenType.STRING:
      case JsonTokenType.NUMBER:
      case JsonTokenType.BOOLEAN:
      case JsonTokenType.NULL:
        this.consume();
        return tok.value;
      default:
        this.error(`Unexpected token '${tok.value || tok.type}' when expecting a JSON value`);
    }
  }

  parseObject() {
    this.consume(JsonTokenType.LEFT_BRACE);
    const obj = {};

    if (this.peek().type === JsonTokenType.RIGHT_BRACE) {
      this.consume(JsonTokenType.RIGHT_BRACE);
      return obj;
    }

    while (true) {
      const keyTok = this.peek();
      if (keyTok.type !== JsonTokenType.STRING) {
        this.error(`Expected string object key but found '${keyTok.value || keyTok.type}'`);
      }
      this.consume();
      const key = keyTok.value;

      this.consume(JsonTokenType.COLON);
      const val = this.parseValue();
      obj[key] = val;

      if (this.peek().type === JsonTokenType.COMMA) {
        this.consume(JsonTokenType.COMMA);
        // Check for trailing comma
        if (this.peek().type === JsonTokenType.RIGHT_BRACE) {
          if (!this.options.lenient) {
            this.error('Trailing comma in object is not allowed in standard JSON');
          }
          this.consume(JsonTokenType.RIGHT_BRACE);
          break;
        }
      } else if (this.peek().type === JsonTokenType.RIGHT_BRACE) {
        this.consume(JsonTokenType.RIGHT_BRACE);
        break;
      } else {
        this.error(`Expected ',' or '}' inside object but found '${this.peek().value || this.peek().type}'`);
      }
    }

    return obj;
  }

  parseArray() {
    this.consume(JsonTokenType.LEFT_BRACKET);
    const arr = [];

    if (this.peek().type === JsonTokenType.RIGHT_BRACKET) {
      this.consume(JsonTokenType.RIGHT_BRACKET);
      return arr;
    }

    while (true) {
      const val = this.parseValue();
      arr.push(val);

      if (this.peek().type === JsonTokenType.COMMA) {
        this.consume(JsonTokenType.COMMA);
        // Check for trailing comma
        if (this.peek().type === JsonTokenType.RIGHT_BRACKET) {
          if (!this.options.lenient) {
            this.error('Trailing comma in array is not allowed in standard JSON');
          }
          this.consume(JsonTokenType.RIGHT_BRACKET);
          break;
        }
      } else if (this.peek().type === JsonTokenType.RIGHT_BRACKET) {
        this.consume(JsonTokenType.RIGHT_BRACKET);
        break;
      } else {
        this.error(`Expected ',' or ']' inside array but found '${this.peek().value || this.peek().type}'`);
      }
    }

    return arr;
  }

  parseAst() {
    const node = this.parseAstValue();
    if (this.currentToken.type !== JsonTokenType.EOF) {
      this.error(`Unexpected token '${this.currentToken.value}' after root AST node`);
    }
    return node;
  }

  parseAstValue() {
    const tok = this.peek();

    switch (tok.type) {
      case JsonTokenType.LEFT_BRACE:
        return this.parseAstObject();
      case JsonTokenType.LEFT_BRACKET:
        return this.parseAstArray();
      case JsonTokenType.STRING:
      case JsonTokenType.NUMBER:
      case JsonTokenType.BOOLEAN:
      case JsonTokenType.NULL: {
        this.consume();
        return new JsonNode(tok.type, tok.value, tok.start, tok.end, tok.line, tok.column);
      }
      default:
        this.error(`Unexpected token '${tok.value || tok.type}' when expecting JSON AST node`);
    }
  }

  parseAstObject() {
    const startTok = this.consume(JsonTokenType.LEFT_BRACE);
    const node = new JsonNode('Object', {}, startTok.start, 0, startTok.line, startTok.column);

    if (this.peek().type === JsonTokenType.RIGHT_BRACE) {
      const endTok = this.consume(JsonTokenType.RIGHT_BRACE);
      node.end = endTok.end;
      return node;
    }

    while (true) {
      const keyTok = this.consume(JsonTokenType.STRING);
      this.consume(JsonTokenType.COLON);
      const valNode = this.parseAstValue();

      const propNode = new JsonNode('Property', keyTok.value, keyTok.start, valNode.end, keyTok.line, keyTok.column);
      propNode.key = keyTok.value;
      propNode.valueNode = valNode;
      node.children.push(propNode);
      node.value[keyTok.value] = valNode.value;

      if (this.peek().type === JsonTokenType.COMMA) {
        this.consume(JsonTokenType.COMMA);
        if (this.peek().type === JsonTokenType.RIGHT_BRACE) {
          const endTok = this.consume(JsonTokenType.RIGHT_BRACE);
          node.end = endTok.end;
          break;
        }
      } else if (this.peek().type === JsonTokenType.RIGHT_BRACE) {
        const endTok = this.consume(JsonTokenType.RIGHT_BRACE);
        node.end = endTok.end;
        break;
      } else {
        this.error(`Expected ',' or '}' in AST object`);
      }
    }

    return node;
  }

  parseAstArray() {
    const startTok = this.consume(JsonTokenType.LEFT_BRACKET);
    const node = new JsonNode('Array', [], startTok.start, 0, startTok.line, startTok.column);

    if (this.peek().type === JsonTokenType.RIGHT_BRACKET) {
      const endTok = this.consume(JsonTokenType.RIGHT_BRACKET);
      node.end = endTok.end;
      return node;
    }

    while (true) {
      const itemNode = this.parseAstValue();
      node.children.push(itemNode);
      node.value.push(itemNode.value);

      if (this.peek().type === JsonTokenType.COMMA) {
        this.consume(JsonTokenType.COMMA);
        if (this.peek().type === JsonTokenType.RIGHT_BRACKET) {
          const endTok = this.consume(JsonTokenType.RIGHT_BRACKET);
          node.end = endTok.end;
          break;
        }
      } else if (this.peek().type === JsonTokenType.RIGHT_BRACKET) {
        const endTok = this.consume(JsonTokenType.RIGHT_BRACKET);
        node.end = endTok.end;
        break;
      } else {
        this.error(`Expected ',' or ']' in AST array`);
      }
    }

    return node;
  }
}
