import { XmlLexer, XmlTokenType } from './XmlLexer.js';
import { XmlDocument } from '../model/XmlDocument.js';
import { XmlElement } from '../model/XmlElement.js';
import { XmlText } from '../model/XmlText.js';
import { XmlCData, XmlComment, XmlProcessingInstruction, XmlDoctype } from '../model/XmlMiscNodes.js';
import { XmlParseException } from '../errors/XmlException.js';

/**
 * Standard W3C-compliant XML Document Parser.
 */
export class XmlParser {
  /**
   * Parses an XML string into a full XmlDocument tree.
   * @param {string} xmlString
   * @param {object} [options]
   * @param {boolean} [options.trimWhitespace=true]
   * @param {boolean} [options.ignoreComments=false]
   * @param {boolean} [options.preserveCData=true]
   * @param {boolean} [options.strict=true]
   * @returns {XmlDocument}
   */
  static parse(xmlString, options = {}) {
    const parser = new XmlParser(xmlString, options);
    return parser.parseDocument();
  }

  /**
   * For backwards-compatibility with Excel engine: returns the root XmlElement.
   * @param {string} xmlString
   * @param {object} [options]
   * @returns {XmlElement|null}
   */
  static parseNode(xmlString, options = {}) {
    const doc = XmlParser.parse(xmlString, options);
    return doc.documentElement;
  }

  /**
   * @param {string} xmlString
   * @param {object} [options]
   */
  constructor(xmlString, options = {}) {
    this.source = xmlString || '';
    this.options = {
      trimWhitespace: true,
      ignoreComments: false,
      preserveCData: true,
      strict: true,
      ...options
    };
    this.lexer = new XmlLexer(this.source);
    this.doc = new XmlDocument();
    /** @type {XmlElement[]} */
    this.elementStack = [];
  }

  parseDocument() {
    let token = this.lexer.nextToken('CONTENT');

    while (token.type !== XmlTokenType.EOF) {
      switch (token.type) {
        case XmlTokenType.DECLARATION: {
          this.parseDeclaration();
          break;
        }

        case XmlTokenType.DOCTYPE: {
          this.doc.doctype = new XmlDoctype(token.value);
          break;
        }

        case XmlTokenType.COMMENT: {
          if (!this.options.ignoreComments) {
            const comment = new XmlComment(token.value);
            this.attachNode(comment);
          }
          break;
        }

        case XmlTokenType.PI: {
          const piTarget = token.value;
          const piData = this.readUntilTagEnd();
          const pi = new XmlProcessingInstruction(piTarget, piData);
          this.attachNode(pi);
          break;
        }

        case XmlTokenType.CDATA: {
          if (this.options.preserveCData) {
            const cdata = new XmlCData(token.value);
            this.attachNode(cdata);
          } else {
            const text = new XmlText(token.value);
            this.attachNode(text);
          }
          break;
        }

        case XmlTokenType.TEXT: {
          let textVal = XmlText.unescapeXml(token.value);
          if (this.options.trimWhitespace) {
            // Only collapse if entirely whitespace outside elements
            if (this.elementStack.length === 0 && !textVal.trim()) {
              textVal = '';
            }
          }
          if (textVal.length > 0) {
            const textNode = new XmlText(textVal);
            this.attachNode(textNode);
          }
          break;
        }

        case XmlTokenType.TAG_OPEN: {
          this.parseElement(token.value, token.line, token.column);
          break;
        }

        case XmlTokenType.TAG_CLOSE: {
          this.closeElement(token.value, token.line, token.column);
          break;
        }

        default:
          break;
      }

      token = this.lexer.nextToken('CONTENT');
    }

    if (this.elementStack.length > 0 && this.options.strict) {
      const unclosed = this.elementStack[this.elementStack.length - 1];
      throw new XmlParseException(`Unclosed XML tag <${unclosed.tagName}>`);
    }

    return this.doc;
  }

  parseDeclaration() {
    const attrs = this.readAttributes();
    if (attrs.version) this.doc.declaration.version = attrs.version;
    if (attrs.encoding) this.doc.declaration.encoding = attrs.encoding;
    if (attrs.standalone !== undefined) this.doc.declaration.standalone = attrs.standalone;
  }

  parseElement(tagName, line, col) {
    const element = new XmlElement(tagName);
    const attrs = this.readAttributes();

    for (const [k, v] of Object.entries(attrs)) {
      element.setAttribute(k, v);
    }

    // Check for namespace xmlns attributes
    if (element.hasAttribute('xmlns')) {
      element.namespaceURI = element.getAttribute('xmlns');
    }

    this.attachNode(element);

    if (this.lastTagSelfClosing) {
      // Element is self-closed, do not push to stack
      return;
    }

    this.elementStack.push(element);
  }

  closeElement(tagName, line, col) {
    if (this.elementStack.length === 0) {
      if (this.options.strict) {
        throw new XmlParseException(`Unexpected closing tag </${tagName}>`, line, col);
      }
      return;
    }

    const current = this.elementStack[this.elementStack.length - 1];
    if (current.tagName !== tagName) {
      if (this.options.strict) {
        throw new XmlParseException(
          `Mismatched closing tag: expected </${current.tagName}>, got </${tagName}>`,
          line,
          col
        );
      }
      // Lenient search in stack
      const idx = this.elementStack.map((e) => e.tagName).lastIndexOf(tagName);
      if (idx !== -1) {
        this.elementStack.splice(idx);
      }
      return;
    }

    this.elementStack.pop();
  }

  readAttributes() {
    const attrs = {};
    this.lastTagSelfClosing = false;

    let token = this.lexer.nextToken('INSIDE_TAG');
    let currentKey = null;

    while (token.type !== XmlTokenType.EOF) {
      if (token.type === XmlTokenType.TAG_END) {
        break;
      }
      if (token.type === XmlTokenType.TAG_SELF_CLOSE) {
        this.lastTagSelfClosing = true;
        break;
      }

      if (token.type === XmlTokenType.ATTR_NAME) {
        currentKey = token.value;
        attrs[currentKey] = ''; // default empty attribute
      } else if (token.type === XmlTokenType.ATTR_VALUE) {
        if (currentKey) {
          attrs[currentKey] = XmlText.unescapeXml(token.value);
          currentKey = null;
        }
      }

      token = this.lexer.nextToken('INSIDE_TAG');
    }

    return attrs;
  }

  readUntilTagEnd() {
    let content = '';
    while (!this.lexer.eof && !this.lexer.startsWith('?>') && this.lexer.peek() !== '>') {
      content += this.lexer.advance();
    }
    if (this.lexer.startsWith('?>')) {
      this.lexer.advance();
      this.lexer.advance();
    } else if (this.lexer.peek() === '>') {
      this.lexer.advance();
    }
    return content.trim();
  }

  attachNode(node) {
    if (this.elementStack.length > 0) {
      this.elementStack[this.elementStack.length - 1].appendChild(node);
    } else {
      this.doc.appendChild(node);
    }
  }
}
