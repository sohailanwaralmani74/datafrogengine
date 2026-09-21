/**
 * Pure JavaScript PNG Encoder.
 * Encodes raw 32-bit RGBA pixel buffers into valid PNG image byte files without any dependencies.
 */
export class PdfPngEncoder {
  static #crcTable = null;

  /**
   * Initializes standard CRC-32 table.
   * @private
   */
  static #initCrcTable() {
    if (PdfPngEncoder.#crcTable) return;
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c;
    }
    PdfPngEncoder.#crcTable = table;
  }

  /**
   * Computes CRC-32 for byte arrays.
   * @private
   */
  static #crc32(bytes, start = 0, length = bytes.length) {
    PdfPngEncoder.#initCrcTable();
    let c = 0xFFFFFFFF;
    const table = PdfPngEncoder.#crcTable;
    const end = start + length;
    for (let i = start; i < end; i++) {
      c = table[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /**
   * Computes Adler-32 checksum for ZLIB data integrity.
   * @private
   */
  static #adler32(bytes) {
    let s1 = 1;
    let s2 = 0;
    const MOD = 65521;
    for (let i = 0; i < bytes.length; i++) {
      s1 = (s1 + bytes[i]) % MOD;
      s2 = (s2 + s1) % MOD;
    }
    return ((s2 << 16) | s1) >>> 0;
  }

  /**
   * Encodes an RGBA byte buffer into a PNG image byte stream.
   * 
   * @param {Uint8Array} rgba - 32-bit RGBA pixel buffer (width * height * 4)
   * @param {number} width - Image width in pixels
   * @param {number} height - Image height in pixels
   * @returns {Uint8Array} - Complete PNG file bytes
   */
  static encode(rgba, width, height) {
    if (!rgba || width <= 0 || height <= 0) {
      throw new Error('Invalid image dimensions or pixel data for PNG encoding');
    }

    // 1. Prepare uncompressed scanline data with filter byte 0 (None) at start of each row
    const rowBytes = width * 4;
    const scanlines = new Uint8Array(height * (1 + rowBytes));
    let srcOffset = 0;
    let dstOffset = 0;

    for (let row = 0; row < height; row++) {
      scanlines[dstOffset++] = 0; // Filter tag 0: None
      scanlines.set(rgba.subarray(srcOffset, srcOffset + rowBytes), dstOffset);
      srcOffset += rowBytes;
      dstOffset += rowBytes;
    }

    // 2. Compress scanlines using RFC 1950 ZLIB container with RFC 1951 Deflate non-compressed blocks
    const MAX_BLOCK = 65535;
    const numBlocks = Math.ceil(scanlines.length / MAX_BLOCK) || 1;
    // ZLIB header (2) + blocks (5 bytes header each + payload) + Adler32 (4)
    const zlibLen = 2 + numBlocks * 5 + scanlines.length + 4;
    const zlibData = new Uint8Array(zlibLen);

    zlibData[0] = 0x78; // CMF (Deflate, 32K window)
    zlibData[1] = 0x01; // FLG (No preset dict, check bits)

    let zPos = 2;
    let scanPos = 0;

    for (let b = 0; b < numBlocks; b++) {
      const isFinal = (b === numBlocks - 1) ? 1 : 0;
      const blockLen = Math.min(MAX_BLOCK, scanlines.length - scanPos);
      const nlen = blockLen ^ 0xFFFF;

      zlibData[zPos++] = isFinal; // BFINAL (1 bit) + BTYPE 00 (2 bits)
      zlibData[zPos++] = blockLen & 0xFF;
      zlibData[zPos++] = (blockLen >>> 8) & 0xFF;
      zlibData[zPos++] = nlen & 0xFF;
      zlibData[zPos++] = (nlen >>> 8) & 0xFF;

      zlibData.set(scanlines.subarray(scanPos, scanPos + blockLen), zPos);
      zPos += blockLen;
      scanPos += blockLen;
    }

    // Append Adler-32
    const adler = PdfPngEncoder.#adler32(scanlines);
    zlibData[zPos++] = (adler >>> 24) & 0xFF;
    zlibData[zPos++] = (adler >>> 16) & 0xFF;
    zlibData[zPos++] = (adler >>> 8) & 0xFF;
    zlibData[zPos++] = adler & 0xFF;

    // 3. Assemble PNG Chunks: Signature + IHDR + IDAT + IEND
    // Signature: 8 bytes
    // IHDR: 8 (len+type) + 13 + 4 (crc) = 25 bytes
    // IDAT: 8 (len+type) + zlibLen + 4 (crc) = 12 + zlibLen bytes
    // IEND: 8 (len+type) + 0 + 4 (crc) = 12 bytes
    const totalPngSize = 8 + 25 + (12 + zlibLen) + 12;
    const png = new Uint8Array(totalPngSize);
    let p = 0;

    // PNG Signature
    png.set([137, 80, 78, 71, 13, 10, 26, 10], p);
    p += 8;

    // IHDR Chunk
    p = PdfPngEncoder.#writeChunk(png, p, 'IHDR', (() => {
      const data = new Uint8Array(13);
      const view = new DataView(data.buffer);
      view.setUint32(0, width, false);
      view.setUint32(4, height, false);
      data[8] = 8; // Bit depth: 8
      data[9] = 6; // Color type: 6 (RGBA)
      data[10] = 0; // Compression: Deflate
      data[11] = 0; // Filter: Adaptive
      data[12] = 0; // Interlace: None
      return data;
    })());

    // IDAT Chunk
    p = PdfPngEncoder.#writeChunk(png, p, 'IDAT', zlibData);

    // IEND Chunk
    p = PdfPngEncoder.#writeChunk(png, p, 'IEND', new Uint8Array(0));

    return png;
  }

  /**
   * Writes a single PNG chunk into the buffer.
   * @private
   */
  static #writeChunk(buffer, offset, typeStr, chunkData) {
    const dataLen = chunkData.length;
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    // 4 bytes Length
    view.setUint32(offset, dataLen, false);
    offset += 4;

    // 4 bytes Type
    const typeStart = offset;
    for (let i = 0; i < 4; i++) {
      buffer[offset++] = typeStr.charCodeAt(i);
    }

    // Chunk Data
    if (dataLen > 0) {
      buffer.set(chunkData, offset);
      offset += dataLen;
    }

    // 4 bytes CRC (calculated over Type + Data)
    const crc = PdfPngEncoder.#crc32(buffer, typeStart, 4 + dataLen);
    view.setUint32(offset, crc, false);
    offset += 4;

    return offset;
  }
}
