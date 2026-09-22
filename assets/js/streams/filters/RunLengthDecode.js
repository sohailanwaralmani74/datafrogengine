import { PdfStreamException } from '../../errors/PdfStreamException.js';

/**
 * Implements PDF RunLengthDecode filter.
 */
export class RunLengthDecode {
  /**
   * Decodes a byte-level Run Length encoded stream.
   * 
   * @param {Uint8Array} data - Encoded input bytes
   * @returns {Uint8Array} - Decoded binary bytes
   */
  static decode(data) {
    const output = [];
    let i = 0;

    while (i < data.length) {
      const len = data[i++];

      // EOD marker (128)
      if (len === 128) {
        break;
      }

      if (len < 128) {
        // Copy next len + 1 literal bytes
        const count = len + 1;
        if (i + count > data.length) {
          throw new PdfStreamException('Unexpected EOF while reading literal run length bytes', 'RunLengthDecode');
        }
        for (let j = 0; j < count; j++) {
          output.push(data[i++]);
        }
      } else {
        // Repeat next byte (257 - len) times
        if (i >= data.length) {
          throw new PdfStreamException('Unexpected EOF while reading repeat byte', 'RunLengthDecode');
        }
        const repeatCount = 257 - len;
        const byteToRepeat = data[i++];
        for (let j = 0; j < repeatCount; j++) {
          output.push(byteToRepeat);
        }
      }
    }

    return new Uint8Array(output);
  }
}
