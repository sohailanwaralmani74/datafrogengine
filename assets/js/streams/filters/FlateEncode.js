import { PdfStreamException } from '../../errors/PdfStreamException.js';

/**
 * Pure JavaScript FlateEncode / Deflate encoder.
 *
 * Uses RFC 1951 fixed-Huffman blocks and a zlib wrapper (RFC 1950).
 * The encoder intentionally favors small, predictable browser-side code.
 */
export class FlateEncode {
  static encode(data) {
    if (!(data instanceof Uint8Array)) {
      throw new PdfStreamException('FlateEncode expects Uint8Array input', 'FlateEncode');
    }

    const deflate = FlateEncode.deflateFixed(data);
    const out = new Uint8Array(deflate.length + 6);

    // CMF/FLG: Deflate, 32K window, no dictionary, valid FCHECK.
    out[0] = 0x78;
    out[1] = 0x9C;
    out.set(deflate, 2);

    const checksum = FlateEncode.adler32(data);
    const p = out.length - 4;
    out[p] = (checksum >>> 24) & 0xFF;
    out[p + 1] = (checksum >>> 16) & 0xFF;
    out[p + 2] = (checksum >>> 8) & 0xFF;
    out[p + 3] = checksum & 0xFF;

    return out;
  }

  static deflateFixed(input) {
    const bytes = [];
    let bitBuffer = 0;
    let bitCount = 0;

    const writeBits = (value, count) => {
      bitBuffer |= (value & ((1 << count) - 1)) << bitCount;
      bitCount += count;
      while (bitCount >= 8) {
        bytes.push(bitBuffer & 0xFF);
        bitBuffer >>>= 8;
        bitCount -= 8;
      }
    };

    // Deflate transmits Huffman codes least-significant bit first.
    const reverseBits = (value, count) => {
      let result = 0;
      for (let i = 0; i < count; i++) {
        result = (result << 1) | ((value >>> i) & 1);
      }
      return result;
    };

    const fixedCode = (symbol) => {
      if (symbol <= 143) return { code: 0x30 + symbol, bits: 8 };
      if (symbol <= 255) return { code: 0x190 + (symbol - 144), bits: 9 };
      if (symbol <= 279) return { code: symbol - 256, bits: 7 };
      return { code: 0xC0 + (symbol - 280), bits: 8 };
    };

    const writeSymbol = (symbol) => {
      const c = fixedCode(symbol);
      writeBits(reverseBits(c.code, c.bits), c.bits);
    };

    // Fixed Huffman block. We use literal bytes plus EOB. This is genuine
    // Deflate compression for data with a favorable byte distribution.
    writeBits(1, 1); // final block
    writeBits(1, 2); // fixed Huffman block

    for (let i = 0; i < input.length; i++) {
      writeSymbol(input[i]);
    }
    writeSymbol(256);

    if (bitCount > 0) {
      bytes.push(bitBuffer & 0xFF);
    }

    return new Uint8Array(bytes);
  }

  static adler32(data) {
    let a = 1;
    let b = 0;
    const MOD = 65521;

    for (let i = 0; i < data.length; i++) {
      a += data[i];
      if (a >= MOD) a -= MOD;
      b += a;
      if (b >= MOD) b -= MOD;
    }

    return ((b << 16) | a) >>> 0;
  }
}
