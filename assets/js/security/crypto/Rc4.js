/**
 * Pure JavaScript RC4 (Arcfour) stream cipher implementation.
 */
export class Rc4 {
  /**
   * Encrypts or decrypts bytes using RC4 with the specified key.
   * 
   * @param {Uint8Array} key
   * @param {Uint8Array} data
   * @returns {Uint8Array}
   */
  static process(key, data) {
    if (!(key instanceof Uint8Array)) {
      key = new Uint8Array(key);
    }
    if (!(data instanceof Uint8Array)) {
      data = new Uint8Array(data);
    }

    const keyLen = key.length;
    if (keyLen === 0) {
      return new Uint8Array(data);
    }

    // Key-Scheduling Algorithm (KSA)
    const s = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      s[i] = i;
    }

    let j = 0;
    for (let i = 0; i < 256; i++) {
      j = (j + s[i] + key[i % keyLen]) & 0xff;
      const temp = s[i];
      s[i] = s[j];
      s[j] = temp;
    }

    // Pseudo-Random Generation Algorithm (PRGA)
    const dataLen = data.length;
    const output = new Uint8Array(dataLen);
    let i = 0;
    j = 0;

    for (let k = 0; k < dataLen; k++) {
      i = (i + 1) & 0xff;
      j = (j + s[i]) & 0xff;
      const temp = s[i];
      s[i] = s[j];
      s[j] = temp;

      const t = (s[i] + s[j]) & 0xff;
      output[k] = data[k] ^ s[t];
    }

    return output;
  }
}
