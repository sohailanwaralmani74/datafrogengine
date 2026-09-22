import { PdfException } from './PdfException.js';

/**
 * Thrown when an invalid argument is passed to a PDF Engine function or method.
 */
export class PdfInvalidArgumentException extends PdfException {
  /**
   * @param {string} argumentName - Name of the invalid argument
   * @param {*} value - The invalid value passed
   * @param {string} expected - Description of what was expected
   */
  constructor(argumentName, value, expected) {
    const message = `Invalid argument '${argumentName}': received ${typeof value} (${String(value)}), expected ${expected}.`;
    super(message, {
      argumentName,
      receivedType: typeof value,
      receivedValue: String(value),
      expected
    });
    this.argumentName = argumentName;
  }
}
