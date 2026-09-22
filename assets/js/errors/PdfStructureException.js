import { PdfException } from './PdfException.js';

/**
 * Thrown when PDF document structural elements (Catalog, Pages, Page, Trailer) are invalid or missing.
 */
export class PdfStructureException extends PdfException {
  /**
   * @param {string} message - Description of the structural error
   * @param {Object} [details={}] - Contextual details
   */
  constructor(message, details = {}) {
    const formatted = `PdfStructureException: ${message}`;
    super(formatted, details);
  }
}
