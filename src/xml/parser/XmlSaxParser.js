import { XmlLexer, XmlTokenType } from './XmlLexer.js';
import { XmlText } from '../model/XmlText.js';

/**
 * Event-driven streaming XML SAX Parser.
 * Memory-efficient processing of massive XML streams.
 */
export class XmlSaxParser {
  constructor() {
    /** @type {Record<string, Function[]>} */
    this.listeners = {
      startDocument: [],
      startElement: [],
      endElement: [],
      text: [],
      cdata: [],
      comment: [],
      pi: [],
      error: [],
      endDocument: []
    };
  }

  /**
   * Registers an event listener.
   * @param {string} event
   * @param {Function} callback
   * @returns {this}
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
    return this;
  }

  /**
   * Emits an event to registered listeners.
   * @param {string} event
   * @param  {...any} args
   */
  emit(event, ...args) {
    const list = this.listeners[event] || [];
    for (const fn of list) {
      fn(...args);
    }
  }

  /**
   * Parses XML string streamingly.
   * @param {string} xmlString
   */
  parse(xmlString) {
    const lexer = new XmlLexer(xmlString);
    this.emit('startDocument');

    try {
      let token = lexer.nextToken('CONTENT');

      while (token.type !== XmlTokenType.EOF) {
        switch (token.type) {
          case XmlTokenType.COMMENT:
            this.emit('comment', token.value);
            break;

          case XmlTokenType.CDATA:
            this.emit('cdata', token.value);
            break;

          case XmlTokenType.PI: {
            const piTarget = token.value;
            let data = '';
            while (!lexer.eof && !lexer.startsWith('?>') && lexer.peek() !== '>') {
              data += lexer.advance();
            }
            if (lexer.startsWith('?>')) {
              lexer.advance();
              lexer.advance();
            }
            this.emit('pi', piTarget, data.trim());
            break;
          }

          case XmlTokenType.TEXT: {
            const unescaped = XmlText.unescapeXml(token.value);
            if (unescaped.trim().length > 0) {
              this.emit('text', unescaped);
            }
            break;
          }

          case XmlTokenType.TAG_OPEN: {
            const tagName = token.value;
            const attrs = {};
            let selfClosing = false;

            let inTag = lexer.nextToken('INSIDE_TAG');
            let attrKey = null;

            while (inTag.type !== XmlTokenType.EOF) {
              if (inTag.type === XmlTokenType.TAG_END) break;
              if (inTag.type === XmlTokenType.TAG_SELF_CLOSE) {
                selfClosing = true;
                break;
              }
              if (inTag.type === XmlTokenType.ATTR_NAME) {
                attrKey = inTag.value;
                attrs[attrKey] = '';
              } else if (inTag.type === XmlTokenType.ATTR_VALUE) {
                if (attrKey) {
                  attrs[attrKey] = XmlText.unescapeXml(inTag.value);
                  attrKey = null;
                }
              }
              inTag = lexer.nextToken('INSIDE_TAG');
            }

            this.emit('startElement', tagName, attrs);
            if (selfClosing) {
              this.emit('endElement', tagName);
            }
            break;
          }

          case XmlTokenType.TAG_CLOSE:
            this.emit('endElement', token.value);
            break;

          default:
            break;
        }

        token = lexer.nextToken('CONTENT');
      }

      this.emit('endDocument');
    } catch (err) {
      this.emit('error', err);
    }
  }
}
