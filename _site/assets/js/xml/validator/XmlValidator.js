import { XmlLexer, XmlTokenType } from '../parser/XmlLexer.js';

/**
 * Validates XML well-formedness against W3C XML 1.0 specifications.
 */
export class XmlValidator {
  /**
   * Validates an XML string.
   * @param {string} xmlString
   * @returns {{ valid: boolean, errors: Array<{ message: string, line: number, column: number }> }}
   */
  static validate(xmlString) {
    const validator = new XmlValidator();
    return validator.check(xmlString);
  }

  check(xmlString) {
    const errors = [];
    if (!xmlString || typeof xmlString !== 'string' || !xmlString.trim()) {
      return {
        valid: false,
        errors: [{ message: 'Empty or invalid XML document', line: 1, column: 1 }]
      };
    }

    const lexer = new XmlLexer(xmlString);
    const elementStack = [];
    let rootElementSeen = false;
    let rootElementClosed = false;

    try {
      let token = lexer.nextToken('CONTENT');

      while (token.type !== XmlTokenType.EOF) {
        switch (token.type) {
          case XmlTokenType.COMMENT: {
            if (token.value.includes('--')) {
              errors.push({
                message: 'Comment must not contain double-hyphen "--"',
                line: token.line,
                column: token.column
              });
            }
            break;
          }

          case XmlTokenType.TAG_OPEN: {
            if (rootElementClosed) {
              errors.push({
                message: 'Extra content at end of document: multiple root elements not allowed',
                line: token.line,
                column: token.column
              });
            }
            rootElementSeen = true;

            // Check attributes in tag
            const attrs = new Set();
            let inTag = lexer.nextToken('INSIDE_TAG');
            let selfClosing = false;

            while (inTag.type !== XmlTokenType.EOF) {
              if (inTag.type === XmlTokenType.TAG_END) break;
              if (inTag.type === XmlTokenType.TAG_SELF_CLOSE) {
                selfClosing = true;
                break;
              }
              if (inTag.type === XmlTokenType.ATTR_NAME) {
                if (attrs.has(inTag.value)) {
                  errors.push({
                    message: `Duplicate attribute '${inTag.value}' on element <${token.value}>`,
                    line: inTag.line,
                    column: inTag.column
                  });
                }
                attrs.add(inTag.value);
              }
              inTag = lexer.nextToken('INSIDE_TAG');
            }

            if (!selfClosing) {
              elementStack.push({ name: token.value, line: token.line, col: token.column });
            } else if (elementStack.length === 0 && rootElementSeen) {
              rootElementClosed = true;
            }
            break;
          }

          case XmlTokenType.TAG_CLOSE: {
            if (elementStack.length === 0) {
              errors.push({
                message: `Unexpected closing tag </${token.value}> without matching open tag`,
                line: token.line,
                column: token.column
              });
            } else {
              const current = elementStack.pop();
              if (current.name !== token.value) {
                errors.push({
                  message: `Mismatched closing tag: expected </${current.name}>, found </${token.value}>`,
                  line: token.line,
                  column: token.column
                });
              }
              if (elementStack.length === 0) {
                rootElementClosed = true;
              }
            }
            break;
          }

          default:
            break;
        }

        token = lexer.nextToken('CONTENT');
      }

      if (!rootElementSeen) {
        errors.push({
          message: 'XML document must contain a root element',
          line: 1,
          column: 1
        });
      }

      if (elementStack.length > 0) {
        for (const unclosed of elementStack) {
          errors.push({
            message: `Unclosed XML element <${unclosed.name}>`,
            line: unclosed.line,
            column: unclosed.col
          });
        }
      }
    } catch (err) {
      errors.push({
        message: err.message,
        line: err.line || lexer.line,
        column: err.column || lexer.column
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
