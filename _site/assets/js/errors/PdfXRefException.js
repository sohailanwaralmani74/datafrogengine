import { PdfException } from './PdfException.js';

/**
 * Thrown when an error occurs during parsing or resolving cross-reference (xref) tables or trailers.
 */
export class PdfXRefException extends PdfException {
  /**
   * @param {string} message - Description of xref error
   * @param {number} [position=0] - Byte offset where the xref error occurred
   * @param {Object} [details={}] - Additional contextual metadata
   */
  constructor(message, position = 0, details = {}) {
    const formatted = `PdfXRefException at byte offset ${position}: ${message}`;
    super(formatted, {
      position,
      ...details
    });
    this.position = position;
  }
}
