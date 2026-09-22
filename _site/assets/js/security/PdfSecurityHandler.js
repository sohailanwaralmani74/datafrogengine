import { Md5 } from './crypto/Md5.js';
import { Sha256 } from './crypto/Sha256.js';
import { Rc4 } from './crypto/Rc4.js';
import { Aes } from './crypto/Aes.js';
import { PdfPermissions } from './PdfPermissions.js';
import { PdfName } from '../objects/PdfName.js';
import { PdfNumber } from '../objects/PdfNumber.js';
import { PdfString } from '../objects/PdfString.js';
import { PdfHexString } from '../objects/PdfHexString.js';



import { PdfDictionary } from '../objects/PdfDictionary.js';
import { PdfArray } from '../objects/PdfArray.js';
import { PdfBoolean } from '../objects/PdfBoolean.js';

import { pageExtractionHelper } from '../document/PdfPage.js';


/**
 * Standard 32-byte padding string per ISO 32000-1 (Section 7.6.3.3).
 */
export const PADDING_BYTES = new Uint8Array([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41,
  0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80,
  0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a
]);

/**
 * Handles PDF encryption, password verification, key derivation,
 * and string/stream cipher operations per ISO 32000-1.
 */
export class PdfSecurityHandler {
  /** @type {'RC4'|'AES-128'|'AES-256'} */
  #algorithm;

  /** @type {number} Key length in bytes (5, 16, or 32) */
  #keyLength;

  /** @type {number} Revision: 2, 3, 4, or 5 */
  #revision;

  /** @type {number} Version: 1, 2, 4, or 5 */
  #version;

  /** @type {number} Permissions flags integer (/P) */
  #permissions;

  /** @type {Uint8Array} Owner hash (/O) */
  #ownerKey;

  /** @type {Uint8Array} User hash (/U) */
  #userKey;

  /** @type {Uint8Array} Document file ID bytes */
  #fileId;

  /** @type {boolean} */
  #encryptMetadata;

  /** @type {Uint8Array|null} Master document encryption key */
  #encryptionKey;

  /** @type {boolean} */
  #authenticated;

  /** @type {'owner'|'user'|null} */
  #authenticatedAs;

  /**
   * @param {Object} options
   */
  constructor(options = {}) {
    this.#algorithm = options.algorithm || 'AES-128';
    this.#revision = options.revision || (this.#algorithm === 'AES-256' ? 5 : 4);
    this.#version = options.version || (this.#algorithm === 'AES-256' ? 5 : 4);
    this.#keyLength = options.keyLength || (this.#algorithm === 'AES-256' ? 32 : (this.#algorithm === 'RC4-40' ? 5 : 16));
    this.#permissions = options.permissions !== undefined ? options.permissions : PdfPermissions.createPermissions();
    this.#ownerKey = options.ownerKey || new Uint8Array(32);
    this.#userKey = options.userKey || new Uint8Array(32);
    this.#fileId = options.fileId || new Uint8Array(16);
    this.#encryptMetadata = options.encryptMetadata !== false;
    this.#encryptionKey = options.encryptionKey || null;
    this.#authenticated = Boolean(options.encryptionKey);
    this.#authenticatedAs = options.authenticatedAs || null;
  }

  get algorithm() { return this.#algorithm; }
  get keyLength() { return this.#keyLength; }
  get revision() { return this.#revision; }
  get version() { return this.#version; }
  get permissions() { return this.#permissions; }
  get ownerKey() { return this.#ownerKey; }
  get userKey() { return this.#userKey; }
  get fileId() { return this.#fileId; }
  get encryptMetadata() { return this.#encryptMetadata; }
  get isAuthenticated() { return this.#authenticated; }
  get authenticatedAs() { return this.#authenticatedAs; }

  /**
   * Creates a security handler initialized for encrypting a document with user and/or owner passwords.
   * 
   * @param {Object} options
   * @param {string} [options.userPassword='']
   * @param {string} [options.ownerPassword='']
   * @param {Object|number} [options.permissions]
   * @param {'AES-128'|'AES-256'|'RC4-128'|'RC4-40'} [options.algorithm='AES-128']
   * @param {Uint8Array} [options.fileId]
   * @returns {PdfSecurityHandler}
   */
  static createEncryptionHandler(options = {}) {
    const userPassword = options.userPassword || '';
    const ownerPassword = options.ownerPassword || userPassword;
    const algorithm = options.algorithm || 'AES-128';

    let version = 4;
    let revision = 4;
    let keyLength = 16;

    if (algorithm === 'AES-256') {
      version = 5;
      revision = 5;
      keyLength = 32;
    } else if (algorithm === 'RC4-40') {
      version = 1;
      revision = 2;
      keyLength = 5;
    } else if (algorithm === 'RC4-128') {
      version = 2;
      revision = 3;
      keyLength = 16;
    }

    const permissions = typeof options.permissions === 'number'
      ? options.permissions
      : PdfPermissions.createPermissions(options.permissions || {});

    let fileId = options.fileId;
    if (!fileId || fileId.length === 0) {
      fileId = new Uint8Array(16);
      for (let i = 0; i < 16; i++) {
        fileId[i] = Math.floor(Math.random() * 256);
      }
    }

    const encryptMetadata = options.encryptMetadata !== false;

    // Compute /O (Algorithm 3.3)
    const oKey = PdfSecurityHandler.#computeOwnerKey(ownerPassword, userPassword, revision, keyLength);

    // Compute document encryption key (Algorithm 3.2)
    const encryptionKey = PdfSecurityHandler.#computeEncryptionKey(
      userPassword, oKey, permissions, fileId, revision, keyLength, encryptMetadata
    );

    // Compute /U (Algorithm 3.4 / 3.5)
    const uKey = PdfSecurityHandler.#computeUserKey(
      encryptionKey, fileId, revision
    );

    return new PdfSecurityHandler({
      algorithm: algorithm.startsWith('AES') ? 'AES-128' : 'RC4',
      version,
      revision,
      keyLength,
      permissions,
      ownerKey: oKey,
      userKey: uKey,
      fileId,
      encryptMetadata,
      encryptionKey,
      authenticatedAs: 'owner'
    });
  }

  /**
   * Initializes a security handler from a parsed PDF /Encrypt dictionary.
   * 
   * @param {PdfDictionary} encryptDict
   * @param {Uint8Array} fileId
   * @returns {PdfSecurityHandler}
   */
  static fromDictionary(encryptDict, fileId) {
    const vObj = encryptDict.get('V');
    const rObj = encryptDict.get('R');
    const pObj = encryptDict.get('P');
    const lenObj = encryptDict.get('Length');
    const oObj = encryptDict.get('O');
    const uObj = encryptDict.get('U');
    const encMetaObj = encryptDict.get('EncryptMetadata');

    const version = vObj && vObj.isNumber ? vObj.intValue() : 1;
    const revision = rObj && rObj.isNumber ? rObj.intValue() : 2;
    const permissions = pObj && pObj.isNumber ? pObj.intValue() : PdfPermissions.createPermissions();
    const lengthBits = lenObj && lenObj.isNumber ? lenObj.intValue() : (version === 1 ? 40 : 128);
    const keyLength = lengthBits >> 3;

    const ownerKey = oObj && oObj.isString ? oObj.bytes : new Uint8Array(32);
    const userKey = uObj && uObj.isString ? uObj.bytes : new Uint8Array(32);
    const encryptMetadata = encMetaObj && encMetaObj.isBoolean ? encMetaObj.value : true;

    // Detect cipher
    let algorithm = 'RC4';
    const cf = encryptDict.get('CF');
    const stmf = encryptDict.get('StmF');
    if (stmf && stmf.isName && (stmf.name === 'AESV2' || stmf.name === 'AESV3')) {
      algorithm = 'AES-128';
    } else if (cf && cf.isDictionary) {
      const stdCf = cf.get('StdCF');
      if (stdCf && stdCf.isDictionary) {
        const cfm = stdCf.getName('CFM');
        if (cfm === 'AESV2' || cfm === 'AESV3') {
          algorithm = 'AES-128';
        }
      }
    }

    return new PdfSecurityHandler({
      algorithm,
      version,
      revision,
      keyLength,
      permissions,
      ownerKey,
      userKey,
      fileId: fileId || new Uint8Array(16),
      encryptMetadata
    });
  }

  /**
   * Authenticates using user or owner password.
   * 
   * @param {string} password
   * @returns {boolean}
   */
  authenticate(password = '') {
    // 1. Try owner password
    if (this.#authenticateOwner(password)) {
      this.#authenticated = true;
      this.#authenticatedAs = 'owner';
      return true;
    }

    // 2. Try user password
    if (this.#authenticateUser(password)) {
      this.#authenticated = true;
      this.#authenticatedAs = 'user';
      return true;
    }

    return false;
  }

  /**
   * @private
   */
  #authenticateUser(password) {
    const encKey = PdfSecurityHandler.#computeEncryptionKey(
      password,
      this.#ownerKey,
      this.#permissions,
      this.#fileId,
      this.#revision,
      this.#keyLength,
      this.#encryptMetadata
    );

    const testU = PdfSecurityHandler.#computeUserKey(
      encKey,
      this.#fileId,
      this.#revision
    );

    // Compare first 16 bytes
    let match = true;
    for (let i = 0; i < 16; i++) {
      if (testU[i] !== this.#userKey[i]) {
        match = false;
        break;
      }
    }

    if (match) {
      this.#encryptionKey = encKey;
      return true;
    }
    return false;
  }

  /**
   * @private
   */
  #authenticateOwner(password) {
    const paddedOwner = PdfSecurityHandler.#padPassword(password);
    let key = Md5.hash(paddedOwner);

    if (this.#revision >= 3) {
      for (let i = 0; i < 50; i++) {
        key = Md5.hash(key.subarray(0, this.#keyLength));
      }
    }

    const rc4Key = key.subarray(0, this.#keyLength);
    let decryptedUserPass = Rc4.process(rc4Key, this.#ownerKey);

    if (this.#revision >= 3) {
      for (let i = 19; i >= 1; i--) {
        const iterKey = new Uint8Array(this.#keyLength);
        for (let k = 0; k < this.#keyLength; k++) {
          iterKey[k] = rc4Key[k] ^ i;
        }
        decryptedUserPass = Rc4.process(iterKey, decryptedUserPass);
      }
    }

    // Find user password length by checking against padding bytes
    let userPassStr = '';
    const bytes = decryptedUserPass;
    for (let i = 0; i < 32; i++) {
      let isPadding = true;
      for (let p = 0; p < 32 - i; p++) {
        if (bytes[i + p] !== PADDING_BYTES[p]) {
          isPadding = false;
          break;
        }
      }
      if (isPadding) {
        userPassStr = new TextDecoder('latin1').decode(bytes.subarray(0, i));
        break;
      }
    }

    return this.#authenticateUser(userPassStr);
  }

  /**
   * Derives object-specific key (Algorithm 3.1) and decrypts bytes.
   * 
   * @param {Uint8Array} data
   * @param {number} objectNumber
   * @param {number} generationNumber
   * @returns {Uint8Array}
   */
  decrypt(data, objectNumber, generationNumber = 0) {
    if (!this.#encryptionKey || data.length === 0) {
      return data;
    }

    const objKey = this.#computeObjectKey(objectNumber, generationNumber);

    if (this.#algorithm === 'AES-128' || this.#algorithm === 'AES-256') {
      return Aes.decryptCbc(objKey, data);
    } else {
      return Rc4.process(objKey, data);
    }
  }

  /**
   * Derives object-specific key and encrypts bytes.
   * 
   * @param {Uint8Array} data
   * @param {number} objectNumber
   * @param {number} generationNumber
   * @returns {Uint8Array}
   */
  encrypt(data, objectNumber, generationNumber = 0) {
    if (!this.#encryptionKey || data.length === 0) {
      return data;
    }

    const objKey = this.#computeObjectKey(objectNumber, generationNumber);

    if (this.#algorithm === 'AES-128' || this.#algorithm === 'AES-256') {
      return Aes.encryptCbc(objKey, data);
    } else {
      return Rc4.process(objKey, data);
    }
  }

  /**
   * Builds the PDF /Encrypt dictionary.
   * 
   * @returns {PdfDictionary}
   */
  toDictionary() {
    const dict = new PdfDictionary();
    dict.set('Filter', PdfName.of('Standard'));
    dict.set('V', PdfNumber.of(this.#version));
    dict.set('R', PdfNumber.of(this.#revision));
    dict.set('P', PdfNumber.of(this.#permissions));
    dict.set('Length', PdfNumber.of(this.#keyLength * 8));
    dict.set('O', PdfHexString.of(this.#ownerKey));
    dict.set('U', PdfHexString.of(this.#userKey));

    if (this.#algorithm.startsWith('AES')) {
      const cfDict = new PdfDictionary();
      const stdCf = new PdfDictionary();
      stdCf.set('Type', PdfName.of('CryptFilter'));
      stdCf.set('CFM', PdfName.of('AESV2'));
      stdCf.set('Length', PdfNumber.of(this.#keyLength * 8));
      cfDict.set('StdCF', stdCf);

      dict.set('CF', cfDict);
      dict.set('StmF', PdfName.of('StdCF'));
      dict.set('StrF', PdfName.of('StdCF'));
    }

    if (!this.#encryptMetadata) {
      dict.set('EncryptMetadata', PdfBoolean.of(false));
    }

    return dict;
  }

  /**
   * Algorithm 3.1: Computes object-specific key.
   * @private
   */
  #computeObjectKey(objectNumber, generationNumber) {
    const isAes = this.#algorithm.startsWith('AES');
    const extraLen = isAes ? 9 : 5;
    const buf = new Uint8Array(this.#keyLength + extraLen);

    buf.set(this.#encryptionKey, 0);
    buf[this.#keyLength] = objectNumber & 0xff;
    buf[this.#keyLength + 1] = (objectNumber >> 8) & 0xff;
    buf[this.#keyLength + 2] = (objectNumber >> 16) & 0xff;
    buf[this.#keyLength + 3] = generationNumber & 0xff;
    buf[this.#keyLength + 4] = (generationNumber >> 8) & 0xff;

    if (isAes) {
      // Append ASCII 'sAlT' (0x73, 0x41, 0x6C, 0x54)
      buf[this.#keyLength + 5] = 0x73;
      buf[this.#keyLength + 6] = 0x41;
      buf[this.#keyLength + 7] = 0x6c;
      buf[this.#keyLength + 8] = 0x54;
    }

    const hash = Md5.hash(buf);
    return hash.subarray(0, Math.min(this.#keyLength + 5, 16));
  }

  /**
   * Pads password string to 32 bytes using PADDING_BYTES.
   * @private
   */
  static #padPassword(password) {
    const result = new Uint8Array(32);
    const passBytes = new TextEncoder().encode(password || '');
    const copyLen = Math.min(passBytes.length, 32);
    result.set(passBytes.subarray(0, copyLen), 0);
    if (copyLen < 32) {
      result.set(PADDING_BYTES.subarray(0, 32 - copyLen), copyLen);
    }
    return result;
  }

  /**
   * Algorithm 3.2: Computes document encryption key.
   * @private
   */
  static #computeEncryptionKey(password, ownerKey, permissions, fileId, revision, keyLength, encryptMetadata) {
    const padded = PdfSecurityHandler.#padPassword(password);
    const chunks = [padded, ownerKey];

    // Permissions in little-endian 4 bytes
    const pBytes = new Uint8Array([
      permissions & 0xff,
      (permissions >> 8) & 0xff,
      (permissions >> 16) & 0xff,
      (permissions >> 24) & 0xff
    ]);
    chunks.push(pBytes);

    if (fileId && fileId.length > 0) {
      chunks.push(fileId);
    }

    if (revision >= 4 && !encryptMetadata) {
      chunks.push(new Uint8Array([0xff, 0xff, 0xff, 0xff]));
    }

    // Concatenate chunks
    const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
    const combined = new Uint8Array(totalLen);
    let offset = 0;
    for (const c of chunks) {
      combined.set(c, offset);
      offset += c.length;
    }

    let hash = Md5.hash(combined);

    if (revision >= 3) {
      for (let i = 0; i < 50; i++) {
        hash = Md5.hash(hash.subarray(0, keyLength));
      }
    }

    return hash.subarray(0, keyLength);
  }

  /**
   * Algorithm 3.3: Computes /O entry.
   * @private
   */
  static #computeOwnerKey(ownerPassword, userPassword, revision, keyLength) {
    const paddedOwner = PdfSecurityHandler.#padPassword(ownerPassword);
    let hash = Md5.hash(paddedOwner);

    if (revision >= 3) {
      for (let i = 0; i < 50; i++) {
        hash = Md5.hash(hash.subarray(0, keyLength));
      }
    }

    const rc4Key = hash.subarray(0, keyLength);
    const paddedUser = PdfSecurityHandler.#padPassword(userPassword);

    let ciphertext = Rc4.process(rc4Key, paddedUser);

    if (revision >= 3) {
      for (let i = 1; i <= 19; i++) {
        const iterKey = new Uint8Array(keyLength);
        for (let k = 0; k < keyLength; k++) {
          iterKey[k] = rc4Key[k] ^ i;
        }
        ciphertext = Rc4.process(iterKey, ciphertext);
      }
    }

    return ciphertext;
  }

  /**
   * Algorithm 3.4 / 3.5: Computes /U entry.
   * @private
   */
  static #computeUserKey(encryptionKey, fileId, revision) {
    if (revision === 2) {
      return Rc4.process(encryptionKey, PADDING_BYTES);
    }

    // Revision 3 or 4:
    const combined = new Uint8Array(32 + (fileId ? fileId.length : 0));
    combined.set(PADDING_BYTES, 0);
    if (fileId) {
      combined.set(fileId, 32);
    }

    const hash = Md5.hash(combined);
    let ciphertext = Rc4.process(encryptionKey, hash);

    for (let i = 1; i <= 19; i++) {
      const iterKey = new Uint8Array(encryptionKey.length);
      for (let k = 0; k < encryptionKey.length; k++) {
        iterKey[k] = encryptionKey[k] ^ i;
      }
      ciphertext = Rc4.process(iterKey, ciphertext);
    }

    const uResult = new Uint8Array(32);
    uResult.set(ciphertext, 0);
    // Arbitrary padding for the remaining 16 bytes
    uResult.set(PADDING_BYTES.subarray(0, 16), 16);
    return uResult;
  }
}

pageExtractionHelper.PdfSecurityHandler = PdfSecurityHandler;

