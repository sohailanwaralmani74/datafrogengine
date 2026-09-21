/**
 * Pure JavaScript AES (Rijndael) block cipher implementation supporting 128-bit and 256-bit keys in CBC mode with PKCS#7 padding.
 */

// Rijndael S-Box
const SBOX = new Uint8Array([
  0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
  0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
  0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
  0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
  0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
  0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
  0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
  0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
  0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
  0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
  0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
  0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
  0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
  0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
  0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
  0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16
]);

// Inverse S-Box
const INV_SBOX = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  INV_SBOX[SBOX[i]] = i;
}

// Rcon table
const RCON = [
  0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36
];

export class Aes {
  /**
   * Expands the key into round keys.
   * @param {Uint8Array} key - 16 bytes (128-bit) or 32 bytes (256-bit)
   * @returns {Uint32Array}
   */
  static expandKey(key) {
    const keyBytes = key.length;
    const nk = keyBytes >> 2; // 4 or 8
    const nr = nk + 6;        // 10 or 14 rounds
    const w = new Uint32Array((nr + 1) * 4);

    for (let i = 0; i < nk; i++) {
      w[i] = (key[4 * i] << 24) | (key[4 * i + 1] << 16) | (key[4 * i + 2] << 8) | key[4 * i + 3];
    }

    for (let i = nk; i < (nr + 1) * 4; i++) {
      let temp = w[i - 1];
      if (i % nk === 0) {
        // RotWord + SubWord + Rcon
        temp = (SBOX[(temp >>> 16) & 0xff] << 24) |
               (SBOX[(temp >>> 8) & 0xff] << 16) |
               (SBOX[temp & 0xff] << 8) |
               SBOX[temp >>> 24];
        temp ^= (RCON[i / nk] << 24);
      } else if (nk > 6 && i % nk === 4) {
        // SubWord for 256-bit AES
        temp = (SBOX[temp >>> 24] << 24) |
               (SBOX[(temp >>> 16) & 0xff] << 16) |
               (SBOX[(temp >>> 8) & 0xff] << 8) |
               SBOX[temp & 0xff];
      }
      w[i] = w[i - nk] ^ temp;
    }

    return w;
  }

  /**
   * Encrypts a single 16-byte block in place.
   * @private
   */
  static #encryptBlock(state, w, nr) {
    let s0 = (state[0] << 24) | (state[1] << 16) | (state[2] << 8) | state[3];
    let s1 = (state[4] << 24) | (state[5] << 16) | (state[6] << 8) | state[7];
    let s2 = (state[8] << 24) | (state[9] << 16) | (state[10] << 8) | state[11];
    let s3 = (state[12] << 24) | (state[13] << 16) | (state[14] << 8) | state[15];

    s0 ^= w[0];
    s1 ^= w[1];
    s2 ^= w[2];
    s3 ^= w[3];

    for (let round = 1; round < nr; round++) {
      const idx = round * 4;
      const b0 = SBOX[s0 >>> 24];
      const b1 = SBOX[(s1 >>> 16) & 0xff];
      const b2 = SBOX[(s2 >>> 8) & 0xff];
      const b3 = SBOX[s3 & 0xff];

      const b4 = SBOX[s1 >>> 24];
      const b5 = SBOX[(s2 >>> 16) & 0xff];
      const b6 = SBOX[(s3 >>> 8) & 0xff];
      const b7 = SBOX[s0 & 0xff];

      const b8 = SBOX[s2 >>> 24];
      const b9 = SBOX[(s3 >>> 16) & 0xff];
      const b10 = SBOX[(s0 >>> 8) & 0xff];
      const b11 = SBOX[s1 & 0xff];

      const b12 = SBOX[s3 >>> 24];
      const b13 = SBOX[(s0 >>> 16) & 0xff];
      const b14 = SBOX[(s1 >>> 8) & 0xff];
      const b15 = SBOX[s2 & 0xff];

      s0 = Aes.#mix(b0, b1, b2, b3) ^ w[idx];
      s1 = Aes.#mix(b4, b5, b6, b7) ^ w[idx + 1];
      s2 = Aes.#mix(b8, b9, b10, b11) ^ w[idx + 2];
      s3 = Aes.#mix(b12, b13, b14, b15) ^ w[idx + 3];
    }

    // Final round (no MixColumns)
    const idx = nr * 4;
    state[0] = SBOX[s0 >>> 24] ^ (w[idx] >>> 24);
    state[1] = SBOX[(s1 >>> 16) & 0xff] ^ ((w[idx] >>> 16) & 0xff);
    state[2] = SBOX[(s2 >>> 8) & 0xff] ^ ((w[idx] >>> 8) & 0xff);
    state[3] = SBOX[s3 & 0xff] ^ (w[idx] & 0xff);

    state[4] = SBOX[s1 >>> 24] ^ (w[idx + 1] >>> 24);
    state[5] = SBOX[(s2 >>> 16) & 0xff] ^ ((w[idx + 1] >>> 16) & 0xff);
    state[6] = SBOX[(s3 >>> 8) & 0xff] ^ ((w[idx + 1] >>> 8) & 0xff);
    state[7] = SBOX[s0 & 0xff] ^ (w[idx + 1] & 0xff);

    state[8] = SBOX[s2 >>> 24] ^ (w[idx + 2] >>> 24);
    state[9] = SBOX[(s3 >>> 16) & 0xff] ^ ((w[idx + 2] >>> 16) & 0xff);
    state[10] = SBOX[(s0 >>> 8) & 0xff] ^ ((w[idx + 2] >>> 8) & 0xff);
    state[11] = SBOX[s1 & 0xff] ^ (w[idx + 2] & 0xff);

    state[12] = SBOX[s3 >>> 24] ^ (w[idx + 3] >>> 24);
    state[13] = SBOX[(s0 >>> 16) & 0xff] ^ ((w[idx + 3] >>> 16) & 0xff);
    state[14] = SBOX[(s1 >>> 8) & 0xff] ^ ((w[idx + 3] >>> 8) & 0xff);
    state[15] = SBOX[s2 & 0xff] ^ (w[idx + 3] & 0xff);
  }

  /**
   * Decrypts a single 16-byte block in place.
   * @private
   */
  static #decryptBlock(state, w, nr) {
    let s0 = (state[0] << 24) | (state[1] << 16) | (state[2] << 8) | state[3];
    let s1 = (state[4] << 24) | (state[5] << 16) | (state[6] << 8) | state[7];
    let s2 = (state[8] << 24) | (state[9] << 16) | (state[10] << 8) | state[11];
    let s3 = (state[12] << 24) | (state[13] << 16) | (state[14] << 8) | state[15];

    s0 ^= w[nr * 4];
    s1 ^= w[nr * 4 + 1];
    s2 ^= w[nr * 4 + 2];
    s3 ^= w[nr * 4 + 3];

    for (let round = nr - 1; round > 0; round--) {
      const idx = round * 4;
      const b0 = INV_SBOX[s0 >>> 24];
      const b1 = INV_SBOX[(s3 >>> 16) & 0xff];
      const b2 = INV_SBOX[(s2 >>> 8) & 0xff];
      const b3 = INV_SBOX[s1 & 0xff];

      const b4 = INV_SBOX[s1 >>> 24];
      const b5 = INV_SBOX[(s0 >>> 16) & 0xff];
      const b6 = INV_SBOX[(s3 >>> 8) & 0xff];
      const b7 = INV_SBOX[s2 & 0xff];

      const b8 = INV_SBOX[s2 >>> 24];
      const b9 = INV_SBOX[(s1 >>> 16) & 0xff];
      const b10 = INV_SBOX[(s0 >>> 8) & 0xff];
      const b11 = INV_SBOX[s3 & 0xff];

      const b12 = INV_SBOX[s3 >>> 24];
      const b13 = INV_SBOX[(s2 >>> 16) & 0xff];
      const b14 = INV_SBOX[(s1 >>> 8) & 0xff];
      const b15 = INV_SBOX[s0 & 0xff];

      s0 = Aes.#invMix(b0, b1, b2, b3) ^ Aes.#invMixWord(w[idx]);
      s1 = Aes.#invMix(b4, b5, b6, b7) ^ Aes.#invMixWord(w[idx + 1]);
      s2 = Aes.#invMix(b8, b9, b10, b11) ^ Aes.#invMixWord(w[idx + 2]);
      s3 = Aes.#invMix(b12, b13, b14, b15) ^ Aes.#invMixWord(w[idx + 3]);
    }

    // Round 0
    state[0] = INV_SBOX[s0 >>> 24] ^ (w[0] >>> 24);
    state[1] = INV_SBOX[(s3 >>> 16) & 0xff] ^ ((w[0] >>> 16) & 0xff);
    state[2] = INV_SBOX[(s2 >>> 8) & 0xff] ^ ((w[0] >>> 8) & 0xff);
    state[3] = INV_SBOX[s1 & 0xff] ^ (w[0] & 0xff);

    state[4] = INV_SBOX[s1 >>> 24] ^ (w[1] >>> 24);
    state[5] = INV_SBOX[(s0 >>> 16) & 0xff] ^ ((w[1] >>> 16) & 0xff);
    state[6] = INV_SBOX[(s3 >>> 8) & 0xff] ^ ((w[1] >>> 8) & 0xff);
    state[7] = INV_SBOX[s2 & 0xff] ^ (w[1] & 0xff);

    state[8] = INV_SBOX[s2 >>> 24] ^ (w[2] >>> 24);
    state[9] = INV_SBOX[(s1 >>> 16) & 0xff] ^ ((w[2] >>> 16) & 0xff);
    state[10] = INV_SBOX[(s0 >>> 8) & 0xff] ^ ((w[2] >>> 8) & 0xff);
    state[11] = INV_SBOX[s3 & 0xff] ^ (w[2] & 0xff);

    state[12] = INV_SBOX[s3 >>> 24] ^ (w[3] >>> 24);
    state[13] = INV_SBOX[(s2 >>> 16) & 0xff] ^ ((w[3] >>> 16) & 0xff);
    state[14] = INV_SBOX[(s1 >>> 8) & 0xff] ^ ((w[3] >>> 8) & 0xff);
    state[15] = INV_SBOX[s0 & 0xff] ^ (w[3] & 0xff);
  }

  static #mix(a, b, c, d) {
    const d2 = (x) => ((x << 1) ^ (((x >>> 7) & 1) * 0x11b)) & 0xff;
    const d3 = (x) => d2(x) ^ x;
    return (
      ((d2(a) ^ d3(b) ^ c ^ d) << 24) |
      ((a ^ d2(b) ^ d3(c) ^ d) << 16) |
      ((a ^ b ^ d2(c) ^ d3(d)) << 8) |
      (d3(a) ^ b ^ c ^ d2(d))
    );
  }

  static #invMix(a, b, c, d) {
    const mul = (x, y) => {
      let p = 0;
      for (let i = 0; i < 8; i++) {
        if (y & 1) p ^= x;
        const hi = x & 0x80;
        x = (x << 1) & 0xff;
        if (hi) x ^= 0x1b;
        y >>>= 1;
      }
      return p;
    };
    return (
      ((mul(a, 0x0e) ^ mul(b, 0x0b) ^ mul(c, 0x0d) ^ mul(d, 0x09)) << 24) |
      ((mul(a, 0x09) ^ mul(b, 0x0e) ^ mul(c, 0x0b) ^ mul(d, 0x0d)) << 16) |
      ((mul(a, 0x0d) ^ mul(b, 0x09) ^ mul(c, 0x0e) ^ mul(d, 0x0b)) << 8) |
      (mul(a, 0x0b) ^ mul(b, 0x0d) ^ mul(c, 0x09) ^ mul(d, 0x0e))
    );
  }

  static #invMixWord(word) {
    return Aes.#invMix(
      (word >>> 24) & 0xff,
      (word >>> 16) & 0xff,
      (word >>> 8) & 0xff,
      word & 0xff
    );
  }

  /**
   * Encrypts plaintext in CBC mode with PKCS#7 padding and prepends 16-byte random IV.
   * 
   * @param {Uint8Array} key - 16 bytes (AES-128) or 32 bytes (AES-256)
   * @param {Uint8Array} data - Plaintext bytes
   * @param {Uint8Array} [iv=null] - Optional 16-byte IV (generated if omitted)
   * @returns {Uint8Array} IV + Ciphertext
   */
  static encryptCbc(key, data, iv = null) {
    const keyBytes = key instanceof Uint8Array ? key : new Uint8Array(key);
    const dataBytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const nr = (keyBytes.length >> 2) + 6;
    const w = Aes.expandKey(keyBytes);

    let actualIv = iv;
    if (!actualIv) {
      actualIv = new Uint8Array(16);
      for (let i = 0; i < 16; i++) {
        actualIv[i] = Math.floor(Math.random() * 256);
      }
    }

    // PKCS#7 padding
    const padLen = 16 - (dataBytes.length % 16);
    const paddedLen = dataBytes.length + padLen;
    const padded = new Uint8Array(paddedLen);
    padded.set(dataBytes, 0);
    padded.fill(padLen, dataBytes.length);

    const output = new Uint8Array(16 + paddedLen);
    output.set(actualIv, 0);

    let prevBlock = new Uint8Array(actualIv);
    const block = new Uint8Array(16);

    for (let offset = 0; offset < paddedLen; offset += 16) {
      for (let i = 0; i < 16; i++) {
        block[i] = padded[offset + i] ^ prevBlock[i];
      }
      Aes.#encryptBlock(block, w, nr);
      output.set(block, 16 + offset);
      prevBlock.set(block, 0);
    }

    return output;
  }

  /**
   * Decrypts IV + Ciphertext in CBC mode and strips PKCS#7 padding.
   * 
   * @param {Uint8Array} key
   * @param {Uint8Array} data - IV (16 bytes) + Ciphertext
   * @returns {Uint8Array} Plaintext bytes
   */
  static decryptCbc(key, data) {
    const keyBytes = key instanceof Uint8Array ? key : new Uint8Array(key);
    const dataBytes = data instanceof Uint8Array ? data : new Uint8Array(data);

    if (dataBytes.length < 32 || (dataBytes.length % 16) !== 0) {
      return new Uint8Array(0);
    }

    const nr = (keyBytes.length >> 2) + 6;
    const w = Aes.expandKey(keyBytes);

    const iv = dataBytes.subarray(0, 16);
    const cipherLen = dataBytes.length - 16;
    const decrypted = new Uint8Array(cipherLen);

    let prevBlock = iv;
    const block = new Uint8Array(16);

    for (let offset = 0; offset < cipherLen; offset += 16) {
      const cipherBlock = dataBytes.subarray(16 + offset, 16 + offset + 16);
      block.set(cipherBlock, 0);
      Aes.#decryptBlock(block, w, nr);
      for (let i = 0; i < 16; i++) {
        decrypted[offset + i] = block[i] ^ prevBlock[i];
      }
      prevBlock = cipherBlock;
    }

    // Strip PKCS#7 padding
    const padLen = decrypted[decrypted.length - 1];
    if (padLen > 0 && padLen <= 16) {
      let validPad = true;
      for (let i = decrypted.length - padLen; i < decrypted.length; i++) {
        if (decrypted[i] !== padLen) {
          validPad = false;
          break;
        }
      }
      if (validPad) {
        return decrypted.subarray(0, decrypted.length - padLen);
      }
    }

    return decrypted;
  }
}
