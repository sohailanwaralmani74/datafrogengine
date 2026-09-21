/**
 * Pure JavaScript MD5 cryptographic hash implementation (RFC 1321).
 */
export class Md5 {
  /**
   * Computes the 16-byte MD5 hash of input bytes or string.
   * 
   * @param {Uint8Array|ArrayBuffer|string} input
   * @returns {Uint8Array} 16-byte raw digest
   */
  static hash(input) {
    let bytes;
    if (typeof input === 'string') {
      bytes = new TextEncoder().encode(input);
    } else if (input instanceof Uint8Array) {
      bytes = input;
    } else if (input instanceof ArrayBuffer) {
      bytes = new Uint8Array(input);
    } else if (Array.isArray(input)) {
      bytes = new Uint8Array(input);
    } else {
      bytes = new Uint8Array(0);
    }

    const byteLen = bytes.length;
    // Number of 32-bit words needed (padded to 64-byte block boundary)
    const wordCount = (((byteLen + 8) >> 6) + 1) << 4;
    const words = new Int32Array(wordCount);

    for (let i = 0; i < byteLen; i++) {
      words[i >> 2] |= bytes[i] << ((i % 4) << 3);
    }
    // Append padding bit '1'
    words[byteLen >> 2] |= 0x80 << ((byteLen % 4) << 3);
    // Append 64-bit length (in bits)
    const bitLen = byteLen * 8;
    words[wordCount - 2] = bitLen & 0xffffffff;
    words[wordCount - 1] = Math.floor(bitLen / 0x100000000) & 0xffffffff;

    let a = 0x67452301;
    let b = 0xefcdab89;
    let c = 0x98badcfe;
    let d = 0x10325476;

    const S = [
      7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
      5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
      4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
      6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
    ];

    const K = [
      0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
      0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
      0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
      0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
      0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
      0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
      0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
      0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391
    ];

    for (let i = 0; i < wordCount; i += 16) {
      let aa = a;
      let bb = b;
      let cc = c;
      let dd = d;

      for (let j = 0; j < 64; j++) {
        let f;
        let g;

        if (j < 16) {
          f = (b & c) | ((~b) & d);
          g = j;
        } else if (j < 32) {
          f = (d & b) | ((~d) & c);
          g = (5 * j + 1) % 16;
        } else if (j < 48) {
          f = b ^ c ^ d;
          g = (3 * j + 5) % 16;
        } else {
          f = c ^ (b | (~d));
          g = (7 * j) % 16;
        }

        const temp = d;
        d = c;
        c = b;
        const sum = (a + f + K[j] + words[i + g]) | 0;
        const rot = (sum << S[j]) | (sum >>> (32 - S[j]));
        b = (b + rot) | 0;
        a = temp;
      }

      a = (a + aa) | 0;
      b = (b + bb) | 0;
      c = (c + cc) | 0;
      d = (d + dd) | 0;
    }

    const digest = new Uint8Array(16);
    const resultWords = [a, b, c, d];
    for (let i = 0; i < 4; i++) {
      digest[i * 4] = resultWords[i] & 0xff;
      digest[i * 4 + 1] = (resultWords[i] >> 8) & 0xff;
      digest[i * 4 + 2] = (resultWords[i] >> 16) & 0xff;
      digest[i * 4 + 3] = (resultWords[i] >> 24) & 0xff;
    }

    return digest;
  }

  /**
   * Computes hex digest string.
   * @param {Uint8Array|string} input
   * @returns {string} 32-character lowercase hex string
   */
  static hex(input) {
    const bytes = Md5.hash(input);
    let hexStr = '';
    for (let i = 0; i < 16; i++) {
      hexStr += bytes[i].toString(16).padStart(2, '0');
    }
    return hexStr;
  }
}
