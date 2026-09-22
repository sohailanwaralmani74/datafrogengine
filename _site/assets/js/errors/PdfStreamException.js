import { PdfException } from './PdfException.js';

/**
 * Thrown when an error occurs during stream decoding, decompression, or predictor filtering.
 */
export class PdfStreamException extends PdfException {
  /**
   * @param {string} message - Description of the stream/filter error
   * @param {string} [filterName=''] - Name of the filter that failed
   * @param {Object} [details={}] - Additional metadata
   */
  constructor(message, filterName = '', details = {}) {
    const formatted = `PdfStreamException${filterName ? ` [${filterName}]` : ''}: ${message}`;
    super(formatted, {
      filterName,
      ...details
    });
    this.filterName = filterName;
  }
}
