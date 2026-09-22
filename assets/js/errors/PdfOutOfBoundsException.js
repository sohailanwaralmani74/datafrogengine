import { PdfException } from './PdfException.js';

/**
 * Thrown when an attempt is made to read or seek outside the bounds of a binary buffer.
 */
export class PdfOutOfBoundsException extends PdfException {
  /**
   * @param {number} requestedPosition - The target position or offset attempted to access
   * @param {number} bufferLength - The total length of the buffer
   * @param {number} requestedBytes - Number of bytes requested to read
   * @param {string} [operation='read'] - Name of the operation being executed
   */
  constructor(requestedPosition, bufferLength, requestedBytes = 0, operation = 'read') {
    const message = `Out of bounds during ${operation}: requested position ${requestedPosition} (+${requestedBytes} bytes) exceeds buffer length ${bufferLength}.`;
    super(message, {
      requestedPosition,
      bufferLength,
      requestedBytes,
      operation
    });
    this.requestedPosition = requestedPosition;
    this.bufferLength = bufferLength;
    this.requestedBytes = requestedBytes;
    this.operation = operation;
  }
}
