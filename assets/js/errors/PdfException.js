/**
 * Base exception class for all PDF Engine errors.
 */
export class PdfException extends Error {
  /**
   * @param {string} message - Human-readable error description
   * @param {Object} [details={}] - Additional contextual metadata (e.g. position, objectId, etc.)
   */
  constructor(message, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Returns formatted string representation with details if present.
   * @returns {string}
   */
  toString() {
    const detailsStr = Object.keys(this.details).length > 0
      ? ` | Details: ${JSON.stringify(this.details)}`
      : '';
    return `${this.name}: ${this.message}${detailsStr}`;
  }
}
