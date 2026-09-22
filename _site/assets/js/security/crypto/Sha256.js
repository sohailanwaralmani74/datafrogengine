/**
 * Pure JavaScript SHA-256 cryptographic hash implementation (FIPS 180-4).
 */
export class Sha256 {
  /**
   * Computes the 32-byte SHA-256 hash of input bytes or string.
   * 
   * @param {Uint8Array|ArrayBuffer|string} input
   * @returns {Uint8Array} 32-byte raw digest
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
    const wordCount = (((byteLen + 8) >> 6) + 1) << 4;
    const words = new Int32Array(wordCount);

    for (let i = 0; i < byteLen; i++) {
      words[i >> 2] |= bytes[i] << (24 - ((i % 4) << 3));
    }
    words[byteLen >> 2] |= 0x80 << (24 - ((byteLen % 4) << 3));
    const bitLen = byteLen * 8;
    words[wordCount - 2] = Math.floor(bitLen / 0x100000000) & 0xffffffff;
    words[wordCount - 1] = bitLen & 0xffffffff;

    let h0 = 0x6a09e667;
    let h1 = 0xbb67ae85;
    let h2 = 0x3c6ef372;
    let h3 = 0xa54ff53a;
    let h4 = 0x510e527f;
    let h5 = 0x9b05688c;
    let h6 = 0x1f83d9ab;
    let h7 = 0x5be0cd19;

    const K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];

    const W = new Int32Array(64);

    for (let i = 0; i < wordCount; i += 16) {
      for (let t = 0; t < 16; t++) {
        W[t] = words[i + t];
      }
      for (let t = 16; t < 64; t++) {
        const gamma0 = ((W[t - 15] >>> 7) | (W[t - 15] << 25)) ^
                       ((W[t - 15] >>> 18) | (W[t - 15] << 14)) ^
                       (W[t - 15] >>> 3);
        const gamma1 = ((W[t - 2] >>> 17) | (W[t - 2] << 15)) ^
                       ((W[t - 2] >>> 19) | (W[t - 2] << 13)) ^
                       (W[t - 2] >>> 10);
        W[t] = (gamma1 + W[t - 7] + gamma0 + W[t - 16]) | 0;
      }

      let a = h0;
      let b = h1;
      let c = h2;
      let d = h3;
      let e = h4;
      let f = h5;
      let g = h6;
      let h = h7;

      for (let t = 0; t < 64; t++) {
        const sigma1 = ((e >>> 6) | (e << 26)) ^
                       ((e >>> 11) | (e << 21)) ^
                       ((e >>> 25) | (e << 7));
        const ch = (e & f) ^ ((~e) & g);
        const t1 = (h + sigma1 + ch + K[t] + W[t]) | 0;
        const sigma0 = ((a >>> 2) | (a << 30)) ^
                       ((a >>> 13) | (a << 19)) ^
                       ((a >>> 22) | (a << 10));
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (sigma0 + maj) | 0;

        h = g;
        g = f;
        f = e;
        e = (d + t1) | 0;
        d = c;
        c = b;
        b = a;
        a = (t1 + t2) | 0;
      }

      h0 = (h0 + a) | 0;
      h1 = (h1 + b) | 0;
      h2 = (h2 + c) | 0;
      h3 = (h3 + d) | 0;
      h4 = (h4 + e) | 0;
      h5 = (h5 + f) | 0;
      h6 = (h6 + g) | 0;
      h7 = (h7 + h) | 0;
    }

    const digest = new Uint8Array(32);
    const resultWords = [h0, h1, h2, h3, h4, h5, h6, h7];
    for (let i = 0; i < 8; i++) {
      digest[i * 4] = (resultWords[i] >>> 24) & 0xff;
      digest[i * 4 + 1] = (resultWords[i] >>> 16) & 0xff;
      digest[i * 4 + 2] = (resultWords[i] >>> 8) & 0xff;
      digest[i * 4 + 3] = resultWords[i] & 0xff;
    }

    return digest;
  }

  /**
   * Computes hex digest string.
   * @param {Uint8Array|string} input
   * @returns {string} 64-character lowercase hex string
   */
  static hex(input) {
    const bytes = Sha256.hash(input);
    let hexStr = '';
    for (let i = 0; i < 32; i++) {
      hexStr += bytes[i].toString(16).padStart(2, '0');
    }
    return hexStr;
  }
}
