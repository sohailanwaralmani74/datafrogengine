import { PdfStreamException } from '../../errors/PdfStreamException.js';

/**
 * Implements PDF ASCIIHexDecode filter.
 */
export class ASCIIHexDecode {
  /**
   * Decodes an ASCII hexadecimal encoded byte stream.
   * 
   * @param {Uint8Array} data - Encoded input bytes
   * @returns {Uint8Array} - Decoded binary bytes
   */
  static decode(data) {
    const hexDigits = [];
    
    for (let i = 0; i < data.length; i++) {
      const byte = data[i];
      
      // Stop on EOD delimiter '>' (0x3E)
      if (byte === 0x3E) {
        break;
      }
      
      // Skip whitespace
      if (byte === 0x00 || byte === 0x09 || byte === 0x0A || byte === 0x0C || byte === 0x0D || byte === 0x20) {
        continue;
      }
      
      // Hex digits: 0-9 (0x30-0x39), A-F (0x41-0x46), a-f (0x61-0x66)
      if ((byte >= 0x30 && byte <= 0x39) ||
          (byte >= 0x41 && byte <= 0x46) ||
          (byte >= 0x61 && byte <= 0x66)) {
        hexDigits.push(String.fromCharCode(byte));
      } else {
        throw new PdfStreamException(`Invalid hexadecimal byte 0x${byte.toString(16)}`, 'ASCIIHexDecode');
      }
    }

    // If odd number of hex digits, append '0'
    if (hexDigits.length % 2 !== 0) {
      hexDigits.push('0');
    }

    const hexStr = hexDigits.join('');
    const output = new Uint8Array(hexStr.length / 2);
    for (let i = 0; i < hexStr.length; i += 2) {
      output[i / 2] = parseInt(hexStr.substring(i, i + 2), 16);
    }

    return output;
  }
}
