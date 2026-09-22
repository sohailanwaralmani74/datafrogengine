import { PdfException } from './PdfException.js';

/**
 * Thrown when the PDF Object Parser encounters structural or grammatical syntax errors.
 */
export class PdfParseException extends PdfException {
  /**
   * @param {string} message - Description of the parse error
   * @param {number} [position=0] - Byte offset where the parse error occurred
   * @param {Object} [details={}] - Additional contextual metadata
   */
  constructor(message, position = 0, details = {}) {
    const formatted = `PdfParseException at byte offset ${position}: ${message}`;
    super(formatted, {
      position,
      ...details
    });
    this.position = position;
  }
}
