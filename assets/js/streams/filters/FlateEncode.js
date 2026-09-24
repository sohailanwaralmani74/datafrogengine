import { PdfStreamException } from '../../errors/PdfStreamException.js';

/**
 * Pure JavaScript FlateEncode / Deflate encoder.
 *
 * Produces a zlib-wrapped RFC 1951 fixed-Huffman stream using a small
 * LZ77 match finder. It is synchronous and browser-safe.
 */
export class FlateEncode {
  static encode(data) {
    if (!(data instanceof Uint8Array)) {
      throw new PdfStreamException('FlateEncode expects Uint8Array input', 'FlateEncode');
    }

    const deflate = FlateEncode.deflateFixed(data);
    const out = new Uint8Array(deflate.length + 6);
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
      while (count > 0) {
        const take = Math.min(count, 8 - bitCount);
        bitBuffer |= (value & ((1 << take) - 1)) << bitCount;
        bitBuffer >>>= 0;
        bitCount += take;
        value >>>= take;
        count -= take;
        if (bitCount === 8) {
          bytes.push(bitBuffer & 0xFF);
          bitBuffer = 0;
          bitCount = 0;
        }
      }
    };

    const reverseBits = (value, count) => {
      let result = 0;
      for (let i = 0; i < count; i++) result = (result << 1) | ((value >>> i) & 1);
      return result;
    };

    const fixedCode = (symbol) => {
      if (symbol <= 143) return { code: 0x30 + symbol, bits: 8 };
      if (symbol <= 255) return { code: 0x190 + symbol - 144, bits: 9 };
      if (symbol <= 279) return { code: symbol - 256, bits: 7 };
      return { code: 0xC0 + symbol - 280, bits: 8 };
    };

    const writeSymbol = (symbol) => {
      const c = fixedCode(symbol);
      writeBits(reverseBits(c.code, c.bits), c.bits);
    };

    const LENGTH_BASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
    const LENGTH_EXTRA = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
    const DIST_BASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
    const DIST_EXTRA = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];

    const writeLength = (length) => {
      let i = LENGTH_BASE.length - 1;
      for (let j = 0; j < LENGTH_BASE.length; j++) {
        const max = LENGTH_BASE[j] + ((1 << LENGTH_EXTRA[j]) - 1);
        if (length >= LENGTH_BASE[j] && length <= max) { i = j; break; }
      }
      writeSymbol(257 + i);
      if (LENGTH_EXTRA[i]) writeBits(length - LENGTH_BASE[i], LENGTH_EXTRA[i]);
    };

    const writeDistance = (distance) => {
      let i = DIST_BASE.length - 1;
      for (let j = 0; j < DIST_BASE.length; j++) {
        const max = DIST_BASE[j] + ((1 << DIST_EXTRA[j]) - 1);
        if (distance >= DIST_BASE[j] && distance <= max) { i = j; break; }
      }
      writeBits(reverseBits(i, 5), 5);
      if (DIST_EXTRA[i]) writeBits(distance - DIST_BASE[i], DIST_EXTRA[i]);
    };

    writeBits(1, 1);
    writeBits(1, 2);

    const chains = new Map();
    const addPosition = (pos) => {
      if (pos + 2 >= input.length) return;
      const key = (input[pos] << 16) | (input[pos + 1] << 8) | input[pos + 2];
      let list = chains.get(key);
      if (!list) { list = []; chains.set(key, list); }
      list.push(pos);
      if (list.length > 48) list.shift();
    };

    let i = 0;
    while (i < input.length) {
      let bestLength = 0;
      let bestDistance = 0;

      if (i + 2 < input.length) {
        const key = (input[i] << 16) | (input[i + 1] << 8) | input[i + 2];
        const list = chains.get(key);
        if (list) {
          for (let c = list.length - 1, checked = 0; c >= 0 && checked < 32; c--, checked++) {
            const pos = list[c];
            const distance = i - pos;
            if (distance < 1 || distance > 32768) continue;

            let len = 3;
            const maxLen = Math.min(258, input.length - i);
            while (len < maxLen && input[pos + len] === input[i + len]) len++;

            if (len > bestLength) {
              bestLength = len;
              bestDistance = distance;
              if (len === maxLen) break;
            }
          }
        }
      }

      if (bestLength >= 3) {
        writeLength(bestLength);
        writeDistance(bestDistance);
        for (let k = 0; k < bestLength; k++) addPosition(i + k);
        i += bestLength;
      } else {
        writeSymbol(input[i]);
        addPosition(i);
        i++;
      }
    }

    writeSymbol(256);
    if (bitCount > 0) bytes.push(bitBuffer & 0xFF);
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
