import { PdfException } from './PdfException.js';

/**
 * Thrown when the PDF Lexer encounters lexical or syntax errors during tokenization.
 */
export class PdfLexerException extends PdfException {
  /**
   * @param {string} message - Description of the lexical error
   * @param {number} position - Byte offset where the lexical error occurred
   * @param {string} [tokenSnippet=''] - Optional snippet of offending character/token
   */
  constructor(message, position, tokenSnippet = '') {
    const formatted = `Lexer error at byte ${position}: ${message}${tokenSnippet ? ` (near '${tokenSnippet}')` : ''}`;
    super(formatted, {
      position,
      tokenSnippet
    });
    this.position = position;
    this.tokenSnippet = tokenSnippet;
  }
}
