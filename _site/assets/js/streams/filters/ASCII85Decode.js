import { PdfStreamException } from '../../errors/PdfStreamException.js';

/**
 * Implements PDF ASCII85Decode (Base85) filter.
 */
export class ASCII85Decode {
  /**
   * Decodes an ASCII85 encoded byte stream.
   * 
   * @param {Uint8Array} data - Encoded input bytes
   * @returns {Uint8Array} - Decoded binary bytes
   */
  static decode(data) {
    const bytes = [];
    let tuple = 0;
    let count = 0;

    for (let i = 0; i < data.length; i++) {
      const c = data[i];

      // Check for EOD marker '~>'
      if (c === 0x7E) { // '~'
        if (i + 1 < data.length && data[i + 1] === 0x3E) { // '>'
          break;
        }
      }

      // Skip whitespace
      if (c === 0x00 || c === 0x09 || c === 0x0A || c === 0x0C || c === 0x0D || c === 0x20) {
        continue;
      }

      // 'z' stands for 4 zero bytes
      if (c === 0x7A) { // 'z'
        if (count !== 0) {
          throw new PdfStreamException("'z' character inside ASCII85 5-tuple", 'ASCII85Decode');
        }
        bytes.push(0, 0, 0, 0);
        continue;
      }

      // ASCII85 characters range from '!' (33) to 'u' (117)
      if (c < 33 || c > 117) {
        throw new PdfStreamException(`Invalid ASCII85 character code ${c} ('${String.fromCharCode(c)}')`, 'ASCII85Decode');
      }

      tuple = tuple * 85 + (c - 33);
      count++;

      if (count === 5) {
        bytes.push(
          (tuple >>> 24) & 0xFF,
          (tuple >>> 16) & 0xFF,
          (tuple >>> 8) & 0xFF,
          tuple & 0xFF
        );
        tuple = 0;
        count = 0;
      }
    }

    // Handle remaining partial tuple (2 to 4 characters)
    if (count > 0) {
      if (count === 1) {
        throw new PdfStreamException('Single character remaining in ASCII85 stream (expected at least 2)', 'ASCII85Decode');
      }

      for (let i = count; i < 5; i++) {
        tuple = tuple * 85 + 84; // Pad with 'u' (84)
      }

      // Emit count - 1 bytes
      if (count >= 2) bytes.push((tuple >>> 24) & 0xFF);
      if (count >= 3) bytes.push((tuple >>> 16) & 0xFF);
      if (count >= 4) bytes.push((tuple >>> 8) & 0xFF);
    }

    return new Uint8Array(bytes);
  }
}
