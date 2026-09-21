import { PdfStreamException } from '../../errors/PdfStreamException.js';

/**
 * Implements PDF LZWDecode filter per ISO 32000-1 specifications.
 */
export class LZWDecode {
  /**
   * Decodes an LZW encoded byte stream.
   * 
   * @param {Uint8Array} data - Encoded input bytes
   * @param {Object} [params={}] - Optional /DecodeParms (e.g. EarlyChange)
   * @returns {Uint8Array} - Decoded binary bytes
   */
  static decode(data, params = {}) {
    const earlyChange = params.EarlyChange !== undefined ? params.EarlyChange : 1;
    const output = [];

    // Helper bit reader
    let bytePtr = 0;
    let bitBuffer = 0;
    let bitsInBuffer = 0;

    const readBits = (numBits) => {
      while (bitsInBuffer < numBits) {
        if (bytePtr >= data.length) {
          return -1; // EOF
        }
        bitBuffer = (bitBuffer << 8) | data[bytePtr++];
        bitsInBuffer += 8;
      }
      const val = (bitBuffer >>> (bitsInBuffer - numBits)) & ((1 << numBits) - 1);
      bitsInBuffer -= numBits;
      return val;
    };

    let table = [];
    let codeLength = 9;

    const resetTable = () => {
      table = new Array(4096);
      for (let i = 0; i < 256; i++) {
        table[i] = [i];
      }
      table[256] = []; // ClearTable
      table[257] = []; // EOD
      codeLength = 9;
    };

    resetTable();
    let prevCode = -1;
    let tableIndex = 258;

    while (true) {
      const code = readBits(codeLength);
      if (code === -1 || code === 257) { // EOF or EOD code
        break;
      }

      if (code === 256) { // Clear table
        resetTable();
        tableIndex = 258;
        prevCode = -1;
        continue;
      }

      let sequence;
      if (code < tableIndex) {
        sequence = table[code];
      } else if (code === tableIndex && prevCode !== -1) {
        sequence = [...table[prevCode], table[prevCode][0]];
      } else {
        throw new PdfStreamException(`Invalid LZW code ${code} (table size ${tableIndex})`, 'LZWDecode');
      }

      for (let i = 0; i < sequence.length; i++) {
        output.push(sequence[i]);
      }

      if (prevCode !== -1 && tableIndex < 4096) {
        table[tableIndex++] = [...table[prevCode], sequence[0]];

        // Adjust code length
        const threshold = (1 << codeLength) - earlyChange;
        if (tableIndex >= threshold && codeLength < 12) {
          codeLength++;
        }
      }

      prevCode = code;
    }

    return new Uint8Array(output);
  }
}
