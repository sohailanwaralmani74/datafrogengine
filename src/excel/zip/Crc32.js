/**
 * IEEE 802.3 CRC32 checksum computation for ZIP archiving.
 */
const CRC_TABLE = new Uint32Array(256);

// Pre-compute CRC table
for (let i = 0; i < 256; i++) {
  let c = i >>> 0;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c >>> 0;
}

export class Crc32 {
  /**
   * Calculates the 32-bit CRC of a Uint8Array or Buffer.
   * 
   * @param {Uint8Array|Buffer|string} input
   * @param {number} [previousCrc=0]
   * @returns {number} Unsigned 32-bit integer
   */
  static calculate(input, previousCrc = 0) {
    let bytes;
    if (typeof input === 'string') {
      bytes = new TextEncoder().encode(input);
    } else if (input instanceof Uint8Array) {
      bytes = input;
    } else if (ArrayBuffer.isView(input)) {
      bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    } else {
      throw new TypeError('CRC32 input must be Uint8Array, Buffer, or string');
    }

    let crc = (previousCrc ^ (-1)) >>> 0;
    const len = bytes.length;
    for (let i = 0; i < len; i++) {
      crc = (CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8)) >>> 0;
    }

    return (crc ^ (-1)) >>> 0;
  }
}
